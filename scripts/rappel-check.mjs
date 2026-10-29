// Vérifie les rappels de soirée du service de notifications, lancé en local :
//   cd notify && npx wrangler dev --test-scheduled   puis   npx tsx scripts/rappel-check.mjs
// Deux joueurs de test, deux tournois : une soirée dans 50 min (tous deux présents) et une demain
// (proposée il y a 7 h, sans réponse du second). Le journal de wrangler montre les envois.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, runTransaction, set, update } from 'firebase/database';
import { createECDH, randomBytes } from 'node:crypto';
import { firebaseConfig } from '../src/net/firebase-config.ts';

const LOCAL = process.env.NOTIFY_URL ?? 'http://localhost:8787';
const player = async (name, nick) => {
  const app = initializeApp(firebaseConfig, name);
  const user = (await signInAnonymously(getAuth(app))).user;
  const db = getDatabase(app);
  await set(ref(db, `v2/users/${user.uid}`), { nick, char: 'tuque', color: 'coral', xp: 0, tokens: 0 });
  return { app, uid: user.uid, db, user, nick };
};
const subscribe = async (p) => {
  // Une adresse par joueur : un même téléphone n'appartient qu'à un joueur.
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const sub = { endpoint: 'https://postman-echo.com/post?' + p.user.uid, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
  const r = await fetch(LOCAL + '/subscribe', { method: 'POST', headers: { Authorization: 'Bearer ' + (await p.user.getIdToken()), 'Content-Type': 'application/json' }, body: JSON.stringify({ sub }) });
  return r.status;
};
const a = await player('a', 'Testeur'), b = await player('b', 'Testeur');
const now = Date.now();
const league = async (title, at, proposedAt, rsvpB) => {
  let code = '';
  for (let k = 0; k < 20 && !code; k++) {
    const c = String(1000 + Math.floor(Math.random() * 9000));
    if ((await runTransaction(ref(a.db, `v2/leagues/${c}/name`), (cur) => (cur ? undefined : title))).committed) code = c;
  }
  await update(ref(a.db, `v2/leagues/${code}`), { n: 4, host: a.uid, createdAt: now, [`members/${a.uid}`]: { name: 'Frédo', char: 'tuque', color: 'coral' }, 'seats/0': a.uid });
  await update(ref(b.db, `v2/leagues/${code}`), { [`members/${b.uid}`]: { name: 'Mimi', char: 'lunettes', color: 'yellow' }, 'seats/2': b.uid });
  const id = 's' + proposedAt.toString(36);
  await update(ref(a.db, `v2/leagues/${code}`), { soiree: { id, at, place: 'chez Frédo', by: a.uid }, [`rsvp/${id}/${a.uid}`]: 'oui' });
  if (rsvpB) await set(ref(b.db, `v2/leagues/${code}/rsvp/${id}/${b.uid}`), rsvpB);
  await set(ref(a.db, `v2/soirees/${code}`), at);
  return code;
};
const t1 = await league('Test rappel 1 h', now + 50 * 60_000, now - 8 * 3_600_000, 'oui');
const t2 = await league('Test rappel veille', now + 20 * 3_600_000, now - 7 * 3_600_000, null);
console.log('Tournois', t1, '(soirée dans 50 min) et', t2, '(demain, Mimi sans réponse)');
console.log('Abonnements locaux :', await subscribe(a), await subscribe(b));
for (const k of [1, 2]) {
  const r = await fetch(LOCAL + '/__scheduled?cron=' + encodeURIComponent('*/15 * * * *'));
  console.log(`Passage ${k} de la tâche planifiée :`, r.status);
  await new Promise((res) => setTimeout(res, 4000));
}
console.log('Uids : Frédo', a.uid.slice(0, 6), '· Mimi', b.uid.slice(0, 6));
// Nettoyage : les deux tournois de test et leurs soirées
for (const c of [t1, t2]) await update(ref(a.db, 'v2'), { [`leagues/${c}`]: null, [`soirees/${c}`]: null });
await Promise.all([deleteApp(a.app), deleteApp(b.app)]);
process.exit(0);
