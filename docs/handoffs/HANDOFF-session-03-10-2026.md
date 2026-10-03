# Handoff ClaudeNav — résumé complet de la session du 03/10/2026

> Session Claude Code (PC Windows de l'utilisateur), 03/10/2026, de la matinée à la nuit.
> **21 commits, quatre chantiers fermés, une version déployée et vérifiée (V2.71.5), un lot
> commité mais ni bumpé ni déployé.** `npm test` **341/341**, `tsc`, `lint`, audit prod
> **0 erreur / 0 avertissement**.
>
> Ce document est le résumé d'ensemble. Chaque chantier a son propre document détaillé, cité
> au passage — **je ne les recopie pas ici**, c'est le piège des mémoires datées qui
> s'accumulent et finissent par se contredire.

---

## §1 — Les deux déploiements, et leur vérification

**V2.71.4, le matin.** Elle était commitée depuis le 02/10 mais jamais déployée, et elle
refait le chemin d'écriture de **tous** les grimpeurs : c'est elle qui découpe la transaction
partagée en deux (classement + état ludique d'abord, `challenges.progress` ensuite et seul),
le correctif du défaut du 02/10. Déployée, puis **vérifiée sur une vraie validation en
production** : 0 écart au recalcul. Détail dans `HANDOFF-reprise-03-10-2026.md` §1.

**V2.71.5, le soir** : le chantier libellés, la boucle de redirection, trois acquis de doctrine
dans `CLAUDE.md`. Déployée et vérifiée.

**Et le bandeau de mise à jour est validé, en attente depuis V2.62** — sur la transition
2.71.3 → 2.71.4, **sur le téléphone Android de l'utilisateur et sur son navigateur PC**.
Le compromis assumé du mode `prompt` s'est vérifié dans l'autre sens aussi : la mise à jour
avait **attendu** le clic sur les deux appareils. La réserve « jamais vu sur un vrai
téléphone » que portait `CLAUDE.md` depuis V2.62 est retirée.

---

## §2 — Les quatre chantiers

### 2.1 — Purge de l'état ludique : terminée, en attente depuis le 17/09

**0 compte candidat** en production. 16 comptes, 17 champs, dans l'ordre : répétition sur un
seul compte, ouverture de l'application dessus, puis les quinze autres, puis **une dérogation
explicite**. Vérifié compte par compte après : **0 champ perdu** dans `user_ludic_state`, dont
l'`updated_at` n'a pas bougé pendant toute l'opération.

Le script a gagné `--purge-unmigrated <uid>.<champ>`, **sans forme groupée volontairement** :
le jugement qu'il encode (« cette absence est la vérité ») ne peut se faire que compte par
compte. Et il distingue enfin **les deux cas qu'il confondait** : aucun document
`user_ludic_state` = « jamais migré » certain, qu'il refuse *et* refuse de suggérer ; un
document vivant où manque ce seul champ = le cas ambigu, probablement supprimé en aval,
rapporté avec la date d'écriture du document pour que le jugement se fasse depuis la ligne
d'avertissement elle-même.

**La mesure du §7 est faite** (`scripts/measure-users-collection.js`, lecture seule) : ~10 Ko
de transfert réseau pour la requête `users` à 61 comptes, 19,29 Ko de JSON sérialisé, et
l'état ludique **vivant** en représenterait **19,1 %** s'il y était resté. Le gain mesuré sur
les copies purgées (figées depuis le 12/09) n'était que de 8,4 %, soit **sous le seuil de 10 %
que le plan s'était fixé pour se déprioriser lui-même** — c'est le contrefactuel qui répond à
la question, parce que ce que le chantier a retiré est la part qui **croît avec l'usage**, pas
avec le nombre de comptes. Détail : `HANDOFF-reprise-03-10-2026.md` §2, §3, §4 bis.

### 2.2 — Fenêtre de saison enregistrée

**2026-11-01 → 2027-05-31**, via « Enregistrer » (jamais « Redémarrer », qui aurait crédité
tout l'historique). **61/61 profils à `season.baseScore = 0`.** Rien à faire avant juin 2027.

### 2.3 — Chantier libellés : le correctif proposé était faux, et il cachait une boucle de redirection

Quatre allers-retours avec toi. Le résultat n'est pas celui que le plan annonçait :
**73 des 77 `InputLabel` du dépôt étaient déjà corrects**, et **le motif de correction proposé
(`htmlFor`) était faux** — un `Select` rend un `div role="combobox"`, qui n'est pas un élément
étiquetable ; un `for` dessus ne résout vers aucun champ, et Chrome remplace simplement un
avertissement par un autre. Lu dans le DOM rendu avec Playwright, pas dans la documentation.

Livré : 4 libellés réellement câblés, **3 identifiants figés dans une boucle** corrigés dans
`ClientCompetitions.tsx` (un identifiant gelé produit N doublons, et `aria-labelledby` résout
alors vers le premier pour toutes les lignes — un défaut échangé contre un autre, **invisible
aux deux avertissements de Chrome**), un filet e2e `assertNoOrphanLabels.mjs` à trois
vérifications, et **deux déviations MUI consignées comme telles** parce qu'elles ne sont pas
corrigeables depuis ce dépôt. D'où une conclusion à retenir : **« zéro avertissement Chrome »
n'est pas un critère de sortie valable sur ce sujet**, il est inatteignable sur les deux types.

Et en chemin, **une boucle de redirection réelle** : `ProtectedRoute` répondait à un rôle
manquant par `<Navigate to="/" />`, mais `/` pousse vers `/client/screen`, lui-même gardé par
`client` — un compte sans ce rôle tournait en rond, **77 navigations mesurées** contre ~5 sur
le chemin nominal, écran scintillant puis bridage par Chrome. **L'application totalement
inutilisable, pas dégradée.** La production n'était protégée que par une *convention* (tout
compte porte `client`), et le prochain chantier prévu est précisément celui qui touche aux
rôles. Corrigé par **terminalité** et non par `replace` : `AccessDenied.tsx` ne navigue nulle
part. Cinq documents : `RETOUR-labels-*.md`.

### 2.4 — Compétition : audit, simulation, départage, et les quatre modes

Avant d'organiser une vraie compétition, l'utilisateur a demandé si le défaut du 02/10 pouvait
atteindre le comptage en compétition. **Non, pour cinq raisons indépendantes**, dont la raison
de fond : **aucun compteur incrémental sur ce chemin** — le document stocké *est* ce qui
s'affiche.

Puis la simulation demandée : **3 murs × 10 blocs (bleu → blanc) × 10 participants**, à deux
niveaux (unitaire sur 60 tirages à graine, et écran réel contre l'émulateur avec le classement
relu sur `AdminCompetitionStats`), chaque fois contre un **oracle indépendant** recopié à la
main depuis le barème. Scores, blocs validés, catégories d'âge et de genre : exacts.

La seule réserve trouvée — l'ordre des ex æquo venait de l'ordre lexicographique des
identifiants de documents, donc d'uid Firebase aléatoires — a été **arbitrée par l'utilisateur
le soir même**. Sa règle : à points égaux, le bloc le plus dur réussi, puis les essais sur ce
bloc, puis le deuxième, et ainsi de suite ; celui qui a un bloc de plus passe devant à préfixe
égal ; et si tout est identique, **rang partagé**. Implémentée avec **huit cas calculés à la
main** (un par clause) et surtout **la propriété qui résume le chantier** : le rang d'un
grimpeur ne dépend plus de l'ordre d'écriture des résultats, vérifié en rejouant 60 tirages
avec les résultats mélangés.

Puis l'utilisateur a demandé si tout cela valait pour les quatre modes de comptage. **Non** —
et la question a trouvé un défaut antérieur : **en mode officiel, le message d'annonce publié
aux grimpeurs numérotait 1, 2, 3 là où l'écran affichait 1, 1, 3.** Dans le mode de la Finale,
le seul où une égalité parfaite au rang 1 est un cas *prévu*, puisqu'elle déclenche la
super-finale. Tout est dans `RETOUR-competition-audit-et-simulation.md`, dont le **§7** est la
partie nouvelle.

---

## §3 — Les acquis de doctrine de la session

Tous inscrits dans `CLAUDE.md`, c'est le vrai livrable de la journée. Les voici en une ligne
chacun, par ordre d'importance décroissante.

1. 🔴 **« Voir rouge d'abord » a une condition que personne n'avait énoncée : le jeu de données
   doit pouvoir produire le défaut.** Deux fois dans la même journée, la tentative de voir
   rouge a **produit du vert** — et on en aurait conclu que le filet fonctionnait. Deux seeds
   ne créaient **qu'un seul bloc** : un identifiant figé dans une boucle n'y produit aucun
   doublon. Le filet était bien « vu attraper quelque chose », par ses *autres* vérifications,
   ce qui masquait que celle-là ne vérifiait rien. **La question à poser à chaque seed : quels
   défauts ce jeu de données est-il physiquement incapable d'exprimer ?** Un jeu d'essai à un
   seul élément ne peut exhiber aucun défaut de multiplicité, d'ordre, de collision ou de
   concurrence. C'est toi qui l'as formulé ; c'est le piège le plus retors des deux jours,
   et il est **à l'intérieur du garde-fou**.
2. ⚠️ **Un critère de sortie doit prédire *tous* les compteurs observables, y compris ceux
   qu'on attend immobiles.** Le critère convenu était « le compte de *No label associated*
   doit passer de 4 à 3 ». **Il l'a fait — et le correctif était faux** : Chrome avait
   simplement reclassé le même libellé dans un troisième avertissement dont personne n'avait
   parlé. Si l'utilisateur n'avait rapporté que le chiffre convenu, un motif erroné serait
   parti sur 77 endroits. **Un compteur qui bouge dans le sens espéré mesure l'espoir.**
3. ⚠️ **Hiérarchie des preuves, telle que ce chantier l'a réellement classée** : ① le DOM rendu
   a tranché ; ② **la source installée de la bibliothèque a induit en erreur** — le bon fichier,
   la bonne ligne, mais la mauvaise variable ; ③ la documentation n'a jamais été consultée et
   n'a jamais manqué ; ④ un compteur qui bouge dans le bon sens a presque validé un faux motif.
   **Lire la source n'est pas lire le DOM.** Pour tout ce qui concerne du balisage généré, il
   faut piloter un navigateur.
4. ⚠️ **Les instruments maison mesurent silencieusement leurs propres défauts** — et d'autant
   plus qu'ils ont été écrits pour l'occasion. Trois chiffres faux dans la journée, **tous du
   bon ordre de grandeur et conformes à l'attente**, donc invisibles : 59 `Select` sans
   `label` (réel : 0), 0,2 Ko de transfert réseau (artefact), un gain de 8,4 % (plancher et non
   mesure). Ce qui a attrapé les deux premiers : **une vérification à la main d'un cas tiré au
   hasard dans la liste**.
5. ⚠️ **Un écran terminal doit TOUJOURS offrir une issue, et cette issue ne doit pas être une
   redirection** — la seconde moitié de l'invariant, ajoutée après ta revue. Sans elle, on a
   troqué une boucle infinie contre un cul-de-sac : la première version d'`AccessDenied`
   n'offrait qu'un lien « Retour à l'accueil » qui, pour un compte sans `client`, **ramène
   exactement là**. D'où le bouton de déconnexion, qui est l'issue valable pour n'importe
   quelle combinaison de rôles — et `performLogout` extrait en vraie fonction partagée au
   moment où un **second** appelant est apparu.
6. ⚠️ **Ne jamais justifier un chantier par l'économie de lectures.** Passer de 2 lectures à 1
   à 61 comptes est du même ordre que les 8,4 % ci-dessus : négligeable, et une justification
   quantitative qui s'effondre à la mesure **discrédite un chantier par ailleurs juste**. Le
   contexte unique des rôles se défend sur la **source unique de vérité**, jamais sur le quota.
7. ⚠️ **Une règle appliquée à une branche d'un `if/else` doit être vérifiée sur l'autre
   branche** — surtout quand l'autre était déjà réputée correcte. Le mode officiel l'était :
   son départage, ses rangs partagés, son jeu d'essai calculé à la main. C'est cette
   correction partielle qui a masqué la dernière zone (§2.4).
8. **Un compte de test sert à répéter un geste destructif, jamais à détecter un défaut** —
   les comptes de test sont jeunes et propres, et les défauts de ce projet naissent d'un
   **état accumulé**. Pour détecter, l'instrument est l'audit de production.

---

## §4 — Mes erreurs de la session, pour que tu les aies toutes

1. **Prédiction depuis une valeur périmée.** J'ai prédit `colorCounts.violet` 8 → 9 depuis le
   chiffre du handoff de la veille ; le réel était 10 → 11. L'écart s'expliquait (deux violets
   validés entre-temps), mais la règle est écrite : **prédire depuis une valeur relue à
   l'instant, jamais depuis un chiffre consigné la veille.**
2. **J'ai fait vider le journal réseau des DevTools** — ce qui supprime la ligne WebChannel sur
   laquelle arrivent les documents Firestore, d'où un artefact à 0,2 Ko. La première mesure de
   l'utilisateur (10 Ko) était la bonne. La seule méthode valable est le **delta du total
   transféré, journal NON vidé**.
3. **Motif `htmlFor` erroné, et surtout mal qualifié.** J'ai lu `SelectInput.js` correctement,
   ligne à ligne, mais mal attribué la variable qui porte l'`id` de l'appelant — puis j'ai
   rédigé la conclusion comme « écarté sur preuve », ce qui a donné à une lecture l'autorité
   d'une mesure. C'est le signalement de l'utilisateur (un **troisième** avertissement apparu)
   qui l'a attrapé.
4. **Un localisateur e2e trop large** (`.MuiPaper-root` + `hasText`) remontait au `Paper`
   englobant : « 30 lignes au lieu de 10 », soit **une accusation crédible mais fausse contre
   l'application**. Corrigé en ancrant sur le titre.
5. **Le défaut du §7 est le mien par omission** : j'ai écrit, la veille, le commentaire qui
   déclare cette incohérence « la pire possible sur ce sujet » — trois lignes sous la branche
   qui la contenait, sans y remonter.

---

## §5 — Ce qui reste ouvert

0. 🟠 **Le départage des ex æquo (`9716f72`) et le correctif du mode officiel (`4f0eb5e`) sont
   commités, poussés, mais NI bumpés NI déployés** — les deux sont visibles des grimpeurs
   (positions du classement, message d'annonce publié), donc une entrée de changelog et une
   décision de déploiement. ⚠️ **Et une tâche qui n'est pas du code : annoncer la règle de
   départage aux grimpeurs AVANT l'épreuve.** Elle s'appuie sur les cotations, **cachées
   pendant la compétition** : personne ne peut l'anticiper, ce qui est sain, mais celui qui
   perd dessus sans l'avoir entendue avant croira à une règle inventée après coup.
1. **Contexte unique des rôles** — `Navbar`, `ProtectedRoute` et `Home` décident chacun de leur
   côté (ou pas du tout) quels sont les rôles d'un utilisateur. 🗓️ **À faire AVEC le chantier
   « droits d'accès, rôle ouvreur trop large »**, en attente du gérant. Statut « pas
   maintenant », pas « abandonné ». Voir le point 6 du §3.
2. Le chemin d'**échec** du réarmement de minuteur dans `useDebouncedFlushQueue` : sans
   couverture, le dépôt n'ayant pas de harnais React.
3. `challenges.progress` : compteur incrémental **sans filet** *et* **à échec silencieux**. Les
   deux étaient acceptables séparément. Rien n'en dérive aujourd'hui — à revoir avant que
   quoi que ce soit en dérive.
4. Le filet `assertNoOrphanLabels` n'est branché que sur **3 e2e** — à reproduire sur les
   autres, sur chaque écran visité.
5. La composition des **messages d'annonce** n'est couverte par aucun test (§7.4).
6. L'arriéré d'écrans jamais passés en revue sur un vrai appareil (V2.70.1 → V2.71.5).
7. Défis `fenetre` / `bloc_designe` : toujours sans e2e navigateur.
8. Finale non annoncée ; sauvegarde durable des images Cloudinary.

---

## §6 — Les deux questions que je te pose

1. **Extraire la composition des messages d'annonce dans une fonction pure** et la tester
   (§7.4) ? C'est du code **publié aux grimpeurs**, qui contredit silencieusement l'écran
   quand il dérive — et c'est précisément ce qui vient d'arriver. Mais c'est un refactor à
   part entière, que je n'ai pas engagé un chantier déjà à son terme.
2. **L'ordre de déploiement du lot en attente** : une seule version portant le départage *et*
   le correctif du mode officiel, ou deux ? Mon avis : une seule, avec une entrée de changelog
   qui annonce la règle de départage — la même phrase servira à l'annonce aux grimpeurs, et
   elle doit sortir **avant** l'épreuve.
