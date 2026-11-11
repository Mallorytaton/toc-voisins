// Écran de table : une tablette posée au milieu de la table affiche le plateau de la salle en grand,
// sans les cartes de personne ; chacun joue sur son téléphone. Lien : ?table=1234 (QR code dans la salle).
// La tablette suit la salle sans y prendre de place (RoomSession.watch) et n'a pas besoin de perso.
import { RoomSession } from '../../net/session';
import { h } from '../dom';
import { avatar, button } from '../kit/kit';
import { mascot } from '../mascot';
import { ROUTES, go } from '../nav';
import { unlockAudio } from '../sound';
import { keepScreenOn } from '../keep-awake';
import { gameScreen } from './game';

export function tableScreen(code: string): { el: HTMLElement; cleanup: () => void } {
  const el = h('div', { class: 'table-screen' });
  let session: RoomSession | null = null;
  let game: { el: HTMLElement; cleanup: () => void } | null = null;
  let alive = true;

  // La tablette ne se met jamais en veille tant que l'écran de table est ouvert (dès l'ouverture, sans toucher).
  const screenOn = keepScreenOn();
  // Les sons (BOUM, victoire…) ne partent qu'après un premier toucher sur la tablette.
  const sound = button('Activer le son', 'white', () => { unlockAudio(); sound.remove(); }, { size: 'md' });
  // Conseil de réglage, seulement si aucun des deux moyens n'a marché.
  const ios = /iPad|iPhone|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
  const sleepTip = h('span', { class: 'table-wait__tip', hidden: true }, ios
    ? 'Si la tablette se met en veille, règle Réglages › Luminosité et affichage › Verrouillage automatique sur « Jamais » le temps de la partie.'
    : 'Si la tablette se met en veille, allonge la mise en veille de l’écran dans ses paramètres d’affichage le temps de la partie.');
  const tipTimer = window.setTimeout(() => { sleepTip.hidden = screenOn.awake(); }, 2500);
  const waiting = (title: string, text: string, seats: HTMLElement[] = [], withSound = true) => el.replaceChildren(
    h('div', { class: 'table-wait' },
      mascot('content', 150),
      h('span', { class: 't-mini' }, `Écran de table · TOC-${code}`),
      h('span', { class: 'table-wait__title' }, title),
      h('span', { class: 'table-wait__text' }, text),
      seats.length ? h('div', { class: 'table-wait__seats' }, ...seats) : null,
      withSound ? sound : null,
      withSound ? sleepTip : null));

  const draw = () => {
    if (!alive || !session) return;
    const r = session.room;
    if (!r) {
      game?.cleanup();
      game = null;
      return waiting('La partie est terminée', 'Cette salle n’existe plus. Tu peux fermer cet écran.', [], false);
    }
    if (game) return;
    if (r.meta.status === 'playing' && r.state) {
      game = gameScreen(session.game(), { onQuit: () => go(ROUTES.home) });
      el.replaceChildren(game.el);
      return;
    }
    const snap = session.snapshot();
    waiting(snap.status === 'countdown' ? 'La partie commence !' : 'En attente du lancement',
      'Le plateau s’affichera ici dès que l’hôte lancera la partie. Chacun joue sur son téléphone.',
      snap.seats.map((p, k) => (p
        ? h('div', { class: 'table-wait__seat' }, avatar(p.char, p.color, 54), h('span', null, p.name))
        : h('div', { class: 'table-wait__seat table-wait__seat--empty' }, h('span', { class: 'aff-chair', style: { width: 50, height: 50 } }, '+'), h('span', null, 'Place libre')))));
  };

  waiting('Connexion à la salle…', 'Un instant.');
  RoomSession.watch(code).then((s) => {
    if (!alive) return s.quit();
    session = s;
    s.onGone = draw;
    s.subscribe(draw);
    draw();
  }).catch((e: Error) => waiting('Salle introuvable', e.message, [], false));

  return {
    el,
    cleanup: () => {
      alive = false;
      game?.cleanup();
      session?.quit();
      screenOn.stop();
      clearTimeout(tipTimer);
    },
  };
}
