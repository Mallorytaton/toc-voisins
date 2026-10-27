# Toc entre voisins

Le jeu de Toc en ligne, pour jouer entre voisins depuis son téléphone. On crée une partie, on envoie le lien sur WhatsApp, chacun rejoint depuis son navigateur (iPhone ou Android). Aucun compte à créer.

## Jouer

1. **Créer une partie** : choisir 4 ou 6 joueurs et les variantes, puis partager le lien (bouton « Partager », QR code ou code `TOC-1234`).
2. **Salon** : chacun saisit son prénom, choisit sa couleur et sa place. Les partenaires sont face à face. L'hôte lance la partie quand toutes les places sont prises.
3. **Jouer** : à ton tour, touche une carte, puis un pion qui s'illumine (pour le 7, répartis les pas pion par pion), puis « Jouer ».
4. **Table locale** : plusieurs joueurs sur le même appareil, avec ou sans robots, sans réseau.

Si un joueur ferme l'appli ou perd le réseau, il rouvre le lien et retrouve sa place. Depuis un autre navigateur, il peut reprendre la place d'un joueur marqué « déconnecté ».

### Installer sur l'écran d'accueil

- **iPhone** (Safari) : bouton Partager, puis « Sur l'écran d'accueil ».
- **Android** (Chrome) : menu ⋮, puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».

## Règles

- 4 joueurs (2 équipes) ou 6 joueurs (3 équipes de 2), partenaires face à face, 4 pions chacun.
- Parcours de 18 cases par joueur. On sort sur sa case de départ, on fait un tour complet, puis on entre dans ses 4 cases maison.
- Donnes de 5, 4 puis 4 cartes (paquet neuf tous les trois tours ; deux paquets à 6 joueurs). Au début de chaque donne, chacun donne une carte face cachée à son partenaire.
- On doit jouer une carte à son tour. Sans coup possible, on défausse sa main et on passe jusqu'à la donne suivante.
- **As** : sortir ou avancer de 1. **Roi** : sortir ou avancer de 13. **Dame** : 12. **Valet** : échanger un de ses pions avec un autre pion du parcours. **10, 9, 8, 6, 5, 3, 2** : avancer d'autant. **4** : reculer de 4. **7** : 7 pas à répartir entre ses pions, qui prennent tous les pions dépassés ou atteints. **Joker** : n'importe quelle carte.
- S'arrêter sur un pion le renvoie à sa base (même un partenaire). Un pion tout juste sorti bloque sa case de départ.
- Entrée en maison à la valeur exacte, sans sauter de pion, jamais en reculant.
- Quand un joueur a rentré ses 4 pions, il joue ceux de son partenaire. L'équipe gagne quand ses 8 pions sont rentrés.

### Variantes (au choix à la création)

| Variante | Par défaut | Effet |
|---|---|---|
| Pion bloquant au départ | oui | Le pion tout juste sorti ne peut être ni dépassé ni pris. |
| Valet = 11 | non | Le Valet avance de 11 au lieu d'échanger. |
| 5 pour un autre joueur | non | Le 5 fait avancer de 5 le pion d'un autre joueur. |
| 7 sans prise des pions dépassés | non | Le 7 ne prend que les pions sur lesquels on s'arrête. |
| Jokers | 2 | 0, 2 ou 4 jokers par paquet. |

Les règles complètes sont aussi dans l'appli (bouton « ? » pendant la partie).

## Technique

- Vite + TypeScript, sans framework. Plateau en SVG.
- `src/engine/` : moteur de règles pur (aucune dépendance), testé avec Vitest.
- Firebase Realtime Database + authentification anonyme. Chaque coup est validé par le moteur puis écrit en une seule mise à jour atomique ; les règles refusent toute écriture dont le numéro de version n'est pas `version + 1`.
- Les mains sont sous `hands/<partie>/<place>`, lisibles uniquement par le joueur assis à cette place.
- PWA (vite-plugin-pwa), hébergée sur GitHub Pages.

## Développer et mettre à jour

```bash
npm install
npm run dev          # serveur local
npm test             # tests du moteur + simulation de parties
npm run build        # build de production
npm run test:e2e     # tests Playwright (iPhone, Android, petit écran)
```

Tout push sur `main` relance les tests puis redéploie le site sur GitHub Pages (`.github/workflows/deploy.yml`).

- **Configuration Firebase** : `src/net/firebase-config.ts`. Ces valeurs sont publiques par nature ; la sécurité repose sur `database.rules.json`.
- **Règles de sécurité** : après une modification de `database.rules.json`, les republier avec `npx firebase-tools deploy --only database`, ou les coller dans la console Firebase (Realtime Database > Règles).
- Les parties de plus de 7 jours sont supprimées automatiquement lors de la création de nouvelles parties.
