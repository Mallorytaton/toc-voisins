// Vérifie « Secouer » et la relance automatique sur le service en ligne, avec deux comptes de test :
// une partie à ton rythme qui attend Mimi depuis 30 h. Usage : npx tsx scripts/secouer-check.mjs [garder]
// (« garder » laisse la partie en place pour que la tâche planifiée la trouve ; sinon elle est supprimée.)
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, set, update } from 'firebase/database';
import { createECDH, randomBytes } from 'node:crypto';
import { firebaseConfig } from '../src/net/firebase-config.ts';

const URL_ = 'https://toc-notifs.toc-voisins.workers.dev';
const keep = process.argv[2] === 'garder';
const player = async (name, nick) => {
  const app = initializeApp(firebaseConfig, name);
  const user = (await signInAnonymously(getAuth(app))).user;
  const db = getDatabase(app);
  await set(ref(db, `v2/users/${user.uid}`), { nick, char: 'tuque', color: 'coral', xp: 0, tokens: 0 });
  const call = async (path, body) => {
    const r = await fetch(URL_ + path, { method: 'POST', headers: { Authorization: 'Bearer ' + (await user.getIdToken()), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  };
  return { app, uid: user.uid, db, call };
};
const a = await player('a', 'Testeur'), b = await player('b', 'Testeur');
const code = String(1000 + Math.floor(Math.random() * 9000));
const now = Date.now(), turnAt = now - 30 * 3_600_000;
await set(ref(a.db, `v2/rooms/${code}/meta`), { host: a.uid, createdAt: now - 31 * 3_600_000, n: 4, status: 'waiting', slow: true, title: 'Test secouer' });
await set(ref(a.db, `v2/rooms/${code}/players/${a.uid}`), { name: 'Frédo', char: 'tuque', color: 'coral', joinedAt: now });
await set(ref(b.db, `v2/rooms/${code}/players/${b.uid}`), { name: 'Mimi', char: 'lunettes', color: 'yellow', joinedAt: now });
await set(ref(a.db, `v2/rooms/${code}/seats/0`), a.uid);
await set(ref(b.db, `v2/rooms/${code}/seats/2`), b.uid);
await update(ref(a.db, `v2/rooms/${code}/seats`), { 1: 'bot', 3: 'bot' });
await update(ref(a.db, `v2/rooms/${code}/meta`), { status: 'playing' });
await set(ref(a.db, `v2/rooms/${code}/state`), { v: 1, n: 4, phase: 'play', turn: 2, dealNo: 0, handCounts: [4, 4, 4, 4] });
await set(ref(a.db, `v2/rooms/${code}/turnAt`), turnAt);
await set(ref(a.db, `v2/index/${code}`), turnAt + 23 * 86_400_000);
const ua = createECDH('prime256v1'); ua.generateKeys();
const sub = { endpoint: 'https://postman-echo.com/post?' + b.uid, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
console.log('Partie TOC-' + code, '| abonnement de Mimi :', JSON.stringify(await b.call('/subscribe', { sub })));
await set(ref(b.db, `v2/status/${b.uid}`), { state: 'offline', at: now });
console.log('Frédo secoue Mimi :', JSON.stringify(await a.call('/notify', { to: [b.uid], kind: 'nudge', code })));
console.log('Frédo secoue encore :', JSON.stringify(await a.call('/notify', { to: [b.uid], kind: 'nudge', code })));
if (!keep) await update(ref(a.db, 'v2'), { [`rooms/${code}`]: null, [`index/${code}`]: null });
console.log(keep ? 'Partie gardée pour la tâche planifiée : TOC-' + code : 'Partie de test supprimée.');
await Promise.all([deleteApp(a.app), deleteApp(b.app)]);
process.exit(0);
