// Fiche de héros : le perso en grand devant son étoile, son niveau, ses chiffres des parties en ligne (parties,
// victoires, BOUM), son ennemi juré, son acolyte et sa carte fétiche. La tienne s'ouvre depuis ton avatar, sur la une ;
// celle d'un ami depuis Ta bande ou le classement.
import { XP_PER_LEVEL, draftProfile, levelOf } from '../../app/profile';
import { type Rival, nemesis, rivalOf } from '../../app/rivaux';
import { ensureAuth } from '../../net/firebase';
import { type PlayerStats, currentUid, playerProfile } from '../../net/social';
import { openAccountSheet } from './account';
import { DEMO } from '../demo';
import { h } from '../dom';
import { COL, type CharId, type ColorName, cardLook } from '../kit/data';
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

/** La fiche de démonstration (?demo) : Frédo, 86 parties, et Coco pour ennemi juré. */
const DEMO_HERO = {
  nick: 'Frédo', char: 'tuque', color: 'coral', xp: 13680, points: 1840, look: { titre: 'roi-boum' },
  stats: { games: 86, wins: 49, streak: 3, best: 6, captures: 212, exits: 301, cards: { '7': 143, J: 98, K: 77 }, partners: { mimi: { g: 31, w: 22 } }, since: Date.now() - 120 * 86_400_000 },
} as unknown as Hero;
const DEMO_FOE: Rival = { name: 'Coco', char: 'casquette', color: 'teal', bot: false, by: 9, on: 12, at: Date.now() - 5 * 86_400_000, dayOn: 3 };

export function playerScreen(id: string): { el: HTMLElement; cleanup: () => void } {
  const mine = DEMO || id === 'moi' || id === currentUid();
  const body = h('div', { class: 'scroll-y heros__body' }, h('p', { class: 'empty' }, 'Chargement…'));
  let alive = true;
  const defier = () => {
    let n = 4;
    try { n = localStorage.getItem('toc.mode') === '6' ? 6 : 4; } catch { /* sans stockage */ }
    go('/salle/nouvelle?n=' + n);
  };

  /** L'ennemi juré (ta fiche) ou votre rivalité à tous les deux (la fiche d'un autre) : qui a renvoyé qui. */
  const foeCard = (p: Hero): HTMLElement | null => {
    const r = DEMO ? DEMO_FOE : mine ? nemesis() : rivalOf(p.nick);
    const me = draftProfile();
    if (!r || !(r.on + r.by))
      return mine ? h('div', { class: 'heros__foe heros__foe--none' },
        h('span', { class: 'heros__foe-k' }, 'Ennemi juré'),
        h('b', null, 'Personne… pour l’instant'),
        h('span', { class: 'heros__foe-t' }, 'Le premier qui renvoie 3 de tes billes à la réserve prend la place.')) : null;
    return h('div', { class: 'heros__foe' },
      avatar(r.char, r.color, 86, 'malin'),
      h('span', { class: 'heros__foe-k' }, mine ? 'Ennemi juré' : 'Entre vous deux'),
      h('b', null, r.name),
      h('span', { class: 'heros__foe-t' }, `${r.name} : ${r.on} renvoi${r.on > 1 ? 's' : ''}. Toi : ${r.by}.`),
      h('button', { class: 'heros__defier', type: 'button', onclick: defier }, 'Défier'),
      // La barre : sa part des renvois à sa couleur, la tienne à la tienne.
      h('div', { class: 'heros__foe-bar', role: 'img', 'aria-label': `${r.name} ${r.on}, toi ${r.by}`, style: { background: COL[me.color].c } },
        h('div', { style: { width: `${Math.round((r.on / (r.on + r.by)) * 100)}%`, background: COL[r.color === me.color ? 'violet' : r.color].c } })));
  };

  const draw = (p: Hero, mate: Mate, offline = false) => {
    const s: Partial<PlayerStats> = p.stats ?? {};
    const games = s.games ?? 0;
    const { level, inLevel } = levelOf(p.xp ?? 0);
    const titre = titreOf(p.look);
    const top = [
      h('div', { class: 'heros__star' },
        h('div', { class: 'heros__burst', 'aria-hidden': 'true' }, ...burstEl(p.color === 'yellow' ? '#fff' : 'var(--jaune)', 14, 37, 4)),
        avatar(p.char, p.color, 178, 'content'),
        h('div', { class: 'heros__lvl', 'aria-label': `Niveau ${level}` }, h('small', null, 'Niveau'), h('b', null, level))),
      h('h1', { class: 'heros__name' + (p.nick.length > 9 ? ' heros__name--long' : '') }, p.nick),
      titre ? h('span', { class: 'heros__titre' }, titre) : null,
      h('div', { class: 'heros__xp' },
        h('div', { class: 'bar', role: 'img', 'aria-label': `${fmt(p.xp ?? 0)} points d’expérience` }, h('div', { style: { width: `${Math.round((inLevel / XP_PER_LEVEL) * 100)}%` } })),
        h('span', null, `${fmt(p.xp ?? 0)} XP`)),
    ];
    const tile = (n: string | number, label: string, hot = false) => h('div', { class: 'heros__tile' + (hot ? ' heros__tile--hot' : '') }, h('b', null, String(n)), h('span', null, label));
    const wins = s.wins ?? 0;
    const best = Object.entries(s.partners ?? {}).sort((a, b) => b[1].w - a[1].w || b[1].g - a[1].g)[0];
    const fav = Object.entries(s.cards ?? {}).sort((a, b) => b[1] - a[1])[0];
    const lines: [string, string][] = games ? [
      ['Victoires', `${Math.round((wins / games) * 100)} % des parties`],
      ['Plus longue série', `${s.best ?? 0} victoire${(s.best ?? 0) > 1 ? 's' : ''}`],
      ...((s.streak ?? 0) > 1 ? [['Série en cours', `${s.streak} victoires`] as [string, string]] : []),
      ['Billes sorties', fmt(s.exits ?? 0)],
      ['Points au classement', fmt(p.points ?? 0)],
    ] : [];
    body.replaceChildren(...[
      ...top,
      h('div', { class: 'heros__tiles' }, tile(fmt(games), games > 1 ? 'parties' : 'partie'), tile(fmt(wins), wins > 1 ? 'victoires' : 'victoire', true), tile(fmt(s.captures ?? 0), 'BOUM')),
      foeCard(p),
      best && mate || fav ? h('div', { class: 'heros__duo' },
        // L'acolyte : le partenaire avec qui ce héros gagne le plus.
        best && mate ? h('div', { class: 'heros__card heros__card--jaune' },
          h('span', { class: 't-mini' }, 'Acolyte'),
          avatar(mate.char, mate.color, 66, 'joie'),
          h('b', null, mate.nick), h('span', null, `${best[1].w} victoire${best[1].w > 1 ? 's' : ''} en ${best[1].g} partie${best[1].g > 1 ? 's' : ''}`)) : null,
        fav ? h('div', { class: 'heros__card' },
          h('span', { class: 't-mini' }, 'Carte fétiche'),
          h('div', { class: 'heros__mini' }, playingCard(fav[0] + (fav[0] === 'X' ? '' : 'D') + '0')),
          h('b', null, CARD_NAMES[fav[0]] ?? `Le ${cardLook(fav[0] + 'S0').r}`), h('span', null, `jouée ${fmt(fav[1])} fois`)) : null) : null,
      !games ? h('div', { class: 'card', style: { alignSelf: 'stretch', padding: '8px 14px 14px' } }, tocSays(
        offline ? 'Tes chiffres (parties, victoires, BOUM) apparaîtront dès que tu seras connecté.'
          : mine ? 'Pas encore de partie comptée : tes chiffres apparaîtront après ta prochaine partie en ligne.'
            : `${p.nick} n’a pas encore de partie comptée.`, 'concentre')) : null,
      lines.length ? h('div', { class: 'card heros__lines' }, ...lines.map(([k, v]) => h('div', { class: 'heros__line' }, h('span', null, k), h('b', null, v)))) : null,
      s.since ? h('span', { class: 't-mini heros__since' }, `Compté depuis le ${sinceFmt.format(s.since)}`) : null,
    ].filter((x): x is HTMLElement => !!x));
  };

  if (DEMO) draw(DEMO_HERO, { nick: 'Mimi', char: 'lunettes', color: 'yellow' });
  else void (async () => {
    // Ta fiche : ce que le téléphone sait de toi s'affiche tout de suite ; tes chiffres en ligne arrivent ensuite.
    const me = draftProfile();
    const local = id === 'moi' ? { nick: me.nick || 'Toi', char: me.char, color: me.color, xp: me.xp, points: me.points ?? 0, look: me.look } as unknown as Hero : null;
    if (local) draw(local, null, !navigator.onLine);
    const uid = id !== 'moi' ? id : navigator.onLine ? await ensureAuth().catch(() => '') : '';
    const p = uid ? await playerProfile(uid).catch(() => null) : null;
    if (!alive) return;
    if (!p) {
      if (!local) body.replaceChildren(h('div', { class: 'card', style: { alignSelf: 'stretch', padding: '8px 14px 14px' } }, tocSays('Ce joueur n’existe plus.', 'surpris')));
      return;
    }
    // Ta fiche garde ton perso du téléphone (un changement de héros pas encore synchronisé s'y voit déjà).
    const hero = local ? { ...p, nick: local.nick, char: local.char, color: local.color, look: local.look } : p;
    draw(hero, null);
    // L'acolyte : son perso et son nom arrivent juste après.
    const best = Object.entries(p.stats?.partners ?? {}).sort((a, b) => b[1].w - a[1].w || b[1].g - a[1].g)[0];
    const m = best ? await playerProfile(best[0]).catch(() => null) : null;
    if (alive && m) draw(hero, { nick: m.nick, char: m.char, color: m.color });
  })();

  const el = h('div', { class: 'screen heros', 'data-fit': 'tabs', 'data-tone': 'rouge', style: { gap: 0, paddingTop: 'calc(var(--safe-top) + 6px)' } },
    h('i', { class: 'rays' }),
    h('div', { class: 'screen__head heros__head' },
      backButton(() => (history.length > 1 ? history.back() : go(ROUTES.home))),
      h('span', { class: 'heros__k' }, 'Fiche de héros'),
      // La tienne : le crayon ouvre ton compte (changer de héros, sons, notifications, sauvegarde).
      mine ? h('button', { class: 'btn-round', type: 'button', 'aria-label': 'Modifier mon héros', onclick: () => openAccountSheet() }, icon(ICONS.edit, 19, 2.8))
        : h('span', { style: { width: 44, flex: 'none' } })),
    body);
  return { el, cleanup: () => { alive = false; } };
}
