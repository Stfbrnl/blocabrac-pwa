# Conception — Écran live de classement de compétition (affichage TV)

> Note rédigée le 15/08/2026 par la session Claude (navigateur).
> À destination de Claude Code dans le Codespace.
>
> **Reprend et met à jour** une conception discutée avant les chantiers quotas. Plusieurs
> hypothèses de l'époque ne sont plus valables — les écarts sont signalés explicitement,
> parce que le handoff V2.25→V2.28 en reprend au moins un qui est faux (voir §2).
>
> **Statut : implémentation logicielle complète (§1 à §7 faits, V2.29-V2.32).**
> Il ne reste que l'étape 8 du §8 — la répétition matérielle à froid (PC + HDMI + TV,
> mode étendu, overscan, veille désactivée) — qui est hors périmètre d'un agent et
> reste à faire par l'utilisateur avant le jour J, ainsi que la vérification manuelle
> de l'ouverture en fenêtre séparée (pas de suite Playwright pour ce parcours).

---

## Le besoin

Afficher le classement d'une compétition en direct sur la TV de la salle, pour que les
grimpeurs suivent l'évolution pendant l'épreuve.

**Solution matérielle retenue** (décidée, ne pas la remettre en cause) : duplication de
l'écran d'un PC admin en **HDMI mode étendu** — pas de cast, pas de boîtier, pas de
navigateur de smart TV. L'admin garde son écran de travail et pousse une fenêtre
navigateur distincte en plein écran sur la TV.

Conséquence de conception directe : **l'écran doit être une route ouvrable dans une
nouvelle fenêtre**, pas un onglet dans lequel on navigue. En mode miroir, tout ce que fait
l'admin passerait sur grand écran — y compris les cotations cachées des blocs de
compétition. Le mode étendu est impératif, et l'ergonomie doit le rendre naturel.

---

## §1 — Prérequis n°1 : extraire `getParticipantScores()` (FAIT — V2.29)

✅ **Fait le 15/08/2026 (commit `33df75d`).** Extrait dans
`frontend/src/utils/competitionClassement.ts` (générique sur le type participant, modèle
`classementScore.ts`), avec 9 tests dédiés. `AdminCompetitionStats.tsx` et
`Ouvreur/CompetitionBoulders/CompetitionStats.tsx` délèguent maintenant à l'utilitaire ;
comportement inchangé, vérifié (`npm run build`/`lint`/`test`).

`getParticipantScores()` existait **en double** :

- `AdminCompetitionStats.tsx`
- `Ouvreur/CompetitionBoulders/CompetitionStats.tsx`

Un troisième écran créerait un troisième exemplaire — et **trois vérités possibles le jour
où le barème change**, potentiellement en pleine compétition.

Extraire dans un utilitaire partagé (modèle : `classementScore.ts`) **avant** d'écrire
l'écran live, avec les tests qui vont avec. Vérifier au passage que les deux copies
actuelles sont bien identiques : si elles ont divergé, c'est déjà un bug latent, et il faut
trancher laquelle fait foi.

Inclure dans l'extraction : le classement global, le découpage par catégorie FFME et par
genre (`getClassementByCategory`), et le barème depuis `climbingPoints.ts`.

---

## §2 — Ce qui a changé depuis la conception initiale

⚠️ **Le handoff V2.25→V2.28 affirme que « les `onSnapshot` du chantier 1 restent
réutilisables ». C'est faux.** `ClientCompetitions.tsx` est passé en cache-first à V2.26,
les listeners ont été retirés. Il n'y a plus de listener à réutiliser : il faut les écrire.

Ce n'est pas un problème — c'est même cohérent. Le cache-first est le bon choix côté
grimpeur (données qu'il écrit lui-même, remontages fréquents) et serait une **erreur** ici :
l'écran live est précisément le seul endroit où le temps réel est la fonctionnalité.

**Autre changement, à ne pas manquer** : `submitted` a été déplacé de
`competition_results` vers `competition_participants` (V2.27), avec un ID déterministe
`${uid}_${competitionId}`. Afficher le statut « a terminé » demande donc un second listener
sur `competition_participants`, pas une lecture des résultats.

---

## §3 — Prérequis n°2 : chiffrer le coût en lectures (FAIT — mesuré le 15/08/2026)

✅ **Mesuré empiriquement**, pas juste estimé : `frontend/test/measure-live-screen-reads.mjs`
(nouveau, même protocole émulateur que `measure-competition-writes.mjs` — client SDK signé
admin, deux requêtes simulant les deux `onSnapshot`, comptage des documents reçus). Scénario
délibérément pessimiste (upper bound de dimensionnement, pas une moyenne) : la grille de
résultats est **déjà pleine** (90 × 35) au moment du premier montage, comme si l'admin
ouvrait l'écran tard dans la soirée, **ET** la totalité d'une soirée d'écritures (mesurée
séparément par `measure-competition-writes-after.mjs` : 82 écritures `competition_results` +
1 verrouillage `competition_participants` par grimpeur) est rejouée en delta par-dessus,
comme si l'écran avait aussi été ouvert dès le début. Les deux pires cas cumulés.

### Résultat mesuré

| Poste | Lectures mesurées |
|---|---|
| Snapshot initial `competition_results` (90 × 35) | 3 150 |
| Snapshot initial `competition_participants` (90) | 90 |
| Deltas `competition_results` (90 grimpeurs × 82 écritures) | 7 200 |
| Deltas `competition_participants` (90 verrouillages) | 90 |
| **Sous-total, 1 montage** | **10 530** |
| + 2 remontages (repaient le snapshot initial : 3 240 × 2) | 6 480 |
| **Total écran live, scénario à 3 remontages** | **17 010** |

L'estimation initiale du 15/08 (~10 500 pour 1 montage) était quasiment exacte — confirmée
à 30 écritures près (10 530).

À rapprocher de l'existant mesuré séparément : ~11 000 lectures pour les 90 grimpeurs
réunis (`HANDOFF-quota-ecritures-version-2026-08-15.md`, dont ~7 200 induites par la règle
`isParticipationSubmitted()`).

**Total soirée (grimpeurs + écran live, 3 remontages) : 28 010 lectures, soit 56,0 % du
plafond de 50 000.** Sous le critère de sortie de 30 000 — confortable mais serré : un
quatrième remontage ajoute encore ~3 240 lectures et franchirait le seuil.

### Le vrai risque reste les remontages

**Chaque remontage de la page live repaie les 3 240 documents du snapshot initial**
(confirmé par la mesure ci-dessus). Rechargement accidentel, mise à jour du service worker
en pleine soirée, veille du PC, plantage du navigateur : c'est le poste le plus sensible,
et la marge du critère de sortie ne tolère qu'un remontage de plus que le scénario testé.
Les parades sans développement ci-dessous restent donc impératives, pas optionnelles.

**Critère de sortie du §3 : atteint** (28 010 < 30 000 lectures pour la soirée, scénario à
3 remontages). Aucun besoin de revoir l'approche avant d'écrire l'écran.

### Parades sans développement (à documenter pour le jour J)

- Connexion **filaire** si possible (une coupure wifi prolongée peut invalider le jeton de
  reprise et refacturer le jeu complet).
- Veille, économiseur d'écran et notifications système **désactivés** sur le PC admin.
- **Ne pas laisser le service worker se mettre à jour pendant l'événement** : ouvrir la
  page une fois, ne plus y toucher. Envisager de ne pas déployer le jour J.
- ✅ **Devenu sans objet le 16/08/2026** : l'écran n'a plus de sélecteur de compétition
  interne (`CONCEPTION-selecteur-marge-compteur-incremental.md` §1) — changer de
  compétition affichée passe désormais par l'ouverture d'une nouvelle fenêtre depuis
  `AdminCompetitionManagement.tsx`, pas par un clic sur l'écran TV lui-même. Rien à
  rappeler à l'admin sur ce point le jour J au-delà de : ouvrir la bonne fenêtre une
  fois, ne plus y toucher (déjà couvert par le point ci-dessus).

---

## §4 — Architecture de l'écran

### Route et layout

- Route protégée **admin**, rendue **hors du layout habituel** : pas de `Navbar`, pas de
  `Container maxWidth`. Vérifier comment `ProtectedRoute` et le layout sont composés — selon
  la structure actuelle, ça peut demander une petite adaptation du routage.
- Aucune interaction : ni tri, ni clic, ni scroll. L'écran se regarde, il ne s'utilise pas.
- Ouvrable en nouvelle fenêtre depuis l'interface admin (bouton dédié, `window.open`), pour
  que l'admin conserve son poste de travail.
- **Screen Wake Lock API** pour empêcher la mise en veille de l'affichage.

### Données

Deux `onSnapshot`, montés une fois :

1. `competition_results` filtré sur la compétition active.
2. `competition_participants` filtré sur la compétition active (pour `submitted` et les
   catégories).

**Ne jamais refetch.** Le classement se recalcule **depuis le snapshot en mémoire**, jamais
par une nouvelle requête. C'est la règle absolue : un refetch à chaque delta ferait
exploser le quota (c'était l'erreur identifiée dès la première conception).

✅ **Vérifié le 15/08/2026 : `competition_id` est bien présent sur `competition_results`.**
Les quatre écrans qui lisent cette collection (`AdminCompetitionStats.tsx`,
`Ouvreur/CompetitionBoulders/CompetitionStats.tsx`, `ClientCompetitionStats.tsx`,
`Ouvreur/ReportsAndStats/CompetitionBoulderStats.tsx`) interrogent déjà tous
`where('competition_id', '==', ...)` directement, sans passer par un découpage en lots de
10 sur les identifiants de blocs. L'inquiétude de la conception initiale (§4 d'origine)
était obsolète — le schéma actuel ne demande qu'un seul listener par collection pour
l'écran live, pas d'orchestration supplémentaire.

### Recalcul groupé

Les validations arrivent **par vagues**, pas régulièrement (fin de rotation, fin de créneau).

Recalcul **groupé toutes les 1 à 2 secondes**, pas à chaque snapshot. Vingt snapshots en
deux secondes ne doivent pas déclencher vingt tris de 90 entrées sur 3 150 résultats. Le
délai est invisible à l'œil sur un écran mural.

---

## §5 — Ergonomie : conçu pour être lu à 5 mètres

### Le point le plus important : ne pas afficher 90 lignes

À cinq mètres, on lit confortablement **une douzaine de lignes**. Un classement global de
90 participants demanderait 8 pages en rotation, soit ~90 secondes par tour complet — un
grimpeur qui cherche son nom attend 40 secondes en moyenne. C'est ce qui fait qu'un écran
est ignoré.

**Solution** : rotation par **catégorie FFME + genre**, qui découpe naturellement 90
participants en groupes de 10 à 20. Chaque groupe tient sur un écran, et c'est de toute
façon dans sa catégorie qu'un grimpeur se situe.

Optionnel : un **Top 10 global fixe** en en-tête ou sur une page dédiée dans la rotation.

Rotation automatique toutes les 15-20 secondes, avec un indicateur de progression visible
(pour qu'on sache quand sa catégorie revient).

### Le reste

- Typographie très grande, contraste élevé. Ne **pas** réutiliser `ClientClassement` : ses
  tableaux denses et son tri interactif sont conçus pour un usage à bout de bras, l'exact
  opposé du besoin.
- **Marge de sécurité sur les bords** : l'overscan de certaines TV rogne le contenu collé
  au cadre.
- Marqueur visuel de statut : résultats **provisoires** vs **verrouillés** (`submitted`).
  Le classement bouge quand un grimpeur corrige son nombre d'essais — l'assumer et
  l'afficher, plutôt que d'attendre les soumissions.
- Horodatage discret de la dernière mise à jour : permet de repérer un écran figé.
- Afficher le **repère de version** (V2.25) quelque part discrètement : si l'écran affiche
  une version périmée servie par le service worker, c'est le seul moyen de s'en apercevoir.

---

## §6 — Sécurité

**Ne pas créer de rôle `display`.** Ça toucherait `firestore.rules`, `ProtectedRoute`,
`Navbar`, `AdminUsers`, et se heurterait à l'invariant « tout compte porte le rôle client »
(`hasClientRole()`). La duplication HDMI depuis un PC admin rend ce chantier inutile : le
compte est déjà connecté, sous la garde de l'admin.

**Ne jamais ouvrir `boulders` en lecture publique** pour simplifier quoi que ce soit. Le
calcul des points a besoin du champ `difficulty` des blocs de compétition — celui qui est
caché aux grimpeurs. L'ouvrir viderait la compétition de son sens.

Le risque d'exposition des cotations est faible ici (le PC est sous garde admin, l'admin
les connaît déjà), mais **le mode étendu reste impératif** : en mode miroir, une fenêtre
d'administration ouverte par erreur les affiche sur grand écran.

---

## §7 — Diffusion optionnelle par compétition + consentement (TRANCHÉ, FAIT — V2.30)

✅ **Implémenté le 15/08/2026 (commit `7ffeb30`).** Schéma, interrupteur, verrouillage
côté règles (dérivé de `status`, pas de champ `liveDisplayLocked` séparé), mention à
l'inscription client, avertissement sur `AdminCompetitionRegistration.tsx` : tout fait.
7 tests de règles dédiés (`live-display-flag-lock.test.ts`), 65/65 verts avec le reste
de la suite `test:rules`.

### Décisions prises le 15/08/2026

- **La diffusion est activable par compétition**, via un interrupteur sur l'écran de
  création/édition de compétition. Toutes les compétitions ne sont pas diffusées.
- **La mention de diffusion est affichée aux participants au moment de l'inscription.**
  → **L'inscription vaut consentement.** C'est le seul mécanisme de consentement retenu.
- **Tous les inscrits apparaissent** sur l'écran live. Pas de croisement avec
  `classementOptIn`, qui couvre un autre usage (le classement dans l'application).

### Schéma

Sur le document de compétition :

- `liveDisplayEnabled: boolean` — défaut **`false`** (une compétition non configurée n'est
  jamais diffusée par accident).
- `liveDisplayLocked: boolean` — voir ci-dessous.

### ⚠️ Verrouiller le drapeau au déclenchement de la compétition

**C'est le point qui rend le dispositif honnête.** Si le drapeau reste modifiable après
ouverture, un grimpeur peut s'être inscrit sans mention de diffusion et se retrouver
affiché sur grand écran.

Règle : une fois la compétition déclenchée (passage à l'état actif), `liveDisplayEnabled`
devient **non modifiable**. Même logique que le verrouillage des résultats à la soumission,
déjà en place.

À imposer côté `firestore.rules` : refuser toute modification de `liveDisplayEnabled`
lorsque la compétition est active. Ajouter un test dédié.

L'activer **avant** le déclenchement, jamais pendant.

### ⚠️ Le trou dans la chaîne de consentement : l'inscription par l'admin

`AdminCompetitionRegistration.tsx` permet à l'admin d'inscrire manuellement un
participant. **Ces personnes ne voient jamais l'écran d'inscription client, donc jamais la
mention de diffusion.**

Puisque l'inscription est le seul mécanisme de consentement retenu, c'est une brèche
réelle. Correctif minimal : afficher un avertissement à l'admin sur cet écran lorsque
`liveDisplayEnabled` est vrai — « cette compétition sera diffusée en salle, assurez-vous
que le participant en est informé ». Ça ne remplace pas le consentement, mais ça met la
responsabilité au bon endroit plutôt que de la laisser disparaître.

### Format d'affichage

**Prénom + initiale du nom** recommandé plutôt que le nom complet. Suffit largement pour
qu'un grimpeur se reconnaisse, et c'est le choix prudent — les catégories FFME impliquent
des **mineurs**.

Note factuelle sur les mineurs : en France, le consentement d'un mineur de moins de 15 ans
ne suffit pas en matière de données personnelles. Si des mineurs s'inscrivent eux-mêmes,
la mention affichée à l'inscription ne constitue pas à elle seule un consentement valide.
Ce n'est pas un blocage technique et ça relève de ta décision, pas de la mienne — mais
c'est un argument supplémentaire pour le prénom + initiale, et pour porter l'information
dans les conditions d'inscription à la compétition côté salle.

### Ce que le drapeau n'est PAS

Ce drapeau **ne peut pas être imposé côté serveur** comme une garantie de sécurité. Les
règles Firestore contrôlent l'accès aux données, pas leur affichage — et l'admin a de toute
façon le droit de tout lire.

C'est une décision d'affichage et une garantie de consentement, pas un contrôle d'accès.
Sans conséquence ici (le seul lecteur est l'admin lui-même), mais à ne pas confondre.

### Implications sur l'écran live

- Le sélecteur de compétition de l'écran live ne liste que les compétitions actives **et**
  `liveDisplayEnabled == true`.
- Si aucune ne correspond, afficher un message explicite (« aucune compétition en
  diffusion ») plutôt qu'un écran vide — l'admin doit comprendre pourquoi rien ne s'affiche
  sans avoir à ouvrir la console.
- Le bouton « Ouvrir l'affichage TV » côté admin n'apparaît que pour les compétitions
  diffusées.

---

## §8 — Ordre de réalisation proposé

1. ✅ **§1** — extraire `getParticipantScores()` + tests. FAIT, V2.29 (commit `33df75d`).
2. ✅ Vérifier le schéma : `competition_id` présent sur `competition_results` ? FAIT,
   vérifié le 15/08/2026 — déjà présent, aucune migration nécessaire.
3. ✅ **§7** — drapeau `liveDisplayEnabled`. FAIT, V2.30 (commit `7ffeb30`).
4. ✅ **§3** — chiffrer le coût du listener. FAIT, mesuré le 15/08/2026
   (`measure-live-screen-reads.mjs`) : 28 010 lectures/soirée (56,0 % du plafond) à 3
   remontages, sous le critère de sortie de 30 000. Pas besoin de revoir l'approche.
5. ✅ Route + layout nu + Wake Lock (coquille vide). FAIT, V2.31 (commit `e9af13b`) :
   `AdminCompetitionLiveDisplay.tsx`, route `/admin/competitions/live-display`, Navbar
   masquée sur cette route, bouton "Ouvrir l'affichage TV" (window.open) sur
   `AdminCompetitionManagement.tsx` pour les compétitions diffusées, sélecteur de
   compétition (status == 'en cours' && liveDisplayEnabled == true), repère de version.
   Reste à vérifier manuellement l'ouverture en fenêtre séparée / mode étendu (pas
   automatisable, pas de suite Playwright — voir §9).
6. ✅ Listeners + recalcul groupé. FAIT, V2.32 (commit `449ce1b`) : deux `onSnapshot`
   (`competition_results`, `competition_participants`) montés une fois par compétition
   sélectionnée (remontage via `key={competition.id}`), blocs lus une seule fois
   (`getDocs`), recalcul débounce à 1,5s via `competitionClassement.ts`. Aucun changement
   de `firestore.rules` nécessaire (admin a déjà un accès en lecture complet).
7. ✅ Mise en page grand écran + rotation par catégorie. FAIT, V2.32 (même commit) :
   rotation toutes les 18s (Top 10 général fixe puis chaque catégorie FFME non vide),
   grande typographie, marge anti-overscan, marqueur "provisoire", horodatage discret,
   prénom + initiale (mineurs FFME).
8. **Répétition matérielle à froid** : PC + câble HDMI + TV, mode étendu, overscan, veille
   désactivée. Une fois, avant le jour J — pas le soir même. **Hors périmètre d'un agent**
   (matériel physique) : reste à faire par l'utilisateur.

---

## §9 — Ce qui reste hors périmètre

- **La concurrence à 90 utilisateurs simultanés** n'a jamais été testée. Toutes les mesures
  existantes portent sur un grimpeur seul. Une **répétition à 10-15 personnes sur une
  vingtaine de blocs** reste ce qui renseignerait le plus — et c'est l'occasion de tester
  l'écran live en conditions réelles.
- **Plan de repli si un quota saute** : Firestore renvoie des erreurs et l'application
  s'arrête, aucune dégradation gracieuse n'a été conçue. Les résultats écrits sont en base
  et le classement reste calculable — mais décider à froid ce qu'on fait, plutôt que
  d'improviser.
- **Relever les compteurs à mi-parcours** le jour J (console Firebase, onglet Usage).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
