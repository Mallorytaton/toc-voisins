// Fenêtre « Le plateau sur une tablette » : le QR code et le lien de l'écran de table d'une salle.
import { tableLink } from '../app/room';
import { h, toast } from './dom';
import { button } from './kit/kit';
import { go } from './nav';
import { openScanner, qrCard } from './qr';

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

/** Code de salle lu dans un QR code ou tapé : lien ?table= ou ?g=, « TOC-4821 » ou « 4821 ». */
const roomCodeOf = (text: string) => /[?&](?:table|g)=(\d{4})/.exec(text)?.[1] ?? /^(?:TOC-?)?(\d{4})$/i.exec(text.trim())?.[1] ?? null;

/** Cet appareil devient le plateau d'une salle (QR code ou code de salle), sans compte ni perso. */
export function openBoardJoin() {
  const close = () => wrap.remove();
  const open = (code: string) => { close(); go('/table/' + code); };
  const field = h('input', {
    class: 'field', placeholder: 'Code (ex. TOC-4821)', 'aria-label': 'Code de la salle',
    inputmode: 'text', autocapitalize: 'characters', enterkeyhint: 'go', style: { flex: 1, minWidth: 0 },
  }) as HTMLInputElement;
  const typed = () => {
    const c = roomCodeOf(field.value);
    if (c) open(c);
    else toast('Entre le code de la salle : 4 chiffres, comme TOC-4821.');
  };
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter') typed(); });
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Utiliser comme plateau de jeu' },
      h('span', { class: 'sheet__title' }, 'Utiliser comme plateau de jeu'),
      h('span', { class: 'sheet__text' }, 'Pose cet appareil au milieu de la table. Dans la salle, un joueur touche « Afficher le plateau sur une tablette » : scanne son QR code, ou entre le code de la salle. Pas besoin de compte.'),
      button('Scanner le QR code', 'primary', () => openScanner('Plateau de jeu', 'Vise le QR code affiché dans la salle, sur le téléphone d’un joueur.',
        'Ce QR code n’est pas celui d’une salle TOC. Vise celui de la salle.', (text) => {
          const c = roomCodeOf(text);
          if (c) open(c);
          return !!c;
        }), { size: 'md', block: true }),
      h('div', { style: { display: 'flex', gap: 10 } }, field, button('Ouvrir', 'dark', typed, { size: 'md' })),
      button('Annuler', 'text', close)));
  (document.getElementById('app') ?? document.body).append(wrap);
}
