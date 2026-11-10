// La une : ce qui t'attend (une partie à reprendre, ton tour, une table qui se lance), de quoi lancer ou rejoindre
// une partie, tes parties à ton rythme, et Toc qui raconte.
import { XP_PER_LEVEL, draftProfile, levelOf } from '../../app/profile';
import { type League, liveGame, parseLeagueCode, refusedBy, watchMyLeagues } from '../../net/league';
import { RoomSession, deleteRoom } from '../../net/session';
import { type SlowGame, forgetGame, watchMyGames } from '../../net/slow';
import { currentUid, watchFriends } from '../../net/social';
import { openAccountSheet } from './account';
import { soireeLabel } from './league';
import { DEMO, DEMO_FRIENDS, type Friend } from '../demo';
import type { CharId, ColorName } from '../kit/data';
import { deNom, h, toast } from '../dom';
import { ICONS, avatar, button, icon, tabbar } from '../kit/kit';
import { mascot } from '../mascot';
import { go } from '../nav';
import { confirmSheet } from '../confirm';
import { nudgePlayers } from '../../net/push';

const fmt = (n: number) => n.toLocaleString('fr-FR');
const MODE_KEY = 'toc.mode';

export function savedMode(): 4 | 6 {
  try {
    return localStorage.getItem(MODE_KEY) === '6' ? 6 : 4;
  } catch {
    return 4;
  }
}

/** Code saisi (« TOC-4821 », « toc 4821 », « 4821 ») ramené à ses 4 chiffres. */
export function parseRoomCode(raw: string): string | null {
  const m = /^\s*(?:toc[\s-]*)?(\d{4})\s*$/i.exec(raw);
  return m ? m[1] : null;
}

/** Les conseils de Toc, un par jour, quand il n'a rien de plus pressant à raconter. */
const TIPS = [
  'Le Valet échange deux billes de place. Garde-le pour les coups durs.',
  'Avec un 7, tu partages tes 7 trous entre plusieurs billes. De quoi en renvoyer deux d’un coup.',
  'Le 4 recule de 4 trous : depuis ta case de départ, c’est un raccourci vers la maison.',
  'Quand tes 4 billes sont rentrées, tu joues celles de ton partenaire. On gagne à deux.',
  'Avant chaque donne, tu passes une carte à ton partenaire. Pense à ce qui lui manque.',
];

/** Ce qui passe à la une : une partie qui t'attend, avec son bouton. */
interface Story {
  tag: string;
  title: string;
  chip: string;
  cta: string;
  go: () => void;
  /** Supprimer la partie (hôte seulement) */
  del?: () => void;
  /** Les autres joueurs, en petit dans le coin */
  cast: { char: CharId; color: ColorName }[];
}

export function homeScreen(): { el: HTMLElement; cleanup: () => void } {
  const p = draftProfile();
  const { level, inLevel } = levelOf(p.xp);
  const fresh = !p.xp;
  const mode = savedMode();

  // ---------- En-tête : le titre du journal, tes pièces, ton perso ----------
  const head = h('div', { class: 'une-head' },
    h('span', { class: 'une-logo', 'aria-hidden': 'true' }, 'TOC !'),
    // Les pièces ouvrent le kiosque.
    h('button', { class: 'tokens', type: 'button', 'aria-label': `${p.tokens} pièces · ouvrir le kiosque`, onclick: () => go('/boutique') }, h('i'), h('span', null, fmt(p.tokens))),
    h('button', { class: 'une-me', type: 'button', 'aria-label': `Ton compte · niveau ${level}`, onclick: () => openAccountSheet() },
      avatar(p.char, p.color, 46), h('span', { class: 'badge-count' }, level)));

  // ---------- Lancer ou rejoindre ----------
  const create = (m: 4 | 6) => {
    try { localStorage.setItem(MODE_KEY, String(m)); } catch { /* sans stockage, on garde en mémoire */ }
    go('/salle/nouvelle?n=' + m);
  };
  /** Un toucher : la salle est créée. Le format joué la dernière fois est mis en avant. */
  const goBtn = (m: 4 | 6) => h('button', { class: 'une-go' + (m === mode ? ' une-go--hot' : ''), type: 'button', 'aria-label': `Créer une salle · ${m} joueurs`, onclick: () => create(m) },
    h('b', null, `${m} joueurs`), h('small', null, `${m / 2} équipes de 2`));
  const sheet = (title: string, ...kids: (HTMLElement | null)[]) => {
    const close = () => wrap.remove();
    const wrap: HTMLElement = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-label': title }, h('span', { class: 'sheet__title' }, title), ...kids));
    (document.getElementById('app') ?? document.body).append(wrap);
    return close;
  };
  const openNew = () => {
    const close = sheet('Nouvelle partie',
      h('span', { class: 'sheet__text' }, 'Tu crées la salle, tu invites ta bande, et vous formez les équipes.'),
      h('div', { class: 'une-hero__go' }, goBtn(4), goBtn(6)),
      button('Annuler', 'text', () => close()));
  };
  const openJoin = () => {
    const code = h('input', {
      class: 'field field--big', placeholder: 'TOC-4821', 'aria-label': 'Code de salle ou d’album',
      inputmode: 'text', autocapitalize: 'characters', enterkeyhint: 'go',
    }) as HTMLInputElement;
    const join = () => {
      // Code de salle (TOC-4821) ou d'album (T-4821)
      const t = parseLeagueCode(code.value);
      if (t) return go('/tournoi/' + t);
      const c = parseRoomCode(code.value);
      if (!c) return toast('Le code ressemble à TOC-4821 (salle) ou T-4821 (album)');
      go('/salle/' + c);
    };
    code.addEventListener('keydown', (e) => e.key === 'Enter' && join());
    const close = sheet('Rejoindre',
      h('span', { class: 'sheet__text' }, 'Tape le code qu’on t’a donné : TOC-4821 pour une salle, T-4821 pour un album.'),
      code,
      button('Rejoindre', 'primary', join, { size: 'md', block: true }),
      button('Annuler', 'text', () => close()));
    setTimeout(() => code.focus(), 60);
  };

  // ---------- Ce qu'on sait en direct : amis, albums, parties à ton rythme, partie interrompue ----------
  let online: Pick<Friend, 'name' | 'char' | 'color'>[] = [];
  let leagues: League[] = [];
  let slow: SlowGame[] = [];
  let resume: { host: boolean } | null = null;
  let lastRoom = '';
  try { lastRoom = localStorage.getItem('toc.lastRoom') ?? ''; } catch { /* sans stockage */ }

  const demoStory: Story | null = DEMO && new URLSearchParams(location.search).get('demo') === 'cours' ? {
    tag: 'Épisode 13 · en cours', title: 'Les voisins du 12', chip: 'À toi de jouer !', cta: 'Reprendre !', go: () => toast('Démonstration : pas de partie à reprendre.'),
    cast: [{ char: 'couronne', color: 'blue' }, { char: 'casquette', color: 'teal' }, { char: 'lunettes', color: 'yellow' }],
  } : null;
  /** La partie qui passe à la une : une table d'album qui se lance, une partie interrompue, ou ton tour dans une partie à ton rythme. */
  const story = (): Story | null => {
    if (demoStory) return demoStory;
    const uid = currentUid();
    for (const l of leagues) {
      const live = liveGame(l, uid);
      if (live) return {
        tag: 'Ça commence !', title: l.name, chip: `${live.by} lance une partie`, cta: 'Rejoindre !', go: () => go('/salle/' + live.code),
        cast: Object.entries(l.members).filter(([u]) => u !== uid).slice(0, 3).map(([, m]) => ({ char: m.char, color: m.color })),
      };
    }
    if (resume) return {
      tag: 'Épisode en cours', title: 'Ta partie t’attend', chip: 'La table est restée ouverte', cta: 'Reprendre !', go: () => go('/salle/' + lastRoom), cast: [],
      // L'hôte peut aussi la supprimer pour tout le monde.
      del: resume.host ? () => confirmSheet('Supprimer la partie en cours ?', 'Elle s’arrête pour tout le monde. C’est définitif.', 'Supprimer la partie', async () => {
        await deleteRoom(lastRoom);
        resume = null;
        try { localStorage.removeItem('toc.lastRoom'); } catch { /* sans stockage */ }
        toast('Partie supprimée.');
        draw();
      }) : undefined,
    };
    const mine = slow.find((g) => g.status === 'mine');
    if (mine) return { tag: 'À ton rythme', title: mine.title, chip: 'À toi de jouer !', cta: 'Jouer mon tour', go: () => go('/salle/' + mine.code), cast: [] };
    return null;
  };

  // ---------- La une ----------
  const friendsLine = h('div', { class: 'une-friends' });
  const hero = h('div', { class: 'une-hero' });
  const drawHero = (s: Story | null) => {
    friendsLine.replaceChildren(...(online.length
      ? [h('div', { class: 'stack' }, ...online.slice(0, 3).map((f) => h('div', { class: 'avatar-ring' }, avatar(f.char, f.color, 28)))),
        h('span', null, online.length > 2 ? `${online[0].name}, ${online[1].name} et ${online.length - 2} autre${online.length > 3 ? 's' : ''} en ligne` : online.map((f) => f.name).join(' et ') + ' en ligne')]
      : [h('span', null, 'Partage le code de ta salle à ta bande.')]));
    hero.className = 'une-hero' + (s ? ' une-hero--now' : '');
    hero.replaceChildren(...[
      h('i', { class: 'rays' }),
      // Ton perso, en grand : c'est toi le héros de l'histoire.
      h('span', { class: 'une-hero__star' }, avatar(p.char, p.color, s ? 172 : 156, s ? 'malin' : 'joie')),
      ...(s ? [
        h('span', { class: 'tag' }, s.tag),
        s.cast.length ? h('div', { class: 'une-hero__cast' }, ...s.cast.map((c, k) => avatar(c.char, c.color, 40, k ? 'content' : 'furieux', { flip: true }))) : null,
        h('span', { class: 'une-hero__title' + (s.title.length > 13 ? ' une-hero__title--long' : '') }, s.title),
        h('span', { class: 'une-chip' }, s.chip),
        h('div', { class: 'une-hero__go une-hero__go--now' },
          button(s.cta, 'primary', s.go, { size: 'md' }),
          s.del ? h('button', { class: 'une-hero__del', type: 'button', onclick: s.del }, 'Supprimer') : null),
      ] : [
        h('span', { class: 'tag' }, `Salut ${p.nick || 'toi'} !`),
        h('span', { class: 'une-hero__title' }, 'On joue ?'),
        h('span', { class: 'une-hero__text' }, 'Crée ta salle, invite ta bande et formez les équipes.'),
        friendsLine,
        h('div', { class: 'une-hero__go' }, goBtn(4), goBtn(6)),
      ]),
    ].filter((x): x is HTMLElement => !!x));
  };

  const tile = (cls: string, ic: string, title: string, sub: string, onclick: () => void) => h('button', { class: 'une-tile ' + cls, type: 'button', onclick },
    h('i', { class: 'une-tile__ic' }, icon(ic, 17, 3.6)), h('b', null, title), h('span', null, sub));
  const tiles = h('div', { class: 'une-tiles' });
  const learnRow = h('div', { class: 'card une-learn' },
    h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 } },
      h('span', { class: 't-label' }, 'Nouveau au TOC ?'),
      h('span', { class: 't-body' }, 'Une partie contre des robots où chaque carte est expliquée.')),
    button('Apprendre', 'dark', () => go('/initiation'), { size: 'xs' }));
  const drawTiles = (s: Story | null) => {
    const learn = tile(fresh ? 'une-tile--jaune' : 'une-tile--turq', ICONS.play, 'Apprendre', 'Une partie guidée contre des robots', () => go('/initiation'));
    const join = tile('', ICONS.arrow, 'Rejoindre', 'Code de salle ou d’album', openJoin);
    // Une partie est déjà à la une : « Nouvelle partie » passe en tuile, et l'initiation reste proposée plus bas.
    tiles.replaceChildren(...(s ? [tile('une-tile--rouge', ICONS.plus, 'Nouvelle partie', '4 ou 6 joueurs', openNew), join] : fresh ? [learn, join] : [join, learn]));
    learnRow.hidden = !s;
  };

  // ---------- Parties à ton rythme : celles où c'est ton tour d'abord ----------
  const ago = (t: number) => {
    const m = Math.max(1, Math.round((Date.now() - t) / 60_000));
    return m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
  };
  const slowList = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } });
  const slowCard = h('div', { class: 'card slow-card', hidden: true },
    h('span', { class: 't-label' }, 'À ton rythme'), slowList);
  const NUDGE_KEY = (code: string) => 'toc.secouer.' + code;
  const nudgedAt = (code: string) => { try { return Number(localStorage.getItem(NUDGE_KEY(code)) ?? 0); } catch { return 0; } };
  const canNudge = (g: SlowGame) => g.status === 'theirs' && g.waiting.length > 0 && Date.now() - g.at > 3_600_000 && Date.now() - nudgedAt(g.code) > 12 * 3_600_000;
  const nudge = async (g: SlowGame) => {
    const names = g.waiting.map((w) => w.name).join(' et ');
    try {
      const sent = await nudgePlayers(g.waiting.map((w) => w.uid), g.code);
      try { localStorage.setItem(NUDGE_KEY(g.code), String(Date.now())); } catch { /* sans stockage */ }
      toast(sent > 0 ? `${names} ${g.waiting.length > 1 ? 'ont été secoués' : 'a été secoué·e'} !`
        : sent < 0 ? 'Déjà secoué·e il y a moins de 12 h. Patience !'
          : `${names} n’a pas activé les notifications : le tour l’attend dans l’app.`, 2600);
    } catch {
      toast('Relance impossible pour l’instant. Réessaie.');
    }
    drawSlow();
  };
  const drawSlow = () => {
    slowCard.hidden = !slow.length;
    slowList.replaceChildren(...slow.slice(0, 3).map((g) => h('div', { class: 'slow-row' + (g.status === 'mine' ? ' slow-row--mine' : '') },
      h('button', { class: 'slow-row__main', type: 'button', onclick: () => go('/salle/' + g.code) },
        h('span', { class: 'slow-row__title' }, g.title),
        h('span', { class: 'slow-row__status' },
          g.status === 'mine' ? 'À toi de jouer' : g.status === 'waiting' ? 'En attente des joueurs'
            : g.status === 'over' ? 'Terminée' : g.who ? `Tour ${deNom(g.who)} · ${ago(g.at)}` : `On attend les autres · ${ago(g.at)}`)),
      // La partie attend quelqu'un depuis plus d'une heure : on peut le secouer (une fois toutes les 12 h).
      canNudge(g) && h('button', { class: 'slow-row__nudge', type: 'button', onclick: () => nudge(g) }, g.waiting.length === 1 ? `Secouer ${g.waiting[0].name}` : 'Secouer'),
      // L'hôte supprime la partie pour tous ; une partie terminée se retire simplement de la liste.
      (g.host || g.status === 'over') && h('button', {
        class: 'slow-row__x', type: 'button', 'aria-label': g.host ? `Supprimer « ${g.title} »` : `Retirer « ${g.title} »`,
        onclick: () => (g.host
          ? confirmSheet(`Supprimer « ${g.title} » ?`, 'La partie s’arrête pour tout le monde et disparaît de vos listes. C’est définitif.', 'Supprimer la partie', () => deleteRoom(g.code).then(() => toast('Partie supprimée.')))
          : forgetGame(g.code).then(() => toast('Partie retirée de ta liste.'))),
      }, '×'))),
    ...(slow.length > 3 ? [h('span', { class: 't-mini' }, `+ ${slow.length - 3} autre${slow.length > 4 ? 's' : ''}`)] : []));
  };

  // ---------- Toc raconte : ce qui se passe autour de toi, sinon un conseil ----------
  const tocText = h('span', { class: 'une-toc__t' });
  const toc = h('div', { class: 'une-toc' }, mascot('content', 76, 'buste'),
    h('div', { class: 'une-toc__bubble' }, h('span', { class: 'une-toc__k' }, 'Toc raconte'), tocText));
  /** Un album a besoin de toi : une table se lance, ou une partie hors app attend ton accord. */
  const needsMe = (l: League) => {
    const uid = currentUid();
    return !!liveGame(l, uid) || (l.seats.includes(uid) && l.offline.some((o) => !o.votes[uid] && !refusedBy(o).length));
  };
  const tocLine = () => {
    if (demoStory) return 'Jeudi dernier, Coco t’a renvoyé 3 fois à la réserve. Ce soir, tu lui en dois une.';
    if (fresh) return 'Bienvenue à la table ! Touche « Apprendre » : une partie guidée où chaque carte est expliquée.';
    const uid = currentUid();
    const pending = leagues.find((l) => !liveGame(l, uid) && needsMe(l));
    if (pending) return `Une partie jouée hors de l’app attend ton accord dans « ${pending.name} ». Va voir dans Albums.`;
    const soon = leagues.filter((l) => l.soiree && l.soiree.at - Date.now() < 7 * 86_400_000).sort((a, b) => a.soiree!.at - b.soiree!.at)[0];
    if (soon) return `Soirée « ${soon.name} » : ${soireeLabel(soon.soiree!.at).toLowerCase()}. Prépare tes valets.`;
    const theirs = slow.find((g) => g.status === 'theirs' && g.who);
    if (theirs) return `Dans « ${theirs.title} », on attend ${theirs.who}. Tu peux le secouer s’il traîne.`;
    if (online.length) return `${online.slice(0, 2).map((f) => f.name).join(' et ')} ${online.length > 1 ? 'sont' : 'est'} en ligne. C’est le moment de lancer une salle.`;
    if (XP_PER_LEVEL - inLevel <= 300) return `Encore ${fmt(XP_PER_LEVEL - inLevel)} XP et tu passes niveau ${level + 1}.`;
    return TIPS[Math.floor(Date.now() / 86_400_000) % TIPS.length];
  };

  let tabs = tabbar('home');
  const draw = () => {
    const s = story();
    drawHero(s);
    drawTiles(s);
    drawSlow();
    tocText.textContent = tocLine();
    // La pastille des Albums : ceux qui ont besoin de toi.
    const n = leagues.filter(needsMe).length;
    const next = tabbar('home', n ? { albums: n } : {});
    tabs.replaceWith(next);
    tabs = next;
  };

  online = DEMO ? DEMO_FRIENDS.filter((f) => f.presence !== 'off') : [];
  const live = !DEMO && navigator.onLine;
  const stopFriends = live ? watchFriends((all) => { online = all.filter((f) => f.presence !== 'off'); draw(); }) : () => {};
  const stopLeagues = live ? watchMyLeagues((list) => { leagues = list; draw(); }) : () => {};
  const stopSlow = live ? watchMyGames((list) => { slow = list; draw(); }) : () => {};
  // Partie en ligne interrompue (app fermée) : on propose de la reprendre.
  let alive = true;
  if (lastRoom && live)
    RoomSession.resumable(lastRoom).then((ok) => {
      if (!ok) try { localStorage.removeItem('toc.lastRoom'); } catch { /* sans stockage */ }
      if (!alive) return;
      resume = ok ? { host: !!ok.host } : null;
      draw();
    }).catch(() => undefined);

  // Le milieu défile si besoin (parties à ton rythme) ; l'en-tête et les onglets restent en place.
  const el = h('div', { class: 'screen screen--tabs une', 'data-fit': 'tabs', 'data-tone': 'jaune', style: { gap: 10, paddingTop: 'calc(var(--safe-top) + 6px)' } },
    head,
    h('div', { class: 'scroll-y une-body' }, hero, tiles, slowCard, toc, learnRow),
    tabs);
  draw();
  return { el, cleanup: () => { alive = false; stopFriends(); stopLeagues(); stopSlow(); } };
}
