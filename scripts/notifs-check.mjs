// Vérifie le service de notifications en ligne avec deux vrais comptes Firebase (anonymes) :
// abonnement, refus sans amitié, envoi à un ami absent, silence si l'ami a l'app sous les yeux.
// L'« adresse de push » du destinataire est un service d'écho : il répond une erreur (il ne sait pas lire un
// message chiffré), donc on regarde « tried » (tentatives d'envoi) ; le détail se suit avec « npx wrangler tail ».
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, set, update } from 'firebase/database';
import { firebaseConfig } from '../src/net/firebase-config.ts';
import { createECDH, randomBytes } from 'node:crypto';

const URL_ = 'https://toc-notifs.toc-voisins.workers.dev';
const player = async (name) => {
  const app = initializeApp(firebaseConfig, name);
  const user = (await signInAnonymously(getAuth(app))).user;
  const db = getDatabase(app);
  await set(ref(db, `v2/users/${user.uid}`), { nick: 'Testeur', char: 'tuque', color: 'coral', xp: 0, tokens: 0 });
  const call = async (path, body) => {
    const r = await fetch(URL_ + path, { method: 'POST', headers: { Authorization: 'Bearer ' + (await user.getIdToken()), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return `${r.status} ${await r.text()}`;
  };
  return { app, uid: user.uid, db, call };
};
const a = await player('a'), b = await player('b');
const ua = createECDH('prime256v1');
ua.generateKeys();
const fake = { endpoint: 'https://postman-echo.com/post', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
console.log('Sans jeton :', (await fetch(URL_ + '/notify', { method: 'POST', body: '{}' })).status);
console.log('Abonnement de B :', await b.call('/subscribe', { sub: fake }));
await set(ref(b.db, `v2/status/${b.uid}`), { state: 'offline', at: Date.now() });
console.log('A → B sans être amis :', await a.call('/notify', { to: [b.uid], kind: 'invite', code: '4821' }));
await update(ref(a.db, 'v2/friends'), { [`${a.uid}/${b.uid}`]: true, [`${b.uid}/${a.uid}`]: true });
console.log('A → B, amis, B absent :', await a.call('/notify', { to: [b.uid], kind: 'invite', code: '4821' }));
await set(ref(b.db, `v2/status/${b.uid}`), { state: 'online', at: Date.now(), away: false });
console.log('A → B, B a l’app ouverte :', await a.call('/notify', { to: [b.uid], kind: 'chat', text: 'Coucou' }));
await update(ref(b.db, `v2/status/${b.uid}`), { away: true });
console.log('A → B, B en arrière-plan :', await a.call('/notify', { to: [b.uid], kind: 'chat', text: 'Coucou' }));
console.log('Désabonnement de B :', await b.call('/unsubscribe', { endpoint: fake.endpoint }));
console.log('A → B après désabonnement :', await a.call('/notify', { to: [b.uid], kind: 'chat', text: 'Coucou' }));
await Promise.all([deleteApp(a.app), deleteApp(b.app)]);
process.exit(0);
