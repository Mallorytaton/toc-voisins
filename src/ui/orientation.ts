// Portrait seulement, sans zoom.
// Android (app installée) : le manifeste verrouille déjà le portrait ; on le redemande au téléphone.
// iPhone et navigateurs : impossible de verrouiller, alors quand le téléphone est tourné, l'app pivote
// à l'inverse (html[data-rot], voir tokens.css) pour rester droite par rapport au téléphone.

type OldWindow = Window & { orientation?: number };

function angle(): number {
  const a = screen.orientation?.angle ?? (window as OldWindow).orientation ?? 0;
  return ((a % 360) + 360) % 360;
}

function apply() {
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  const landscape = window.innerWidth > window.innerHeight;
  const a = angle();
  const rot = phone && landscape ? (a === 270 ? '-90' : '90') : '';
  if (rot) document.documentElement.dataset.rot = rot;
  else delete document.documentElement.dataset.rot;
}

export function lockPortrait() {
  // Accepté seulement en plein écran ou en app installée (Android) ; ailleurs, on ignore le refus.
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  o?.lock?.('portrait').catch(() => undefined);
  apply();
  window.addEventListener('resize', apply);
  screen.orientation?.addEventListener?.('change', apply);
  window.addEventListener('orientationchange', apply);
}

/** iPhone : Safari ignore « user-scalable=no » pour le pincement ; on bloque le geste lui-même. */
export function blockZoom() {
  const stop = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
}
