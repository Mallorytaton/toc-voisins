// Fenêtre « Le plateau sur une tablette » : le QR code et le lien de l'écran de table d'une salle.
import { tableLink } from '../app/room';
import { h, toast } from './dom';
import { button } from './kit/kit';
import { qrCard } from './qr';

export function openTableSheet(code: string) {
  const link = tableLink(code);
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Le plateau sur une tablette' },
      h('span', { class: 'sheet__title' }, 'Le plateau sur une tablette'),
      h('span', { class: 'sheet__text' }, 'Pose une tablette au milieu de la table et scanne ce code avec son appareil photo. Le plateau s’y affiche en grand, sans les cartes de personne ; chacun continue de jouer sur son téléphone.'),
      h('div', { class: 'table-qr' }, qrCard(link, 220)),
      button('Copier le lien', 'white', async () => {
        try {
          await navigator.clipboard.writeText(link);
          toast('Lien copié : ouvre-le sur la tablette.');
        } catch {
          toast(link, 5000);
        }
      }, { size: 'md', block: true }),
      button('Fermer', 'text', close)));
  (document.getElementById('app') ?? document.body).append(wrap);
}
