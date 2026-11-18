"""Calcul de la lumière d'une salle avec Blender (moteur Cycles), sans interface.

Lancé par `npm run lumiere` (scripts/lumiere.mjs), avec le Python où Blender est installé
comme module (`pip install bpy`). Ne se lance pas seul.

Entrée : la scène exportée par la visite (JSON), dans le repère de Three.js (y vers le haut).
  - surfaces « bake » : murs, sol et plafond de la salle, avec leurs coordonnées dans l'atlas
    de lumière (uv1) et la lumière que le moteur leur donne aujourd'hui (pour garder le niveau) ;
  - surfaces « emit » : le reste du bâtiment vu par les portes, et la gorge lumineuse.
    Elles rayonnent la couleur qu'elles ont à l'écran ;
  - surfaces « occlude » : bancs, cadres, projecteurs. Elles font de l'ombre et renvoient la lumière ;
  - projecteurs (spots) et éclairage d'ambiance du plafond (fill).
Sortie : l'atlas de lumière en PNG (sRGB, valeurs divisées par ENCODE), et un résumé JSON.
"""

import json
import math
import random
import struct
import sys
import time
import zlib

import bpy
import numpy as np
from mathutils import Vector

# La lumière d'un point va de 0 à 1,7 environ (1 = pleine lumière). Le PNG ne va que de 0 à 1 :
# on y range la moitié de la valeur, et la visite la double.
ENCODE = 2.0
# Marge autour de chaque surface dans l'atlas, en points (voir src/engine/lumiere.ts).
PAD = 3
# Force des ombres de contact, par famille de surfaces.
OCCLUSION = {"sol": 1.3, "murs": 0.6, "plafond": 0.5}


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
        loops = np.zeros(len(mesh.loops) * 2, dtype=np.float32)
        vidx = np.zeros(len(mesh.loops), dtype=np.int32)
        mesh.loops.foreach_get("vertex_index", vidx)
        uv = np.asarray(uv1, dtype=np.float32).reshape(-1, 2)
        loops[:] = uv[vidx].reshape(-1)
        layer.data.foreach_set("uv", loops)
    if colors is not None:
        attr = mesh.color_attributes.new(name="rayonnement", type="FLOAT_COLOR", domain="POINT")
        rgb = np.asarray(colors, dtype=np.float32).reshape(-1, 3)
        rgba = np.concatenate([rgb, np.ones((len(rgb), 1), dtype=np.float32)], axis=1)
        attr.data.foreach_set("color", rgba.reshape(-1))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def diffuse_material(name, albedo):
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfDiffuse")
    bsdf.inputs["Color"].default_value = (*albedo, 1.0)
    mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat, nodes


def emission_material(name, strength):
    """Surface qui rayonne la couleur de ses sommets, multipliée par `strength`."""
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    attr = nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "rayonnement"
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = strength
    links = mat.node_tree.links
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


def smooth(block, sigma):
    """Flou gaussien d'un rectangle de l'atlas, ses bords prolongés par symétrie."""
    if sigma <= 0:
        return block
    radius = max(1, int(math.ceil(3 * sigma)))
    kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    out = block
    for axis in (0, 1):
        if out.shape[axis] <= radius:
            continue
        pad = [(0, 0)] * out.ndim
        pad[axis] = (radius, radius)
        padded = np.pad(out, pad, mode="reflect")
        acc = np.zeros_like(out)
        for i, k in enumerate(kernel):
            acc += k * np.take(padded, range(i, i + out.shape[axis]), axis=axis)
        out = acc
    return out


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    scene_path, png_path, summary_path = args[:3]
    with open(scene_path, encoding="utf-8") as f:
        data = json.load(f)
    random.seed(1)
    started = time.time()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = data.get("samples", 512)
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 4
    scene.cycles.use_denoising = False
    world = bpy.data.worlds.new("noir")
    world.color = (0, 0, 0)
    scene.world = world

    width, height = data["atlas"]["width"], data["atlas"]["height"]
    image = bpy.data.images.new("lumiere", width, height, float_buffer=True, alpha=False)
    image.colorspace_settings.name = "Non-Color"

    targets = []
    for i, m in enumerate(data["meshes"]):
        name = f"{m['role']}-{i}"
        if m["role"] == "bake":
            obj = make_mesh(name, m["positions"], m["indices"], uv1=m["uv1"])
            mat, nodes = diffuse_material(name, m["albedo"])
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = image
            nodes.active = tex
            obj.data.materials.append(mat)
            targets.append((obj, m))
        elif m["role"] == "emit":
            obj = make_mesh(name, m["positions"], m["indices"], colors=m["colors"])
            obj.data.materials.append(emission_material(name, m.get("strength", 1.0)))
        else:
            obj = make_mesh(name, m["positions"], m["indices"])
            mat, _ = diffuse_material(name, m["albedo"])
            obj.data.materials.append(mat)

    for i, s in enumerate(data.get("spots", [])):
        light = bpy.data.lights.new(f"projecteur-{i}", type="SPOT")
        light.energy = s["power"]
        light.spot_size = math.radians(s["angle"])
        light.spot_blend = s.get("blend", 0.6)
        light.shadow_soft_size = s.get("radius", 0.04)
        light.color = s.get("color", (1, 1, 1))
        obj = bpy.data.objects.new(f"projecteur-{i}", light)
        obj.location = to_blender(*s["position"])
        scene.collection.objects.link(obj)
        look_at(obj, to_blender(*s["target"]))

    for i, a in enumerate(data.get("areas", [])):
        light = bpy.data.lights.new(f"ambiance-{i}", type="AREA")
        light.shape = "RECTANGLE"
        light.size = a["size"][0]
        light.size_y = a["size"][1]
        light.energy = a["power"]
        light.color = a.get("color", (1, 1, 1))
        obj = bpy.data.objects.new(f"ambiance-{i}", light)
        obj.location = to_blender(*a["position"])
        scene.collection.objects.link(obj)
        # La lampe éclaire vers le bas : son axe -Z de Blender pointe déjà vers le sol.

    bpy.ops.object.select_all(action="DESELECT")
    for obj, _ in targets:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = targets[0][0]
    bake = scene.render.bake
    bake.target = "IMAGE_TEXTURES"
    bake.margin = data.get("margin", 6)
    bake.margin_type = "EXTEND"
    bake.use_clear = True
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True, margin=bake.margin)
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    light = pixels.reshape(height, width, 4)[:, :, :3].copy()

    # Ombres de contact : la part du voisinage proche (OCCLUSION_DISTANCE) que chaque point voit dégagée.
    # Sous un éclairage très diffus, les vraies ombres sont presque invisibles ; ce léger assombrissement
    # au pied des bancs, dans les angles et autour des cadres donne leur poids aux objets.
    scene.cycles.samples = data.get("occlusion_samples", 96)
    world.light_settings.distance = data.get("occlusion_distance", 0.8)
    bpy.ops.object.bake(type="AO", use_clear=True, margin=bake.margin)
    image.pixels.foreach_get(pixels)
    occlusion = pixels.reshape(height, width, 4)[:, :, :1].copy()
    baked_at = time.time()

    # Famille de chaque surface, d'après son orientation : sol, plafond ou murs.
    for _, m in targets:
        pos = np.asarray(m["positions"], dtype=np.float64).reshape(-1, 3)
        idx = np.asarray(m["indices"], dtype=np.int64).reshape(-1, 3)
        cross = np.cross(pos[idx[:, 1]] - pos[idx[:, 0]], pos[idx[:, 2]] - pos[idx[:, 0]])
        ny = (cross[:, 1] / np.maximum(1e-12, np.linalg.norm(cross, axis=1))).mean()
        m["family"] = "sol" if ny > 0.7 else "plafond" if ny < -0.7 else "murs"

    # Lissage du grain, surface par surface : chaque surface occupe un rectangle de l'atlas, et le
    # lissage ne déborde jamais de l'une sur l'autre. Un plafond n'a aucun détail fin : il est lissé
    # davantage. Puis les ombres de contact assombrissent la lumière, plus ou moins selon OCCLUSION.
    sigma = {"sol": 1.8, "murs": 1.8, "plafond": 5.0}
    charts = []
    for _, m in targets:
        uv = np.asarray(m["uv1"], dtype=np.float64).reshape(-1, 2)
        x0 = max(0, int(math.floor(uv[:, 0].min() * width)) - PAD)
        x1 = min(width, int(math.ceil(uv[:, 0].max() * width)) + PAD)
        y0 = max(0, int(math.floor(uv[:, 1].min() * height)) - PAD)
        y1 = min(height, int(math.ceil(uv[:, 1].max() * height)) + PAD)
        charts.append((x0, y0, x1, y1))
        light[y0:y1, x0:x1] = smooth(light[y0:y1, x0:x1], sigma[m["family"]])
        ao = np.clip(smooth(occlusion[y0:y1, x0:x1], 1.2), 0, 1)
        # Au sol, l'ombre de contact porte le poids des bancs et des socles ; sur les murs et au
        # plafond, elle ne fait qu'adoucir les angles.
        light[y0:y1, x0:x1] *= ao ** OCCLUSION[m["family"]]

    # Niveau et teinte : chaque famille de surfaces (sol, murs, plafond) garde la clarté et la teinte
    # moyennes que lui donne le moteur aujourd'hui. Le calcul n'apporte que les variations : ombres,
    # coins, faisceaux des projecteurs, lumière des portes. Le décor de la salle reste celui qui a été choisi.
    lum = np.array([0.2126, 0.7152, 0.0722])
    samples = []
    for _, m in targets:
        pos = np.asarray(m["positions"], dtype=np.float64).reshape(-1, 3)
        idx = np.asarray(m["indices"], dtype=np.int64).reshape(-1, 3)
        uv = np.asarray(m["uv1"], dtype=np.float64).reshape(-1, 2)
        cur = np.asarray(m["light"], dtype=np.float64).reshape(-1, 3)
        area = 0.5 * np.linalg.norm(np.cross(pos[idx[:, 1]] - pos[idx[:, 0]], pos[idx[:, 2]] - pos[idx[:, 0]]), axis=1)
        cuv = uv[idx].mean(axis=1)
        samples.append((m["family"], area, cur[idx].mean(axis=1), bilinear(light, cuv[:, 0], cuv[:, 1])))

    def median(values, weights):
        order = np.argsort(values)
        cumulative = np.cumsum(weights[order])
        return values[order][np.searchsorted(cumulative, cumulative[-1] / 2)]

    def ratios(keep):
        """Rapport, canal par canal, entre la lumière du moteur et celle du calcul, sur la partie
        typique de chaque famille (médiane pondérée par la surface) : les faisceaux et la gorge,
        plus clairs, n'assombrissent pas le reste du mur."""
        groups = {}
        for family, area, cur, baked in samples:
            weight = area * keep(family, cur, baked)
            groups.setdefault(family, []).append((weight, cur, baked))
        out = {}
        for family, parts in groups.items():
            weight = np.concatenate([p[0] for p in parts])
            cur = np.concatenate([p[1] for p in parts])
            baked = np.concatenate([p[2] for p in parts])
            out[family] = np.array([median(cur[:, c], weight) / max(1e-9, median(baked[:, c], weight)) for c in range(3)])
        return out

    # Premier passage sur tout ; le second ignore ce qui reste caché (derrière un tableau, sous un banc),
    # que le visiteur ne voit pas et qui fausserait la moyenne.
    first = ratios(lambda f, cur, baked: np.ones(len(cur)))
    scales = ratios(lambda f, cur, baked: ((baked * first[f]) @ lum > 0.25 * (cur @ lum)).astype(float))
    scales = {f: v * data.get("exposure", 1.0) for f, v in scales.items()}
    for (_, m), (x0, y0, x1, y1) in zip(targets, charts):
        light[y0:y1, x0:x1] *= scales[m["family"]]

    # Codage : moitié de la valeur, en sRGB, avec un léger tramage contre les bandes.
    encoded = linear_to_srgb(light / ENCODE) * 255.0
    noise = np.random.default_rng(1).random(encoded.shape) - 0.5
    rgb8 = np.clip(np.round(encoded + noise), 0, 255).astype(np.uint8)
    # Blender range la première ligne en bas ; le PNG commence en haut.
    write_png(png_path, rgb8[::-1], width, height)

    summary = {
        "scale": {f: [round(float(x), 4) for x in v] for f, v in scales.items()},
        "samples": data.get("samples", 512),
        "seconds": {"bake": round(baked_at - started, 1), "total": round(time.time() - started, 1)},
        "clipped": float((light / ENCODE > 1).mean()),
        "max": float(light.max()),
    }
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary))


main()
