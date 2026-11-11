// Le retour haptique de la partie : une petite palette de vibrations, une par geste ou par évènement.
// Android : la vraie vibration du téléphone (durées en millisecondes).
// iPhone : Safari ne laisse pas les apps web faire vibrer le téléphone. Il reste une astuce, bonne pour iOS 17.4 à 26.4
// seulement (Apple l'a fermée ensuite) : pendant un toucher, basculer un interrupteur caché fait faire « tic » au
// téléphone. On la tente, pour un à trois petits coups sous le doigt ; là où elle ne marche plus, il ne se passe rien.
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
/** Nombre de petits coups pour un téléphone qui ne sait que faire « tic » : un par vibration du motif, trois au plus. */
export const ticksOf = (p: Pattern) => (typeof p === 'number' ? 1 : Math.min(3, Math.ceil(p.length / 2)));

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
export const hapticsOn = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
export function setHapticsOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* sans stockage, réglage pour cette visite */ }
}
/** Ce téléphone sait-il vibrer pour une page web ? (Android ; jamais l'iPhone) */
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
/** Écran tactile qui ne sait pas vibrer pour une page web (iPhone) : on tente le « tic » de l'interrupteur. */
const canTick = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * Un « tic » sur iPhone : un interrupteur caché, basculé par son étiquette, puis retiré. Seulement pendant un toucher :
 * en dehors, le téléphone ne répond pas, et un faux clic n'a rien à faire dans la page.
 */
function tick() {
  try {
    if (!navigator.userActivation?.isActive) return;
    const label = document.createElement('label'), input = document.createElement('input');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.append(input);
    document.head.append(label);
    label.click();
    label.remove();
  } catch { /* pas de retour haptique sur ce téléphone */ }
}

let busy: Busy = { until: 0, level: 0 };
/** Fait vibrer le téléphone pour ce geste ou cet évènement, si les vibrations ne sont pas coupées. */
export function haptic(name: Haptic) {
  if (!hapticsOn()) return;
  const p: Pattern = HAPTICS[name];
  const next = admit(busy, p, performance.now());
  if (!next) return;
  if (canVibrate()) {
    busy = next;
    try { navigator.vibrate(typeof p === 'number' ? p : [...p]); } catch { /* refusée : rien à faire */ }
  } else if (canTick()) {
    busy = next;
    tick();
    for (let k = 1; k < ticksOf(p); k++) setTimeout(tick, k * 120);
  }
}
