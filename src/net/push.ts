// Notifications (Web Push) : abonnement du téléphone auprès du service de TOC (Worker Cloudflare,
// dossier notify/), et demandes d'envoi. Le service n'envoie qu'entre amis ou membres d'une même salle
// ou d'un même tournoi, et seulement à quelqu'un qui n'a pas l'app sous les yeux.
import { getAuth } from 'firebase/auth';
import { ensureAuth, firebaseApp } from './firebase';

/** Adresse du service ; vide tant qu'il n'est pas en ligne (les notifications restent alors cachées). */
export const NOTIFY_URL = 'https://toc-notifs.toc-voisins.workers.dev';
/** Clé publique de signature (la clé privée n'existe que dans le service). */
const VAPID_PUBLIC = 'BM9d9hBE1XQtrwchuyk3Bcd9rUuBd82tMvdxoKTCzHiw0gUR55j3Hbtu5POpraCFQg-il82FWO4xQC35i8bH9A8';

const ON_KEY = 'toc.notifs';
const SENT_KEY = 'toc.notifs.sent';
const LATER_KEY = 'toc.notifs.later';
const WAIT_DAYS = 7;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
};

export type PushState = 'unsupported' | 'install-first' | 'denied' | 'off' | 'on';

const standalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Où en sont les notifications sur ce téléphone. */
export function pushState(): PushState {
  if (!NOTIFY_URL) return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    // Sur iPhone, les notifications n'existent que pour l'app installée sur l'écran d'accueil.
    return /iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone() ? 'install-first' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && store.get(ON_KEY) === 'on' ? 'on' : 'off';
}

const b64uDecode = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

async function call(path: string, body: unknown) {
  await ensureAuth();
  const token = await getAuth(firebaseApp()).currentUser!.getIdToken();
  const res = await fetch(NOTIFY_URL + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`notifications : ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function subscription(): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('Pas de service worker');
  return (await reg.pushManager.getSubscription())
    ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uDecode(VAPID_PUBLIC) });
}

/** Envoie l'abonnement au service s'il ne le connaît pas déjà (pour ce joueur). */
async function register() {
  const sub = await subscription();
  const uid = await ensureAuth();
  if (store.get(SENT_KEY) === `${uid} ${sub.endpoint}`) return;
  await call('/subscribe', { sub: sub.toJSON() });
  store.set(SENT_KEY, `${uid} ${sub.endpoint}`);
}

/** Demande l'autorisation (à appeler sur un toucher) et abonne ce téléphone. */
export async function enablePush(): Promise<PushState> {
  if ((await Notification.requestPermission()) !== 'granted') return pushState();
  await register();
  store.set(ON_KEY, 'on');
  return 'on';
}

export async function disablePush() {
  store.set(ON_KEY, 'off');
  store.set(SENT_KEY, '');
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await call('/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

/** Au démarrage : l'abonnement peut changer (ou le compte) ; on tient le service à jour. */
export async function refreshPush() {
  if (pushState() === 'on') await register();
}

export type NotifyKind = 'invite' | 'league' | 'turn' | 'chat' | 'soiree' | 'offline';

/** Demande au service de prévenir ces joueurs. Sans attente ni message d'erreur : ce n'est qu'un bonus. */
export function notifyPlayers(to: string[], kind: NotifyKind, extra: { code?: string; text?: string } = {}) {
  if (!NOTIFY_URL || !to.length || !navigator.onLine) return;
  void call('/notify', { to, kind, ...extra }).catch((e) => console.warn('notification', e));
}

/** La proposition d'activer les notifications revient au plus une fois par semaine. */
export const pushSnoozed = () => Date.now() - Number(store.get(LATER_KEY) ?? 0) < WAIT_DAYS * 86_400_000;
export const snoozePush = () => store.set(LATER_KEY, String(Date.now()));
