// Connexion Firebase : Realtime Database + authentification anonyme.
// Les données du nouveau jeu sont rangées sous v2/, à côté de celles de l'ancien site.
import { type FirebaseApp, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { type Database, getDatabase, onValue, ref } from 'firebase/database';
import { firebaseConfig } from './firebase-config';

export const ROOT = 'v2';
export const WEEK = 7 * 24 * 3600 * 1000;

let app: FirebaseApp | null = null;
let db: Database;
let uidPromise: Promise<string> | null = null;
let serverOffset = 0;

export function firebaseApp() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    onValue(ref(db, '.info/serverTimeOffset'), (s) => { serverOffset = Number(s.val()) || 0; });
  }
  return app;
}

export function database() {
  firebaseApp();
  return db;
}

/** Référence sous v2/ : node('rooms', code, 'meta'). */
export const node = (...parts: (string | number)[]) => ref(database(), [ROOT, ...parts].join('/'));

/** Heure du serveur Firebase (corrige l'horloge du téléphone). */
export const serverNow = () => Date.now() + serverOffset;

/** Identifiant du joueur : le compte déjà connecté sur l'appareil (Google ou anonyme), sinon un compte anonyme. */
export function ensureAuth(): Promise<string> {
  if (!uidPromise) {
    const auth = getAuth(firebaseApp());
    uidPromise = (async () => {
      // On attend la session gardée sur l'appareil : sans ça, un compte Google serait remplacé par un anonyme.
      await auth.authStateReady();
      if (auth.currentUser) return auth.currentUser.uid;
      return (await signInAnonymously(auth)).user.uid;
    })().catch((e) => {
      uidPromise = null;
      throw e;
    });
  }
  return uidPromise;
}

/** Après un changement de compte : le prochain ensureAuth relit la session. */
export function resetAuthCache() {
  uidPromise = null;
}

/** Firebase supprime les tableaux vides et les valeurs nulles : on reconstruit des tableaux complets. */
export function arr<T>(x: unknown, len: number, def: (i: number) => T): T[] {
  const o = (x ?? {}) as Record<number, T>;
  return Array.from({ length: len }, (_, i) => (o[i] === undefined || o[i] === null ? def(i) : o[i]));
}

export function list<T>(x: unknown): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x.filter((v) => v !== undefined && v !== null) : Object.values(x as Record<string, T>);
}
