// Fiche de héros : le perso en grand, son niveau, ses chiffres des parties en ligne (parties, victoires, BOUM,
// billes sorties, séries), son acolyte et sa carte fétiche. La sienne depuis « Ton compte », celle d'un ami depuis
// Ta bande ou le Classement.
import { XP_PER_LEVEL, levelOf } from '../../app/profile';
import { type PlayerStats, currentUid, playerProfile } from '../../net/social';
import { DEMO } from '../demo';
import { h } from '../dom';
import { type CharId, type ColorName, cardLook } from '../kit/data';
import { ICONS, avatar, backButton, icon, playingCard } from '../kit/kit';
import { tocSays } from '../mascot';
import { ROUTES, go } from '../nav';
import { burstEl } from '../planche';
import { titreOf } from '../../app/shop';

const sinceFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const fmt = (n: number) => n.toLocaleString('fr-FR');
/** Nom d'une carte pour « ta carte fétiche » */
const CARD_NAMES: Record<string, string> = { A: 'L’As', K: 'Le Roi', Q: 'La Dame', J: 'Le Valet', X: 'Le Joker' };

type Hero = NonNullable<Awaited<ReturnType<typeof playerProfile>>>;
type Mate = { nick: string; char: CharId; color: ColorName } | null;

/** La fiche de démonstration (?demo) : Frédo, 86 parties. */
const DEMO_HERO = {
  nick: 'Frédo', char: 'tuque', color: 'coral', xp: 13680, points: 1840, look: { titre: 'roi-boum' },
  stats: { games: 86, wins: 49, streak: 3, best: 6, captures: 212, exits: 301, cards: { '7': 143, J: 98, K: 77 }, partners: { mimi: { g: 31, w: 22 } }, since: Date.now() - 120 * 86_400_000 },
} as unknown as Hero;

export function playerScreen(id: string): { el: HTMLElement; cleanup: () => void } {
  const mine = DEMO || id === currentUid();
  const body = h('div', { class: 'scroll-y heros__body' }, h('p', { class: 'empty' }, 'Chargement…'));
  let alive = true;

  const draw = (p: Hero, mate: Mate) => {
    const s: Partial<PlayerStats> = p.stats ?? {};
    const games = s.games ?? 0;
    const { level, inLevel } = levelOf(p.xp ?? 0);
    const titre = titreOf(p.look);
    const top = [
      h('div', { class: 'heros__star' },
        ...burstEl(p.color === 'yellow' ? '#fff' : 'var(--jaune)', 16, 38, 4),
        avatar(p.char, p.color, 138, 'joie'),
        h('div', { class: 'heros__lvl', 'aria-label': `Niveau ${level}` }, h('small', null, 'Niveau'), h('b', null, level))),
      h('span', { class: 'heros__name' + (p.nick.length > 9 ? ' heros__name--long' : '') }, p.nick),
      titre ? h('span', { class: 'tag tag--jaune heros__titre' }, titre) : null,
      h('div', { class: 'heros__xp' },
        h('div', { class: 'bar' }, h('div', { style: { width: `${Math.round((inLevel / XP_PER_LEVEL) * 100)}%` } })),
        h('span', null, `${fmt(p.xp ?? 0)} XP · ${fmt(p.points ?? 0)} points`)),
    ];
    if (!games) {
      body.replaceChildren(...top.filter((x): x is HTMLElement => !!x),
        h('div', { class: 'card', style: { padding: '8px 14px 14px' } }, tocSays(mine ? 'Pas encore de partie comptée : tes chiffres apparaîtront après ta prochaine partie en ligne.'
          : `${p.nick} n’a pas encore de partie comptée.`, 'concentre')));
      return;
    }
    const wins = s.wins ?? 0, pct = Math.round((wins / games) * 100);
    const tile = (n: string | number, label: string, hot = false) => h('div', { class: 'heros__tile' + (hot ? ' heros__tile--hot' : '') }, h('b', null, String(n)), h('span', null, label));
    const best = Object.entries(s.partners ?? {}).sort((a, b) => b[1].w - a[1].w || b[1].g - a[1].g)[0];
    const fav = Object.entries(s.cards ?? {}).sort((a, b) => b[1] - a[1])[0];
    const lines: [string, string][] = [
      ['Victoires', `${pct} % des parties`],
      ['Plus longue série', `${s.best ?? 0} victoire${(s.best ?? 0) > 1 ? 's' : ''}`],
      ...((s.streak ?? 0) > 1 ? [['Série en cours', `${s.streak} victoires`] as [string, string]] : []),
      ['Billes sorties', fmt(s.exits ?? 0)],
    ];
    body.replaceChildren(...[
      ...top,
      h('div', { class: 'heros__tiles' }, tile(fmt(games), games > 1 ? 'parties' : 'partie'), tile(fmt(wins), wins > 1 ? 'victoires' : 'victoire', true), tile(fmt(s.captures ?? 0), 'BOUM')),
      h('div', { class: 'heros__duo' },
        // L'acolyte : le partenaire avec qui ce héros gagne le plus.
        best && mate ? h('div', { class: 'heros__card heros__card--jaune' },
          h('span', { class: 't-mini' }, 'Acolyte'),
          h('div', { class: 'heros__card-row' }, avatar(mate.char, mate.color, 52, 'joie'),
            h('div', null, h('b', null, mate.nick), h('span', null, `${best[1].w} victoire${best[1].w > 1 ? 's' : ''} en ${best[1].g} partie${best[1].g > 1 ? 's' : ''}`)))) : null,
        fav ? h('div', { class: 'heros__card' },
          h('span', { class: 't-mini' }, 'Carte fétiche'),
          h('div', { class: 'heros__card-row' }, h('div', { class: 'heros__mini' }, playingCard(fav[0] + (fav[0] === 'X' ? '' : 'D') + '0')),
            h('div', null, h('b', null, CARD_NAMES[fav[0]] ?? `Le ${cardLook(fav[0] + 'S0').r}`), h('span', null, `jouée ${fmt(fav[1])} fois`)))) : null),
      h('div', { class: 'card heros__lines' }, ...lines.map(([k, v]) => h('div', { class: 'heros__line' }, h('span', null, k), h('b', null, v)))),
      s.since ? h('span', { class: 't-mini heros__since' }, `Compté depuis le ${sinceFmt.format(s.since)}`) : null,
    ].filter((x): x is HTMLElement => !!x));
  };

  if (DEMO) draw(DEMO_HERO, { nick: 'Mimi', char: 'lunettes', color: 'yellow' });
  else void (async () => {
    const p = await playerProfile(id).catch(() => null);
    if (!alive) return;
    if (!p) return body.replaceChildren(h('div', { class: 'card', style: { padding: '8px 14px 14px' } }, tocSays('Ce joueur n’existe plus.', 'surpris')));
    draw(p, null);
    // L'acolyte : son perso et son nom arrivent juste après.
    const best = Object.entries(p.stats?.partners ?? {}).sort((a, b) => b[1].w - a[1].w || b[1].g - a[1].g)[0];
    const m = best ? await playerProfile(best[0]).catch(() => null) : null;
    if (alive && m) draw(p, { nick: m.nick, char: m.char, color: m.color });
  })();

  const el = h('div', { class: 'screen heros', 'data-fit': 'tabs', 'data-tone': 'rouge', style: { gap: 6, paddingTop: 'calc(var(--safe-top) + 8px)' } },
    h('i', { class: 'rays' }),
    h('div', { class: 'screen__head heros__head' },
      backButton(() => (history.length > 1 ? history.back() : go(ROUTES.home))),
      h('span', { class: 't-label heros__k' }, 'Fiche de héros'),
      // La tienne : le crayon ouvre le choix du héros.
      mine ? h('button', { class: 'btn-round', type: 'button', 'aria-label': 'Changer de héros', onclick: () => go(ROUTES.pick) }, icon(ICONS.edit, 20, 2.8))
        : h('span', { style: { width: 44, flex: 'none' } })),
    body);
  return { el, cleanup: () => { alive = false; } };
}
