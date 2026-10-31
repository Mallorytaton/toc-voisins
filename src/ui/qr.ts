// QR codes d'ami : afficher le sien (avec Toc au centre), scanner celui d'un ami avec l'appareil photo.
// Lecture : le détecteur intégré au navigateur s'il existe (Android), sinon jsQR (iPhone, ordinateur),
// chargé seulement au moment de scanner.
import { renderSVG } from 'uqr';
import { h, toast } from './dom';
import { button } from './kit/kit';
import { mascot } from './mascot';

/** Un QR code, avec la tête de Toc au centre (correction d'erreur maximale : il reste lisible). */
export function qrCard(text: string, size = 250): HTMLElement {
  const box = h('div', { class: 'qr', style: { width: size, height: size } });
  box.innerHTML = renderSVG(text, { ecc: 'H', border: 2, blackColor: '#2b2a3d', whiteColor: '#ffffff' });
  box.append(h('span', { class: 'qr__toc' }, mascot('content', Math.round(size * 0.2), 'buste')));
  return box;
}

/** Le code ami contenu dans un QR : le lien de l'app (…?ami=FREDO%232741) ou le code seul. */
export function friendCodeFrom(text: string): string | null {
  const ok = (c: string) => /^[A-Z]+[#-]\d{4}$/.test(c);
  try {
    const c = new URL(text).searchParams.get('ami')?.toUpperCase();
    if (c && ok(c)) return c;
  } catch { /* pas un lien */ }
  const t = text.trim().toUpperCase();
  return ok(t) ? t : null;
}

type Detect = (v: HTMLVideoElement) => Promise<string | null>;
interface BarcodeDetectorLike { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> }
interface BarcodeDetectorClass {
  new (o: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?(): Promise<string[]>;
}

async function makeDetector(): Promise<Detect> {
  const BD = (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  const formats: string[] = BD ? (await BD.getSupportedFormats?.().catch(() => [] as string[])) ?? [] : [];
  if (BD && formats.includes('qr_code')) {
    const d = new BD({ formats: ['qr_code'] });
    return async (v) => (await d.detect(v))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return async (v) => {
    const s = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
    canvas.width = Math.round(v.videoWidth * s);
    canvas.height = Math.round(v.videoHeight * s);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

/**
 * Ouvre l'appareil photo (arrière) et cherche un QR code. `onText` renvoie true quand le texte convient :
 * la caméra s'arrête et la fenêtre se ferme ; sinon on continue en affichant `wrongHint`.
 */
export function openScanner(title: string, help: string, wrongHint: string, onText: (text: string) => boolean) {
  const video = h('video', { class: 'scan__video', autoplay: '', playsinline: '' }) as HTMLVideoElement;
  video.muted = true;
  const hint = h('span', { class: 'scan__hint' }, help);
  let stream: MediaStream | null = null;
  let stopped = false;
  let timer = 0;
  const close = () => {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    wrap.remove();
  };
  const wrap = h('div', { class: 'scan', role: 'dialog', 'aria-label': title },
    video,
    h('div', { class: 'scan__frame', 'aria-hidden': 'true' }),
    h('div', { class: 'scan__bar' }, h('span', { class: 'scan__title' }, title), hint, button('Annuler', 'white', close, { size: 'md', block: true })));
  (document.getElementById('app') ?? document.body).append(wrap);
  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (e) {
      close();
      toast((e as Error).name === 'NotAllowedError'
        ? 'Accès à l’appareil photo refusé. Autorise-le dans les réglages du téléphone, ou tape le code ami.'
        : 'Appareil photo indisponible. Tape le code ami à la place.', 3400);
      return;
    }
    if (stopped) return void stream.getTracks().forEach((t) => t.stop());
    video.srcObject = stream;
    await video.play().catch(() => undefined);
    const detect = await makeDetector();
    const tick = async () => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const text = await detect(video).catch(() => null);
        if (stopped) return;
        if (text) {
          if (onText(text)) return close();
          hint.textContent = wrongHint;
        }
      }
      timer = window.setTimeout(tick, 200);
    };
    void tick();
  })();
}

/** Petite icône d'appareil photo (bouton « Scanner »). */
export const cameraIcon = () => {
  const s = h('span', { class: 'cam-icon', 'aria-hidden': 'true' });
  s.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M9 4.5h6l1.4 2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h2.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12.6" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  return s;
};
