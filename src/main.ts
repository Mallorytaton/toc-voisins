import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/baloo-2';
import '@fontsource-variable/nunito';
import './ui/kit/tokens.css';
import './ui/kit/kit.css';
import { vitrineScreen } from './ui/screens/vitrine';

registerSW({ immediate: true });

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

function setView(el: HTMLElement, onLeave?: () => void) {
  cleanup?.();
  cleanup = onLeave ?? null;
  app.replaceChildren(el);
  window.scrollTo(0, 0);
}

/** Routes par hash (#/vitrine…). Les écrans de la maquette arrivent à l'étape 3. */
function router() {
  const path = location.hash.replace(/^#/, '') || '/';
  switch (path) {
    case '/vitrine':
    default:
      return setView(vitrineScreen());
  }
}

window.addEventListener('hashchange', router);
router();
