import { tr } from './engine/types';
import { $, type App } from './ui';

/**
 * Carnet de visite : il retient les œuvres dont le visiteur a ouvert la fiche et montre
 * son avancée, salle par salle. Il est gardé dans le navigateur, sur cet appareil seulement.
 */
export function setupCarnet(app: App, actions: { goToRoom(roomId: string): void }) {
  const { museum } = app;
  const key = `musee-virtuel:${new URL(app.base).pathname}:vues`;
  const all = new Set(museum.rooms.flatMap((r) => r.artworks.map((a) => a.id)));
  const dialog = $('carnet');
  const toast = $('toast');
  let toastTimer = 0;

  let seen = new Set<string>();
  try {
    // Une œuvre retirée du musée depuis la dernière visite ne compte plus.
    seen = new Set((JSON.parse(localStorage.getItem(key) ?? '[]') as string[]).filter((id) => all.has(id)));
  } catch {
    // Stockage indisponible (navigation privée) : le carnet vit le temps de la visite.
  }
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify([...seen]));
    } catch {
      // Voir plus haut.
    }
  };

  const countIn = (roomId: string) => {
    const room = museum.rooms.find((r) => r.id === roomId)!;
    return { done: room.artworks.filter((a) => seen.has(a.id)).length, total: room.artworks.length };
  };

  function announce(text: string) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), 4500);
  }

  function render() {
    const t = app.ui();
    const button = $('carnet-open');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = `${seen.size}/${all.size}`;
    button.replaceChildren(t.carnet, badge);
    button.setAttribute('aria-label', `${t.carnetTitle} : ${t.carnetCount.replace('{n}', String(seen.size)).replace('{total}', String(all.size))}`);

    $('carnet-title').textContent = t.carnetTitle;
    $('carnet-hint').textContent = t.carnetCount.replace('{n}', String(seen.size)).replace('{total}', String(all.size));
    $('carnet-close').setAttribute('aria-label', t.close);
    const bar = $('carnet-bar');
    bar.style.setProperty('--part', String(all.size ? seen.size / all.size : 0));
    const list = $('carnet-body');
    list.replaceChildren();
    for (const room of museum.rooms) {
      const { done, total } = countIn(room.id);
      if (total === 0) continue;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'carnet-room';
      row.classList.toggle('complete', done === total);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = tr(room.name, app.lang);
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `${done} / ${total}`;
      const track = document.createElement('span');
      track.className = 'track';
      track.style.setProperty('--part', String(done / total));
      row.append(name, count, track);
      row.setAttribute('aria-label', `${tr(room.name, app.lang)} : ${done} / ${total}${done === total ? ` (${t.carnetRoomDone})` : ''}`);
      row.addEventListener('click', () => {
        dialog.hidden = true;
        actions.goToRoom(room.id);
      });
      list.append(row);
    }
    const reset = $('carnet-reset');
    reset.textContent = t.carnetReset;
    reset.hidden = seen.size === 0;
  }

  $('carnet-open').addEventListener('click', () => {
    render();
    dialog.hidden = false;
    $('carnet-close').focus();
  });
  $('carnet-close').addEventListener('click', () => (dialog.hidden = true));
  dialog.addEventListener('click', (e) => e.target === dialog && (dialog.hidden = true));
  $('carnet-reset').addEventListener('click', () => {
    seen.clear();
    save();
    render();
  });
  render();

  return {
    /** Note qu'une œuvre a été vue ; salue la fin d'une salle, puis celle du musée. */
    see(artId: string, roomId: string) {
      if (seen.has(artId) || !all.has(artId)) return;
      seen.add(artId);
      save();
      render();
      const t = app.ui();
      const { done, total } = countIn(roomId);
      if (seen.size === all.size) announce(t.carnetAllDone);
      else if (done === total) announce(t.carnetRoomToast.replace('{room}', tr(museum.rooms.find((r) => r.id === roomId)!.name, app.lang)));
    },
    /** Affiche un court message au-dessus de la barre de commandes. */
    announce,
    close() {
      if (dialog.hidden) return false;
      dialog.hidden = true;
      return true;
    },
    render,
    get count() {
      return seen.size;
    },
  };
}
