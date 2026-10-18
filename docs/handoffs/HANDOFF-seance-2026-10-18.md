# Handoff ClaudeNav — séance du 18/10/2026

**Couvre deux choses** : la séance d'aujourd'hui (Claude Code), et **la queue de la séance du
15/10 qui n'avait jamais été poussée**. Les 17 commits concernés sont maintenant sur
`origin/main` (`f72e0e8..25c51fc`).

⚠️ **Trois choses à retenir avant le reste** :

1. **`CLAUDE.md` a été découpé** (190 ko → 80 ko). Une partie de la doctrine que tu cites n'y
   est plus : elle vit dans `docs/architecture/`. Détail en §4.
2. **La production tourne toujours V2.74.1.** La V2.74.2 d'aujourd'hui est commitée, poussée,
   construite — **pas déployée**. Rien ne l'impose : elle corrige des écrans de cours, pas le
   chemin du 5 novembre.
3. **Un nouveau chantier non planifié est arrivé en cours de séance** (§5) : l'utilisateur a
   demandé comment apparaissent les résultats d'une mini-compétition de cours. Cinq défauts,
   tous mesurés sur les écrans rendus.

---

## 1. Ce que le 15/10 avait livré et qui n'était pas poussé

Rien de neuf pour toi sur le fond — c'est ton plan du 5 novembre, et tu en as déjà eu trois
retours (`RETOUR-classements-competition-5-novembre.md`,
`RETOUR-avant-deploiement-reponses.md`, `RETOUR-avant-deploiement-cloture.md`). Ce qui
change : **ces 11 commits existaient seulement sur le poste de l'utilisateur**, alors même que
V2.74 et V2.74.1 étaient, elles, **déjà déployées en production**. L'écart est refermé.

`82c0508` V2.73 (53 comptes sur 61 ne pouvaient pas s'inscrire) · `01186c7` l'épinglage des
trois classements · `2b09c33` classement par niveau max + `level_at_start` · `6e88bfc` le
palmarès gelé · `352cd4f` l'écran du grimpeur · `8aaafcd` anonymat de l'écran live ·
`db6eb3a`/`b99b9fd`/`99a5ef5` tes retours · `51979a1` V2.74 · `7f2ee5a` V2.74.1.

Un détail de propreté au passage : `51979a1` avait introduit un
`RETOUR-avant-deploiement-cloture (1).md` (un double téléchargement du navigateur) ; `7f2ee5a`
l'avait déjà renommé. Rien à nettoyer, vérifié.

## 2. Topo papier à jour (dernière étape du rituel du 15/10)

Le chantier du 5 novembre n'était décrit **nulle part** dans le topo, alors que c'est
l'ouvreur ou l'admin qui actionnera le bouton de publication le soir même.

| Où | Ce qui a été ajouté |
| --- | --- |
| Page neuve « 06 (suite) » | « Palmarès officiel d'une compétition » : les **cinq** classements gelés, les deux gestes (aperçu → confirmation définitive), pourquoi un gel plutôt qu'un recalcul, le départage et ce qu'il faut annoncer au micro, le nom tronqué et l'absence de date de naissance |
| Table Admin | ligne « Publier le palmarès » ; et le passage en « en cours » **fige le niveau de départ** |
| Table Client | ce que « Mes compétitions » montre et ne montre pas pendant l'épreuve (**aucun classement**), et la section « Palmarès officiels » après |
| Points de vigilance | « Publier le palmarès est définitif » ; « Inscrire les participants avant le coup d'envoi » |

**Deux débordements traités**, et c'est la partie non triviale : un débordement accidentel
**fait disparaître le pied de page** de la page concernée.
- La page « 04 Admin + 05 Options » était pleine à ras bord **avant** cet ajout : une seule
  ligne de table la faisait déborder. Coupée en deux pages explicites, chacune avec son pied.
- La page « 07 Points de vigilance » débordait à son tour : son groupe « Cours & séances » est
  passé sur la page de suite, qui avait la place.

**Vérifié en relisant le PDF rendu, pas en supposant** : 12 pages pour 12 sections, un pied de
page partout.

Corrigé au passage : `.warn b` est en `display:block` (c'est le **titre** de l'encadré), ce
dont héritait une emphase à l'intérieur du paragraphe — elle cassait la ligne avant et après
elle (« Seul le classement / de saison / (nouveau)… »). Une règle `.warn p b` la repasse en
`inline`.

## 3. L'interrupteur « Je publie quand même » est enfin exercé

C'était le chemin non couvert nommé explicitement en fin de séance du 15/10. Le seed figeait
`level_at_start` sur **toutes** les participations, donc `niveauxNonFiges` valait 0 : ni
l'avertissement, ni le bouton inerte, ni l'interrupteur n'étaient jamais atteints.
`e2e-palmares-flow.mjs` passe de **17 à 19 pas**, tous verts.

**Le seed exprime désormais les DEUX absences, de part et d'autre du coup d'envoi** — et c'est
ce qui donne sa valeur au contrôle :
- une grimpeuse inscrite **avant** `started_at`, sans `level_at_start` → défaut réel, **doit**
  être comptée ;
- un participant inscrit **après**, sans `level_at_start` → retardataire **légitime**, ne doit
  **pas** l'être ;
- `competitions.started_at` ajouté, sans lequel l'écran ne peut pas trancher et avertit sans
  distinguer — le seed doit exercer la branche où il **tranche**.

L'attendu est donc **1, pas 2**. Avec un seul cas, « 1 » et « 2 » seraient indiscernables et
une garde comptant naïvement toutes les absences resterait verte. (`level_at_start` valant
`level` partout dans ce seed, son absence ne déplace **aucun** classement : aucun rang attendu
n'a eu à bouger.)

**Trois cassures, une par propriété, chacune vue rouge séparément** — ta règle du 15/10 :
1. le retardataire ramené avant le coup d'envoi → pas 3 **et** pas 7 rouges (le compteur
   passe à 2) ;
2. la condition `!risqueAssume` retirée du bouton → pas 7 rouge (bouton actif) ;
3. `setRisqueAssume(false)` retiré → pas 8 rouge.

### ⚠️ Et la troisième a d'abord produit du VERT. C'est l'enseignement de méthode du jour.

La vérification de la remise à zéro vivait dans le pas de **republication**, qui survient après
un `reload()`. Or **un rechargement remonte le composant et remet l'état à `false` tout seul** :
l'assertion ne pouvait pas rougir. Ce n'est pas le jeu de données qui empêchait le défaut de
s'exprimer — c'est le **décor du pas**.

Elle vit maintenant dans un pas dédié qui **ferme et rouvre l'aperçu sans rechargement**. La
forme générale est ajoutée aux règles de méthode de `CLAUDE.md` : **se demander ce qui, dans
le décor, produirait l'effet attendu à la place du code.**

Deux précisions mineures trouvées en chemin :
- le `Switch` de MUI pose `role="switch"`, qui l'emporte sur le rôle implicite de son
  `<input type="checkbox">` : `getByRole('checkbox')` renvoie **0**. Lu dans le DOM rendu ;
- une exécution interrompue laissait la sauvegarde d'essai de `unpublish-*` sur le disque et
  faisait échouer le pas « la simulation n'écrit rien » **sur un fichier qu'elle n'avait pas
  créé** — un rouge qui ne désigne pas son défaut. Le flux la supprime à son démarrage.

## 4. ⚠️ `CLAUDE.md` découpé : 190 ko → 80 ko

Le fichier avait atteint **≈ 190 000 caractères pour une limite de 150 000**. Il était donc
tronqué en silence — et une troncature coupe le tiers **le plus récent**, c'est-à-dire le plus
utile. Découpage accepté « pour après » le 15/10 ; c'était maintenant.

**Le critère est la NATURE, jamais l'ancienneté :**
- **reste dans `CLAUDE.md`** ce qui s'applique **sans condition** — invariants, ⚠️ courts,
  interdits, procédures (bump de version, déploiement), et les **règles de méthode**, qui sont
  les plus courtes et les plus chères à redécouvrir ;
- **part dans `docs/architecture/`** le **récit** : l'histoire, les incidents, les arbitrages,
  les chiffres de mesure, les variantes rejetées et pourquoi.

Huit documents (180 ko au total) : `blocs.md`, `classement-et-saison.md`, `competitions.md`,
`jeu-et-missions.md`, `etat-ludique.md`, `badges-et-niveaux.md`,
`cache-et-service-worker.md`, `tests-et-fiabilite.md`.

**Le texte n'a pas été réécrit : il a été DÉPLACÉ tel quel**, titres compris, pour qu'un
`git log -S` retrouve encore sa formulation d'origine.

Les **33 sections** d'architecture de `CLAUDE.md` sont toutes conservées, dans le même ordre,
et chacune porte en tête un lien 📖 vers son document. ⚠️ **Ce lien est un DÉCLENCHEUR DE
LECTURE, pas une référence de courtoisie : le résumé suffit pour comprendre, pas pour
toucher.** La règle d'écriture qui évite la rechute est énoncée dans le fichier : une
nouveauté qui ne s'applique pas sans condition enrichit le document d'architecture, pas
`CLAUDE.md`. S'il regrossit, c'est que du récit s'y est réinstallé.

**Ce que cela change pour toi** : quand tu cites « `CLAUDE.md` dit que… », vérifie d'abord si
la phrase est encore là ou si elle a migré. Les ⚠️ les plus structurants y sont restés (74 ⚠️
dans `CLAUDE.md`, 51 dans les documents d'architecture) ; ce qui a migré, ce sont les récits
d'incident et les mesures.

**Vérifications faites** : les 33 titres sont là et dans l'ordre ; les huit liens résolvent et
aucun document n'est orphelin ; aucun lien markdown relatif n'a été cassé (les documents ne
citent leurs sources qu'en code inline) ; les 51 ⚠️ restés dans les documents d'architecture
ont été relus un par un pour vérifier que leur part inconditionnelle figure bien dans
`CLAUDE.md`.

## 5. V2.74.2 — les mini-compétitions de cours (chantier non planifié)

**Origine** : l'utilisateur avait demandé à une monitrice de faire un essai de
mini-compétition pendant son cours, n'avait pas encore son retour, et a voulu savoir **comment
les résultats apparaissent** — pour elle et pour les élèves. J'ai piloté les deux écrans sur
l'émulateur, puis lu la production (lecture seule).

### 5.1 D'abord : en production, il ne pouvait rien y avoir

| | |
|---|---|
| Mini-compétition | 35 blocs, créée le 13/10 par la monitrice |
| Séance | 19h30, 0 exercice, 1 mini-compétition |
| `activatedAt` | **absent → séance encore « à venir »** |
| Participants | **la monitrice seule** — son groupe ne contient qu'elle-même comme élève |
| Résultats de bloc | **0** dans toute la base |

Mécanique, et pas un bug : tant que la séance n'est pas **activée**, le contenu est caché aux
élèves et `firestore.rules` **refuse toute validation** côté serveur. Deux gestes manquent :
mettre les élèves dans le groupe, puis activer la séance le jour même.

(Au passage : seuls 13 comptes sur 63 ont `inscritAuxCours = true`. Ce n'est **pas** le
pendant du défaut de V2.73 — `Register.tsx` écrit `false` **délibérément**, avec un commentaire
sur place : « une inscription aux cours est un acte commercial, pas une autorisation. Ne pas
aligner les deux champs. » Je l'ai vérifié avant de le signaler comme un défaut, et ce n'en
est pas un.)

### 5.2 Les cinq défauts, tous mesurés sur l'écran rendu

**① Le score n'était pas le même des deux côtés.** Même validation, bloc recoté après la
séance : **80 points chez la monitrice, 900 chez l'élève**. Le classement du moniteur lit la
couleur **figée** à la validation (`client_course_results.boulderColor` — le comportement voulu
et documenté depuis l'origine) ; l'écran de l'élève recalculait depuis la couleur **courante**
du bloc. L'élève lit désormais la couleur figée, et la pastille montre celle qui a réellement
rapporté les points. Tant que la séance est **active**, c'est au contraire la couleur du jour
qui s'affiche : c'est celle que le grimpeur a sous les yeux sur le mur.

**② Le rang était un `index + 1`.** Deux élèves au même score recevaient deux positions
différentes, départagées par l'ordre des documents Firestore — le défaut exact que tu avais
fait corriger sur les écrans de compétition le 03/10. **Dans un cours, l'égalité est la règle,
pas un cas limite** : en début de séance tout le monde est à zéro. Rang de compétition
(1, 1, 3), et ordre d'affichage rendu déterministe à score égal — ce second critère ne
départage rien, il stabilise la liste. La clé React était le **nom affiché** : deux homonymes
entraient en collision, c'est l'uid désormais.

**③ La pastille de couleur était illisible** chez le moniteur : le mot français était passé tel
quel à `backgroundColor`, or « bleu », « rouge », « noir », « jaune », « vert », « blanc » ne
sont **pas** des couleurs CSS — le navigateur ignorait la déclaration et MUI retombait sur son
gris clair, **avec du texte blanc dessus** (mesuré : fond `rgba(0,0,0,0.08)`, texte
`rgb(255,255,255)`). Seuls « violet » et « rose » s'affichaient, par coïncidence : ce sont
aussi des noms CSS. Au passage, le choix noir/blanc du texte était **inversé sur fond noir**
dans `ClientCourseSession` : `['noir','blanc'].includes(c) ? 'black'` écrivait **en noir sur
`#000000`**.

**④ La colonne « Exercice » était vide** pour chaque ligne de mini-compétition, chez le
moniteur comme dans « Mes statistiques » de l'élève : ces résultats n'ont pas d'`exerciseId`.

**⑤ Le classement n'apparaissait pas du tout** si la mini-compétition avait été créée par
quelqu'un d'autre. `StatsList.tsx` ne listait que celles dont le moniteur est l'**auteur**
(`createdBy`), alors que l'écran qui les rattache à une séance les liste **toutes**, sans
filtre : faire jouer celle d'un collègue dans sa propre séance faisait disparaître le bloc
entier — **sans message, sans section vide : rien**. Trouvé en construisant le jeu d'essai, et
c'est le seul que la monitrice avait évité, puisque c'est elle qui l'a créée.

### 5.3 Deux modules purs, et pourquoi

La couverture s'arrête au bord des `.tsx` — ces deux calculs y étaient **structurellement
invisibles**, et c'est ce qui les a laissés passer. C'est ta règle du 03/10 appliquée à un
écran qui n'est pas une compétition.

- **`utils/miniCompetitionRanking.ts`** — classement + liste proposée. 13 tests, dont
  « 1, 1, 3 », « trois ex æquo puis un quatrième : 1, 1, 4 », « tout le monde à zéro », et
  l'ordre déterministe quel que soit l'ordre d'entrée.
- **`utils/boulderColorDisplay.ts`** — teinte (depuis `colorGrades`) + couleur de texte.
  10 tests, dont **la propriété qui survivra à un changement de palette** : contraste **≥ 3:1
  sur chaque entrée de `colorGrades`**, vérifié avec la formule WCAG **réimplémentée dans le
  test** plutôt qu'importée du module — sinon le test ne vérifierait que sa propre cohérence.
  Épingler huit valeurs attendues ne vérifierait, lui, que la palette d'aujourd'hui.

### 5.4 Le filet, et les cassures

`e2e-course-minicompetition-flow.mjs` : **10 pas → 16**. Le jeu d'essai a reçu un **second
élève**, sans quoi « deux ex æquo partagent le rang 1 » serait vrai **et vide** sur une seule
ligne ; et la mini-compétition **garde délibérément son absence de `createdBy`**, qui est le
cas du collègue — un commentaire sur place interdit de « compléter » le document.

Quatre cassures, **une par propriété, chacune vue rouge séparément** :

| Cassure | Pas rouge |
| --- | --- |
| filtre `createdBy` seul | 13 (le bloc Classement n'apparaît plus) |
| rang `index + 1` | 14 (`rangs attendus 1,1 — vus 1,2`) |
| l'élève relit la couleur courante | 15 (`vu : … rose … 900 pts`) |
| cellule « Exercice » vide | 16 (`vu : ["",""]`) |

### 5.5 ⚠️ Une erreur de méthode de ma part, à ne pas reproduire

**`emulator-reset.mjs` n'EXPORTE qu'une fonction : `node test/emulator-reset.mjs` ne fait
RIEN.** Trois exécutions se sont empilées en silence — un classement attendu à 80 points en a
affiché **2780**, et une cassure a semblé faire rougir un pas qu'elle ne touchait pas, ce qui
m'a fait chercher une explication dans le code pendant un moment. **J'ai refait toute la série
sur base propre.** Le seed appelle maintenant `resetEmulators()` lui-même, comme celui du
palmarès : son pas sur le classement affirme un état **global** (« une seule mini-compétition
en base »), ce qui l'exigeait déjà d'après la convention du dépôt.

C'est, encore une fois, la famille « tout avait l'air d'aller » : la commande ne renvoyait
aucune erreur, et les chiffres faux étaient du bon ordre de grandeur.

---

## Ce qui n'a PAS été vérifié, dit plainement

- **Aucun écran n'a été ouvert sur un vrai appareil.** L'arriéré court depuis V2.70.1 — tous
  les écrans du 5 novembre, et maintenant ceux des mini-compétitions.
- **Le §4.4 reste à faire à la main** (ouvrir la page des compétitions avant une publication,
  publier, recharger) : la persistance Firestore est désactivée de force sous
  `VITE_USE_EMULATOR`, donc aucun e2e ne peut l'exercer.
- **La lisibilité de la pastille n'est vérifiée que par le test unitaire de contraste**, pas
  par un e2e : c'est le bon niveau une fois le calcul devenu pur, mais ce n'est pas un œil
  humain sur un écran.
- **Le PDF a été relu page par page, pas imprimé.**
- **V2.74.2 n'est pas déployée.** `dist/` a bien été reconstruit **après** le bump (vérifié :
  `2.74.2` est dans le bundle), donc un `--only hosting` partirait juste — mais il n'a pas
  été fait.

## Points ouverts par ailleurs

1. **L'annonce orale dans la salle le 5 au matin** — trois points, texte prêt dans
   `RETOUR-avant-deploiement-reponses.md`. Le changelog ne la remplace pas : le point sur le
   niveau max est celui qu'il porte le moins bien.
2. **Contexte unique des rôles**, avec le chantier « droits d'accès, rôle ouvreur trop large ».
   ⚠️ Jamais justifié par l'économie de lectures.
3. **`inscritAuxCompetitions` lui-même** : à supprimer ou à assumer en opt-out — après le
   5 novembre.
4. Le chemin d'**échec** du réarmement de minuteur dans `useDebouncedFlushQueue`.
5. `challenges.progress` : compteur incrémental sans filet **et** à échec silencieux.
6. `assertNoOrphanLabels` n'est branché que sur 3 e2e ; `assertNoFullLastName` sur 1.
7. Défis `fenetre` / `bloc_designe` : toujours sans e2e navigateur.
8. Finale non annoncée ; sauvegarde durable des images Cloudinary.
9. **Nouveau, et mineur** : `utils/boulderColorDisplay.ts` est le module vers lequel faire
   converger les tables `levelColors` dispersées. État exact, vérifié plutôt que supposé :
   `AdminUsers`, `ClientScreen` et `ClientDaily` les **dérivent déjà de `colorGrades`** (donc
   pas de teinte en double) ; seuls `AdminCompetitionRegistration` et `ClientClassement`
   recopient les huit hexadécimaux à la main. Aucun n'est illisible — ils partent tous
   d'hexadécimaux valides, contrairement à `StatsList`. Convergence non faite aujourd'hui,
   hors du périmètre demandé.
