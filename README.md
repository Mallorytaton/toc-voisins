# TOC

Le jeu de TOC en équipes, sur ton téléphone : crée ta salle, invite tes amis et jouez ensemble. Aucun compte à créer pour jouer.

## Jouer

1. **Choisis ton perso** : un des 6 personnages, ta couleur et ton surnom (gardés sur le téléphone).
2. **Crée une salle** depuis l'accueil (4 ou 6 joueurs), puis envoie le code `TOC-4821` ou le lien (« Copier », « Inviter »). Les autres le tapent dans « Code de salle » ou ouvrent le lien.
3. **Places libres** : l'hôte peut « Compléter avec des robots ». Quand la salle est pleine, il lance la partie (compte à rebours 3-2-1-TOC !).
4. **À ton tour** : touche une carte, puis la bille qui s'illumine si plusieurs sont possibles (le Valet demande aussi la bille à échanger, le 7 se répartit avec + et −, le Joker demande sa valeur), puis « Jouer ». Tu as 30 s, sinon un coup est joué pour toi.

Si un joueur ferme l'app ou perd le réseau, son tour est joué à sa place au bout de 30 s, et il retrouve sa place en rouvrant le lien. Depuis un autre téléphone, on peut « Prendre sa place ». Sans réseau, la salle reste sur le téléphone et on joue contre les robots.

### Tournois (mêmes équipes, victoires cumulées)

Pour jouer souvent avec les mêmes personnes (entre voisins, par exemple) :

1. **Accueil → Tes tournois → Créer** : un nom (« Les voisins du 12 ») et 4 ou 6 joueurs.
2. **Inviter** : chacun ouvre le lien (ou tape `T-4821` dans le champ code de l'accueil) et prend sa place. Les places forment les duos ; une fois tout le monde assis, les équipes ne changent plus.
3. **Jouer une partie** : une salle s'ouvre, chacun y retrouve sa place, les autres membres reçoivent une invitation.
4. À chaque fin de partie, la victoire s'ajoute à l'équipe gagnante. La page du tournoi montre le score et les dernières parties.

Contre des robots seulement, il n'y a pas de minuteur : les robots t'attendent. Si l'app a été fermée pendant une partie en ligne, l'accueil propose « Reprendre ».

### Installer sur l'écran d'accueil

- **iPhone** (Safari) : bouton Partager, puis « Sur l'écran d'accueil ».
- **Android** (Chrome) : menu ⋮, puis « Installer l'application ».

## Règles

- 4 joueurs (2 équipes) ou 6 joueurs (3 équipes de 2), partenaires face à face, 4 billes chacun dans sa réserve.
- **16 trous par joueur**, comme sur le vrai plateau. On sort sur son trou de départ, on fait le tour, puis on entre dans ses 4 trous de maison depuis le trou juste avant son départ.
- Donnes de 5, 4 puis 4 cartes (paquet neuf tous les trois tours ; deux paquets à 6 joueurs). Au début de chaque donne, chacun passe une carte face cachée à son partenaire.
- On doit jouer une carte à son tour. Sans coup possible, on défausse sa main et on passe jusqu'à la donne suivante.
- **As** : sortir ou avancer de 1. **Roi** : sortir ou avancer de 13. **Dame** : 12. **Valet** : échanger une de ses billes avec une autre bille du circuit. **10, 9, 8, 6, 5, 3, 2** : avancer d'autant. **4** : reculer de 4. **7** : 7 pas à répartir entre ses billes, qui prennent toutes les billes dépassées ou atteintes. **Joker** : n'importe quelle carte.
- S'arrêter sur une bille la renvoie dans sa réserve (même celle d'un partenaire). Une bille tout juste sortie bloque son trou de départ.
- Entrée en maison au compte exact, sans sauter de bille, jamais en reculant.
- Quand un joueur a rentré ses 4 billes, il joue celles de son partenaire. L'équipe gagne quand toutes ses billes sont rentrées.

### Variantes (moteur)

| Variante | Par défaut | Effet |
|---|---|---|
| `startBlocks` | oui | La bille tout juste sortie ne peut être ni dépassée ni prise. |
| `jackEleven` | non | Le Valet avance de 11 au lieu d'échanger. |
| `fiveOthers` | non | Le 5 fait avancer de 5 la bille d'un autre joueur. |
| `sevenNoPassCapture` | non | Le 7 ne prend que les billes sur lesquelles on s'arrête (règle de la maquette). |
| `jokers` | 2 | 0, 2 ou 4 jokers par paquet (0 dans la maquette). |
| `discardOne` | non | Sans coup possible, on défausse une seule carte au choix (règle de la maquette). |

## Technique

- Vite + TypeScript, sans framework. Interface d'après la maquette `design_handoff_toc_mobile/` (polices Baloo 2 et Nunito, style « argile »).
- `src/engine/` : moteur de règles pur (aucune dépendance), testé avec Vitest. `legalMovesFor(state, place, carte)` donne les coups d'une carte ; `applyMove` valide et applique.
- `src/ui/kit/` : couleurs, composants (boutons, avatars, billes, cartes). `src/ui/screens/` : les écrans. `src/ui/board/geom.ts` : la géométrie du plateau de la maquette (`geom(N)`).
- `src/app/game-source.ts` : source de partie commune ; `LocalGame` (robots, sans réseau) et `OnlineGame` (`src/net/session.ts`).
- Firebase Realtime Database + connexion anonyme (et Google pour garder sa progression), offre gratuite, sans Cloud Functions. Les deux fournisseurs, Anonyme et Google, doivent rester activés dans la console Firebase. Les données sont sous `v2/` (l'ancienne version du jeu garde les siennes à la racine). Chaque coup est validé par le moteur puis écrit en une seule mise à jour ; les règles refusent toute écriture dont la version n'est pas `version + 1`. Les mains sont sous `v2/hands/<salle>/<place>`, lisibles par le joueur assis, ou par la table si la place est un robot ou un joueur déconnecté (le téléphone « meneur », celui de l'hôte, joue pour eux).
- PWA (vite-plugin-pwa), hébergée sur GitHub Pages.

## Développer et mettre à jour

```bash
npm install
npm run dev          # serveur local
npm test             # moteur, simulation de parties, géométrie du plateau
npm run build        # build de production
npm run test:e2e     # tests Playwright (iPhone, Android, petit écran)
npm run icons        # régénère les icônes à partir de public/favicon.svg
```

Ajouter `?demo` à l'adresse montre des données de démonstration (amis, classement, chat) ; `#/vitrine` montre tous les composants.

Scripts de vérification (serveur `npx vite --port 5180` lancé avant) :

- `node scripts/capture.mjs <dossier> /accueil=nom …` : captures d'écran au format téléphone (`TOC_DEMO=1` pour les données de démo).
- `node scripts/partie-check.mjs <dossier> 4|6` : joue un début de partie contre les robots.
- `node scripts/online-check.mjs <dossier>` : vraie partie en ligne entre deux navigateurs (`TOC_ABSENT=1` : un joueur part en cours de partie).
- `node scripts/social-check.mjs`, `scripts/tournoi-check.mjs`, `scripts/reprise-check.mjs` : amis et chat, tournoi à quatre, partie interrompue puis reprise.

Tout push sur `main` relance les tests puis redéploie le site sur GitHub Pages (`.github/workflows/deploy.yml`).

- **Configuration Firebase** : `src/net/firebase-config.ts`. Ces valeurs sont publiques par nature ; la sécurité repose sur `database.rules.json`.
- **Règles de sécurité** : après une modification de `database.rules.json`, les republier avec `npx firebase-tools deploy --only database`.
- Les salles de plus de 7 jours sont supprimées automatiquement lors de la création de nouvelles salles.
