// Tournois : création, page du tournoi (équipes fixes, score cumulé, dernières parties).
import { type League, createLeague, leagueLink, takeLeagueSeat, watchLeague } from '../../net/league';
import { currentUid } from '../../net/social';
import { h, toast } from '../dom';
import { COL, SEAT_COLORS, TEAM_NAMES } from '../kit/data';
import { avatarRing, backButton, button, duo, segmented } from '../kit/kit';
import { ROUTES, go } from '../nav';
import { savedMode } from './home';
import { variantsCard } from './rules';
import { DEFAULT_VARIANTS, type Variants } from '../../engine';

type View = { el: HTMLElement; cleanup: () => void };

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** Équipe t : places t et t + n/2. */
const teamSeats = (n: number, t: number) => [t, t + n / 2];

export function newLeagueScreen(): View {
  let n = savedMode();
  let variants: Variants = { ...DEFAULT_VARIANTS };
  const rules = variantsCard(() => variants, () => true, (v) => { variants = v; rules.refresh(); });
  const name = h('input', { class: 'field field--big', placeholder: 'Ex. Les voisins du 12', 'aria-label': 'Nom du tournoi', maxlength: 30, enterkeyhint: 'done' });
  const create = button('Créer le tournoi', 'primary', async () => {
    if (!navigator.onLine) return toast('Il faut du réseau pour créer un tournoi.');
    create.disabled = true;
    try {
      const code = await createLeague(name.value, n, variants);
      history.replaceState(null, '', '#/tournoi/' + code);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Création impossible.');
      create.disabled = false;
    }
  }, { block: true });
  const el = h('div', { class: 'screen', style: { gap: 16, paddingTop: 'calc(var(--safe-top) + 8px)' } },
    h('div', { class: 'screen__head' },
      backButton(() => go(ROUTES.home)),
      h('span', { class: 't-title', style: { paddingTop: 3 } }, 'Nouveau tournoi')),
    h('p', { class: 't-body', style: { margin: 0 } },
      'Toujours les mêmes équipes, et les victoires s’additionnent de partie en partie. Idéal pour jouer entre voisins.'),
    h('label', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, h('span', { class: 't-label' }, 'Nom du tournoi'), name),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, h('span', { class: 't-label' }, 'Joueurs'),
      segmented<4 | 6>([{ value: 4, label: '4 joueurs', sub: '2 équipes de 2' }, { value: 6, label: '6 joueurs', sub: '3 équipes de 2' }], n, (v) => { n = v; })),
    rules.el,
    h('div', { class: 'spacer' }),
    create);
  return { el, cleanup: () => {} };
}

async function shareLeague(l: League) {
  const url = leagueLink(l.code);
  const text = `Rejoins le tournoi « ${l.name} » sur TOC (code T-${l.code})`;
  try {
    if (navigator.share) return await navigator.share({ title: 'TOC', text, url });
    await navigator.clipboard.writeText(`${text} : ${url}`);
    toast('Lien copié, envoie-le aux joueurs !');
  } catch { /* partage annulé */ }
}

export function leagueScreen(code: string): View {
  const title = h('span', { class: 't-title', style: { flex: 1, minWidth: 0, paddingTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, 'Tournoi');
  const pill = h('span', { class: 'pill' });
  const codeVal = h('span', { style: { font: '800 26px/1.05 var(--display)', letterSpacing: '.06em' } }, 'T-' + code);
  const teams = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } });
  const hist = h('div', { class: 'card', style: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 } });
  // Déclaré avant la carte « Règles », qui lit le tournoi dès sa création.
  let league: League | null = null;
  const rules = variantsCard(() => league?.variants ?? DEFAULT_VARIANTS, () => false, () => undefined);
  const status = h('span', { class: 'status-line' });
  const play = button('Jouer une partie', 'primary', () => undefined, { size: 'lg', block: true });
  const invite = button('Inviter', 'dark', () => league && shareLeague(league), { size: 'sm' });

  const draw = (l: League | null) => {
    league = l;
    if (!l) {
      title.textContent = 'Tournoi introuvable';
      teams.replaceChildren(h('p', { class: 'empty' }, `Aucun tournoi T-${code}. Vérifie le code.`));
      hist.hidden = true;
      play.hidden = true;
      return;
    }
    const me = currentUid();
    const seated = l.seats.includes(me);
    const full = l.seats.every(Boolean);
    title.textContent = l.name;
    pill.textContent = `${l.n} joueurs`;
    teams.replaceChildren(...Array.from({ length: l.n / 2 }, (_, t) => {
      const seats = teamSeats(l.n, t);
      return h('div', { class: 'card card--lg', style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          duo(SEAT_COLORS[l.n][seats[0]], SEAT_COLORS[l.n][seats[1]]),
          h('span', { style: { flex: 1, font: '800 17px/1 var(--display)', paddingTop: 2 } }, 'Équipe ' + TEAM_NAMES[t]),
          h('span', { style: { font: '800 30px/1 var(--display)', color: COL[SEAT_COLORS[l.n][seats[0]]].d }, 'aria-label': `${l.wins[t]} victoires` }, l.wins[t]),
          h('span', { style: { font: '800 12px var(--text)', color: 'var(--ink-2)', paddingTop: 6 } }, l.wins[t] > 1 ? 'victoires' : 'victoire')),
        h('div', { class: 'seat-grid' }, ...seats.map((k) => {
          const uid = l.seats[k], tint = COL[SEAT_COLORS[l.n][k]];
          const m = uid ? l.members[uid] : null;
          if (m)
            return h('div', { class: 'seat', style: { background: tint.l } },
              avatarRing(m.char, m.color, 38, tint.c, 3, 2, null),
              h('div', { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 } },
                h('span', { class: 'seat__name' }, m.name), h('span', { class: 'seat__tag' }, uid === me ? 'Toi' : uid === l.host ? 'Créateur' : 'Joueur')));
          // Place libre : on la prend (rejoindre, ou choisir son duo tant que le tournoi n'est pas complet).
          return h('button', {
            class: 'seat', type: 'button', style: { border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' },
            onclick: () => takeLeagueSeat(code, k).catch((e) => toast(e instanceof Error ? e.message : 'Place indisponible.')),
          },
            h('div', { class: 'seat__wait' }),
            h('div', { class: 'seat__invite' }, h('span', null, 'Place libre'), h('span', null, seated ? 'Changer de place' : 'Prendre la place')));
        })));
    }));
    hist.hidden = false;
    rules.refresh();
    hist.replaceChildren(h('span', { class: 't-label' }, 'Dernières parties'),
      ...(l.games.length
        ? l.games.slice(0, 4).map((g) => {
          const seats = teamSeats(l.n, g.winner);
          return h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, font: '700 14px var(--text)' } },
            duo(SEAT_COLORS[l.n][seats[0]], SEAT_COLORS[l.n][seats[1]], 12),
            h('span', { style: { flex: 1 } }, `Victoire ${TEAM_NAMES[g.winner]}`),
            h('span', { style: { color: 'var(--ink-3)', font: '800 12px var(--text)' } }, g.at ? dateFmt.format(new Date(g.at)) : ''));
        })
        : [h('span', { class: 't-body' }, 'Aucune partie pour l’instant.')]));
    const filled = l.seats.filter(Boolean).length;
    status.textContent = !full ? `${filled} / ${l.n} joueurs · partage le lien pour compléter`
      : seated ? 'Les équipes sont fixes. Bonne partie !' : 'Ce tournoi est complet.';
    play.hidden = !seated && full;
    play.disabled = !full || !seated;
    play.className = 'btn btn--lg btn--block ' + (full && seated ? 'btn--primary' : 'btn--off');
    play.textContent = full ? 'Jouer une partie' : 'En attente des joueurs…';
    play.onclick = () => go(`/salle/nouvelle?n=${l.n}&ligue=${code}`);
  };

  const stop = watchLeague(code, draw);
  const el = h('div', { class: 'screen', style: { gap: 14, paddingTop: 'calc(var(--safe-top) + 8px)' } },
    h('div', { class: 'screen__head' }, backButton(() => go(ROUTES.home)), title, pill),
    h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 14px 18px' } },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } }, h('span', { class: 't-mini' }, 'Code du tournoi'), codeVal),
      invite),
    teams,
    rules.el,
    hist,
    h('div', { class: 'spacer' }),
    status,
    play);
  return { el, cleanup: stop };
}
