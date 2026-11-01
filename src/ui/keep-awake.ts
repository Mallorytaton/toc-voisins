// Écran toujours allumé (écran de table) : deux moyens en même temps, dès l'ouverture, sans attendre de toucher.
// 1. La demande officielle au navigateur (Wake Lock), refusée par certaines tablettes sans toucher préalable.
// 2. Une toute petite vidéo muette et invisible qui tourne en boucle (celle de NoSleep.js) : tant qu'une
//    vidéo joue, la tablette ne se met pas en veille, même là où la demande officielle ne marche pas (iPad).
import media from 'nosleep.js/src/media.js';

type WakeLock = EventTarget & { release: () => Promise<void> };
type WakeNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLock> } };

export function keepScreenOn(): { awake: () => boolean; stop: () => void } {
  let lock: WakeLock | null = null;
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1';
  for (const [src, type] of [[media.webm, 'video/webm'], [media.mp4, 'video/mp4']]) {
    const s = document.createElement('source');
    s.src = src;
    s.type = type;
    video.append(s);
  }
  document.body.append(video);

  const again = () => {
    if (document.visibilityState !== 'visible') return;
    if (video.paused) video.play().catch(() => undefined);
    if (lock) return;
    (navigator as WakeNavigator).wakeLock?.request('screen').then((l) => {
      lock = l;
      // L'app passe en arrière-plan : la demande tombe ; on la refait au retour.
      l.addEventListener('release', () => { lock = null; });
    }).catch(() => undefined);
  };
  document.addEventListener('visibilitychange', again);
  document.addEventListener('pointerdown', again, true);
  again();

  return {
    awake: () => !!lock || !video.paused,
    stop: () => {
      document.removeEventListener('visibilitychange', again);
      document.removeEventListener('pointerdown', again, true);
      lock?.release().catch(() => undefined);
      video.pause();
      video.remove();
    },
  };
}
