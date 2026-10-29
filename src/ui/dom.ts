type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> | null | undefined;

function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

function setProps(el: Element, props: Props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v as Record<string, string | number>)) {
        if (p.startsWith('--')) (el as HTMLElement).style.setProperty(p, String(val));
        else ((el as HTMLElement).style as unknown as Record<string, string>)[p] = typeof val === 'number' ? val + 'px' : val;
      }
    } else if (k === 'value' && el instanceof HTMLInputElement) el.value = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

/** Crée un élément HTML : h('button', { class: 'btn', onclick }, 'Texte').
 *  Dans style, un nombre vaut des px et les clés « --x » posent des variables CSS. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...children: Child[]) {
  const el = document.createElement(tag);
  setProps(el, props);
  append(el, children);
  return el;
}

/** Petit message flottant au milieu de l'écran. */
export function toast(msg: string, ms = 1700) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  // Dans #app, pour pivoter avec l'app quand le téléphone est tourné.
  (document.getElementById('app') ?? document.body).append(t);
  setTimeout(() => t.remove(), ms);
}
