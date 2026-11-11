// La une : l'épisode du moment en grand (partie à reprendre, table d'album qui se lance, prochain épisode de ton album),
// « Nouvelle partie » et « Rejoindre », tes parties à ton rythme, et Toc qui raconte.
import { draftProfile, levelOf } from '../../app/profile';
import { lastTime, nemesis } from '../../app/rivaux';
import { type League, liveGame, parseLeagueCode, refusedBy, watchMyLeagues } from '../../net/league';
import { RoomSession, deleteRoom } from '../../net/session';
import { type SlowGame, forgetGame, watchMyGames } from '../../net/slow';
import { currentUid, watchFriends } from '../../net/social';
import { soireeLabel } from './league';
import { DEMO, DEMO_FRIENDS, DEMO_LEAGUE, DEMO_UID, type Friend } from '../demo';
import { type CharId, type ColorName, TEAM_BG, TEAM_INK, TEAM_NAMES } from '../kit/data';
import { deNom, h, toast } from '../dom';
import { ICONS, avatar, button, icon, tabbar } from '../kit/kit';
import { mascot } from '../mascot';
import { go } from '../nav';
import { confirmSheet } from '../confirm';
import { nudgePlayers } from '../../net/push';
import { openScanner } from '../qr';

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

/** Adresse lue dans un QR code d'invitation (salle « ?g=4821 », album « ?t=4821 ») : l'écran à ouvrir, ou null. */
function routeFromScan(text: string): string | null {
  const m = /[?&]([gt])=(\d{4})\b/.exec(text);
  if (m) return (m[1] === 'g' ? '/salle/' : '/tournoi/') + m[2];
  const t = parseLeagueCode(text);
  if (t) return '/tournoi/' + t;
  const c = parseRoomCode(text);
  return c ? '/salle/' + c : null;
}

/** Les conseils de Toc, un par jour, quand il n'a rien de plus pressant à raconter. */
const TIPS = [
  'Le Valet échange deux billes de place. Garde-le pour les coups durs.',
  'Avec un 7, tu partages tes 7 trous entre plusieurs billes. De quoi en renvoyer deux d’un coup.',
  'Le 4 recule de 4 trous : depuis ta case de départ, c’est un raccourci vers la maison.',
  'Quand tes 4 billes sont rentrées, tu joues celles de ton partenaire. On gagne à deux.',
  'Avant chaque donne, tu passes une carte à ton partenaire. Pense à ce qui lui manque.',
];

type Face = { char: CharId; color: ColorName };
/** Ce qui passe à la une : l'épisode du moment, avec son bouton. */
interface Story {
  tag: string;
  title: string;
  /** Le score, par équipe (victoires de l'album) */
  score?: number[];
  chip: string;
  cta: string;
  go: () => void;
  /** Supprimer la partie (hôte seulement) */
  del?: () => void;
  /** Ton partenaire (en bas à droite) et tes adversaires (en haut à droite) */
  partner?: Face;
  rivals: Face[];
}

/** Les compères par défaut, quand on ne sait pas encore avec qui tu joues : ceux des parties contre les robots. */
const MIMI: Face = { char: 'lunettes', color: 'yellow' }, BOSS: Face = { char: 'couronne', color: 'blue' }, COCO: Face = { char: 'casquette', color: 'teal' };

export function homeScreen(): { el: HTMLElement; cleanup: () => void } {
  const p = draftProfile();
  const { level } = levelOf(p.xp);
  const fresh = !p.xp;
  const mode = savedMode();
  // Ton perso ne se croise pas lui-même : si tu portes la tête ou la couleur d'un compère, il en change.
  const other = (f: Face): Face => (f.color === p.color ? { ...f, color: f.color === 'violet' ? 'rose' : 'violet' } : f);

  // ---------- En-tête : le titre du journal, tes pièces, ta fiche de héros ----------
  const head = h('div', { class: 'une-head' },
    h('span', { class: 'une-logo', 'aria-hidden': 'true' }, 'TOC !'),
    // Les pièces ouvrent le kiosque.
    h('button', { class: 'tokens', type: 'button', 'aria-label': `${p.tokens} pièces · ouvrir le kiosque`, onclick: () => go('/boutique') }, h('i'), h('span', null, fmt(p.tokens))),
    h('button', { class: 'une-me', type: 'button', 'aria-label': `Ta fiche de héros, niveau ${level}`, onclick: () => go('/joueur/moi') },
      avatar(p.char, p.color, 52), h('span', { class: 'badge-count' }, level)));

  // ---------- Nouvelle partie, rejoindre ----------
  const create = (m: 4 | 6) => {
    try { localStorage.setItem(MODE_KEY, String(m)); } catch { /* sans stockage, on garde en mémoire */ }
    go('/salle/nouvelle?n=' + m);
  };
  /** Un toucher : la salle est créée. Le format joué la dernière fois est mis en avant. */
  const goBtn = (m: 4 | 6) => h('button', { class: 'une-go' + (m === mode ? ' une-go--hot' : ''), type: 'button', 'aria-label': `Créer une salle · ${m} joueurs`, onclick: () => create(m) },
    h('b', null, `${m} joueurs`), h('small', null, `${m / 2} équipes de 2`));
  const sheet = (title: string, ...kids: (HTMLElement | null | false)[]) => {
    const close = () => wrap.remove();
    const wrap: HTMLElement = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-label': title }, h('span', { class: 'sheet__title' }, title), ...kids));
    (document.getElementById('app') ?? document.body).append(wrap);
    return close;
  };
  const openNew = () => {
    const close = sheet('Nouvelle partie',
      h('span', { class: 'sheet__text' }, 'Tu crées la salle, tu invites ta bande, et vous formez les équipes.'),
      h('div', { class: 'une-gos' }, goBtn(4), goBtn(6)),
      // L'initiation : une partie guidée, pour apprendre ou faire découvrir le jeu.
      button('Partie d’initiation, contre des robots', 'white', () => go('/initiation'), { size: 'sm', block: true }),
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
      h('span', { class: 'sheet__text' }, 'Tape le code qu’on t’a donné (TOC-4821 pour une salle, T-4821 pour un album), ou scanne le QR code de l’invitation.'),
      code,
      button('Rejoindre', 'primary', join, { size: 'md', block: true }),
      // Le QR code affiché sur le téléphone de celui qui invite.
      !!navigator.mediaDevices?.getUserMedia && button('Scanner un QR code', 'white', () => {
        close();
        openScanner('Rejoindre une partie', 'Vise le QR code affiché sur le téléphone de celui qui t’invite.', 'Ce QR code n’est pas une invitation TOC.', (text) => {
          const to = routeFromScan(text);
          if (to) go(to);
          return !!to;
        });
      }, { size: 'sm', block: true }),
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
  const demo = DEMO ? new URLSearchParams(location.search).get('demo') : null;
  const myUid = () => (DEMO ? DEMO_UID : currentUid());

  /** Toi, ton partenaire et tes adversaires dans un album : les places sont fixes. */
  const castOf = (l: League): Pick<Story, 'partner' | 'rivals'> => {
    const uid = myUid(), k = l.seats.indexOf(uid), half = l.n / 2;
    const face = (u: string): Face | null => (l.members[u] ? { char: l.members[u].char, color: l.members[u].color } : null);
    if (k < 0) return { rivals: l.seats.map(face).filter((f): f is Face => !!f).slice(0, 2) };
    return {
      partner: face(l.seats[(k + half) % l.n]) ?? undefined,
      rivals: l.seats.filter((_, i) => i % half !== k % half).map(face).filter((f): f is Face => !!f).slice(0, 2),
    };
  };
  /** L'épisode à la une : une table qui se lance, une partie à reprendre, ton tour, le prochain épisode de ton album, sinon l'invitation à jouer. */
  const story = (): Story => {
    const uid = myUid();
    if (demo === 'cours') return {
      tag: 'Épisode 13 · en cours', title: DEMO_LEAGUE.name, score: [3, 1], chip: 'À toi de jouer !', cta: 'Reprendre !',
      go: () => toast('Démonstration : pas de partie à reprendre.'), ...castOf(DEMO_LEAGUE),
    };
    for (const l of leagues) {
      const live = liveGame(l, uid);
      if (live) return { tag: `Épisode ${l.games.length + 1} · ça commence`, title: l.name, score: l.wins, chip: `${live.by} lance la partie !`, cta: 'Rejoindre !', go: () => go('/salle/' + live.code), ...castOf(l) };
    }
    if (resume) return {
      tag: 'Épisode en cours', title: 'Ta partie t’attend', chip: 'La table est restée ouverte', cta: 'Reprendre !', go: () => go('/salle/' + lastRoom),
      partner: other(MIMI), rivals: [other(BOSS), other(COCO)],
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
    if (mine) return { tag: 'À ton rythme', title: mine.title, chip: 'À toi de jouer !', cta: 'Jouer !', go: () => go('/salle/' + mine.code), partner: other(MIMI), rivals: [other(BOSS), other(COCO)] };
    // Ton album le plus récent : son prochain épisode.
    const l = leagues[0];
    if (l) return {
      tag: `Épisode ${l.games.length + 1} · à jouer`, title: l.name, score: l.wins, chip: l.soiree ? soireeLabel(l.soiree.at) : 'Qui lance la partie ?',
      cta: 'Jouer !', go: () => go('/tournoi/' + l.code), ...castOf(l),
    };
    const friends: Pick<Story, 'partner' | 'rivals'> = online.length
      ? { partner: online[0], rivals: online.slice(1, 3) }
      : { partner: other(MIMI), rivals: [other(BOSS), other(COCO)] };
    // Jamais joué : la une propose l'initiation.
    if (fresh) return { tag: `Salut ${p.nick || 'toi'} !`, title: 'Apprends à jouer', chip: 'Une partie guidée', cta: 'Commencer !', go: () => go('/initiation'), ...friends };
    return {
      tag: `Salut ${p.nick || 'toi'} !`, title: 'On joue ?',
      // Court : le bandeau tient sur une ligne (Toc, dessous, donne les prénoms).
      chip: online.length === 1 ? `${online[0].name} est là !` : online.length ? `${online.length} amis sont là !` : 'Ta bande t’attend',
      cta: 'C’est parti !', go: openNew, ...friends,
    };
  };

  // ---------- Le héros de la une : une composition fixe, comme une couverture ----------
  const hero = h('div', { class: 'une-hero' });
  const drawHero = (s: Story) => {
    const half = s.score?.length ?? 0;
    hero.replaceChildren(...[
      h('div', { class: 'une-hero__bg', 'aria-hidden': 'true' }, h('i', { class: 'rays' }), h('i', { class: 'une-hero__dots' })),
      h('span', { class: 'tag une-hero__tag' }, s.tag),
      ...s.rivals.slice(0, 2).map((f, k) => h('span', { class: 'une-hero__rival une-hero__rival--' + k }, avatar(f.char, f.color, k ? 62 : 54, k ? 'furieux' : 'malin', { flip: true }))),
      h('h1', { class: 'une-hero__title' + (s.title.length > 18 ? ' une-hero__title--long' : '') }, s.title),
      // Le score de l'album : une case par équipe, à sa couleur.
      s.score ? h('div', { class: 'une-hero__score', role: 'img', 'aria-label': s.score.map((w, t) => `${TEAM_NAMES[t]} ${w}`).join(', ') },
        ...s.score.map((w, t) => h('div', { style: { background: TEAM_BG[t], color: TEAM_INK[t], flexDirection: t === half - 1 && half === 2 ? 'row-reverse' : 'row' } }, h('span', null, TEAM_NAMES[t]), h('b', null, w)))) : null,
      // Toi, en grand : c'est toi le héros de l'épisode. Ton partenaire passe la tête en bas à droite.
      h('span', { class: 'une-hero__star' }, avatar(p.char, p.color, 196, 'malin', { flip: true, ombre: true })),
      s.partner ? h('span', { class: 'une-hero__partner' }, avatar(s.partner.char, s.partner.color, 96, 'joie', { flip: true })) : null,
      h('span', { class: 'une-hero__chip' + (s.score ? '' : ' une-hero__chip--haut') }, s.chip),
      h('button', { class: 'une-hero__cta' + (s.score ? '' : ' une-hero__cta--haut'), type: 'button', onclick: s.go }, s.cta),
      s.del ? h('button', { class: 'une-hero__del', type: 'button', onclick: s.del }, 'Supprimer') : null,
    ].filter((x): x is HTMLElement => !!x));
  };

  const tile = (cls: string, ic: string, title: string, sub: string, onclick: () => void) => h('button', { class: 'une-tile ' + cls, type: 'button', onclick },
    h('i', { class: 'une-tile__ic' }, icon(ic, 18, 3.8)), h('span', null, h('b', null, title), h('small', null, sub)));
  const tiles = h('div', { class: 'une-tiles' },
    tile('une-tile--rouge', ICONS.plus, 'Nouvelle partie', '4 ou 6 joueurs', openNew),
    tile('', ICONS.arrow, 'Rejoindre', 'Code ou QR code', openJoin));

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

  // ---------- Toc raconte : tes rivalités, ce qui se passe autour de toi, sinon un conseil ----------
  const tocText = h('span', { class: 'une-toc__t' });
  const toc = h('div', { class: 'une-toc' }, mascot('content', 84, 'buste'),
    h('div', { class: 'une-toc__bubble' }, h('span', { class: 'une-toc__k' }, 'Toc raconte'), tocText));
  /** Un album a besoin de toi : une table se lance, ou une partie hors app attend ton accord. */
  const needsMe = (l: League) => {
    const uid = myUid();
    return !!liveGame(l, uid) || (l.seats.includes(uid) && l.offline.some((o) => !o.votes[uid] && !refusedBy(o).length));
  };
  const tocLine = () => {
    if (demo === 'cours') return 'Jeudi dernier, Coco a renvoyé 3 de tes billes à la réserve. Ce soir, tu lui en dois une.';
    if (fresh) return 'Bienvenue à la table ! Lance l’initiation : une partie guidée où chaque carte est expliquée.';
    const uid = myUid();
    const pending = leagues.find((l) => !liveGame(l, uid) && needsMe(l));
    if (pending) return `Une partie jouée hors de l’app attend ton accord dans « ${pending.name} ». Va voir dans Albums.`;
    // La rivalité du moment : celui qui t'a le plus renvoyé à la réserve.
    const foe = nemesis();
    if (foe && Date.now() - foe.at < 14 * 86_400_000)
      return `${lastTime(foe)}, ${foe.name} a renvoyé ${foe.dayOn > 1 ? `${foe.dayOn} de tes billes` : 'une de tes billes'} à la réserve. ${foe.on > foe.by ? 'Tu lui en dois une.' : 'Vous êtes quittes… pour l’instant.'}`;
    const soon = leagues.filter((l) => l.soiree && l.soiree.at - Date.now() < 7 * 86_400_000).sort((a, b) => a.soiree!.at - b.soiree!.at)[0];
    if (soon) return `Soirée « ${soon.name} » : ${soireeLabel(soon.soiree!.at).toLowerCase()}. Prépare tes valets.`;
    const theirs = slow.find((g) => g.status === 'theirs' && g.who);
    if (theirs) return `Dans « ${theirs.title} », on attend ${theirs.who}. Tu peux le secouer s’il traîne.`;
    if (online.length) return `${online.slice(0, 2).map((f) => f.name).join(' et ')} ${online.length > 1 ? 'sont' : 'est'} en ligne. C’est le moment de lancer une salle.`;
    return TIPS[Math.floor(Date.now() / 86_400_000) % TIPS.length];
  };

  let tabs = tabbar('home');
  const draw = () => {
    drawHero(story());
    drawSlow();
    tocText.textContent = tocLine();
    // La pastille des Albums : ceux qui ont besoin de toi.
    const n = leagues.filter(needsMe).length;
    const next = tabbar('home', n ? { albums: n } : {});
    tabs.replaceWith(next);
    tabs = next;
  };

  online = DEMO ? DEMO_FRIENDS.filter((f) => f.presence !== 'off') : [];
  if (demo === 'album') leagues = [DEMO_LEAGUE];
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
  const el = h('div', { class: 'screen screen--tabs une', 'data-fit': 'tabs', 'data-tone': 'jaune', style: { gap: 0, paddingTop: 'calc(var(--safe-top) + 6px)' } },
    head,
    h('div', { class: 'scroll-y une-body' }, hero, tiles, slowCard, toc),
    tabs);
  draw();
  return { el, cleanup: () => { alive = false; stopFriends(); stopLeagues(); stopSlow(); } };
}
