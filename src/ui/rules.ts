import { DEFAULT_VARIANTS, Variants } from '../engine';
import { h } from './dom';

export const VARIANT_INFO: { key: keyof Omit<Variants, 'jokers'>; label: string; help: string }[] = [
  {
    key: 'startBlocks',
    label: 'Pion bloquant sur la case de départ',
    help: "Un pion qui vient de sortir bloque sa case de départ : personne ne peut le dépasser ni le prendre tant qu'il n'a pas bougé. Désactivé, il peut être dépassé et pris comme les autres.",
  },
  {
    key: 'jackEleven',
    label: 'Le Valet compte 11',
    help: "Le Valet fait avancer de 11 cases au lieu d'échanger deux pions.",
  },
  {
    key: 'fiveOthers',
    label: 'Le 5 fait avancer un autre joueur',
    help: "Le 5 sert uniquement à faire avancer de 5 un pion d'un autre joueur (adversaire ou partenaire). Pratique pour pousser un adversaire au-delà de sa maison… ou aider son partenaire.",
  },
  {
    key: 'sevenNoPassCapture',
    label: 'Le 7 ne prend pas les pions dépassés',
    help: "Pendant un 7, seuls les pions sur lesquels on s'arrête sont renvoyés à la base. Les pions simplement dépassés restent en place.",
  },
];

export function variantSummary(v: Variants): string[] {
  const out: string[] = [];
  for (const info of VARIANT_INFO) if (v[info.key] !== DEFAULT_VARIANTS[info.key]) out.push(info.key === 'startBlocks' ? 'Pas de blocage au départ' : info.label);
  out.push(v.jokers ? `${v.jokers} jokers` : 'Sans joker');
  return out;
}

export function rulesView(v: Variants = DEFAULT_VARIANTS): HTMLElement {
  const li = (title: string, text: string) => h('li', null, h('strong', null, title), ' : ', text);
  return h(
    'article',
    { class: 'rules' },
    h('h2', null, 'Règles du Toc'),
    h(
      'p',
      null,
      'Le Toc se joue à 4 joueurs (2 équipes) ou à 6 joueurs (3 équipes de 2). Les partenaires sont assis face à face. Chacun a 4 pions. Le but : faire rentrer les 8 pions de son équipe dans leurs maisons.',
    ),
    h('h3', null, 'Le plateau'),
    h(
      'p',
      null,
      'Le parcours compte 18 cases par joueur. Chaque pion sort sur la case de départ de son joueur (la grande case colorée), fait un tour complet dans le sens des aiguilles d\'une montre puis entre dans ses 4 cases maison en repassant par sa case de départ.',
    ),
    h('h3', null, 'Déroulement'),
    h(
      'ul',
      null,
      h('li', null, 'Les cartes sont distribuées par donnes de 5, puis 4, puis 4 cartes. Un paquet neuf est mélangé tous les trois tours.'),
      h('li', null, 'Au début de chaque donne, chacun donne une carte face cachée à son partenaire.'),
      h('li', null, "À son tour, on doit jouer une carte. Si aucune carte ne permet de bouger, on défausse toute sa main et on attend la donne suivante."),
      h('li', null, 'Quand un joueur a ses 4 pions en maison, il joue les pions de son partenaire.'),
    ),
    h('h3', null, 'Les cartes'),
    h(
      'ul',
      null,
      li('As', 'sortir un pion sur la case de départ, ou avancer de 1'),
      li('Roi', 'sortir un pion, ou avancer de 13'),
      li('Dame', 'avancer de 12'),
      v.jackEleven
        ? li('Valet', 'avancer de 11 (variante)')
        : li('Valet', "échanger la place d'un de ses pions avec n'importe quel autre pion du parcours (pas en maison, pas un pion protégé sur sa case de départ)"),
      li('10, 9, 8, 6, 3, 2', 'avancer du nombre indiqué'),
      v.fiveOthers ? li('5', "faire avancer de 5 le pion d'un autre joueur (variante)") : li('5', 'avancer de 5'),
      li('4', 'reculer de 4. Astuce : reculer depuis sa case de départ place le pion tout près de sa maison'),
      li(
        '7',
        `7 pas à répartir entre ses pions (et ceux du partenaire si l'on a fini en cours de route). Le 7 doit être joué en entier. ${
          v.sevenNoPassCapture ? 'Seuls les pions atteints sont pris (variante).' : 'Tout pion dépassé ou atteint pendant le 7 retourne à sa base.'
        }`,
      ),
      v.jokers ? li('Joker', `remplace n'importe quelle carte (${v.jokers} par paquet)`) : null,
    ),
    h('h3', null, 'Prises et blocages'),
    h(
      'ul',
      null,
      h('li', null, "Un pion qui s'arrête sur une case occupée renvoie l'occupant à sa base, même s'il s'agit d'un pion partenaire."),
      v.startBlocks
        ? h('li', null, "Un pion qui vient de sortir bloque sa case de départ : personne ne peut le dépasser ni le prendre tant qu'il n'a pas bougé (même pas son propre joueur). Il est marqué d'un anneau.")
        : h('li', null, 'Variante : les pions sur leur case de départ ne bloquent pas.'),
      h('li', null, "On entre en maison à la valeur exacte. On ne peut pas sauter un pion déjà en maison, et le 4 ne fait jamais reculer en maison. Un pion ne fait qu'un seul tour : il doit rentrer."),
    ),
    h('h3', null, 'Variantes de cette partie'),
    h(
      'ul',
      null,
      VARIANT_INFO.map((i) =>
        h('li', null, h('strong', null, `${i.label} : ${v[i.key] ? 'oui' : 'non'}`), h('br'), h('span', { class: 'muted' }, i.help)),
      ),
      h('li', null, h('strong', null, `Jokers : ${v.jokers}`), h('br'), h('span', { class: 'muted' }, 'Nombre de jokers ajoutés à chaque paquet (0, 2 ou 4).')),
    ),
  );
}
