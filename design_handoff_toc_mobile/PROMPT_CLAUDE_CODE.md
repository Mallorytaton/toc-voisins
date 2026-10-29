Copie ce texte dans Claude Code, à la racine de ton dépôt, après y avoir placé le dossier `design_handoff_toc_mobile/`.

---

Je veux remplacer entièrement l'interface et le moteur de mon jeu de TOC par la nouvelle maquette du dossier `design_handoff_toc_mobile/`. Le résultat doit être 100 % fonctionnel en production (Firebase), avec un rendu identique à la maquette.

**Étape 1. Comprendre avant de toucher (ne modifie rien pendant cette étape).**
1. Lis `design_handoff_toc_mobile/README.md` en entier. C'est la spec : écrans, design tokens, géométrie du plateau, animations, règles, données.
2. Ouvre `design_handoff_toc_mobile/maquette/TOC Mobile.dc.html` et `Avatar.dc.html`. Les styles inline du gabarit sont la source de vérité visuelle. La classe `Component` contient la logique de référence : `geom(N)` pour le plateau, `FxItem` pour les effets, `hop`, `flyTo`, `land`, `capture` et `flyCard` pour les animations. Regarde aussi les photos de `references/`.
3. Explore mon dépôt : framework, structure, routing, config Firebase (Auth, Firestore ou Realtime Database, Functions, Hosting), règles de sécurité, modèle de données actuel, déploiement.
4. Présente-moi un plan court : ce que tu gardes (config Firebase, auth, données utiles), ce que tu supprimes, la nouvelle architecture, le modèle de données, et les étapes. **Attends ma validation avant de coder.**

**Étape 2. Implémenter, dans cet ordre, avec un commit par étape.**
1. **Design system** : tokens (couleurs, polices Baloo 2 et Nunito, ombres argile, rayons) et composants de base (bouton argile, carte, segmenté, avatar, bille, carte à jouer). Mise en page mobile de référence : 393 × 852, avec respect des zones sûres. Ne reproduis pas le cadre iPhone ni la colonne de navigation de la maquette.
2. **Moteur de règles** : un module pur, sans interface, avec des tests unitaires. Il couvre la géométrie 4 et 6 joueurs (16 trous par joueur), les donnes 5/4/4, l'échange de carte avec le partenaire, chaque carte (As, Roi, Dame, Valet, 10, 8, 7 divisible, 4 en arrière, valeurs simples), la capture, le blocage sur le trou de départ, l'entrée à la maison au compte exact, la reprise des billes du partenaire et la victoire d'équipe. Le moteur expose `legalMoves(state, playerId, card)` et `applyMove(state, move)`. Garde les variantes configurables, comme indiqué dans le README.
3. **Écrans** dans l'ordre de la maquette : splash, onboarding, choix du perso (sauvegardé dans le profil), accueil, salle privée, plateau, Ta gang (amis et chat d'équipe), classement. Reprends les textes exacts, en québécois.
4. **Plateau** : reprends `geom(N)` tel quel pour placer les trous, les maisons, les réserves et les avatars. Seules la réserve et la ligne de la maison sont teintées. Branche la sélection de carte sur `legalMoves` : surbrillance de la bille et de la destination, points de trajet, et choix de la bille par toucher si plusieurs sont possibles. Ajoute une petite interface pour répartir le 7.
5. **Animations** : reproduis chaque effet du tableau « Animations » du README avec les mêmes durées et courbes (distribution, vol de carte, sauts case par case, atterrissage, sortie, échange, capture avec tremblement et confettis, bande de tour, joueur actif). Les coups des autres joueurs, reçus en temps réel, passent par le même pipeline d'animation.
6. **Multijoueur Firebase** : salles par code `TOC-XXXX`, places et équipes, compte à rebours, état de partie autoritaire avec chaque coup validé côté serveur (Cloud Functions ou transactions), mains privées, minuteur de 30 s avec coup automatique, remplacement par un bot en cas de déconnexion, émotes et chat d'équipe en temps réel, présence des amis, invitations, classement, inscription aux tournois. Mets à jour les règles de sécurité.
7. **Nettoyage** : supprime l'ancienne interface et l'ancien code mort. Mets à jour le README du dépôt.

**Exigences**
- Le rendu doit être fidèle au pixel près à la maquette : couleurs hex, tailles, rayons, ombres, espacements.
- Pas de régression sur l'auth ni sur les données existantes. Si le modèle de données change, prévois une migration.
- Tests verts (moteur de règles au minimum) et build sans erreur.
- À la fin de chaque étape, donne-moi un résumé court et la commande pour tester en local.
