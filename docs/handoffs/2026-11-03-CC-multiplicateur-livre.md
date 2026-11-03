# Le multiplicateur est livré — ton §0 était juste, ton §D3 avait des chiffres faux, et ton §3 comptait deux sites sur cinq

> Réponse à `docs/plans/2026-11-03-CN-plan-multiplicateur-v2.md`.
> **V2.77 commitée, PAS poussée, PAS déployée** — 6 commits sur `main` local
> (`b15f5ef` → `c962061`). 471 tests rapides verts (37 fichiers), 171 tests de règles verts
> (10 fichiers), lint propre, build en 2.77 **après** le bump.
> ⚠️ **Rien n'est posé en production**, et il y a un ordre à respecter : voir §6.

---

## §0 — Ton §0 était juste, et c'était le cœur du chantier

La lecture tient. `competition_results` stocke `success`, `attempts`, `rating`,
`proposedDifficulty`, `zone`, `attemptsToZone` — **aucun point**, vérifié sur l'interface
`ValidationResult` et sur le seul site de calcul (`ClientCompetitions.tsx:887`). Les points
sont recalculés à chaque affichage. Donc effacer le multiplicateur à la clôture rendrait au
simple, pour toujours, les blocs doublés d'une épreuve terminée.

Les trois moments sont posés comme ton tableau le dit : **effacer au rattachement, effacer au
retrait, CONSERVER à la clôture**.

**Ce que j'ai ajouté, parce que ton tableau ne pouvait pas se garder tout seul :** deux des
trois clauses sont des **absences**, et une absence ne s'observe pas en exécutant un geste. Si
quelqu'un ajoutait `points_multiplier: deleteField()` à `handleConfirmMigrate` dans six mois,
le défaut n'apparaîtrait qu'à la consultation d'un classement passé, des semaines plus tard,
et il ressemblerait **trait pour trait** à un classement normal — aucun écran n'affiche « ×1 »
là où il y avait « ×2 ».

D'où `frontend/test/contrats/pointsMultiplier.test.ts`, qui lit les **sources** plutôt que de
les exécuter, exactement comme le contrat de `registered_count`. Trois propriétés, chacune vue
rouge séparément (4 mutations, restauration vérifiée à l'octet). La troisième porte
l'assertion `expect(corps).toContain('points_value: deleteField()')` — **nommer ce qui doit
DIFFÉRER** : sans elle, le test passerait tout aussi vert si `handleConfirmMigrate` avait cessé
d'écrire quoi que ce soit.

---

## §1 — Ton §D3 annonçait 144 / 288 / 289. Les vraies valeurs sont 158 / 316 / 317

**Violet à 3 essais, mode à plancher :** `200 × (0,25 + 0,75 × 0,85²) = 200 × 0,791875 =
158,375`, donc **158** affiché. Les deux ordres donnent **316** (arrondir puis doubler) contre
**317** (doubler puis arrondir).

**Ta conclusion tient entièrement** — seul « arrondir puis doubler » rend exactement le double
de ce qui est affiché. Ce sont les chiffres d'illustration qui étaient faux.

Ce qui l'a attrapé : j'ai écrit **tes** valeurs dans le test, telles quelles, avant de
l'exécuter. Même geste que la cellule du 28/10, même résultat.

**Et ton §D3 sous-estimait l'enjeu.** J'ai mesuré : les deux ordres divergent sur **86 des 160
combinaisons** couleur × essais du mode à plancher, pas sur un cas isolé. Le test épingle donc
la propriété qui couvre toute la grille — *en mode à plancher, un bloc doublé rend toujours un
nombre **pair*** — en plus du cas nommé. L'ordre inverse produirait des impairs.

---

## §2 — Ton §3 disait « les deux déclarations ». Il y en a CINQ

C'est la correction la plus importante de ce lot, et celle qui aurait fait le plus de dégâts.

> **Commit 1 — le champ et son cycle de vie.** `points_multiplier?: number` sur le type
> `Boulder` (les deux déclarations : l'ouvreur et `ClientCompetitions.tsx`, qui a la sienne)

Cinq écrans composent un objet-bloc pour le calcul, et **chacun mappe ses champs un par un**
(`points_value: d.data().points_value`) plutôt que par étalement :

| fichier | ce qu'il calcule |
|---|---|
| `AdminCompetitionLiveDisplay.tsx` | l'écran live TV |
| `AdminCompetitionManagement.tsx` | **la publication du palmarès gelé** |
| `AdminCompetitionStats.tsx` | le classement admin |
| `Ouvreur/CompetitionBoulders/CompetitionStats.tsx` | le classement ouvreur |
| `ClientCompetitions.tsx` | l'aperçu de points du grimpeur |

Un seul qui oublie le champ **compte le simple pendant que les autres comptent le double, sur
la même compétition** — et celui qui proclame est l'écran de l'admin. Les cinq transmettent, et
`CLAUDE.md` porte l'avertissement pour le prochain lecteur. (`ClientCompetitionStats.tsx` et
`CompetitionJudgeEntry.tsx` ne calculent aucun point : vérifiés, rien à y faire.)

---

## §3 — Tes trois décisions, appliquées telles quelles

**D1 — un nombre, liste blanche.** `isValidPointsMultiplier()` dans `firestore.rules` : absent,
`null`, 1 ou 2. Sans `get()`, donc inconditionnelle et gratuite, comme `isValidOpenerNote`.
Posée sur la branche **create** *et* la branche **update** — vérifiée rouge séparément sur
chacune. Un client ne peut jamais toucher le champ : ses deux branches sont bornées par
`hasOnly([...])`.

Et **aucun repli dans le code** : un `Math.max` ou une normalisation silencieuse rendrait
aveugle au défaut que la liste blanche existe pour attraper. La règle serveur fait foi.

**D2 — ça coule, et je l'ai écrit quelque part.** Confirmé : `getParticipantScores` mesure la
dureté par `calculateCompetitionPoints(bloc, 1, true, mode)`. Rien à changer, donc rien n'était
garanti — d'où `competitionClassementMultiplicateur.test.ts`, qui fige la décision en **deux
moitiés** :

- le multiplicateur **coule** dans le départage (un violet ×2 se mesure aussi dur qu'un rouge) ;
- le classement **par niveau max n'est PAS affecté** — il partitionne par `boulderColorKey`,
  jamais par les points. Un violet ×2 reste un violet.

Tu n'avais pas mentionné la seconde, et une seule des deux ne décrit pas le système. En
supprimant la multiplication, les 4 tests à points rougissent et **les 2 de niveau max restent
verts** : c'est cela qui montre leur indépendance plutôt que de la supposer.

⚠️ **Un de mes tests ne pouvait pas rougir et a été renforcé.** « Un bloc doublé fait passer
devant » affirmait l'**ordre** — que l'égalité à 200-200 rendait de toute façon. Le décor
produisait l'effet attendu à la place du code. Il affirme désormais les scores.

**D3 — après l'arrondi.** Pas en une ligne glissée à la fin, parce que **le corps de
`calculateCompetitionPoints` a cinq retours anticipés : il n'y a pas de « fin »**. Je l'ai donc
renommé en `pointsAvantMultiplicateur` (interne, inchangé mot pour mot) et l'export est devenu
un emballage d'une ligne. Couvre les cinq modes uniformément.

---

## §4 — Ton §0 bis : les deux signaux sont restés silencieux

1. **`calculatePoints` n'a pas été touchée.** Vérifié au `git diff` : pas une ligne de son corps.
2. **Aucun fichier de test existant n'a eu besoin d'être modifié.** 454 → 471 tests, 34 → 37
   fichiers. La seule exception est le *helper* de transcription de `handleConfirmAddExisting`
   dans `competition-existing-daily-boulders.test.ts`, qui a gagné la clé que le handler écrit
   désormais : aucune assertion existante changée.

**L'invariant que tu demandais** vit dans `competitionPointsMultiplier.test.ts` : un bloc
**sans** multiplicateur rend exactement ce qu'il rendait avant, sur **800 combinaisons** (5
modes × 8 couleurs × 20 essais). La table a été **produite par le code de `git show HEAD:`**
puis figée en littéraux — elle n'est pas recalculée par la fonction qu'elle juge. Elle se
recoupe avec la table publiée aux grimpeurs sur le cas le plus fragile (noir à 2 essais : 533).
Et la **taille** est affirmée avant le contenu : 40 lignes de 20 valeurs.

---

## §5 — Ce que j'ai décidé et que tu n'avais pas tranché

1. **Le sélecteur est masqué en mode « Officiel ».** Ce mode ne produit pas de points mais un
   tri, `calculateCompetitionPoints` y rend 0, donc un multiplicateur y serait sans **aucun**
   effet. Afficher un réglage inopérant est pire que ne rien afficher — même raison que
   l'absence de « Points: 0 » dans le dialogue de validation.
2. **×1 s'écrit `deleteField()`, pas le littéral 1.** L'absence du champ *est* ×1 partout
   (calcul comme règles) ; ne pas semer de 1 inutiles garde la donnée lisible — un bloc portant
   `points_multiplier` est un bloc que quelqu'un a réglé.
3. **L'écriture du sélecteur est optimiste puis annulée en cas d'échec.** Un sélecteur qui
   resterait sur la valeur choisie après un refus mentirait à l'ouvreur. L'action en masse,
   elle, est tout-ou-rien.
4. **Le topo a gagné l'encadré** (page 06, « Modes de comptage ») et la mention sur la ligne
   « Blocs de compétition ». Il porte les trois phrases de ton §5 et l'asymétrie du point
   suivant. 14 sections, toutes dans une page, toutes avec leur pied ; 278 px libres sur 1123.
5. **J'ai dit l'asymétrie à voix haute, parce qu'elle n'est pas évidente.** `scoring_mode` est
   verrouillé côté serveur dès que la compétition démarre, **précisément** parce que le changer
   en cours d'épreuve changerait le score de tout le monde rétroactivement.
   **`points_multiplier` ne l'est pas** — c'est ta demande explicite, et je l'ai suivie. Mais
   cela veut dire qu'un clic en cours de soirée réécrit l'histoire de tout le monde. C'est tenu
   par la **procédure**, pas par les règles.

---

## §6 — 🔴 L'ORDRE DE DÉPLOIEMENT, et pourquoi il n'est pas négociable

**Rien n'est poussé, rien n'est déployé, aucun multiplicateur n'est posé en prod.**

🔴 **Déployer AVANT de poser le moindre ×2 sur une compétition de production.** Un grimpeur sur
un ancien bundle n'a pas la branche du multiplicateur dans son code : `calculateCompetitionPoints`
y est l'ancienne, et il verrait **le simple sur son écran pendant que le classement de l'admin
crédite le double**, sans aucun message. C'est exactement le piège du barème à plancher du
28/10, et il est pire ici : là, le mode était un champ d'admin invisible ; ici, le grimpeur a un
nombre sous les yeux et il le compare à l'affiche de l'accueil.

🔴 **Poser les multiplicateurs AVANT de publier le palmarès.** `competition_rankings` est
immuable par les règles — un palmarès publié avec les mauvais multiplicateurs ne se répare
qu'avec `unpublish-competition-rankings.js` et la clé de service.

L'ordre, donc : `--only firestore:rules` **et** `--only hosting` d'abord, puis les ×2 dans
l'écran ouvreur, puis le pas 3 du soir (passage en « en cours »), puis le palmarès.

---

## §7 — Ce que je n'ai PAS pu faire, et qui reste à l'utilisateur

1. 🔴 **Ta tâche 0 et ton §1.7 — l'état des 23 blocs en production.** Mes lectures de prod ont
   été **refusées par le classificateur de permissions** de cette session. Je n'ai donc
   **aucune** information de première main sur : combien de blocs portent `competition_id` du
   Contest, lesquels sont `competition_active`, sur quels murs, ni s'ils sont déjà rattachés.
   Le script de lecture est prêt (lecture seule, aucun write, aucun journal) si tu veux que je
   le relance avec la permission.
2. 🔴 **Ta question au gérant : *quels murs exactement ?*** « Un ou deux murs, 23 blocs » n'est
   pas une liste, et 23 multiplicateurs posés sur le mauvais mur sont pires que pas de
   multiplicateur du tout. **Rien dans ce lot ne répond à cette question**, et aucun test ne
   peut la poser.
3. ⚠️ **Le rendu VISUEL du topo n'a pas été regardé** : `pdftoppm` n'est pas installé sur cette
   machine. Le filet mesure les **débordements**, jamais les collisions ni les disparitions —
   il est déjà arrivé qu'un document régénéré sorte vert et faux. À regarder avant impression.
4. ⚠️ **Aucun essai manuel de l'interface.** Le sélecteur, l'action en masse, la puce côté
   grimpeur : rien de tout cela n'a été vu dans un navigateur. Pas d'e2e non plus sur ce
   chemin. **Dans la culture de ce dépôt, une modification d'interface non vérifiée est un
   risque ouvert, pas une formalité.** C'est le point le plus faible du lot.
5. ⚠️ **L'affiche du barème** (`public/docs/affiche-bareme-competition.pdf`) porte la valeur des
   couleurs ; un bloc ×2 la contredit. Une ligne au feutre, comme tu l'écris : *« les blocs du
   Mur X comptent double »*. L'affiche n'a **pas** été régénérée : le multiplicateur n'est pas
   une propriété du barème, et le générateur n'a aucune raison de le connaître.

---

## §8 — Ton défaut latent : lu, noté, pas touché

Confirmé tel quel. `points_value` est effacé à la clôture, et rien ne stocke les points : une
compétition `blocs_valides` **terminée** se recalcule donc déjà aujourd'hui avec des valeurs
disparues. Écrit dans `docs/architecture/competitions.md` comme question ouverte, **pas
corrigé**. Ce n'est pas le chantier de cette semaine, et le gel tient.

---

## §9 — Table des changements

| fichier | commit | nature |
|---|---|---|
| `firestore.rules` | 1 | `isValidPointsMultiplier()`, posée sur create et update |
| `Ouvreur/.../CompetitionBouldersList.tsx` | 1, 3 | champ, 3 sites du cycle de vie, sélecteur, action en masse |
| `test/contrats/pointsMultiplier.test.ts` | 1 | **nouveau** — le cycle de vie, sur les sources |
| `test/competition-existing-daily-boulders.test.ts` | 1 | +6 tests de règles (liste blanche, cycle de vie) |
| `utils/climbingPoints.ts` | 2 | emballage + champ sur `CompetitionScoringBoulder` |
| `utils/competitionClassement.ts` | 2 | champ sur `BoulderInput`, D2 documentée |
| 4 écrans de classement | 2 | transmission du champ |
| `utils/competitionPointsMultiplier.test.ts` | 2 | **nouveau** — les 800 valeurs, §D3 |
| `Client/.../ClientCompetitions.tsx` | 2, 4 | transmission, puce ×2, détail du calcul |
| `utils/competitionClassementMultiplicateur.test.ts` | 5 | **nouveau** — D2 et sa limite |
| `package.json`, `data/changelog.ts` | 5 | V2.77 + entrée visible du grimpeur |
| `CLAUDE.md`, `docs/architecture/competitions.md` | — | invariant + récit |
| `topo-blocabrac-source.html` + PDF | — | encadré page 06 |

---

## §10 — Points ouverts par ailleurs, repris du handoff précédent

Inchangés par ce lot, qui est orthogonal :

1. **Correctif des niveaux** — après le contest. **Rien sur cette chaîne avant le 6 novembre**,
   ni déployé, ni commité. Ce lot ne touche ni `users.level`, ni les badges, ni
   `level_at_start`, ni le gel.
2. **Route `*` terminale et documents de `public/docs/` listés côté admin** — tranchés « plus
   tard » le 28/10.
3. **« Mes stats » reste le pire poste de lectures** — intouchable jusqu'au 6.
4. **Retour en Spark décidé pour le 6 novembre.** Ce lot n'ajoute **aucune lecture** et au plus
   une écriture par changement de multiplicateur (23 en masse = 1 `writeBatch`) : négligeable
   devant les ~4 325 écritures prévues pour la soirée.
5. **Plan B inchangé**, si quelque chose tourne mal : basculer en `blocs_valides` avec
   `points_value` = 2 × la base de la couleur. Mais le code est vert, donc le prix de ce plan B
   (perdre la décroissance par essais du mode à plancher) n'a plus à être payé.
