# Handoff : TOC Mobile (refonte complète)

## Vue d'ensemble
Application mobile du jeu de TOC (Tock québécois) : jeu de plateau par équipes de 2 où les dés sont remplacés par des cartes. Cette maquette remplace entièrement l'interface du jeu existant. Elle couvre 8 écrans : splash, onboarding, choix du perso, accueil, salle privée, plateau de jeu, « Ta gang » (amis et chat d'équipe), classement.

Le but est une **app 100 % fonctionnelle** : vraies règles, multijoueur en temps réel sur Firebase, salles privées par code, chat, amis, classement.

## À propos des fichiers de design
Les fichiers de `maquette/` sont des **références de design écrites en HTML**. Ce sont des prototypes qui montrent l'apparence et le comportement attendus, pas du code de production à copier tel quel. La tâche consiste à **recréer ce design dans l'environnement du dépôt existant** (son framework, son routing, sa config Firebase), en suivant ses conventions.

- `maquette/TOC Mobile.dc.html` contient tout : le gabarit HTML avec les styles inline (la source de vérité visuelle) et une classe JS `Component` (logique, données, géométrie du plateau, animations).
- `maquette/Avatar.dc.html` est le composant avatar (personnage en formes simples).
- `maquette/support.js` sert seulement à l'affichage local de la maquette. Ne pas l'intégrer à l'app.
- Pour voir la maquette : `npx serve design_handoff_toc_mobile/maquette`, puis ouvrir `TOC Mobile.dc.html`. Un serveur est nécessaire, `file://` ne marche pas.

## Fidélité
**Haute fidélité.** Couleurs, typos, espacements, rayons, ombres, textes et animations sont définitifs. Reproduire au pixel près. Le cadre iPhone (bezel, Dynamic Island, barre d'état factice « 9:41 ») et la colonne de navigation à gauche **ne font pas partie de l'app** : ce sont des outils de présentation.

Écran de référence : 393 × 852 pt (iPhone 15/16). Zone sûre en haut : 54 pt. Barre d'accueil : 34 pt.

---

## Design tokens

### Couleurs
| Rôle | Hex |
|---|---|
| Fond app | `#fbf6ef` |
| Fond plateau (écran jeu) | `#f5ede3` |
| Encre (texte principal) | `#2b2a3d` |
| Texte secondaire | `#6b6880` |
| Texte tertiaire / icônes inactives | `#a39cb0`, `#8a8398` |
| Champ segmenté (fond) | `#f1e8dd` |
| Ombre « argile » neutre (base) | `#ece1d4`, `#e6dccf` |
| Plateau bois-argile | `#fff4e6` (épaisseur `#ecd6bf`), trous `#ead8c4`, disque central `#f6e6d3` |

Couleurs d'équipe/joueur (`c` = principale, `d` = foncée pour ombre/relief, `l` = teinte claire) :
| Nom | c | d | l |
|---|---|---|---|
| coral | `#ff6b4a` | `#d9482a` | `#ffe3da` |
| blue | `#4a7dff` | `#2f5bd6` | `#dfe7ff` |
| yellow | `#ffc93c` | `#d9a116` | `#fff1c9` |
| teal | `#2ec4a0` | `#1d9c7e` | `#d4f4eb` |
| violet | `#9b7bff` | `#7656e0` | `#ece6ff` |
| rose | `#ff6fae` | `#d94b8a` | `#ffe2ef` |

- Bouton principal : dégradé `#ff8466 → #f25a38`, relief `#c9401f`.
- Carte « Partie privée » : `#3560e6` (relief `#2547b8`).
- Carte tournoi : `#ffc93c` (relief `#d9a116`).
- Rouge des cartes ♥♦ : `#e5482a`.

### Typographie (Google Fonts)
- **Baloo 2** (500–800) : titres, boutons, chiffres, cartes. Titres d'écran 34 px/800, titres de cartes 26–30 px/800, boutons 18–21 px/800.
- **Nunito** (500–900) : texte courant 15–17 px/600–700, libellés 11–13 px/800 en majuscules avec `letter-spacing: .08–.16em`.
- Baloo 2 est décalée vers le bas : ajouter environ 2–4 px de `padding-top` dans les boutons pour la centrer visuellement (voir la maquette).

### Style « argile » (clay)
Toutes les surfaces sont des volumes doux : un relief dur en dessous, une ombre portée diffuse et un reflet en haut.
- Carte blanche : `background:#fff; border-radius:22–32px; box-shadow:0 6px 0 #ece1d4, 0 14px 24px rgba(110,80,50,.08)`
- Bouton principal : `box-shadow:0 6px 0 #c9401f, 0 16px 26px rgba(242,90,56,.32), inset 0 2px 0 rgba(255,255,255,.4)`. Au clic : `translateY(4px)` et le relief passe à `0 2px 0`.
- Bille (pion) : `radial-gradient(circle at 32% 28%, rgba(255,255,255,.95) 0 10%, transparent 32%), radial-gradient(circle at 50% 48%, c 55%, d 100%)` avec l'ombre `0 (0.16×taille)px 0 d, 0 (0.32×taille)px (0.4×taille)px rgba(70,40,20,.32)`.
- Rayons : 999 (pilules), 50 % (avatars, billes), 14–24 (boutons, champs), 26–38 (cartes, panneaux), 44 (plateau).

---

## Écrans
Tous les textes exacts sont dans le gabarit de `TOC Mobile.dc.html`. Le ton est québécois et complice : « Embarque ! », « Ta gang », « pis », « Envoye ! ».

1. **Splash** : logo en 3 tuiles argile « T », bille jaune, « C » (corail, bleu, turquoise), qui oscillent doucement. Billes flottantes en fond. Accroche « Le jeu qui brise des amitiés… pis qui en crée. ». Boutons « Embarque ! » (vers l'onboarding) et « J'ai déjà un compte » (vers l'auth existante, puis l'accueil).
2. **Onboarding** : 3 slides (équipe, cartes, maison), illustration dans un panneau teinté, pastilles de progression (active 28 px de large), « Passer » et « Suivant », puis « Choisir mon perso ».
3. **Choix du perso** : aperçu de 140 px sur un disque teinté, grille 3×2 de 6 personnages (Ti-Loup/tuque, Mimi/lunettes, Le Boss/couronne, Coco/casquette, Ginette/chignon, Pinotte/bandeau), 6 couleurs, champ surnom (14 caractères max), « C'est moi, ça ! ». **À sauvegarder dans le profil Firebase.**
4. **Accueil** : en-tête avec avatar, niveau, barre XP et jetons. Segmenté « 4 joueurs · 2 équipes de 2 » / « 6 joueurs · 3 équipes de 2 ». Carte bleue « Partie privée » (« Créer une salle »). Champ « Code de salle » et bouton « Rejoindre ». Carte jaune « Tournoi » avec compte à rebours live, inscrits / 64 et bouton « M'inscrire » / « T'es inscrit ! ». Barre d'onglets flottante : Jouer · Ta gang · Classement.
5. **Salle privée** : code `TOC-XXXX` avec bouton « Copier », équipes et places (place vide en pointillés animés avec « Inviter »). « Lancer la partie » reste inactif tant que la salle n'est pas pleine. Puis compte à rebours plein écran 3-2-1-« TOC ! ».
6. **Plateau de jeu** : voir la section suivante.
7. **Ta gang** : onglets « Amis » / « Chat d'équipe ». Code ami et « Partager ». Liste en ligne (statut, « Inviter » / « Invité·e », « En partie ») et liste hors ligne (grisée). Le chat d'équipe a des bulles moi/partenaire, un indicateur « en train d'écrire », des réponses rapides et un champ d'envoi.
8. **Classement** : onglets Amis / Québec / Monde, podium en 3 piédestaux argile (2e bleu, 1er jaune, 3e corail), liste à partir du 4e avec tendance ▲▼, et ma ligne fixée en bas, encadrée de corail.

---

## Plateau de jeu (le cœur)

### Disposition (fidèle aux photos de `references/`)
La géométrie complète est dans `geom(N)` de la maquette. **La reprendre telle quelle.** Le plateau fait 360 × 360 (left 16, top 132 sur l'écran de 393). Les coordonnées viennent d'un repère de 800 × 800 centré en (400, 400), multiplié par un facteur `f`.

- **4 joueurs** (`f = 0.45`) : 4 « bras » en losange dans les coins, à −135°, −45°, 45° et 135°. Paramètres : demi-largeur w = 92, r_in = 226, r_out = 410, 4 intervalles par rail, 4 en bout de bras, 4 par connecteur droit entre deux bras. **16 trous par joueur, 64 au total.**
- **6 joueurs** (`f = 0.39`) : étoile à 6 bras à −90° + k·60°. Paramètres : w = 80, r_in = 80·√3 (les rails des bras voisins partagent un trou), r_out = 360, 6 intervalles par rail, 4 en bout de bras, pas de connecteur. **16 trous par joueur, 96 au total.**
- Pour chaque bras k, le circuit suit dans le sens horaire : rail gauche (de l'intérieur vers l'extérieur), bout du bras, rail droit (de l'extérieur vers l'intérieur), puis le connecteur.
- **Trou de départ** : bout du bras, index 3 sur 0–4, donc `j = rg + 3` dans le bras. Il est entouré de la couleur du joueur.
- **Maison** : 4 trous de couleur alignés sur l'axe du bras, depuis le milieu du bout du bras vers le centre. On y entre depuis `j = rg + 2`, le trou juste avant le départ.
- **Réserve** (4 trous) entre le bras k et le bras k+1, sur la bissectrice : en arc en U au milieu d'un côté (4 joueurs), en carré 2×2 (6 joueurs).
- Seules la réserve et la ligne de la maison ont un fond teinté. Le reste du circuit n'a aucune couleur autour.
- Centre : un disque légèrement creusé, avec la pioche (dos bleu « TOC ») et la défausse (dernière carte jouée).
- Avatars : sur l'axe de chaque bras, hors du bout (r = 494 pour 4 joueurs, 452 pour 6), avec l'anneau de la couleur d'équipe, un badge du nombre de cartes et le nom.
- Places : moi en bas, mon partenaire en face. Pour 4 joueurs : TL Mimi jaune (partenaire), TR Coco turquoise, BR moi corail, BL Le Boss bleu. Pour 6 joueurs : haut Mimi jaune, puis Coco turquoise, Ginette violet, moi corail, Le Boss bleu, Pinotte rose. Équipes : Soleil (moi + partenaire), Bleuets, Framboises (6 joueurs).

### Autres zones de l'écran de jeu
- **Barre du haut** : bouton pause (rond), « Manche N · Donne N », « À toi de jouer, {nom} » / « Tour de {nom} », et le score par équipe (billes rentrées à la maison).
- **Barre d'action** (top 520) : bouton émotes (rond 54), carte d'indice (titre et règle de la carte sélectionnée), et « Jouer » qui apparaît quand un coup est sélectionné.
- **Minuteur de tour** : barre de 5 px qui se vide en 30 s.
- **Main** : cartes 80 × 116 en éventail (espacement 60, rotation (i − milieu)·6°, courbe y = 34 + m²·5). La carte sélectionnée monte à y = 2, se redresse et prend un contour corail. Chaque carte porte un badge de pouvoir : Sortir, Recule 4, Divise, Échange, +12…
- **Émotes** : « Envoye donc ! », « Tabarnouche ! », « Bien joué ! », « Ayoye… », « Bin voyons donc », « GG la gang ». Elles s'affichent en bulle au-dessus de l'avatar de l'émetteur **chez tous les joueurs (temps réel)**.
- **Pause** : panneau du bas avec Reprendre / Recommencer la donne (partie locale seulement) / Quitter la partie.

### Animations (à reproduire fidèlement, c'est une exigence)
Les keyframes sont dans le `<helmet>` de la maquette et les effets dans `FxItem` (Web Animations API).
| Effet | Détail |
|---|---|
| Distribution | Les cartes partent du paquet vers la main, `tocDeal .6s cubic-bezier(.2,1.25,.4,1)`, 0,1 s d'écart entre deux cartes |
| Carte jouée | Vol en arc de la main vers la défausse, 460 ms, rotation de 360°, rétrécissement à 0,68. Rebond de la défausse `tocThump .35s` |
| Carte d'un adversaire | Même vol, depuis son avatar, à l'échelle 0,35 au départ |
| Aperçu du coup | Points animés (`tocPath`, décalage de 70 ms) sur chaque case du trajet. Cercle pointillé pulsé sur l'arrivée, noir si le coup capture. L'indice affiche « · capture ! » |
| Avance case par case | 150 ms par case pour moi, 110 ms pour les bots. Saut de 11 px (4 joueurs) / 8 px (6 joueurs) à mi-pas. Petite bouffée de couleur à chaque trou quitté |
| Atterrissage | Écrasement puis rebond `tocSquash .42s`, onde de choc (anneau ×3,2, 550 ms), éclats (12 particules, 650 ms), texte flottant « +7 » / « −4 » (26 px si 10 cases ou plus) |
| Sortie (As/Roi) | Saut en arc de 32 px de la réserve au départ (600 ms), confettis, « SORTI ! » |
| Échange (Valet) | Les deux billes s'envolent en arc (26 px) et se croisent, avec anneaux, éclats et « ÉCHANGE ! » |
| Capture | Le plateau tremble (`tocShake .45s`), 22 confettis, « BOUM ! » 30 px. La victime retourne en arc (36 px) dans le premier trou libre de sa réserve. Message « Retour à la réserve, {nom} ! » |
| Changement de tour | Bande corail inclinée qui traverse l'écran, avec « À TOI DE JOUER ! » (1,5 s). « C'EST PARTI ! » en début de partie |
| Joueur actif | Avatar agrandi à 1,14 (ressort), halo pulsé `tocRing`, sa réserve s'illumine (`tocGlow`) |
| Bille sélectionnée | Elle sautille (`tocBob .8s`) avec un double contour blanc + couleur |

---

## Règles (moteur de jeu à implémenter pour de vrai)
La maquette ne simule que quelques coups scriptés. Il faut un **vrai moteur de règles**, pur et testé, sans dépendance à l'interface. Valeurs par défaut ci-dessous ; garder chaque variante configurable.

- **Mise en place** : 4 billes par joueur dans sa réserve. 4 joueurs : 1 jeu de 52 cartes. 6 joueurs : 2 jeux.
- **Donnes** : 5 cartes, puis 4, puis 4… jusqu'à épuiser le paquet, puis on rebat. Au début de chaque donne, chaque joueur passe 1 carte face cachée à son partenaire.
- **Tour** : dans le sens horaire, chaque joueur joue 1 carte. S'il n'a aucun coup légal, il défausse une carte au choix.
- **Pouvoirs des cartes** :
  - **As** : sortir une bille (réserve vers départ) ou avancer de 1.
  - **Roi** : sortir une bille ou avancer de 13.
  - **Dame** : avancer de 12.
  - **Valet** : échanger une de mes billes du circuit avec n'importe quelle autre bille du circuit. Interdit sur une bille en maison, en réserve, ou posée sur son propre départ.
  - **10** : avancer de 10.
  - **8** : avancer de 8.
  - **7** : avancer de 7, ou répartir les 7 cases entre plusieurs de mes billes (ou celles de mon partenaire si j'ai fini).
  - **4** : reculer de 4.
  - **2, 3, 5, 6, 9** : avancer de la valeur.
- **Capture** : finir exactement sur une bille, alliée ou adverse, la renvoie dans sa réserve. Variante en option : le 7 capture aussi chaque bille dépassée.
- **Blocage** : une bille posée sur son propre trou de départ ne peut être ni dépassée ni capturée.
- **Maison** : on y entre seulement par son propre couloir, avec le compte exact. On ne peut pas sauter ses propres billes dans le couloir, et le 4 ne permet pas d'y entrer.
- **Fin** : un joueur qui a rentré ses 4 billes joue celles de son partenaire. L'équipe gagne quand toutes ses billes sont à la maison.
- **Temps** : 30 s par tour. Quand le temps est écoulé, le moteur joue automatiquement un coup légal, ou défausse.

Interface liée au moteur : quand une carte est sélectionnée, le moteur renvoie la liste des coups légaux. L'interface surligne la ou les billes jouables et la destination. Si plusieurs billes sont possibles, un toucher sur la bille choisit. Pour le 7, il faut une petite interface de répartition (curseur ou touchers successifs).

## Multijoueur et données (Firebase)
Reprendre la config Firebase et l'authentification existantes.
- **Salles** : code `TOC-XXXX`, hôte, mode 4 ou 6, places et équipes, statut (`waiting`, `countdown`, `playing`, `finished`). Les joueurs arrivent en temps réel.
- **Partie** : état autoritaire, de préférence validé côté serveur (Cloud Functions ou transactions). Contenu : billes, mains (privées par joueur), défausse, joueur actif, donne, échéance du tour. **Chaque coup est validé par le moteur avant d'être écrit.** Les clients animent les coups reçus en rejouant le même pipeline d'animation que pour leurs propres coups.
- **Bots** : un joueur qui se déconnecte est remplacé par une IA simple (prendre un coup légal au hasard ou glouton) pour que la partie continue.
- Émotes et chat d'équipe en temps réel. Amis : code ami, invitations, présence (en ligne / en partie / vu il y a…).
- Profil : surnom, personnage, couleur, niveau et XP, jetons, points classés.
- Classement : saisons, filtres Amis / Québec / Monde.
- Tournois : inscription, nombre d'inscrits et compte à rebours réels. Le tableau du tournoi reste à concevoir et ne fait pas partie de cette maquette.

## Assets
Aucun fichier image. Les avatars, billes, cartes et icônes sont faits en CSS, avec des formes simples (voir `Avatar.dc.html` : unités `em`, avec 10em = la taille de l'avatar). Les polices viennent de Google Fonts. Les photos du plateau dans `references/` servent seulement de référence de disposition.

## Fichiers
- `maquette/TOC Mobile.dc.html` : tous les écrans, les données de démo (`CHARS`, `CARDS`, `FR`, `RK`…), la géométrie `geom(N)`, les animations (`FxItem`, `hop`, `flyTo`, `land`, `capture`, `flyCard`).
- `maquette/Avatar.dc.html` : avatar (props `char`, `color`, `size`).
- `references/plateau-4-joueurs.jpg`, `references/plateau-6-joueurs.jpg` : disposition des trous.
