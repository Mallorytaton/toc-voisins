// Fiche de joueur : ses chiffres des parties en ligne (parties, victoires, BOUM, billes sorties, séries),
// son meilleur partenaire et sa carte fétiche. La sienne depuis « Ton compte », celle d'un ami depuis Amis ou le Classement.
import { levelOf } from '../../app/profile';
import { type PlayerStats, currentUid, playerProfile } from '../../net/social';
import { h } from '../dom';
import { cardLook } from '../kit/data';
import { avatarRing, backButton } from '../kit/kit';
import { tocSays } from '../mascot';
import { ROUTES, go } from '../nav';

const sinceFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
/** Nom d'une carte pour la phrase « ta carte fétiche » */
const CARD_NAMES: Record<string, string> = { A: 'l’As', K: 'le Roi', Q: 'la Dame', J: 'le Valet', X: 'le Joker' };

export function playerScreen(id: string): { el: HTMLElement; cleanup: () => void } {
  const mine = id === currentUid();
  const title = h('span', { class: 't-title', style: { flex: 1, minWidth: 0, paddingTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, mine ? 'Ta fiche' : 'Fiche de joueur');
  const body = h('div', { class: 'scroll-y', style: { display: 'flex', flexDirection: 'column', gap: 14, margin: '0 -20px', padding: '4px 20px 16px' } },
    h('p', { class: 'empty' }, 'Chargement…'));
  let alive = true;
  void (async () => {
    const p = await playerProfile(id).catch(() => null);
    if (!alive) return;
    if (!p) return body.replaceChildren(tocSays('Ce joueur n’existe plus.', 'surpris'));
    title.textContent = mine ? 'Ta fiche' : p.nick;
    const s: Partial<PlayerStats> = p.stats ?? {};
    const games = s.games ?? 0;
    const head = h('div', { class: 'card player-head' },
      avatarRing(p.char, p.color, 76, 'var(--coral)', 4, 3, null),
      h('div', { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 } },
        h('span', { class: 'player-head__name' }, p.nick),
        h('span', { class: 't-mini' }, `Niveau ${levelOf(p.xp ?? 0).level} · ${p.points ?? 0} points`)));
    if (!games) {
      body.replaceChildren(head, tocSays(mine ? 'Pas encore de partie comptée : tes chiffres apparaîtront après ta prochaine partie en ligne.'
        : `${p.nick} n’a pas encore de partie comptée.`, 'concentre'));
      return;
    }
    const pct = Math.round(((s.wins ?? 0) / games) * 100);
    const tile = (n: string | number, label: string) => h('div', { class: 'player-tile' }, h('b', null, String(n)), h('span', null, label));
    // Meilleur partenaire : le plus de victoires ensemble (puis le plus de parties).
    const partners = Object.entries(s.partners ?? {}).sort((a, b) => b[1].w - a[1].w || b[1].g - a[1].g);
    const best = partners[0];
    const mateName = best ? ((await playerProfile(best[0]).catch(() => null))?.nick ?? '…') : '';
    if (!alive) return;
    const fav = Object.entries(s.cards ?? {}).sort((a, b) => b[1] - a[1])[0];
    const favName = fav ? CARD_NAMES[fav[0]] ?? `le ${cardLook(fav[0] + 'S0').r}` : '';
    const lines: [string, string][] = [];
    if (best) lines.push(['Meilleur partenaire', `${mateName} · ${best[1].w} victoire${best[1].w > 1 ? 's' : ''} ensemble`]);
    if (fav) lines.push(['Carte fétiche', `${favName} · jouée ${fav[1]} fois`]);
    lines.push(['Plus longue série', `${s.best ?? 0} victoire${(s.best ?? 0) > 1 ? 's' : ''}`]);
    if ((s.streak ?? 0) > 1) lines.push(['Série en cours', `${s.streak} victoires`]);
    body.replaceChildren(head,
      h('div', { class: 'player-grid' },
        tile(games, `partie${games > 1 ? 's' : ''} en ligne`), tile(`${pct} %`, 'de victoires'),
        tile(s.captures ?? 0, 'BOUM (billes renvoyées)'), tile(s.exits ?? 0, 'billes sorties')),
      h('div', { class: 'card player-lines' }, ...lines.map(([k, v]) => h('div', { class: 'recap__line player-line' }, h('span', null, k), h('b', null, v)))),
      s.since ? h('span', { class: 't-mini', style: { textAlign: 'center' } }, `Compté depuis le ${sinceFmt.format(s.since)}`) : h('span'));
  })();
  const el = h('div', { class: 'screen', 'data-fit': 'tabs', style: { gap: 14, paddingTop: 'calc(var(--safe-top) + 8px)' } },
    h('div', { class: 'screen__head' }, backButton(() => (history.length > 1 ? history.back() : go(ROUTES.home))), title),
    body);
  return { el, cleanup: () => { alive = false; } };
}
