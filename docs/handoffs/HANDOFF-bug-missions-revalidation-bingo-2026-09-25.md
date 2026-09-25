# Handoff ClaudeNav — V2.68.1 / V2.69 / V2.70 : grille de missions, règle de revalidation, grille « bingo »

> Session Claude Code (PC Windows de l'utilisateur, pas le Codespace), 25/09/2026.
> Implémente `docs/handoffs/RETOUR-bug-missions-et-revalidation.md` (ta réponse du 25/09 au
> matin), étapes §5.1 à §5.7. L'étape §5.8 (garde-fou dans les règles) n'a pas été faite.
> **3 commits séparés** (`a47c031` V2.68.1, `11230de` V2.69, `110094c` V2.70), **poussés
> sur `main` et déployés le 25/09 au soir** (`--only hosting`). **Aucun changement de
> `firestore.rules`** dans ces trois versions, donc pas de déploiement des règles.
> `topo-blocabrac.pdf` a été mis à jour et régénéré (§6).
> **Rien n'a encore été vérifié par l'utilisateur dans l'interface** (§5).
> **Ajout du soir (§4 bis)** : l'audit §3.2 a été lancé en prod. Il a révélé que le badge de
> mission **n'avait jamais été créé au catalogue**, et il est maintenant créé. Les e2e
> saison passent (15/15 et 10/10).
> **V2.70.1 (§4 ter)** : badge au tampon, texte de « Quoi de neuf » coupé sur mobile, déployé.
> **V2.70.2 (§9)** : suite donnée à ton `RETOUR-v2681-v269-v270.md`, point par point, déployé.
> **V2.71 (§10)** : suite donnée à ton `RETOUR-v2701-v2702.md` — ⚠️ ton §4.2.1 reposait sur une hypothèse fausse, voir §10.

---

## 0. Comment ça s'est déroulé

J'ai suivi l'ordre de ton §5 en séparant le correctif de régression (V2.68.1) de la
décision produit (V2.69), comme tu le demandais. L'habillage de la grille (V2.70) est
livré à part.

L'utilisateur a validé en session :
- la règle « B sans fenêtre » ;
- la maquette du tampon (ta maquette, non livrée dans l'app), rangée depuis dans
  `docs/handoffs/apercu-tampon-RETOUR-bug-missions.png`.

---

## 1. V2.68.1 — correctif de la grille effacée

### Contrôles préalables

- **§1.2, « une première réussite repeuple-t-elle la grille ? »** : le bug a été
  **reproduit sur l'émulateur avant le correctif** avec `test/e2e-weekly-missions-flow.mjs`.
  L'e2e contient une étape dédiée (« Contrôle §1.2 ») : une première réussite après
  plusieurs flushs « missions seules » conserve tout l'état stocké et ajoute sa mission.
  Aucune seconde cause n'est apparue. **Pas de contrôle sur un compte de prod.**
- **§1.3, inventaire des écrivains de `user_ludic_state`** : tous passent par un `setDoc`
  avec `merge: true` ou par une transaction qui relit le document. Aucun `setDoc` sans
  merge n'existe.

| Écrivain | Avant | Après |
|---|---|---|
| Flush partagé (`classementFlushWrites`) | relisait seulement si `wallDeltas` non vide : **c'était la cause** | lectures dérivées de `pending` |
| `incrementRouletteCompleted` (M8) | recomposait depuis l'état React | transaction avec relecture |
| `recordDeclarativeMission` (M4 bis) | recomposait depuis l'état React | transaction avec relecture |
| `recordMissionGesture` (nouveau, V2.69) | — | transaction avec relecture |
| `updateLudicState` : `weeklyGoalItems` (`ClientScreen`), `firstAscentOptIn` (`ClientProfile`) | champs scalaires ou remplacés d'un bloc, merge | inchangé, sans risque |

### Correctif

- `classementFlushReadKeys(pending)`, fonction pure : l'ensemble des lectures est dérivé du
  même `pending` que les écritures.
- `ClassementFlushReadData.readKeys` distingue « non lu » de « document absent » (ta
  solution du §1.6). `buildClassementFlushWrites` **lève une exception** sur toute écriture
  vers un document non relu.
- Test de **propriété** (§1.5) sur les 1024 combinaisons présence/absence des champs de
  `pending`. Ajouter un champ à la transaction sans étendre les lectures fait échouer le
  test tout seul.
- `utils/ludicStateWrites.ts` (pur) calcule les patchs de M8 et de M4 bis.
  `mergeWeeklyMissionsForDisplay` fusionne la grille écrite avec celle en mémoire, qui peut
  contenir des missions dont le flush débouncé n'est pas encore parti.
- `CLAUDE.md` contient maintenant ta règle du §4 : « aucune écriture ne reconstruit un
  document à partir de l'état mémoire ».
- `scripts/audit-weekly-missions.js` fait en lecture seule le contrôle de ton §3.2
  (cohérence de `weeklyMissionsCompleted` et du badge en prod). **Il n'a pas encore été
  lancé**, voir §5.

---

## 2. V2.69 — la première réussite fait foi

Implémente ton §2 entier.

- **Bloc déjà réussi** : fiche en lecture seule (« Déjà validé le … en N essais »), plus de
  boutons « Réussi » ni « Échoué ». `handleValidateSuccess` revérifie aussi le résultat
  stocké : la règle ne repose pas seulement sur l'interface.
- **« Corriger ma saisie »**, sans limite de temps (§2.2) : change les essais ou annule la
  réussite, et le classement suit.
- **Nombre d'essais obligatoire** (§2.4, tranché : pas de valeur par défaut). « Réussi »
  reste désactivé tant qu'aucun nombre n'est choisi.
- **Écriture unique** de `client_boulder_results` (`utils/boulderResult.ts`, pur,
  `planResultWrite`) :
  - `merge: true`, avec **seulement** les champs pilotés par le geste. C'est la
    préservation structurelle du §2.5.
  - `createdAt` est repris du document stocké.
  - Le delta de classement n'est appliqué que si l'état réussite/essais a réellement changé.
- **Échec puis réussite** (§2.7) : la réussite compte comme une première réussite. La règle
  porte sur « déjà *réussi* », pas sur « déjà *saisi* ».
- **M3 (flash)** exige `neverTriedBefore` : aucun résultat stocké et `attempts === 1`
  (§2.6).
- **Gestes de mission** (§2.8) : « J'ai testé ce bloc » (bloc au-dessus du niveau pas
  encore réussi → M4) et « Je l'ai refait » (bloc déjà réussi → M1, et toute mission qu'il
  fait avancer). Ils passent par `recordMissionGesture`, hors de la transaction partagée,
  **sans jamais écrire de résultat** et sans interface optimiste. Chaque bouton n'apparaît
  que s'il fait réellement avancer la grille (`missionGestureAdvances`).
- **Grammaire des boutons** (§2.9) : un bouton qui écrit un résultat porte un adjectif
  d'état. Un bouton qui n'en écrit pas est à la 1re personne du passé, en contour, avec la
  légende « n'enregistre pas de résultat ». Le bouton Roulette a été aligné et M4 bis
  s'appelle « Je l'ai fait ».
- **Aide** (`ClientHelp.tsx`) : section « Missions de la semaine » et les trois gestes
  (enregistrer / faire avancer une mission / corriger).

---

## 3. V2.70 — grille « bingo » tamponnée (§2.11)

- **Mise en page** : `WeeklyMissionsGrid.tsx`, affichage seul. 8 tuiles, en 2×4 sur mobile
  et 4×2 au-delà.
- **Tampon** : c'est la marque de la salle sans typographie (`src/assets/marque.png`,
  masque alpha recoloré en CSS, texture griffée conservée).
  - Il arrive grand (~75 px) quand une mission est cochée pendant que l'écran est ouvert,
    puis se pose petit (~26 px) dans un coin. Aucune animation au premier affichage.
  - Inclinaison et opacité sont dérivées de la clé de la mission (`missionGridStyle.ts`,
    pur, testé), jamais tirées au hasard.
  - Encre `brandGreen` en thème sombre : `brandGreenDark` y était presque invisible.
- **Couleurs et pictogrammes** : accent de couleur de niveau pour M1/M3/M4 (bordure pour
  les couleurs pâles). Pictogrammes pour dévers, rétablissement et dalle. M2 en 4 segments.
- **En-tête** : niveau figé, « N / 8 », badge en silhouette qui s'allume à la complétion.
- **Accessibilité** : l'état validé est aussi donné en texte, le tampon est `aria-hidden`,
  et les animations sont coupées sous `prefers-reduced-motion`.
- **Ta condition est respectée** : le tampon n'est réutilisé nulle part ailleurs (badges,
  roulette) avant d'avoir été vu en vrai sur la grille.

---

## 4. Tests

| Vérification | Résultat |
|---|---|
| `npm test` | **290/290** (23 fichiers), relancé juste avant le déploiement |
| `npm run lint` | propre |
| `npm run build` | OK, refait **après** le bump 2.70 et juste avant le déploiement (la chaîne `2.70` est présente dans `dist/`) |
| `e2e-weekly-missions-flow.mjs` | **10/10** : nouveaux gestes, flush « missions seules » qui conserve la grille, contrôle §1.2, « Corriger ma saisie », M8 qui s'ajoute sans rien effacer, rechargement |
| e2e quotidien, défis, premiers ascensionnistes | verts, adaptés à la saisie obligatoire des essais |
| e2e saison (`season-classement`, `season-restart`) | **15/15 et 10/10** après installation de la clé (voir §4 bis) |
| `npm run test:rules` | non relancé : aucun changement de règles |

---

## 4 bis. Contrôles faits après le déploiement (25/09, plus tard dans la soirée)

L'utilisateur a installé une clé de compte de service sur le PC
(`firestore-migration/serviceAccountKey.json`, exclue de git, vérifié avec
`git check-ignore`). Deux points de §5 ont pu être levés.

### Audit §3.2 en prod : 0 anomalie, mais le badge n'existait pas

`scripts/audit-weekly-missions.js`, en lecture seule : 30 documents `user_ludic_state`,
3 avec une grille de missions, **0 anomalie**. Un grimpeur a une grille complète (8/8,
`weeklyMissionsCompleted = 1`).

**🔴 Le badge de mission n'existait pas au catalogue `badges` de prod.** Le handoff V2.68
annonçait un « badge `type: 'mission'` (nouveau, dans le catalogue `badges`) », mais aucune
étape n'a jamais créé ce document :
- le code d'attribution (`ClientStats.tsx`) était prêt ;
- la règle (`type in ["automatic", "mission"]`) aussi ;
- le test de règle crée **son propre** badge fictif (`badge-missions`), ce qui a masqué
  l'absence en prod.

Conséquence : **personne ne pouvait obtenir ce badge**, et la silhouette de badge de la
grille ne pouvait correspondre à rien.

**Corrigé le 25/09 au soir, avec l'accord de l'utilisateur**, par une écriture unique en
prod (`create`, qui échoue si le document existe déjà) :

```
badges/badge-missions = {
  name: 'Badge du grimpeur régulier',          // nom choisi par l'utilisateur
  feminineName: 'Badge de la grimpeuse régulière',
  type: 'mission',
  description: 'Compléter une grille de missions de la semaine (8/8).'
}
```

Pas de `color` ni de `criteria.color` : la synchronisation du niveau l'ignore (vérifié
dans `ClientStats.tsx`), et `computeBadgeActive` le traite comme toujours actif une fois
obtenu. Le grimpeur à 8/8 le recevra à sa prochaine ouverture de « Mes stats ».
L'audit relancé trouve bien `["badge-missions"]`.

**Leçon, même famille que §4 de ton retour** : un livrable qui est une *donnée de prod*, et
pas du code, n'est vérifié par aucun test. Le test de règle avait fabriqué la donnée
qu'il supposait. À l'avenir, tout chantier qui dépend d'un document de catalogue devrait
avoir une étape explicite « créer en prod » dans sa checklist de déploiement, et un audit
qui vérifie sa présence.

### e2e saison : 15/15 et 10/10

- `e2e-season-classement-flow.mjs` : **15/15**.
- `e2e-season-restart-flow.mjs` : **10/10**. Le test a d'abord été lancé sur le même
  émulateur, juste après le premier. Il a alors échoué à l'étape 8 : un écart de
  réconciliation sur le compte client **du premier test**, resté dans l'émulateur. Sur un
  émulateur redémarré à vide, il passe 10/10.
- Les scripts appelés par ces tests forcent `FIRESTORE_EMULATOR_HOST`. Seul le journal
  `.emulator.json` (exclu de git) a été écrit, et `git status` est resté propre.

---

## 4 ter. V2.70.1 : le badge au tampon (25/09, fin de soirée, déployé)

L'utilisateur a vu son badge dans « Mes stats » et l'a trouvé « tristounet » : il était en
gris par défaut, car il n'a aucune couleur de niveau. Deux options lui ont été proposées
(vert de la salle seul, ou vert plus tampon). Il a **choisi le tampon à la place de la
médaille**. Ta condition du §2.11 (voir le tampon en vrai sur la grille avant de le
réutiliser) était remplie, puisqu'il venait de le voir.

- **En-tête de la carte** dans « Mes stats » : fond `brandGreen`, tampon blanc à −13°, via
  le nouveau `components/GymStampMark.tsx` (version statique de celui de la grille, même
  masque).
- **Accueil** : la puce « Dernier badge obtenu » passe au vert de la salle.
- **La couleur est décidée par le type**, avec `isMissionBadge`/`badgeDisplayColor` (purs,
  testés, dans `badgeActivation.ts`). Il ne faut **jamais** poser de `color` sur le
  document : `computeBadgeActive` chercherait des blocs de cette « couleur » et mettrait le
  badge en veille.
- **Deux défauts antérieurs**, trouvés sur les captures de contrôle et corrigés dans le même
  lot :
  - la puce de l'accueil ignorait `feminineName` ;
  - **le texte du panneau « Quoi de neuf » était coupé à droite sur mobile depuis V2.13** :
    chaque `ListItem` faisait 100 % de large avec une marge à gauche, donc débordait, et
    l'`Alert` coupait ce qui dépassait. Corrigé par `width: 'auto'`. Chaque annonce de
    version était donc partiellement illisible sur téléphone.
- **Vérifié sur émulateur** : attribution automatique réelle du badge à l'ouverture de
  « Mes stats », captures en 400 px, clair et sombre, sans erreur console. `npm test`
  293/293.
- **Pas d'entrée de changelog**, pour que l'annonce 2.70 (qui reprend la 2.69) reste
  affichée.
- **Le tampon n'est pas réutilisé pour la roulette** : ce n'était pas demandé.

---

## 5. ⚠️ Ce qui n'a PAS été vérifié

1. **L'utilisateur n'a encore rien vu dans l'interface.** Seules des captures Playwright ont
   été faites : mobile, desktop, thème sombre, arrivée du tampon. À vérifier sur téléphone :
   - la bannière de mise à jour, puis « V2.70 » dans la Navbar ;
   - la fiche « Déjà validé » ;
   - « Corriger ma saisie » ;
   - un geste de mission ;
   - le tampon en vrai.
2. ~~Audit §3.2~~ et ~~e2e saison~~ : **faits**, voir §4 bis.
3. **L'attribution réelle du badge** au grimpeur à 8/8 n'a pas été observée. Elle se
   fera à sa prochaine ouverture de « Mes stats ». Relancer l'audit ensuite : il doit
   afficher `badge=true`.
4. **La grille de cette semaine de l'utilisateur reste effacée** jusqu'au lundi 28/09,
   conformément à ton §3.1 (pas de réparation).

---

## 6. Topo mis à jour

`topo-blocabrac-source.html`, régénéré (`npm run topo`, 10 pages, aucun débordement
vérifié page par page) :
- version V2.70 et date du 25/09 ;
- **Blocabrac quotidien** : essais obligatoires, première réussite en lecture seule,
  « Corriger ma saisie », note/commentaire/cotation toujours modifiables ;
- **Missions de la semaine** : grille « bingo » tamponnée, les deux gestes, flash seulement
  sur un bloc jamais essayé ;
- **Points de vigilance** : nouvel encadré « Une réussite ne se réécrit pas en revenant sur
  le bloc ».

---

## 7. Écarts par rapport à ton retour

1. **Transaction plutôt qu'`arrayUnion`** (§1.4). La remise à zéro hebdomadaire impose de
   lire `isoWeek` de toute façon, et `weeklyMissionsCompleted`/`completedAt` dépendent du
   contenu réel de `done`. Avec `arrayUnion`, une grille de la semaine précédente
   recevrait des missions de la semaine courante.
2. **« Je l'ai refait »** s'affiche dès qu'il fait avancer *une* mission (M1, mais aussi
   M2/M5/M6/M7 sur un nouveau mur ou type de mur), pas seulement M1.
3. **Note, commentaire et cotation proposée restent modifiables** hors de « Corriger ma
   saisie » (bouton « Enregistrer », `handleSaveNotes`, qui n'écrit jamais
   `success`/`attempts`). Ce ne sont pas des données de score.
4. **La règle n'est pas imposée dans `firestore.rules`.** Le propriétaire peut toujours
   réécrire son résultat librement. L'application passe par l'interface et par la garde de
   `handleValidateSuccess` : c'est suffisant selon la doctrine de confiance du projet, et
   ça évite une règle qui bloquerait aussi les corrections légitimes.
5. **Garde-fou du §1.7 (étape §5.8) non tenté.**
6. **Changelog** : seul `changelog[0]` est affiché dans « Quoi de neuf ». L'entrée 2.70
   reprend donc les points de la 2.69, pour qu'un grimpeur qui passe de 2.68 à 2.70 les
   voie. V2.68.1 n'a pas d'entrée : c'est un correctif invisible.

---

## 8. Questions ouvertes pour toi

- Le §1.7 vaut-il encore d'être tenté, maintenant que la garde est côté client et que le
  flush lève sur toute lecture manquante ?
- Si les missions devaient un jour rapporter des points au classement, les gestes (qui sont
  déclaratifs) ne doivent pas compter. C'est noté dans `CLAUDE.md`, sans rien de prévu.

---

## 9. Suite donnée à ton `RETOUR-v2681-v269-v270.md` : V2.70.2, déployée

Commit `63d9c04`, poussé, déployé le 25/09 au soir (`--only hosting`, pas de changement de
règles).

| Ton point | Suite |
|---|---|
| §1.1, garde-fou §1.7 | **Retiré** des points ouverts, pas reporté. |
| §1.2, provenance des gestes | Rien fait, comme tu le recommandes. |
| §2.2, aide « Je l'ai refait » | `ClientHelp` dit maintenant ce qu'il coche : niveau max **ou niveau au-dessus (M4)** selon la couleur, le mur pour M2, dévers/réta/dalle. Ta liste comptait bien M4 ; je l'avais oublié dans un premier jet, et je l'ai vérifié dans `applyValidationToWeeklyMissions`. |
| §3, « Échoué » sans essais | **Délibéré, confirmé** : `if (success && !chosenAttempts)`, et `attempts: null` est un état stocké prévu pour un échec. |
| §3, effacer un échec | **Ce n'était pas possible**, et tu avais raison de poser la question. « Corriger ma saisie » n'existait que pour une réussite, et **annuler une réussite laissait aussi un document `success: false`** : même effet, flash fermé à vie. Ajout de **« Effacer cet échec »** (voir ci-dessous). |
| §4, ligne `CLAUDE.md` | Ajoutée mot pour mot à côté de ta règle « aucune écriture ne reconstruit un document ». J'y ai mis le tableau des trois occurrences. |
| §4.1, audit générique | `scripts/audit-prod-catalog.js` (voir ci-dessous). |
| §4.2, étape vérifiée par une lecture | Écrit dans `CLAUDE.md` : l'étape « créer en prod » se vérifie **en lançant l'audit**, pas en cochant une case. |
| §5, isolation des e2e | `test/emulator-reset.mjs` (voir ci-dessous). |
| §6, la clé | Clos. L'utilisateur la garde et la traite comme un mot de passe admin. |
| §7, compteur et silhouette | Faits tous les deux, plus un troisième changement qui en découle (voir ci-dessous). |
| Attribution du badge au grimpeur à 8/8 | **Confirmée en prod** : `audit-weekly-missions.js` affiche `badge=true`. |

### Effacer un échec

- `canEraseFailure` (pur, 4 tests) : un résultat stocké, qui n'est pas une réussite, et qui
  ne porte **aucun vote de méthodes**. Un vote resté sur une réussite annulée est compté dans
  `boulders.methodCounts` ; supprimer le document ferait dériver l'agrégat, donc c'est refusé.
- `handleEraseFailure` **supprime** le document, avec une confirmation qui prévient que la
  note et le commentaire partent avec. Le bloc redevient « jamais tenté ».
- Ni classement ni missions ne sont touchés.
- **Aucun pouvoir de triche nouveau** : un grimpeur pouvait déjà ne pas saisir son échec.
- **Nouvelle étape 10 de `e2e-weekly-missions-flow.mjs`, 11/11** : échec en base → bouton →
  document supprimé → fiche de nouveau saisissable → grille strictement inchangée.

### Audit générique du catalogue

**Aucun identifiant de badge n'est écrit en dur dans l'application** : `ClientStats.tsx`
parcourt le catalogue et attribue **par type**. « Tout identifiant référencé dans le code »
aurait donc vérifié un ensemble vide. L'audit vérifie à la place les **contrats** que le code
suppose :
- au moins un badge `mission`, sans couleur ;
- un badge `automatic` « réussir un bloc X » pour chaque couleur de violet à rose (la
  synchro du niveau ne peut pas atteindre une couleur qui n'a pas de badge), plus le Master ;
- toute couleur de badge automatique présente dans `levelOrder` ;
- aucun lien `client_badges` vers un badge absent ;
- l'état de `app_config/classement_saison`.

C'est le **seul** document à identifiant fixe que le code lit, vérifié par grep.

**Résultat en prod : 0 erreur, 2 avertissements, tous deux déjà connus ou sans effet.**
- `app_config/classement_saison` **absent** : la fenêtre de saison n'a jamais été réglée,
  c'est le point que tu connaissais.
- **Un `client_badges` à l'ancien format** (`client_id`/`badge_id` en snake_case, mai 2026,
  `badge-expert`, décerné à la main par l'admin le 27/05/2026). Aucun écran ne le lit,
  puisque tous interrogent `userId`. **Non supprimé** : c'est à l'utilisateur de décider.

  **⚠️ Correctif de ce paragraphe** : j'avais d'abord écrit que le `client_id` ne
  correspondait à aucun compte. C'était faux. Ma vérification cherchait un champ `clientId`
  au lieu de `client_id`, donc un compte « none ».

  En réalité, le `client_id` pointe vers un **compte de test des débuts**, « Maurice
  Tartanpion ». Ce compte se compose de :
  - un document `users` créé le 16/05/2026 avec un identifiant **auto-généré par Firestore**,
    et non l'uid de connexion. Il est donc impossible de s'y connecter : son e-mail
    correspond à un autre uid d'authentification, qui n'a lui-même aucun document `users`
    (dernière connexion le 15/05/2026) ;
  - un `classement_profiles` à zéro, sans nom ;
  - aucun résultat de bloc, aucun badge au format actuel ;
  - ce seul lien à l'ancien format, sans doute créé par un premier écran d'admin qui
    utilisait `addDoc`.

  **Proposition à l'utilisateur** : supprimer les trois documents Firestore (lien, `users`,
  `classement_profiles`) et le compte d'authentification orphelin.

  **Décision de l'utilisateur (25/09) : on garde tout.** Maurice Tartanpion fait partie des
  comptes de test conservés « sous le coude ». Les badges manuels (`badge-debutant`,
  `-intermediaire`, `-avance`, `-expert`) sont le système prévu à l'origine pour que les
  moniteurs valident la progression des élèves des cours : ils restent. La remise manuelle
  actuelle (`StatsList.tsx`, `awardBadgeToUser`) écrit bien au format `userId`/`badgeId`,
  vérifié. Seul ce lien de mai 2026 est à l'ancien format. L'audit continuera de le
  signaler en avertissement, et c'est voulu.

La première version de l'audit le classait en erreur, avant que je lise le document ; il est
maintenant classé à part. Code de sortie non nul en cas d'erreur, donc utilisable tel quel
comme étape de vérification d'un déploiement.

### Isolation des e2e

`resetEmulators()` vide Firestore et Auth des émulateurs par leur API REST
`/emulator/v1/...`. Les URL sont en dur sur `localhost`, et cette API n'existe pas en prod.
Les deux seeds saison l'appellent en premier.

**Vérifié sur le scénario exact qui échouait** : classement → redémarrage → classement →
redémarrage, sur le même émulateur, sans le redémarrer. Résultat : 15/15, 10/10, 15/15,
10/10.

Effet de bord utile : le seed du classement, qui plantait à la relance (« email déjà
utilisé »), est maintenant rejouable. **Tu proposais d'isoler le test lui-même ; j'ai isolé
les seeds**, car le test présuppose l'état que son seed vient de poser. Un reset dans le test
effacerait ce seed.

### Badge : §7 et ce qui en découle

1. **Compteur** : « N semaines complètes » en vert sur la carte du badge obtenu, lu dans
   `weeklyMissionsCompleted` (déjà chargé, aucune lecture de plus).
2. **Silhouette « non obtenu »** : tant que le badge n'est pas obtenu, « Mes stats » l'affiche
   en tampon grisé avec « Pas encore obtenu : complétez une grille… ».
3. **En-tête de la grille** : sa petite icône de badge était encore une *médaille*. C'est
   maintenant le même tampon (`GymStampMark`), gris puis encré à la complétion. Sans ce
   changement, les deux écrans ne racontaient toujours pas la même chose.

Vérifiés en captures sur émulateur (400 px, clair et sombre).

### Chiffres

`npm test` 297/297, lint propre, build après le passage en 2.70.2. e2e : missions 11/11,
quotidien 10/10, saison ×2 (voir ci-dessus).

### Ce qui n'est pas vérifié

- Aucune de ces nouveautés n'a été vue sur un vrai téléphone.
- **Pas d'entrée de changelog** pour 2.70.1/2.70.2 : l'annonce 2.70 reste affichée dans
  « Quoi de neuf ». Ce panneau est d'ailleurs **enfin lisible sur mobile** depuis la V2.70.1
  (§4 ter).

---

## 10. Suite donnée à ton `RETOUR-v2701-v2702.md` : V2.71, déployée

Commits `8765550` et `e680f5d`, poussés, déployés le 25/09 au soir (`--only hosting`).

| Ton point | Suite |
|---|---|
| §2.1, règle de `delete` | **Ouverte au propriétaire**, lue dans `firestore.rules` (`allow delete: if resource.data.userId == request.auth.uid…`). Elle était déjà exercée par l'étape 10 de l'e2e missions, à travers les vraies règles. La garde « pas de vote de méthodes » est donc **côté client seulement**. Elle est gardée, comme tu le recommandes. |
| §2.2, filet `methodCounts` | `scripts/reconcile-method-counts.js` : simulation / `--fix` / garde-fou 30 % **et** ≥ 3 / `--force`. Workflow mensuel `reconcile-method-counts.yml` (1er du mois, 03h45 UTC). Test émulateur `reconcile-method-counts-emulator.mjs` : écart détecté, simulation sans écriture, correction, idempotence, garde-fou puis `--force`. **Prod : 141 blocs, 0 vote, 0 écart.** |
| §3, annonce | Entrée de changelog 2.71 : saison du 1er novembre au 31 mai, départ à zéro, **le classement général compte dès maintenant**. **Aucune mention de la Finale, sur décision de l'utilisateur** : sa faisabilité réelle reste à confirmer, elle sera annoncée plus tard. |
| §4.2.1, baseline à zéro | ⚠️ **Hypothèse fausse, vérifiée dans le code et fixée par un test** : `recomputeSeasonBaseline` ne reçoit **aucune date**. « Redémarrer » crédite donc tout l'historique de chaque grimpeur, jamais zéro, quel que soit `debut`. Ton §4.3.5 (« régler puis cliquer ») aurait donné aux anciens tout leur historique en crédit. **Une saison à zéro s'ouvre avec « Enregistrer »**, ce que l'utilisateur avait déjà prévu. L'écran admin porte maintenant un avertissement à côté du bouton, et son texte, inexact depuis V2.56 (« blocs encore posés »), est corrigé. Conséquence assumée : sans `season.baseScore`, la réconciliation ignore `season.*`, et seul le compteur incrémental fait foi. |
| §4.2.2, « saison à venir » | `seasonPhase(config, today)` (pur, testé) → `aucune / a_venir / en_cours / terminee`. Dans l'onglet saison, hors `en_cours`, un **message daté** remplace le tableau de zéros (« La saison commence le 1er novembre 2026… le classement général, lui, compte dès maintenant »). Puce admin « Saison à venir ». Une seule lecture de `app_config` au montage, et une lecture ratée ne masque pas le classement général. |
| §4.2.3, `isWithinSeasonWindow` avec un début futur | Test explicite ajouté (validation d'octobre, saison au 1er novembre). |
| §4.3.3, profils manquants | **Aucun** : 59 `users`, 59 `classement_profiles`. Tes 28/30 comparaient les profils porteurs d'un champ `season` et les `user_ludic_state`. Sans objet de toute façon avec « Enregistrer ». |
| §5, garde de `resetEmulators()` | Lève une exception si l'un des deux `*_EMULATOR_HOST` ne pointe pas vers localhost. Vérifié en le lançant sans variables : refusé. |
| §5, exceptions connues | `KNOWN_EXCEPTIONS` dans `audit-prod-catalog.js`, affichées sur une ligne ℹ️ à part. Prod : 0 erreur, 1 avertissement (fenêtre de saison non réglée, qui disparaîtra à l'enregistrement). |

**Vérifié** : 300 tests unitaires, lint propre, build après le passage en 2.71. e2e saison 15/15 et 10/10. Captures sur émulateur (onglet saison à venir, écran admin, annonce), où j'ai trouvé et corrigé « le 1 novembre » en « le 1er novembre ».

**Pas vérifié** : le rendu sur un vrai téléphone.

**Ce qui reste côté utilisateur** :
- enregistrer la fenêtre 2026-11-01 → 2027-05-31 avec « Enregistrer » ;
- en juin 2027, enregistrer tout de suite la saison suivante, sinon le cron de clôture passe au rouge après 7 jours.

**Tranché par l'utilisateur, V2.71.1 déployée (`905e275`)** : les trois textes client qui parlaient
de la Finale sont **retirés jusqu'à ce qu'elle soit confirmée** :
- la légende de l'onglet saison ;
- la ligne d'aide ;
- la légende sous l'opt-in du profil.

Les textes d'origine sont consignés mot pour mot dans `CLAUDE.md` (section classement de
saison), pour être remis tels quels. L'étape 5 de `e2e-season-classement-flow.mjs` vérifie
maintenant que la légende est **absente** : elle est à inverser le jour venu.

La mécanique de la Finale est intacte : archive, roster, mode `officiel`, et l'exclusion
des opt-out dans `compute-classement-saison.js`. L'écran admin la mentionne toujours, ce
qui est voulu puisqu'il ne s'adresse qu'au staff.

Au passage, la ligne d'aide « au démarrage d'une saison, votre score repart de vos
validations des blocs en place » décrivait le « Redémarrer » avec crédit. Elle dit
maintenant que tout le monde repart de zéro.

---

## Points ouverts par ailleurs (reportés, inchangés sauf mention contraire)

- ~~Attribution du « Badge du grimpeur régulier »~~ : confirmée en prod (§9).
- ~~Clé de compte de service~~ : gardée sur le PC, point clos (ton §6).
- ~~Garde-fou §1.7~~ : retiré (ton §1.1).
- ~~Le `client_badges` à l'ancien format~~ : conservé, c'est un compte de test (§9).
- **Fenêtre de saison jamais réglée** (`app_config/classement_saison` absent), confirmé par l'audit.
- Vérification visuelle de l'anecdote d'ouvreur et du carnet de méthodes (V2.66/V2.67) :
  toujours sans retour de l'utilisateur.
- Migration de l'état ludique : Passe C déployée en V2.61, la purge
  (`purge-legacy-ludic-fields.js --fix`) est toujours en attente.
- Clic « Redémarrer la saison » : à vérifier si l'utilisateur l'a déjà fait.
- Défis `fenetre` / `bloc_designe` : toujours en prod sans e2e navigateur.
- Chantier droits d'accès (rôle ouvreur trop large) : en attente du gérant.
- `topo-blocabrac.pdf` : on ne sait toujours pas si la police Dosis s'affiche réellement
  dans le PDF généré ; `aide-connexion-installation.html` est toujours hors charte.
- Un projet Firebase par salle ou un projet mutualisé ; fork « Grimpe ! ».
- Sauvegarde durable des images Cloudinary (`--backup`).
- Idée « mode flash » : écartée explicitement (voir `CLAUDE.md`).
