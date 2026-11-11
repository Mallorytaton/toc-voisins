// Le retour haptique de la partie.
// Android : la vraie vibration du téléphone, avec une petite palette de motifs, un par geste ou par évènement.
// iPhone : Safari ne laisse pas les apps web faire vibrer le téléphone. Le seul retour possible est le « tic » que fait un
// vrai interrupteur (<input type="checkbox" switch>) quand le doigt le bascule : tickUnder() en glisse un, invisible, sous
// chaque geste de la partie. Un seul tic par toucher, toujours le même, et rien pour les évènements (ton tour, un BOUM) :
// depuis iOS 26.5, un interrupteur basculé par le code ne fait plus rien.
// Le réglage « Vibrations » (pause du jeu, Ton compte) coupe tout.

/** Une vibration seule (ms), ou un motif : vibration, silence, vibration… */
export type Pattern = number | readonly number[];

export const HAPTICS = {
  /** Un bouton de la partie (une astuce, un choix, une réaction) */
  touche: 12,
  /** Choisir une carte dans sa main */
  carte: 14,
  /** Choisir une bille, ou le trou où elle arrive */
  bille: 16,
  /** Jouer le coup, donner sa carte */
  jouer: 24,
  /** Chaque trou franchi par la bille que tu joues */
  pas: 10,
  /** La bille que tu joues se pose */
  pose: 20,
  /** Une bille sort de sa réserve */
  sortie: [14, 45, 24],
  /** Une bille rentre à la maison */
  maison: [16, 55, 16, 55, 36],
  /** Deux billes échangent leur place */
  echange: [18, 60, 18],
  /** Un BOUM à la table, entre les autres : le plateau tremble */
  choc: 28,
  /** Tu renvoies une bille */
  boum: [30, 40, 80],
  /** Une de tes billes est renvoyée dans sa réserve */
  aie: [40, 30, 220],
  /** À toi de jouer */
  tour: [60, 40, 60],
  /** La donne : cinq cartes claquent, au rythme du son */
  donne: [10, 75, 10, 75, 10, 75, 10, 75, 10],
  /** Pas ton tour */
  refus: [30, 50, 30],
  /** Le minuteur : chacune des cinq dernières secondes */
  urgence: 30,
  /** Un moment fort pour toi : doublé, vengeance, au millimètre, tes 4 billes rentrées */
  bravo: [20, 40, 20, 40, 60],
  victoire: [80, 60, 80, 60, 200],
  defaite: [130, 90, 60],
} as const satisfies Record<string, Pattern>;
export type Haptic = keyof typeof HAPTICS;

/** Durée totale d'un motif, silences compris (ms). */
export const lengthOf = (p: Pattern) => (typeof p === 'number' ? p : p.reduce((a, b) => a + b, 0));
/** Force d'un motif : sa plus longue vibration. */
export const strengthOf = (p: Pattern) => (typeof p === 'number' ? p : Math.max(...p.filter((_, i) => i % 2 === 0)));

/** Ce qui vibre en ce moment : jusqu'à quand, et avec quelle force. */
export interface Busy { until: number; level: number }
/**
 * Une vibration lancée coupe celle qui est en cours : un petit « tic » ne doit pas faire taire un BOUM.
 * Renvoie le nouvel état si le motif peut partir (rien en cours, ou motif au moins aussi fort), sinon null.
 */
export function admit(busy: Busy, p: Pattern, now: number): Busy | null {
  const level = strengthOf(p);
  return now < busy.until && level < busy.level ? null : { until: now + lengthOf(p), level };
}

// ---------- Le téléphone ----------

const KEY = 'toc.vibrations';
/** Ce téléphone sait-il vibrer pour une page web ? (Android ; jamais l'iPhone) */
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
/**
 * iPhone (Safari 17.4 et plus) : pas de vibration, mais un vrai interrupteur fait « tic » quand le doigt le bascule.
 * Pas l'iPad, qui n'a pas de moteur pour ça.
 */
export const canTick = () => !canVibrate() && typeof navigator !== 'undefined' && /iPhone|iPod/.test(navigator.userAgent ?? '')
  && typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype;
/** Ce téléphone peut-il rendre quelque chose sous le doigt ? */
export const canHaptic = () => canVibrate() || canTick();
/**
 * Le réglage « Vibrations ». Allumé d'office là où le téléphone vibre. Sur iPhone, il faut l'allumer : le tic passe par
 * des interrupteurs invisibles glissés sous le doigt, encore à l'essai.
 */
export const hapticsOn = () => {
  let v: string | null = null;
  try { v = localStorage.getItem(KEY); } catch { /* sans stockage : le réglage d'office */ }
  return canTick() ? v === '1' : v !== '0';
};
export function setHapticsOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* sans stockage, rien n'est retenu */ }
  syncTick();
}

let busy: Busy = { until: 0, level: 0 };
/** Fait vibrer le téléphone pour ce geste ou cet évènement (Android), si les vibrations ne sont pas coupées. */
export function haptic(name: Haptic) {
  if (!canVibrate() || !hapticsOn()) return;
  const p: Pattern = HAPTICS[name];
  const next = admit(busy, p, performance.now());
  if (!next) return;
  busy = next;
  try { navigator.vibrate(typeof p === 'number' ? p : [...p]); } catch { /* refusée : rien à faire */ }
}

// ---------- iPhone : le tic d'un vrai interrupteur ----------
// Technique reprise des bibliothèques browser-haptic et @haptics/core (licence MIT), qui la disent vérifiée sur iOS 26.5 et 27.

/** Les interrupteurs invisibles ne reçoivent les touchers que si le réglage est allumé (voir .tic dans kit.css). */
function syncTick() {
  if (typeof document !== 'undefined') document.documentElement.toggleAttribute('data-tic', canTick() && hapticsOn());
}
syncTick();

/**
 * iPhone : glisse sous ce bouton une étiquette invisible reliée à un vrai interrupteur. Le doigt touche l'étiquette, qui
 * bascule l'interrupteur pour de bon (c'est ce qui fait « tic »), puis le toucher repart vers le bouton comme un clic
 * ordinaire. Sans effet ailleurs, ni tant que le réglage est coupé (l'étiquette n'est alors pas affichée).
 */
export function tickUnder<T extends HTMLElement>(el: T): T {
  if (!canTick() || el.querySelector(':scope > .tic')) return el;
  const sw = document.createElement('input');
  sw.type = 'checkbox';
  sw.setAttribute('switch', '');
  sw.tabIndex = -1;
  const cover = document.createElement('label');
  cover.className = 'tic';
  cover.setAttribute('aria-hidden', 'true');
  cover.append(sw);
  cover.addEventListener('click', (e) => {
    // Le clic que l'étiquette renvoie à son interrupteur remonte ici : ce n'est pas un toucher.
    if (e.target !== cover) return;
    e.stopPropagation();
    if (el.matches(':disabled')) return void e.preventDefault();
    // Un tour plus tard : le clic redessine souvent ce qu'on vient de toucher (la main, les choix), et un interrupteur
    // retiré de la page avant d'avoir basculé ne ferait plus « tic ».
    setTimeout(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), 0);
  });
  const stop = (e: Event) => e.stopPropagation();
  sw.addEventListener('click', stop);
  sw.addEventListener('change', stop);
  el.classList.add('tic-host');
  el.append(cover);
  return el;
}
