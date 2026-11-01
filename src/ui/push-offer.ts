// Proposer d'activer les notifications : une fenêtre sur l'accueil (une fois par semaine au plus),
// et un interrupteur dans « Ton compte ».
import { disablePush, enablePush, pushSnoozed, pushState, snoozePush } from '../net/push';
import { h, toast } from './dom';
import { button } from './kit/kit';

const DENIED = 'Notifications bloquées : autorise-les dans les réglages du téléphone, rubrique TOC.';
let shownThisVisit = false;

/** Active (sur un toucher) et dit ce qu'il en est. */
export async function turnPushOn(): Promise<boolean> {
  try {
    const st = await enablePush();
    if (st === 'on') {
      toast('Notifications activées !');
      return true;
    }
    toast(st === 'denied' ? DENIED : 'Notifications non activées.', 2800);
  } catch (e) {
    console.warn('notifications', e);
    toast('Notifications indisponibles pour l’instant. Réessaie plus tard.', 2600);
  }
  return false;
}

/** Sur l'accueil : propose les notifications si elles ne sont pas encore activées. */
export function maybeOfferPush() {
  if (shownThisVisit || pushState() !== 'off' || pushSnoozed()) return;
  shownThisVisit = true;
  const close = () => wrap.remove();
  const later = () => { snoozePush(); close(); };
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) later(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Activer les notifications' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
        h('span', { class: 'notif-bell', 'aria-hidden': 'true' }),
        h('span', { class: 'sheet__title' }, 'Ne rate plus une partie')),
      h('span', { class: 'sheet__text' }, 'Active les notifications : on te prévient quand un ami t’invite, quand c’est ton tour, quand une soirée est proposée ou qu’une partie attend ton accord.'),
      button('Activer les notifications', 'primary', async () => { close(); if (!(await turnPushOn())) snoozePush(); }, { size: 'md', block: true }),
      button('Plus tard', 'text', later)));
  (document.getElementById('app') ?? document.body).append(wrap);
}

/**
 * Après « Je viens » (ou « Peut-être ») à une soirée : dit quand arrivera le rappel.
 * Sans notifications, pas de rappel : on le dit, et on propose de les activer.
 */
export function soireeReminderHint(today: boolean) {
  const when = today ? '1 h avant' : 'le jour même et 1 h avant';
  const st = pushState();
  if (st === 'on') return toast(`C’est noté ! On te le rappellera ${when}.`, 2600);
  if (st === 'install-first') return toast('C’est noté ! Pour recevoir le rappel, installe l’app sur ton écran d’accueil.', 3200);
  if (st === 'denied') return toast('C’est noté ! Les notifications de TOC sont bloquées dans les réglages du téléphone : pas de rappel.', 3200);
  if (st === 'unsupported') return toast('C’est noté ! Ce téléphone ne reçoit pas les notifications : pense à noter la date.', 3200);
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Recevoir le rappel' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
        h('span', { class: 'notif-bell', 'aria-hidden': 'true' }),
        h('span', { class: 'sheet__title' }, 'Recevoir le rappel ?')),
      h('span', { class: 'sheet__text' }, `C’est noté ! Active les notifications pour qu’on te rappelle la soirée ${when}.`),
      button('Activer les notifications', 'primary', async () => {
        close();
        if (await turnPushOn()) toast(`C’est fait ! Rappel ${when}.`, 2600);
      }, { size: 'md', block: true }),
      button('Plus tard', 'text', close)));
  (document.getElementById('app') ?? document.body).append(wrap);
}

/** Ligne « Notifications » de la fenêtre « Ton compte ». null si le téléphone ne peut pas en recevoir. */
export function pushSetting(): HTMLElement | null {
  const st = pushState();
  if (st === 'unsupported') return null;
  const text = h('span', { class: 'push-row__text' });
  const sw = h('input', { type: 'checkbox', class: 'switch', role: 'switch', 'aria-label': 'Notifications' }) as HTMLInputElement;
  const draw = () => {
    const now = pushState();
    sw.checked = now === 'on';
    sw.disabled = now === 'install-first' || now === 'denied';
    text.textContent = now === 'install-first' ? 'Installe l’app sur ton écran d’accueil pour les recevoir.'
      : now === 'denied' ? 'Bloquées dans les réglages du téléphone.'
        : now === 'on' ? 'Invitations, ton tour, soirées, parties à valider.' : 'Désactivées.';
  };
  sw.addEventListener('change', async () => {
    sw.disabled = true;
    if (sw.checked) await turnPushOn();
    else await disablePush().catch(() => undefined);
    draw();
  });
  draw();
  return h('label', { class: 'push-row' },
    h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } }, h('b', null, 'Notifications'), text), sw);
}
