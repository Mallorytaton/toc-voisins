// Fenêtre de confirmation avant une action définitive (quitter un tournoi, supprimer une partie…).
import { h, toast } from './dom';
import { button } from './kit/kit';

export function confirmSheet(title: string, text: string, label: string, action: () => Promise<void>) {
  const close = () => wrap.remove();
  const ok = button(label, 'danger', async () => {
    ok.disabled = true;
    try {
      await action();
      close();
    } catch {
      ok.disabled = false;
      toast('Impossible pour l’instant. Réessaie.');
    }
  }, { size: 'md', block: true });
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('span', { class: 'sheet__title' }, title),
      h('span', { class: 'sheet__text' }, text),
      ok,
      button('Annuler', 'text', close)));
  (document.getElementById('app') ?? document.body).append(wrap);
}
