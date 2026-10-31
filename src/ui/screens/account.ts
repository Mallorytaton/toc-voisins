// « Ton compte » : feuille ouverte depuis l'avatar de l'accueil (garder sa progression avec Google).
import { draftProfile, getProfile } from '../../app/profile';
import { account, signInWithGoogle } from '../../net/account';
import { syncProfile } from '../../net/social';
import { h, toast } from '../dom';
import { avatarRing, button } from '../kit/kit';
import { ROUTES, go } from '../nav';
import { pushSetting } from '../push-offer';
import { soundSettings } from '../sound';
import { currentUid } from '../../net/social';

/** Connexion Google puis suite logique : profil retrouvé → accueil, sinon → choix du perso. */
export async function googleThenGo(): Promise<boolean> {
  if (!navigator.onLine) {
    toast('Pas de réseau. Réessaie quand tu es connecté.', 2400);
    return false;
  }
  const r = await signInWithGoogle();
  if (!r.ok) {
    toast(r.error, 2600);
    return false;
  }
  if (r.restored) {
    // Autre compte retrouvé : on recharge l'app pour repartir proprement avec lui.
    location.hash = ROUTES.home;
    location.reload();
  } else if (getProfile()) {
    await syncProfile().catch(() => undefined);
    toast('Ta progression est sauvegardée !', 2200);
  } else toast('Compte Google relié ! Choisis ton perso.', 2200);
  return true;
}

export function openAccountSheet() {
  const p = draftProfile();
  const status = h('span', { class: 'sheet__text' }, '…');
  const googleBtn = button('Garder ma progression avec Google', 'primary', async () => {
    googleBtn.disabled = true;
    if (await googleThenGo()) close();
    googleBtn.disabled = false;
  }, { size: 'md', block: true });
  googleBtn.hidden = true;
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Ton compte' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
        avatarRing(p.char, p.color, 52, 'var(--coral)'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          h('span', { class: 'sheet__title' }, p.nick || 'Toi'),
          h('span', { class: 't-mini' }, `Code ami ${p.friendCode ?? '—'}`))),
      status,
      googleBtn,
      pushSetting(),
      soundSettings(),
      navigator.onLine && button('Ma fiche de joueur', 'white', () => { close(); go('/joueur/' + currentUid()); }, { size: 'md', block: true }),
      button('Changer de perso', 'white', () => { close(); go(ROUTES.pick); }, { size: 'md', block: true }),
      button('Fermer', 'text', close)));
  (document.getElementById('app') ?? document.body).append(wrap);
  if (!navigator.onLine) {
    status.textContent = 'Hors ligne : ta progression reste sur ce téléphone.';
    return;
  }
  account().then((a) => {
    if (a.google) status.textContent = `Connecté·e avec Google${a.email ? ' · ' + a.email : ''}. Ta progression te suit sur tous tes téléphones.`;
    else {
      status.textContent = 'Retrouve ton perso, tes points et tes amis sur un autre téléphone.';
      googleBtn.hidden = false;
    }
  }).catch(() => { status.textContent = 'Compte indisponible pour l’instant.'; });
}
