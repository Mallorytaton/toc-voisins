// Compte Google : garder sa progression (rattacher le compte anonyme de l'appareil à Google)
// ou la retrouver sur un autre téléphone (« J'ai déjà un compte »).
import {
  type AuthError, GoogleAuthProvider, type User, getAuth, linkWithPopup, signInWithCredential, signInWithPopup,
} from 'firebase/auth';
import { get } from 'firebase/database';
import { type Profile, draftProfile, saveProfile } from '../app/profile';
import { ensureAuth, firebaseApp, node, resetAuthCache } from './firebase';
import type { PublicProfile } from './social';

export interface Account {
  google: boolean;
  email: string;
  name: string;
}

const auth = () => getAuth(firebaseApp());
const isGoogle = (u: User | null) => !!u?.providerData.some((p) => p.providerId === 'google.com');

export async function account(): Promise<Account> {
  await ensureAuth();
  const u = auth().currentUser;
  const g = u?.providerData.find((p) => p.providerId === 'google.com');
  return { google: isGoogle(u), email: g?.email ?? '', name: g?.displayName ?? '' };
}

/** Profil enregistré en ligne pour ce compte (null s'il n'en a pas encore). */
async function onlineProfile(uid: string): Promise<Profile | null> {
  const p = (await get(node('users', uid))).val() as PublicProfile | null;
  if (!p?.nick) return null;
  return {
    nick: p.nick, char: p.char, color: p.color, level: 1, xp: p.xp ?? 0, tokens: p.tokens ?? 0,
    points: p.points ?? 0, city: p.city ?? '', qc: p.qc, friendCode: p.code || undefined,
  };
}

function message(e: unknown) {
  const code = (e as AuthError)?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Connexion annulée.';
  if (code === 'auth/popup-blocked') return 'La fenêtre Google a été bloquée. Autorise les fenêtres pour ce site, puis réessaie.';
  if (code === 'auth/network-request-failed') return 'Pas de réseau. Réessaie quand tu es connecté.';
  if (code === 'auth/operation-not-allowed') return 'La connexion Google n’est pas activée pour le jeu.';
  return 'Connexion Google impossible pour l’instant.';
}

export type SignInResult = { ok: true; restored: boolean } | { ok: false; error: string };

/**
 * Connexion Google.
 * - Compte anonyme sans progression ailleurs : il est rattaché à Google (même identifiant, rien ne se perd).
 * - Ce Google sert déjà un autre compte : on bascule dessus et on reprend son profil (restored = true).
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  const a = auth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await ensureAuth();
    const u = a.currentUser;
    if (u && u.isAnonymous) {
      try {
        await linkWithPopup(u, provider);
        return { ok: true, restored: false };
      } catch (e) {
        if ((e as AuthError).code !== 'auth/credential-already-in-use') throw e;
        const cred = GoogleAuthProvider.credentialFromError(e as AuthError);
        if (!cred) throw e;
        await signInWithCredential(a, cred);
      }
    } else if (!isGoogle(u)) await signInWithPopup(a, provider);
    resetAuthCache();
    const uid = await ensureAuth();
    const p = await onlineProfile(uid);
    if (p) saveProfile({ ...draftProfile(), ...p });
    return { ok: true, restored: !!p };
  } catch (e) {
    console.warn('google', e);
    return { ok: false, error: message(e) };
  }
}
