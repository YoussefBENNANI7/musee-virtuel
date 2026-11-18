"""Calcul de la lumière d'une salle avec Blender (moteur Cycles), sans interface.

Lancé par `npm run lumiere` (scripts/lumiere.mjs), avec le Python où Blender est installé
comme module (`pip install bpy`). Ne se lance pas seul.

Entrée : la scène exportée par la visite (JSON, voir exportBakeScene dans src/engine/lumiere.ts),
dans le repère de Three.js (y vers le haut).

La lumière est calculée en plusieurs passes, chacune rangée dans l'atlas de la salle :
  - base : l'éclairage d'ambiance du plafond, la gorge lumineuse, le ciel de la verrière, les lanternes ;
  - accent : les faisceaux des projecteurs, ou le soleil sous une verrière ;
  - voisines : la lumière des autres salles, qui entre par les portes ;
  - contact : la part de son voisinage proche que chaque point voit dégagée (ombres de contact).
Puis elles sont réunies :
  lumière = contact × (décor × variation de la base + s × accent + voisines) × chaleur × exposition
  - chaque famille de surfaces (sol, murs, plafond) garde la clarté et la teinte que lui donne son
    décor dans la visite. De la passe de base, on ne retient que les variations autour de sa valeur
    médiane : plus clair ici, plus sombre là, et un peu de la couleur que les surfaces se renvoient ;
  - s donne au faisceau des projecteurs (ou à la tache de soleil) la force demandée, par rapport à la
    clarté du mur (ou du sol) ;
  - la lumière des salles voisines est prise telle quelle : elle a la couleur qu'elles ont à l'écran.

Sortie : l'atlas de lumière en PNG (sRGB, valeurs divisées par le facteur de codage), et un résumé JSON.
"""

import hashlib
import json
import math
import os
import struct
import sys
import time
import zlib

import bpy
import numpy as np
from mathutils import Vector

# Force des ombres de contact, par famille de surfaces : au sol, elle porte le poids des bancs et des
# socles ; sur les murs et au plafond, elle ne fait qu'adoucir les angles.
OCCLUSION = {"sol": 1.5, "murs": 0.45, "plafond": 0.5}
# Lissage du grain, en points de l'atlas. Un plafond n'a aucun détail fin : il est lissé davantage,
# comme les murs d'une salle sans projecteurs, où aucun faisceau n'est à garder net.
SMOOTH = {"sol": 1.8, "murs": 1.8, "plafond": 5.0}
SMOOTH_PLAIN_WALLS = 3.2
# Variation de la base : jusqu'où une surface peut être plus claire que sa valeur médiane. Un plafond
# ne reçoit que la lumière renvoyée par la salle : dans une salle sombre, ses bords seraient sans cela
# bien plus clairs que son centre.
LIMIT = {"sol": 1.2, "murs": 1.2, "plafond": 0.5}
# Part que l'on garde de la couleur propre au calcul (lumière qu'une surface colorée renvoie sur une autre).
# Entière, elle sature : une gorge lumineuse sur un mur de terre cuite deviendrait rouge vif.
CHROMA = 0.35
# Les murs sont un peu plus clairs que ne le veut la formule : ils n'ont plus les halos peints autour des œuvres.
LIFT = {"sol": 1.0, "murs": 1.06, "plafond": 1.0}
LUM = np.array([0.2126, 0.7152, 0.0722])
# Version du calcul des passes : à changer quand la façon de les calculer change, pour ne pas en reprendre d'anciennes.
RENDER = 3


def to_blender(x, y, z):
    """Three.js (y vers le haut) vers Blender (z vers le haut)."""
    return (x, -z, y)


def make_mesh(name, positions, indices, uv1=None, colors=None):
    verts = [to_blender(positions[i], positions[i + 1], positions[i + 2]) for i in range(0, len(positions), 3)]
    faces = [tuple(indices[i:i + 3]) for i in range(0, len(indices), 3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if uv1 is not None:
        layer = mesh.uv_layers.new(name="lumiere")
        vidx = np.zeros(len(mesh.loops), dtype=np.int32)
        mesh.loops.foreach_get("vertex_index", vidx)
        uv = np.asarray(uv1, dtype=np.float32).reshape(-1, 2)
        layer.data.foreach_set("uv", uv[vidx].reshape(-1))
    if colors is not None:
        attr = mesh.color_attributes.new(name="rayonnement", type="FLOAT_COLOR", domain="POINT")
        rgb = np.asarray(colors, dtype=np.float32).reshape(-1, 3)
        rgba = np.concatenate([rgb, np.ones((len(rgb), 1), dtype=np.float32)], axis=1)
        attr.data.foreach_set("color", rgba.reshape(-1))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def new_material(name):
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    mat.node_tree.nodes.clear()
    return mat, mat.node_tree.nodes, mat.node_tree.links


def diffuse_material(name, albedo):
    mat, nodes, links = new_material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfDiffuse")
    bsdf.inputs["Color"].default_value = (*albedo, 1.0)
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat, nodes


def emission_material(name, strength):
    """
    Surface qui rayonne la couleur de ses sommets, du côté où elle est tournée seulement : le dos d'un
    mur voisin n'éclaire pas l'épaisseur du mur mitoyen.
    """
    mat, nodes, links = new_material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    attr = nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "rayonnement"
    emit = nodes.new("ShaderNodeEmission")
    geometry = nodes.new("ShaderNodeNewGeometry")
    front = nodes.new("ShaderNodeMath")
    front.operation = "MULTIPLY_ADD"  # force × (dos ? 0 : 1) = dos × (-force) + force
    front.inputs[1].default_value = -strength
    front.inputs[2].default_value = strength
    links.new(geometry.outputs["Backfacing"], front.inputs[0])
    links.new(front.outputs["Value"], emit.inputs["Strength"])
    links.new(attr.outputs["Color"], emit.inputs["Color"])
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def write_png(path, rgb8, width, height):
    """PNG RVB 8 bits, sans dépendance. `rgb8` : (height, width, 3), première ligne en haut."""
    raw = b"".join(b"\x00" + rgb8[y].tobytes() for y in range(height))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def linear_to_srgb(v):
    v = np.clip(v, 0.0, 1.0)
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)


def bilinear(img, u, v):
    """Lit l'image (hauteur, largeur, canaux ; ligne 0 en bas, comme Blender) aux coordonnées uv."""
    h, w = img.shape[:2]
    x = np.clip(u * w - 0.5, 0, w - 1)
    y = np.clip(v * h - 0.5, 0, h - 1)
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    fx = (x - x0)[:, None]
    fy = (y - y0)[:, None]
    top = img[y0, x0] * (1 - fx) + img[y0, x1] * fx
    bottom = img[y1, x0] * (1 - fx) + img[y1, x1] * fx
    return top * (1 - fy) + bottom * fy


def blur(block, sigma):
    """Flou gaussien d'un rectangle ; ce qui dépasse du rectangle compte pour zéro."""
    radius = max(1, int(math.ceil(3 * sigma)))
    kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    out = block
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (radius, radius)
        padded = np.pad(out, pad, mode="constant")
        acc = np.zeros_like(out)
        for i, k in enumerate(kernel):
            acc += k * np.take(padded, range(i, i + out.shape[axis]), axis=axis)
        out = acc
    return out


def smooth(block, mask, sigma):
    """
    Lisse un plan de l'atlas sans mêler ce qui n'en fait pas partie : seuls comptent les points
    couverts par une surface (`mask`). Les points voisins non couverts (marges, ouverture d'une porte)
    reçoivent la valeur des points couverts les plus proches : le filtrage de la visite ne lit jamais de noir.
    """
    weight = mask.astype(np.float32)
    out = np.zeros_like(block)
    filled = np.zeros(mask.shape, dtype=bool)
    for step in range(5):
        s = sigma * 4 ** step
        den = blur(weight, s)
        num = blur(block * weight[..., None], s)
        ok = (den > 1e-3) & ~filled
        out[ok] = num[ok] / den[ok][..., None]
        filled |= ok
        if filled.all():
            break
    return out


def median(values, weights):
    order = np.argsort(values)
    cumulative = np.cumsum(weights[order])
    if cumulative[-1] <= 0:
        return 0.0
    return float(values[order][min(len(values) - 1, np.searchsorted(cumulative, cumulative[-1] / 2))])


def solve(base, extra, weights, target):
    """Facteur k tel que la médiane de k × base + extra soit `target` (0 si `extra` y suffit déjà)."""
    if median(extra, weights) >= target or median(base, weights) <= 0:
        return 0.0
    low, high = 0.0, 1.0
    while median(high * base + extra, weights) < target and high < 1e6:
        high *= 2
    for _ in range(50):
        mid = (low + high) / 2
        if median(mid * base + extra, weights) < target:
            low = mid
        else:
            high = mid
    return (low + high) / 2


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    scene_path, png_path, summary_path = args[:3]
    cache_path = args[3] if len(args) > 3 else None
    with open(scene_path, encoding="utf-8") as f:
        data = json.load(f)
    started = time.time()
    width, height = data["atlas"]["width"], data["atlas"]["height"]
    samples = data.get("samples", 256)

    # Les passes calculées sont gardées : tant que la salle, ses lampes et la finesse du calcul ne
    # changent pas, un réglage de chaleur, d'exposition ou de force des faisceaux se refait en secondes.
    lit = {"rendu": RENDER, **{k: data.get(k) for k in ("meshes", "areas", "points", "sun", "samples", "atlas")}}
    lit["spots"] = [{k: v for k, v in s.items() if k != "probe"} for s in data.get("spots", [])]
    key = hashlib.sha1(json.dumps(lit, sort_keys=True).encode()).hexdigest()
    passes = None
    if cache_path and os.path.exists(cache_path):
        try:
            with np.load(cache_path) as saved:
                if str(saved["key"]) == key:
                    passes = {k: saved[k].astype(np.float32) for k in ("base", "accent", "around", "contact")}
                    passes["mask"] = saved["mask"]
        except Exception:
            passes = None
    if passes is None:
        passes, timings = render(data, width, height, samples)
        # Arrondies comme elles seront gardées : l'assemblage donne ainsi le même atlas, au point près,
        # que les passes viennent d'être calculées ou qu'elles soient reprises.
        for k in ("base", "accent", "around", "contact"):
            passes[k] = passes[k].astype(np.float16).astype(np.float32)
        if cache_path:
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            np.savez_compressed(cache_path, key=key, mask=passes["mask"], **{k: passes[k].astype(np.float16) for k in ("base", "accent", "around", "contact")})
    else:
        timings = {"repris": True}
    mask = passes["mask"]
    base = passes["base"]
    accent = passes["accent"]
    around = passes["around"] * data.get("neighbours", 1.0)
    contact = passes["contact"]
    compose(data, width, height, samples, mask, base, accent, around, contact, timings, started, png_path, summary_path)


def render(data, width, height, samples):
    """Calcule les passes de lumière avec Cycles. Renvoie les passes et la durée de chacune."""

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 4
    scene.cycles.use_denoising = False
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    # Les rares rayons aberrants (un grain très clair) sont plafonnés.
    scene.cycles.sample_clamp_indirect = 12
    world = bpy.data.worlds.new("noir")
    world.color = (0, 0, 0)
    world.light_settings.distance = data.get("occlusion_distance", 1.0)
    scene.world = world

    image = bpy.data.images.new("lumiere", width, height, float_buffer=True, alpha=True)
    image.colorspace_settings.name = "Non-Color"

    # --- La scène -------------------------------------------------------------------------------
    targets = []
    own = []  # sources dessinées de la salle : gorge lumineuse, vitrage de la verrière
    env = []  # surfaces des autres salles
    for i, m in enumerate(data["meshes"]):
        name = f"{m['role']}-{i}"
        if not m["indices"]:
            continue
        if m["role"] == "bake":
            obj = make_mesh(name, m["positions"], m["indices"], uv1=m["uv1"])
            mat, nodes = diffuse_material(name, m["albedo"])
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = image
            nodes.active = tex
            obj.data.materials.append(mat)
            targets.append((obj, m))
        elif m["role"] in ("own", "env"):
            obj = make_mesh(name, m["positions"], m["indices"], colors=m["colors"])
            obj.data.materials.append(emission_material(name, m.get("strength", 1.0)))
            (own if m["role"] == "own" else env).append(obj)
        else:
            obj = make_mesh(name, m["positions"], m["indices"])
            mat, _ = diffuse_material(name, m["albedo"])
            obj.data.materials.append(mat)

    def lamp(kind, name, location):
        light = bpy.data.lights.new(name, type=kind)
        obj = bpy.data.objects.new(name, light)
        obj.location = to_blender(*location)
        scene.collection.objects.link(obj)
        return light, obj

    spots, base_lamps, suns = [], [], []
    for i, s in enumerate(data.get("spots", [])):
        light, obj = lamp("SPOT", f"projecteur-{i}", s["position"])
        light.energy = 300
        light.spot_size = math.radians(s["angle"])
        light.spot_blend = s.get("blend", 0.6)
        light.shadow_soft_size = s.get("radius", 0.04)
        light.color = s.get("color", (1, 1, 1))
        look_at(obj, to_blender(*s["target"]))
        spots.append(obj)
    for i, a in enumerate(data.get("areas", [])):
        light, obj = lamp("AREA", f"ambiance-{i}", a["position"])
        light.shape = "RECTANGLE"
        light.size = a["size"][0]
        light.size_y = a["size"][1]
        light.energy = a["power"]
        light.color = a.get("color", (1, 1, 1))
        # La lampe éclaire vers le bas : son axe -Z de Blender pointe déjà vers le sol.
        base_lamps.append(obj)
    for i, p in enumerate(data.get("points", [])):
        light, obj = lamp("POINT", f"lanterne-{i}", p["position"])
        light.energy = p["power"]
        light.shadow_soft_size = p.get("radius", 0.1)
        light.color = p.get("color", (1, 1, 1))
        base_lamps.append(obj)
    sun = data.get("sun")
    if sun:
        light, obj = lamp("SUN", "soleil", sun["from"])
        light.energy = 3.0
        light.angle = math.radians(sun.get("angle", 0.8))
        light.color = sun.get("color", (1, 1, 1))
        look_at(obj, Vector(to_blender(*sun["from"])) + Vector(to_blender(*sun["direction"])))
        suns.append(obj)

    bpy.ops.object.select_all(action="DESELECT")
    for obj, _ in targets:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = targets[0][0]
    scene.render.bake.target = "IMAGE_TEXTURES"

    def bake(kind, samples, base=False, accent=False, neighbours=False):
        """Calcule une passe : seules les sources demandées éclairent. Les autres sont retirées de la
        scène : une surface lumineuse éteinte ne fait pas d'ombre (le soleil traverse ainsi le vitrage)."""
        for obj in own + base_lamps:
            obj.hide_render = not base
        for obj in env:
            obj.hide_render = not neighbours
        for obj in spots + suns:
            obj.hide_render = not accent
        bpy.context.view_layer.update()
        scene.cycles.samples = max(4, int(samples))
        if kind == "AO":
            bpy.ops.object.bake(type="AO", use_clear=True, margin=0)
        else:
            bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True, margin=0)
        pixels = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        return pixels.reshape(height, width, 4).copy()

    has_accent = bool(spots or suns)
    has_env = bool(env)
    timings = {}

    def timed(name, *args, **kwargs):
        t0 = time.time()
        out = bake(*args, **kwargs)
        timings[name] = round(time.time() - t0, 1)
        return out

    base_px = timed("base", "DIFFUSE", samples, base=True)
    mask = base_px[:, :, 3] > 0
    base = base_px[:, :, :3]
    # Le soleil est surtout une lumière directe : il demande moins d'échantillons.
    accent = timed("accent", "DIFFUSE", samples / 2 if suns else samples, accent=True)[:, :, :3] if has_accent else np.zeros_like(base)
    around = timed("voisines", "DIFFUSE", samples / 2, neighbours=True)[:, :, :3] if has_env else np.zeros_like(base)
    contact = timed("contact", "AO", min(96, samples))[:, :, :1]
    return {"mask": mask, "base": base, "accent": accent, "around": around, "contact": contact}, timings


def compose(data, width, height, samples, mask, base, accent, around, contact, timings, started, png_path, summary_path):
    """Réunit les passes en un atlas de lumière, et l'écrit."""
    has_spots = bool(data.get("spots"))
    has_sun = bool(data.get("sun"))
    if has_spots:
        accent = accent * np.asarray(data.get("lampTint", (1, 1, 1)), dtype=np.float32)

    # --- Lissage, plan par plan ------------------------------------------------------------------
    charts = data["charts"]
    sigmas = {**SMOOTH, **({} if has_spots else {"murs": SMOOTH_PLAIN_WALLS})}
    for c in charts:
        x0, y0, x1, y1 = c["rect"]
        area = (slice(y0, y1), slice(x0, x1))
        sigma = sigmas[c["family"]]
        m = mask[area]
        if c.get("visible"):
            # Sol et plafond vont jusqu'aux limites de la salle, dans l'épaisseur des murs : cette partie
            # cachée ne compte pas, sans quoi son obscurité déborderait sur le bord visible.
            seen = np.zeros(m.shape, dtype=bool)
            xs = np.arange(x0, x1) + 0.5
            ys = np.arange(y0, y1) + 0.5
            for vx0, vy0, vx1, vy1 in c["visible"]:
                seen |= np.outer((ys >= vy0) & (ys <= vy1), (xs >= vx0) & (xs <= vx1))
            m = m & seen
            mask[area] = m
        if not m.any():
            continue
        base[area] = smooth(base[area], m, sigma)
        # La tache de soleil garde un bord net au sol ; ailleurs, sa lumière n'arrive que par rebond.
        accent[area] = smooth(accent[area], m, 1.2 if (has_sun and c["family"] == "sol") else sigma)
        around[area] = smooth(around[area], m, sigma * 1.5)
        shade = np.clip(smooth(contact[area], m, 1.2), 0, 1) ** OCCLUSION[c["family"]]
        base[area] *= shade
        accent[area] *= shade
        around[area] *= shade
        contact[area] = shade

    # --- Mesures : un point par triangle, pondéré par sa surface ----------------------------------
    samples_by_family = {}
    for m in data["meshes"]:
        if m["role"] != "bake" or not m["indices"]:
            continue
        family = charts[m["chart"]]["family"]
        pos = np.asarray(m["positions"], dtype=np.float64).reshape(-1, 3)
        idx = np.asarray(m["indices"], dtype=np.int64).reshape(-1, 3)
        uv = np.asarray(m["uv1"], dtype=np.float64).reshape(-1, 2)
        cur = np.asarray(m["light"], dtype=np.float64).reshape(-1, 3)
        area = 0.5 * np.linalg.norm(np.cross(pos[idx[:, 1]] - pos[idx[:, 0]], pos[idx[:, 2]] - pos[idx[:, 0]]), axis=1)
        cuv = uv[idx].mean(axis=1)
        # Ce qui est caché (derrière un tableau, sous un banc) ne se voit pas : on ne le compte pas.
        seen = bilinear(contact, cuv[:, 0], cuv[:, 1])[:, 0] > 0.15
        entry = samples_by_family.setdefault(family, {"w": [], "cur": [], "base": [], "around": []})
        entry["w"].append(area * seen)
        entry["cur"].append(cur[idx].mean(axis=1))
        entry["base"].append(bilinear(base, cuv[:, 0], cuv[:, 1]))
        entry["around"].append(bilinear(around, cuv[:, 0], cuv[:, 1]))
    for entry in samples_by_family.values():
        for key in entry:
            entry[key] = np.concatenate(entry[key])

    # Clarté et teinte : chaque famille garde celles que lui donne son décor dans la visite.
    def variation(family, values):
        """Variation de la base autour de sa valeur médiane, pour des valeurs (…, 3) de la famille."""
        ref = reference[family]
        lum = values @ LUM
        ratio = lum / ref["lum"]
        limit = LIMIT[family]
        # Plus sombre que la médiane : tel quel. Plus clair : de moins en moins, jusqu'au plafond fixé.
        bounded = np.where(ratio > 1, 1 + limit * np.tanh((ratio - 1) / limit), ratio)
        chroma = np.clip((values / ref["rgb"]) / np.maximum(ratio, 1e-6)[..., None], 0.5, 2.0) ** CHROMA
        return bounded[..., None] * chroma

    reference = {}
    decor = {}
    scales = {}
    level = {}
    for family, e in samples_by_family.items():
        reference[family] = {"lum": max(1e-9, median(e["base"] @ LUM, e["w"])), "rgb": np.maximum(1e-9, [median(e["base"][:, c], e["w"]) for c in range(3)])}
        decor[family] = np.array([median(e["cur"][:, c], e["w"]) for c in range(3)]) * LIFT[family]
        level[family] = float(decor[family] @ LUM)
        shaped = (variation(family, e["base"]) * decor[family]) @ LUM
        scales[family] = solve(shaped, e["around"] @ LUM, e["w"], level[family])

    def family_values(img, family):
        """Luminance des points couverts d'une famille de surfaces."""
        parts = [(img[c["rect"][1]:c["rect"][3], c["rect"][0]:c["rect"][2]] @ LUM)[mask[c["rect"][1]:c["rect"][3], c["rect"][0]:c["rect"][2]]] for c in charts if c["family"] == family]
        return np.concatenate(parts) if parts else np.zeros(0)

    # Accent : la force demandée, par rapport à la clarté du mur (projecteurs) ou du sol (soleil).
    accent_scale = 0.0
    gains = data.get("gains", {})
    if has_spots and gains.get("spots", 0) > 0 and "murs" in level:
        probes = [s["probe"] for s in data["spots"] if s.get("probe")]
        if probes:
            p = np.asarray(probes, dtype=np.float64)
            measured = float(np.median(bilinear(accent, p[:, 0], p[:, 1]) @ LUM))
        else:
            measured = float(np.percentile(family_values(accent, "murs"), 97))
        if measured > 0:
            accent_scale = gains["spots"] * level["murs"] / measured
    elif has_sun and gains.get("sun", 0) > 0 and "sol" in level:
        floor = family_values(accent, "sol")
        # La tache occupe une bonne part du sol : son niveau est celui des points les plus éclairés.
        measured = float(np.percentile(floor, 90)) if floor.size else 0.0
        if measured > 0:
            accent_scale = gains["sun"] * level["sol"] / measured

    # Chaleur : un peu plus de rouge, un peu moins de bleu, sur les murs et, moitié moins, au plafond.
    warmth = data.get("warmth", 0.0)
    warm = {"murs": 1.0, "plafond": 0.5, "sol": 0.0}
    exposure = data.get("exposure", 1.0)

    light = np.zeros_like(base)
    for c in charts:
        x0, y0, x1, y1 = c["rect"]
        area = (slice(y0, y1), slice(x0, x1))
        f = c["family"]
        share = warmth * warm[f]
        tint = np.array([1 + share, 1 + 0.15 * share, 1 - 1.3 * share])
        own = variation(f, base[area]) * decor[f] * scales[f] if f in scales else 0.0
        light[area] = (own + accent[area] * accent_scale + around[area]) * tint * exposure

    # --- Codage ----------------------------------------------------------------------------------
    # L'image ne va que de 0 à 1 : elle garde la lumière divisée par 2, 4 ou 8 selon la salle. Les plus
    # fortes lumières (cœur d'un faisceau dans une salle sombre) sont arrondies en douceur sous ce plafond.
    lum = light @ LUM
    peak = float(np.percentile(lum[mask], 99.9)) if mask.any() else 1.0
    encode = next((e for e in (2.0, 4.0, 8.0) if peak <= 1.2 * e), 8.0)
    knee = 0.7 * encode
    over = lum > knee
    rolled = knee + (encode - knee) * (1 - np.exp(-(lum[over] - knee) / (encode - knee)))
    light[over] *= (rolled / lum[over])[:, None]

    # Moitié de la valeur (ou quart, ou huitième), en sRGB, avec un léger tramage contre les bandes.
    encoded = linear_to_srgb(light / encode) * 255.0
    noise = np.random.default_rng(1).random(encoded.shape) - 0.5
    rgb8 = np.clip(np.round(encoded + noise), 0, 255).astype(np.uint8)
    # Blender range la première ligne en bas ; le PNG commence en haut.
    write_png(png_path, rgb8[::-1], width, height)

    summary = {
        "encode": encode,
        "soleil": has_sun and accent_scale > 0,
        "scale": {f: round(float(v), 4) for f, v in scales.items()},
        "gain": {f: round(float(decor[f] @ LUM / reference[f]["lum"]), 3) for f in scales},
        "accent": round(float(accent_scale), 5),
        "peak": round(peak, 3),
        "samples": samples,
        "seconds": {**timings, "total": round(time.time() - started, 1)},
    }
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary))


main()
