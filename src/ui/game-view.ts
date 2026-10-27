import {
  Card, GameState, Move, PawnRef, RANK_NAMES, Rank, SUIT_SYMBOLS, SevenPart, applyMove, applySevenPrefix,
  clonePawns, inBase, inHome, isRed, legalMoves, partner, rankOf, sameRef, suitOf, teamOf,
} from '../engine';
import { Board } from './board';
import { COLORS, shapeIcon } from './colors';
import { confetti, haptic, isMuted, setMuted, sfx } from './fx';
import type { GameController } from './controller';
import { h, toast } from './dom';
import { rulesView } from './rules';

const TEAM_LETTERS = ['A', 'B', 'C'];
const SHORT: Record<string, string> = { J: 'V', Q: 'D', K: 'R', X: '★' };

interface Sel {
  card: Card;
  as: Rank | null;
  pawn: PawnRef | null;
  parts: SevenPart[];
  pawn7: PawnRef | null;
  move: Move | null;
}

const FACE_ICONS: Record<string, string> = { J: '⚔', Q: '♛', K: '♚', X: '★' };

/** Carte à jouer : index dans les coins, grand motif central. */
export function cardFace(card: Card) {
  const r = rankOf(card);
  const red = isRed(card);
  const label = SHORT[r] ?? r;
  const suit = SUIT_SYMBOLS[suitOf(card)] ?? '';
  const face = FACE_ICONS[r];
  const corner = (cls: string) => h('span', { class: 'corner ' + cls }, h('b', null, r === 'X' ? '★' : label), r === 'X' ? null : h('i', null, suit));
  return h(
    'span',
    { class: 'face' + (red ? ' red' : '') + (r === 'X' ? ' joker' : '') + (face ? ' figure' : '') },
    corner('tl'),
    r === 'X'
      ? h('span', { class: 'center' }, h('span', { class: 'big' }, '★'), h('span', { class: 'jk' }, 'JOKER'))
      : face
        ? h('span', { class: 'center' }, h('span', { class: 'big' }, label), h('span', { class: 'emblem' }, face, suit))
        : h('span', { class: 'center' }, h('span', { class: 'big' }, suit)),
    corner('br'),
  );
}

export function cardName(card: Card) {
  const r = rankOf(card);
  return r === '?' ? 'carte' : RANK_NAMES[r];
}

export interface GameViewOptions {
  onQuit: () => void;
  onShare?: () => void;
}

export function mountGame(root: HTMLElement, ctl: GameController, opts: GameViewOptions) {
  const st0 = ctl.state;
  const rotation = ctl.mode === 'online' ? Math.max(0, ctl.viewer) : Math.max(0, ctl.seats.findIndex((s) => !s.bot));
  const board = new Board(
    st0.n,
    rotation,
    ctl.seats.map((s) => s.color),
    ctl.seats.map((s) => s.name),
  );
  let sel: Sel | null = null;
  let busy = false;
  let lastV = -1;
  let lastTurnMine = false;
  let legal: { key: string; moves: Move[] } = { key: '', moves: [] };

  const name = (seat: number) => ctl.seats[seat]?.name || `Joueur ${seat + 1}`;
  const fmt = (text: string) => text.replace(/@(\d)/g, (_, d) => name(+d));

  const players = h('div', { class: 'players' });
  const status = h('div', { class: 'status', 'aria-live': 'polite' });
  const actions = h('div', { class: 'actions' });
  const hand = h('div', { class: 'hand' });
  const logList = h('ol', { class: 'log-list' });
  const lastLog = h('div', { class: 'last-log' });
  const overlay = h('div', { class: 'overlay-host' });

  const topbar = h(
    'header',
    { class: 'topbar' },
    h('button', { class: 'icon-btn', onclick: () => confirmQuit(), 'aria-label': 'Quitter la partie' }, '←'),
    ctl.code
      ? h('button', { class: 'code-btn', onclick: () => opts.onShare?.(), 'aria-label': 'Partager la partie' }, `TOC-${ctl.code}`, h('span', { class: 'muted' }, ' · inviter'))
      : h('span', { class: 'title' }, 'Table locale'),
    h('div', { class: 'top-actions' },
      h('button', { class: 'icon-btn', onclick: (e: Event) => toggleSound(e.currentTarget as HTMLElement), 'aria-label': 'Activer ou couper le son' }, isMuted() ? '🔇' : '🔊'),
      h('button', { class: 'icon-btn', onclick: () => showLog(), 'aria-label': 'Journal des coups' }, '📜'),
      h('button', { class: 'icon-btn', onclick: () => showRules(), 'aria-label': 'Règles' }, '?')),
  );

  function toggleSound(btn: HTMLElement) {
    setMuted(!isMuted());
    btn.textContent = isMuted() ? '🔇' : '🔊';
    if (!isMuted()) sfx.tap();
  }

  const pile = h('div', { class: 'pile', 'aria-live': 'polite' });
  const banner = h('div', { class: 'turn-banner', 'aria-hidden': 'true' }, 'À toi de jouer !');

  root.replaceChildren(
    h(
      'div',
      { class: 'game' },
      topbar,
      h(
        'div',
        { class: 'game-main' },
        h('div', { class: 'board-col' }, players, h('div', { class: 'board-wrap' }, board.el, pile, banner), lastLog),
        h(
          'div',
          { class: 'panel-col' },
          status,
          actions,
          hand,
        ),
      ),
      overlay,
    ),
  );

  function confirmQuit() {
    if (ctl.state.phase === 'over' || confirm(ctl.mode === 'online' ? 'Quitter la partie ? Tu pourras revenir avec le lien.' : 'Quitter la table locale ? La partie est sauvegardée sur cet appareil.')) {
      ctl.leave();
      opts.onQuit();
    }
  }

  function showLog() {
    const close = () => modal.remove();
    const modal = h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true', onclick: (e: Event) => e.target === modal && close() },
      h('div', { class: 'modal-box' }, h('button', { class: 'icon-btn close', onclick: close, 'aria-label': 'Fermer' }, '✕'), h('h2', null, 'Journal des coups'), logList),
    );
    document.body.append(modal);
  }

  function showRules() {
    const close = () => modal.remove();
    const modal = h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true', onclick: (e: Event) => e.target === modal && close() },
      h('div', { class: 'modal-box' }, h('button', { class: 'icon-btn close', onclick: close, 'aria-label': 'Fermer' }, '✕'), rulesView(ctl.state.variants)),
    );
    document.body.append(modal);
  }

  const st = () => ctl.state;
  const myTurn = () => st().phase === 'play' && ctl.viewer >= 0 && st().turn === ctl.viewer && !ctl.curtain;

  function moves(): Move[] {
    const s = st();
    if (!myTurn()) return [];
    const key = `${s.v}|${ctl.viewer}|${s.hands[ctl.viewer].join()}`;
    if (legal.key !== key) legal = { key, moves: legalMoves(s) };
    return legal.moves;
  }
  const movesOf = (card: Card, as?: Rank | null) =>
    moves().filter((m) => m.kind !== 'discard' && m.card === card && (!as || m.as === as)) as Exclude<Move, { kind: 'discard' }>[];

  const prefixOk = (m: Move, parts: SevenPart[]) =>
    m.kind === 'seven' && parts.every((p, k) => m.parts[k] && sameRef(m.parts[k].pawn, p.pawn) && m.parts[k].steps === p.steps);

  function chooseAs(as: Rank) {
    if (!sel) return;
    sel.as = as;
    const cand = movesOf(sel.card, as);
    if (cand.length === 1 && cand[0].kind !== 'seven') sel.move = cand[0];
    else if (cand.length === 1) sel.move = cand[0];
    render();
  }

  function tapCard(card: Card) {
    const s = st();
    if (busy) return;
    sfx.tap();
    haptic(8);
    if (s.phase === 'exchange') {
      if (ctl.viewer < 0 || s.exchange[ctl.viewer]) return;
      sel = sel?.card === card ? null : { card, as: null, pawn: null, parts: [], pawn7: null, move: null };
      return render();
    }
    if (!myTurn()) return toast("Ce n'est pas ton tour");
    if (sel?.card === card) {
      sel = null;
      return render();
    }
    const ms = movesOf(card);
    if (!ms.length) {
      sfx.error();
      return toast(`Le ${cardName(card)} ne permet aucun coup`);
    }
    sel = { card, as: null, pawn: null, parts: [], pawn7: null, move: null };
    const r = rankOf(card) as Rank;
    const ases = [...new Set(ms.map((m) => m.as))];
    if (r !== 'X' || ases.length === 1) chooseAs(ases[0]);
    else render();
  }

  function tapPawn(ref: PawnRef) {
    if (!sel || !sel.as || busy) return;
    sfx.tap();
    haptic(8);
    const cand = movesOf(sel.card, sel.as);
    if (sel.as === '7' && cand[0]?.kind === 'seven') {
      sel.pawn7 = ref;
      const k = sel.parts.length;
      const steps = [...new Set(cand.filter((m) => prefixOk(m, sel!.parts) && m.kind === 'seven' && sameRef(m.parts[k].pawn, ref)).map((m) => (m as { parts: SevenPart[] }).parts[k].steps))];
      if (steps.length === 1) return addSevenPart(steps[0]);
      return render();
    }
    if (cand[0]?.kind === 'swap' && !(sel.pawn && cand.some((m) => m.kind === 'swap' && sameRef(m.pawn, sel!.pawn!) && sameRef(m.target, ref)))) {
      sel.pawn = ref;
      sel.move = null;
      const targets = cand.filter((m) => m.kind === 'swap' && sameRef(m.pawn, ref));
      if (targets.length === 1) sel.move = targets[0];
      return render();
    }
    if (cand[0]?.kind === 'swap' && sel.pawn) {
      sel.move = cand.find((m) => m.kind === 'swap' && sameRef(m.pawn, sel!.pawn!) && sameRef(m.target, ref)) ?? null;
      return render();
    }
    const m = cand.find((m) => (m.kind === 'step' || m.kind === 'exit') && sameRef(m.pawn, ref));
    if (m) {
      sel.pawn = ref;
      sel.move = m;
      render();
    }
  }
  board.onPawnTap = tapPawn;

  function addSevenPart(steps: number) {
    if (!sel || !sel.pawn7) return;
    sel.parts.push({ pawn: sel.pawn7, steps });
    sel.pawn7 = null;
    const total = sel.parts.reduce((a, p) => a + p.steps, 0);
    if (total === 7) {
      sel.move = movesOf(sel.card, '7').find((m) => m.kind === 'seven' && m.parts.length === sel!.parts.length && prefixOk(m, sel!.parts)) ?? null;
    }
    render();
  }

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    render();
    try {
      await fn();
      sel = null;
    } catch (e) {
      console.error(e);
      toast((e as Error).message || 'Coup refusé, réessaie');
    } finally {
      busy = false;
      render();
    }
  }

  /** Marques à afficher sur le plateau et état éventuel d'aperçu. */
  function boardMarks(): { view: GameState; highlight: PawnRef[]; ghosts: { ref: PawnRef; p: number }[]; preview: string } {
    const s = st();
    const none = { view: s, highlight: [] as PawnRef[], ghosts: [] as { ref: PawnRef; p: number }[], preview: '' };
    if (!sel || !sel.as || s.phase !== 'play') return none;
    const cand = movesOf(sel.card, sel.as);
    const uniq = (refs: PawnRef[]) => refs.filter((r, i) => refs.findIndex((x) => sameRef(x, r)) === i);
    if (sel.move) {
      const after = applyMove(s, sel.move);
      const ghosts: { ref: PawnRef; p: number }[] = [];
      for (let seat = 0; seat < s.n; seat++)
        for (let i = 0; i < 4; i++) {
          const p = after.pawns[seat][i].p;
          if (p !== s.pawns[seat][i].p && !inBase(p)) ghosts.push({ ref: { s: seat, i }, p });
        }
      const entry = after.log[after.log.length - (after.phase === 'over' ? 2 : 1)];
      return { view: s, highlight: sel.pawn ? [sel.pawn] : [], ghosts, preview: fmt(entry.text) + (after.phase === 'over' ? ' : victoire !' : '') };
    }
    if (sel.as === '7') {
      const view = { ...s, pawns: clonePawns(s.pawns) };
      const caps = applySevenPrefix({ n: s.n, v: s.variants, pawns: view.pawns }, s.turn, sel.parts) ?? [];
      view.lastCaptures = caps;
      const k = sel.parts.length;
      const hl = uniq(cand.filter((m) => prefixOk(m, sel!.parts)).map((m) => (m as { parts: SevenPart[] }).parts[k].pawn));
      return { view, highlight: hl, ghosts: [], preview: '' };
    }
    if (cand[0]?.kind === 'swap') {
      if (sel.pawn) {
        const targets = cand.filter((m) => m.kind === 'swap' && sameRef(m.pawn, sel!.pawn!)).map((m) => (m as { target: PawnRef }).target);
        return { ...none, highlight: [sel.pawn, ...targets] };
      }
      return { ...none, highlight: uniq(cand.map((m) => (m as { pawn: PawnRef }).pawn)) };
    }
    return { ...none, highlight: uniq(cand.map((m) => (m as { pawn: PawnRef }).pawn)) };
  }

  function renderPlayers() {
    const s = st();
    players.replaceChildren(
      ...ctl.seats.map((seat, i) => {
        const cls = ['chip'];
        if (s.phase === 'play' && s.turn === i) cls.push('turn');
        if (!seat.online) cls.push('offline');
        if (s.passed[i]) cls.push('passed');
        if (i === ctl.viewer) cls.push('me');
        const col = COLORS[seat.color]?.fill ?? '#999';
        const icon = h('span', { class: 'avatar', style: { '--c': col } as never });
        icon.innerHTML = shapeIcon(seat.color, 22);
        const homeCount = s.pawns[i].filter((pw) => inHome(s.n, pw.p)).length;
        const tag = !seat.online ? 'hors ligne' : s.passed[i] ? 'passe' : s.phase === 'exchange' && s.exchange[i] ? '✓' : '';
        const team = teamOf(s.n, i);
        return h(
          'div',
          { class: cls.join(' '), title: `${seat.name}, équipe ${TEAM_LETTERS[team]}` },
          icon,
          h('span', { class: 'chip-text' },
            h('span', { class: 'chip-name' }, seat.name || `Joueur ${i + 1}`, seat.bot ? ' 🤖' : ''),
            h('span', { class: 'chip-meta' },
              h('span', { class: 'team t' + team }, TEAM_LETTERS[team]),
              h('span', { class: 'dots', 'aria-label': `${homeCount} pions rentrés` }, [0, 1, 2, 3].map((k) => h('i', { class: k < homeCount ? 'on' : '' }))),
              h('span', { class: 'count', 'aria-label': `${s.hands[i].length} cartes` }, `${s.hands[i].length}`))),
          tag ? h('span', { class: 'chip-tag' }, tag) : null,
        );
      }),
    );
  }

  function renderStatus(preview: string) {
    const s = st();
    let text = '';
    if (s.phase === 'deal') text = 'Distribution des cartes…';
    else if (s.phase === 'exchange') {
      if (ctl.viewer >= 0 && !ctl.curtain && !s.exchange[ctl.viewer]) text = `Choisis une carte à donner à ${name(partner(s.n, ctl.viewer))}`;
      else text = "Échange des cartes entre partenaires…";
    } else if (s.phase === 'play') {
      if (myTurn()) text = ctl.mode === 'local' && ctl.seats.filter((x) => !x.bot).length > 1 ? `À ${name(s.turn)} de jouer` : 'À toi de jouer !';
      else text = `${name(s.turn)} ${ctl.seats[s.turn]?.bot ? 'réfléchit…' : 'joue…'}`;
    }
    status.replaceChildren(
      h('div', { class: 'status-main' + (myTurn() ? ' mine' : '') }, text),
      ...(ctl.notice ? [h('div', { class: 'status-notice' }, ctl.notice)] : []),
      ...(preview ? [h('div', { class: 'status-preview' }, preview)] : []),
    );
  }

  function renderActions() {
    const s = st();
    const out: HTMLElement[] = [];
    const btn = (label: string, onclick: () => void, cls = 'btn') => h('button', { class: cls, onclick, disabled: busy }, label);
    if (ctl.curtain) {
      out.push(
        h('div', { class: 'curtain' },
          h('p', null, `Passe l'appareil à ${name(ctl.viewer)}.`),
          btn(`Je suis ${name(ctl.viewer)} : voir ma main`, () => ctl.reveal(), 'btn primary big')),
      );
    } else if (s.phase === 'exchange' && sel && ctl.viewer >= 0 && !s.exchange[ctl.viewer]) {
      out.push(
        h('div', { class: 'confirm' },
          h('span', null, `Donner ce ${cardName(sel.card)} à ${name(partner(s.n, ctl.viewer))} ?`),
          h('div', { class: 'row' },
            btn('Annuler', () => { sel = null; render(); }, 'btn ghost'),
            btn('Donner', () => { const c = sel!.card; run(() => ctl.give(c)); }, 'btn primary'))),
      );
    } else if (myTurn()) {
      const ms = moves();
      if (ms.length === 1 && ms[0].kind === 'discard') {
        out.push(
          h('div', { class: 'confirm' },
            h('span', null, 'Aucune de tes cartes ne permet de jouer. Tu défausses ta main et tu passes jusqu’à la prochaine donne.'),
            btn('Défausser ma main', () => run(() => ctl.play({ kind: 'discard' })), 'btn primary')),
        );
      } else if (!sel) {
        out.push(h('p', { class: 'hint' }, 'Touche une carte, puis un pion qui s’illumine.'));
      } else if (!sel.as) {
        const ases = [...new Set(movesOf(sel.card).map((m) => m.as))];
        out.push(
          h('div', { class: 'choice' },
            h('span', null, 'Le Joker remplace :'),
            h('div', { class: 'chips' }, ases.map((a) => btn(RANK_NAMES[a], () => chooseAs(a), 'btn chip-btn')))),
        );
      } else if (sel.move) {
        out.push(
          h('div', { class: 'confirm' },
            h('div', { class: 'row' },
              btn('Annuler', () => { sel = null; render(); }, 'btn ghost'),
              btn('Jouer', () => { const m = sel!.move!; run(() => ctl.play(m)); }, 'btn primary'))),
        );
      } else if (sel.as === '7') {
        const used = sel.parts.reduce((a, p) => a + p.steps, 0);
        const parts: HTMLElement[] = [h('span', null, `7 à répartir : encore ${7 - used} pas. `)];
        if (sel.pawn7) {
          const k = sel.parts.length;
          const steps = [...new Set(movesOf(sel.card, '7').filter((m) => prefixOk(m, sel!.parts) && sameRef((m as { parts: SevenPart[] }).parts[k].pawn, sel!.pawn7!)).map((m) => (m as { parts: SevenPart[] }).parts[k].steps))].sort((a, b) => a - b);
          parts.push(h('div', { class: 'chips' }, steps.map((n) => btn(String(n), () => addSevenPart(n), 'btn chip-btn'))));
        } else parts.push(h('span', { class: 'muted' }, 'Touche un pion.'));
        parts.push(h('div', { class: 'row' }, btn('Recommencer', () => { sel!.parts = []; sel!.pawn7 = null; render(); }, 'btn ghost')));
        out.push(h('div', { class: 'choice' }, parts));
      } else {
        const cand = movesOf(sel.card, sel.as);
        out.push(h('p', { class: 'hint' }, cand[0]?.kind === 'swap' ? (sel.pawn ? 'Touche le pion avec lequel échanger.' : 'Touche ton pion à échanger.') : 'Touche un pion qui s’illumine.'));
      }
    }
    actions.replaceChildren(...out);
  }

  function renderHand() {
    const s = st();
    if (ctl.viewer < 0 || ctl.curtain) {
      hand.replaceChildren(h('p', { class: 'muted hand-empty' }, ctl.curtain ? 'Main cachée' : ''));
      return;
    }
    const cards = s.hands[ctl.viewer].filter((c) => c !== '?');
    const playable = new Set(moves().map((m) => (m.kind === 'discard' ? '' : m.card)));
    const giving = s.phase === 'exchange' && !s.exchange[ctl.viewer];
    if (!cards.length) {
      hand.replaceChildren(h('p', { class: 'muted hand-empty' }, s.passed[ctl.viewer] ? 'Tu as défaussé : attends la prochaine donne.' : 'Plus de cartes'));
      return;
    }
    const mid = (cards.length - 1) / 2;
    hand.replaceChildren(
      ...cards.map((c, idx) => {
        const cls = ['card'];
        if (sel?.card === c) cls.push('selected');
        if (myTurn() && !playable.has(c)) cls.push('dim');
        if (giving) cls.push('giving');
        const off = idx - mid;
        return h('button', { class: cls.join(' '), style: { '--rot': `${off * 4}deg`, '--lift': `${Math.abs(off) * Math.abs(off) * 2}px`, '--i': idx } as never, onclick: () => tapCard(c), 'aria-label': cardName(c) + ' de ' + suitName(c), 'aria-pressed': sel?.card === c ? 'true' : 'false' }, cardFace(c));
      }),
    );
  }

  function renderLog() {
    const s = st();
    const entries = s.log.slice().reverse();
    logList.replaceChildren(...entries.map((e) => h('li', null, fmt(e.text))));
    lastLog.replaceChildren(...entries.slice(0, 2).map((e, i) => h('div', { class: i ? 'muted' : '' }, fmt(e.text))));
  }

  /** Dernière carte jouée, posée au centre du plateau. */
  function renderPile() {
    const s = st();
    const c = s.phase === 'play' || s.phase === 'over' ? s.lastCard : '';
    if (c === (pile.dataset.card ?? '')) return;
    pile.dataset.card = c;
    if (!c) return pile.replaceChildren();
    pile.replaceChildren(h('div', { class: 'card pile-card' }, cardFace(c)));
  }

  function renderOverlay() {
    const s = st();
    if (s.phase !== 'over') return overlay.replaceChildren();
    const t = s.winner;
    const p = partner(s.n, t);
    const mine = ctl.viewer >= 0 && teamOf(s.n, ctl.viewer) === t;
    if (!overlay.childElementCount) {
      confetti([t, p].map((x) => COLORS[ctl.seats[x]?.color]?.fill ?? '#fc0').concat(['#ffd166', '#ffffff']));
      sfx.win();
      haptic([60, 40, 120]);
    }
    overlay.replaceChildren(
      h('div', { class: 'victory' },
        h('div', { class: 'victory-box' },
          h('div', { class: 'trophy', 'aria-hidden': 'true' }, '🏆'),
          h('h2', null, mine ? 'Victoire !' : 'Partie terminée'),
          h('p', null, `L'équipe ${TEAM_LETTERS[t]} (${name(t)} et ${name(p)}) a rentré tous ses pions.`),
          h('div', { class: 'row' },
            ctl.canRematch ? h('button', { class: 'btn primary', onclick: () => run(() => ctl.rematch()) }, 'Revanche') : h('p', { class: 'muted' }, "En attente de la revanche lancée par l'hôte…"),
            h('button', { class: 'btn ghost', onclick: () => { ctl.leave(); opts.onQuit(); } }, 'Accueil')))),
    );
  }

  function render() {
    const s = st();
    if (s.v !== lastV) {
      if (lastV !== -1) sel = null;
      if (myTurn() && !lastTurnMine) haptic(80);
    }
    const changed = s.v !== lastV && lastV !== -1;
    const marks = boardMarks();
    const fx = board.update(marks.view, { highlight: marks.highlight, selected: sel?.pawn7 ?? sel?.pawn ?? null, ghosts: marks.ghosts }, true);
    if (changed) {
      if (s.lastCard && s.lastCard !== pile.dataset.card) sfx.card();
      if (fx.steps) sfx.steps(fx.steps, 110);
      if (fx.captures) setTimeout(() => { sfx.capture(); haptic([30, 30, 60]); }, fx.delay);
      if (fx.home) setTimeout(() => sfx.home(), fx.delay);
      if (myTurn() && !lastTurnMine) {
        banner.classList.remove('show');
        void banner.offsetWidth;
        banner.classList.add('show');
        setTimeout(() => sfx.turn(), 250);
      }
    }
    renderPile();
    lastTurnMine = myTurn();
    lastV = s.v;
    renderPlayers();
    renderStatus(marks.preview);
    renderActions();
    renderHand();
    renderLog();
    renderOverlay();
  }

  const unsub = ctl.subscribe(render);
  render();
  return () => unsub();
}

function suitName(c: Card) {
  return ({ S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle', J: 'joker' } as Record<string, string>)[suitOf(c)] ?? '';
}
