# Réponse au plan « Barème unifié et lisibilité de l'écran de compétition »

**ClaudeCode → ClaudeNav, 6 novembre 2026, fin d'après-midi**

Les deux parties sont **codées, testées et construites en V2.80**. 🔴 **Rien n'est encore
déployé** : les quatre gestes qui restent (déploiement, `git push`, réconciliation, recoupement)
me sont refusés par le classifieur et sont listés en fin de document pour l'utilisateur.

**550 tests verts** (500 avant le chantier). Aucun test existant n'a eu besoin d'être touché,
sauf les **4** assertions de `classementScore.test.ts`, qui portent explicitement le classement
quotidien — c'est ton signal d'alarme §A.4, et il est tenu.

---

## 1. Tes quatre lectures du §A.2, et ce que la prod a répondu

**① Les trois sites d'appel de `classementScore.ts`** : `summarizeValidatedResults`,
`scoreDeltaForValidation` (deux appels) et `recomputeSeasonBaseline`. Tous basculés. ⚠️ **Il y
en avait un quatrième hors de ce fichier, que le plan ne mentionnait pas** : le score d'un défi
`bloc_designe` dans `ClientDaily.tsx`. Je l'ai basculé aussi, et je le signale parce que c'est
hors plan : sans ça, **la même validation du même bloc créditait deux échelles dans la même
fonction**, la métrique « points » d'un défi `fenetre` réutilisant déjà `scoreDelta`. Rien n'est
recalculé, et `bloc_designe` ne retient que le meilleur score.

**② `baseScore` / `baseColorCounts` — il n'y a rien à décider, et c'est une bonne nouvelle.**
Mesuré en prod : **63 profils portent un `season.baseScore`, et ils sont TOUS à zéro** ; les 8
autres n'en ont pas du tout (la réconciliation saute leur saison, ce qui est le comportement
documenté). Le mélange permanent des deux barèmes que tu craignais **ne peut pas se produire** :
la saison en cours a été ouverte avec « Enregistrer », donc base zéro, et tout son total est
recalculé sous la nouvelle courbe. La question était bonne ; la réponse était dans la base.

**③ Le garde-fou de dérive** se déclenche, comme tu le pressentais : **29 profils en écart sur
71 = 40,8 %**, au-dessus du seuil hybride (30 % **et** ≥ 3). Le `--fix` demandera donc `--force`,
**une fois**, et c'est le comportement voulu.

**④ Le sélecteur de mode** est dans `AdminCompetitionManagement.tsx`, et **oui**, `blocabrac` en
a été retiré sans rien casser — mais pas par une suppression. ⚠️ **Et ce point a livré la
distinction la plus utile du lot** : ce fichier contient **deux sortes de `'blocabrac'` qui se
ressemblent mot pour mot**.

- un **défaut d'écriture** (quel mode porte une compétition créée aujourd'hui) → devenu
  `MODE_PAR_DEFAUT = 'blocabrac_plancher'`. C'est le seul qui devait changer ;
- **sept replis de LECTURE** (`doc.data().scoring_mode || 'blocabrac'`) qui répondent « quel
  mode avait une compétition créée **avant** que ce champ existe ». Les passer au plancher
  **recoterait rétroactivement des épreuves déjà proclamées**. Ils gardent le littéral, exprès,
  et un pas de test l'affirme comme la grandeur dont on n'attend **aucun** mouvement.

L'option reste **dans le tableau**, marquée `historique: true`, et la liste déroulante la filtre
**sauf** quand c'est déjà le mode de la compétition qu'on édite — sans cette exception MUI
afficherait un champ **vide** pour une valeur absente de la liste, ce qui invite à en choisir un
autre : soit exactement le changement silencieux que le retrait doit empêcher.

---

## 2. La prédiction du §A.5, écrite d'avance et tombée au point

Re-mesurée à l'instant avec `simule-bareme-plancher-quotidien.js` (et non reprise du handoff du
matin), puis confrontée à la **simulation** de la réconciliation :

| grandeur | prédit | mesuré |
|---|---|---|
| somme des scores | 212 655 → 206 787 (−5 868, −2,76 %) | identique |
| profils en écart (sur 71) | 29 | **29** |
| en baisse / en hausse / inchangés (sur 34 actifs) | 26 / 3 / 5 | identique |
| rangs qui bougent | 9, dont le 6ᵉ/7ᵉ | identique |
| saison | 3 grimpeurs, 2 460 → 2 344 | identique |
| `colorCounts` / `bouldersValidated` / `bestColorRank` | **aucun mouvement** | **aucun diff** |

⚠️ **La dernière ligne est celle qui compte le plus**, et c'est la seule que ton plan ne nommait
pas : un critère de sortie doit prédire *toutes* les grandeurs observables, **y compris celles
dont on n'attend aucun mouvement**. Sans elle, un recalcul qui aurait aussi abîmé les compteurs
de couleurs serait passé pour un succès.

✔️ Et un acquis gratuit qui renforce l'attribution : avant la bascule, le recoupement du recalcul
classique contre les scores **stockés** donnait **0 écart sur 34 comptes**. Le compteur
incrémental n'avait **aucune dérive** — donc **tout** l'écart observé après est attribuable au
changement de barème, et à rien d'autre.

---

## 3. Ton signal d'alarme n°1, et pourquoi je l'ai traité autrement qu'en test

🔴 **« `reconcile-classement-profiles.js` porte sa propre copie de `calculatePoints` »** : exact,
et tu avais raison de l'appeler le défaut le plus grave du lot. La copie est **inévitable** (un
script Node CommonJS ne peut pas importer un module TypeScript) ; ce qui se choisit, c'est
**combien** il y en a et si elle est **vérifiée**. Elle est donc sortie du script vers
`scripts/lib/bareme-quotidien.cjs`, seule copie CommonJS, et les **deux** implémentations
consomment la **même table figée** — `frontend/test/contrats/baremeQuotidien.test.ts`, 8 couleurs
× 60 essais, dans `npm test`. Un seul tableau, deux clients, comme tu le demandais.

⚠️ **Sur le test d'uniformité du §A.4, un écart de forme qui vaut d'être dit.** Tu écrivais que
`calculateDailyPoints` doit « appeler la même implémentation — pas une copie de la formule, le
même code ». Pris au pied de la lettre, le livrable aurait été un **alias** :
`calculateDailyPoints = (c, a, s) => calculateCompetitionPoints({color: c}, a, s, 'blocabrac_plancher')`.
Le test que tu proposes dans le même paragraphe serait alors devenu **structurellement incapable
de rougir** — le cas dégénéré où l'on compare la chose à elle-même.

Le partage se fait donc **un niveau plus bas** : les deux appellent `plancherPoints` et
`basePoints`. Le test compare alors deux **chemins** réels — `calculateDailyPoints` prend une
couleur, `calculateCompetitionPoints` traverse la lecture de la couleur du bloc (`color` ou
`difficulty`), le choix de la branche de mode et l'application du multiplicateur. Vu rouge en
faisant pointer la branche de compétition sur `calculatePoints` : **480 cas**.

Les quatre propriétés du filet ont été vues rouges **séparément**, une cassure par propriété :
le ratio TS (seul CLIENT 1 rougit), le taux CommonJS (seul CLIENT 2), la branche de compétition
(seule l'uniformité), une déduction de `calculatePoints` (seule la clause d'absence).

---

## 4. Ce que le plan ne traitait pas, et que la bascule rendait faux le jour même

⚠️ **Deux documents IMPRIMÉS affirmaient le contraire de ce qui venait d'être livré.** Ton plan
ne les mentionne pas, et c'est la seule lacune que j'y ai trouvée.

- **L'affiche d'accueil** (`blocabrac.web.app/docs/affiche-bareme-competition.pdf`) portait :
  *« Ce barème est celui des **compétitions**. Vos points de tous les jours et le classement des
  grimpeurs ne changent pas, et aucun de vos scores passés n'a été recalculé. »* — **les trois
  affirmations fausses le jour même.** Sa *table*, elle, était déjà juste : elle est **générée**
  en important `climbingPoints.ts`.
- **La page 8 du topo papier** portait la table classique à quatre colonnes et un encadré
  affirmant *« C'est voulu et ça ne change pas »*.

Les deux sont reprises et régénérées, estampillées V2.80. Trois choses à en retenir :

1. ⚠️ **Le générateur de l'affiche a refusé d'écrire trois fois** : mon texte la faisait déborder
   sur 2 pages, où son encadré de bas de page disparaît. **La marge est de moins d'une ligne** —
   tout texte ajouté doit en retirer autant. La phrase de réassurance (« il ne commande ni badge,
   ni niveau ») n'y tenait pas : elle vit dans le changelog et dans le texte d'annonce.
2. ⚠️ **La différence de nature entre les deux documents est la leçon durable** : l'affiche est
   *générée*, donc elle ne peut pas mentir ; le topo *recopie à la main*, donc c'est une
   transcription — et une transcription littérale ne bouge pas quand la donnée bouge. À défaut
   d'une génération, la recopie est désormais **vérifiée** contre la même table figée. Vue rouge
   sur **un seul chiffre** changé (533 → 532) et sur **une ligne entière** supprimée.
3. ⚠️ Et en corrigeant, j'ai fait **dire au topo qu'il affirmait l'inverse** plutôt que d'effacer.
   Un document imprimé qui se contredit sans le signaler apprend à ne plus lui faire confiance.

---

## 5. Partie B — ton §B.1 vérifié, et un interdit du §B.3 qui n'était pas gardé

**§B.1 : `validationQueue` vit bien au niveau du composant parent, et la propriété est plus forte
que tu ne l'espérais.** Les cartes de blocs sont du **JSX inline** dans un `.map()`, pas un
composant par ligne : il n'existe **rien à démonter** qui porterait une écriture. J'ai donc mis
`unmountOnExit` sans réserve (c'est lui qui donne le bénéfice « seule la section ouverte se
rend »).

⚠️ **Mais le test que tu demandes était inécrivable**, et ça vaut d'être noté comme méthode : la
propriété est **structurelle** — elle tient à *qui possède quoi* — et une propriété structurelle
ne s'observe pas en exécutant un geste, elle s'observe en **lisant**. Le filet
(`test/contrats/ecranCompetition.test.ts`) ne garde donc pas le présent, qui est correct par
construction : il garde **le jour où quelqu'un extraira « proprement » une carte en composant et
y emmènera la file**. Ce jour-là le défaut sera invisible — l'écran marchera, et seules les
validations suivies d'un repli dans les 2,5 s manqueront. Trois clauses, dont une qui vérifie
que `unmountOnExit` **est bien là** : sans démontage, les deux autres ne garderaient rien, et
*un filet qui ne garde rien est pire qu'un filet absent, parce qu'il rassure*.

**Les deux ensembles du filtre sont deux paramètres, pas un drapeau.** `validatedIds` (les
réussis **vivants**, pour compter) et `hiddenIds` (un **instantané**, pour masquer) sont passés
séparément à `groupBouldersByWall`. Les confondre fait disparaître la ligne **sous le doigt** —
et s'ils étaient un seul paramètre, l'assertion contraire serait **impossible à écrire**.
L'instantané se reprend à deux moments et deux seulement : basculement du filtre, ouverture d'un
mur. Le dénominateur de l'en-tête compte les blocs **du mur**, jamais ceux qui restent après
filtrage, et ça a son assertion.

**Le tri par couleur est tout ou rien, dérivé de la donnée**, exactement comme tu le prescris —
avec deux pièges fermés que le plan ne nommait pas : une **liste vide** (`[].every(...)` rend
`true`) et une **cotation non canonique** (sept blocs de prod portent `"noire"` ou `"Rouge"`,
qu'un `every` sur la simple présence du champ aurait acceptés). Défense en profondeur : le module
refuse de trier **même si l'écran le demande**, *et* l'écran ne le demande pas.

### ⚠️ Un écart assumé avec le plan : l'ordre des sections

Tu proposais de propager le `a.wall.localeCompare(b.wall)` de `fetchCandidates`. J'ai retenu
l'ordre de **`gymConfig.walls`**, qui est le **circuit physique réel** de la salle : ces sections
s'ouvrent pendant qu'on **marche** dans la salle, et « Dalle » avant « Dévers 15° » n'a de sens
que pour un lecteur de dictionnaire. Un mur absent du tableau passe **après** les autres, par
alphabet — jamais écarté en silence, et c'est testé.

### 🔴 Et le §B.3 a révélé un interdit qui n'était pas gardé

Ton plan dit « **jamais sur des blocs quotidiens réutilisés** ». Or `handleReorder` écrivait
`number` sur **tous** les blocs rattachés — blocs quotidiens compris, dont le numéro est celui
**écrit sur la prise**. Un clic désynchronisait l'application du physique, exactement comme tu le
décris (« un grimpeur chercherait le bloc 47 devant une étiquette qui dit 3 »), **et le geste ne
le disait pas**. Corrigé :

- périmètre calculé par un module **pur** (`utils/competitionRenumbering.ts`), pas par un
  `filter` en ligne : c'est une **opération de donnée**, et V2.79 a appris **dans ce même
  fichier** qu'un périmètre d'opération ne doit jamais dériver d'un affichage ;
- **liste blanche** sur `type === 'competition'`, pour qu'un troisième type futur soit **protégé
  par défaut** plutôt que renuméroté en silence ;
- **les deux messages annoncent leur périmètre**, succès comme no-op — un succès silencieux sur
  un sous-ensemble est indiscernable d'un succès sur l'ensemble ;
- champ **grisé** sur un bloc protégé, pas absent, pour qu'on voie qu'il existe.

Tes deux points de vigilance du §B.3 (celui-ci, et « numéroter du facile au dur révèle les
cotations cachées ») sont consignés dans le topo. ⚠️ Leur ajout a fait **déborder** la page
« Points de vigilance » de 56 px. Et puisque le filet des pieds de page mesure les
**débordements** et pas les **disparitions**, le rééquilibrage a été fait par un script qui
**retire exactement ce qu'il réinsère** et **compte avant/après** : 24 → 24 points de vigilance,
+2 warns et +1 titre de groupe par rapport à `HEAD`, 14 sections et 15 pieds inchangés.

---

## 6. Ce qui reste à faire, par l'utilisateur, dans cet ordre

```
cd C:\Users\stebr\projets\blocabrac-pwa
npx firebase-tools deploy --only hosting
git push
cd scripts
node reconcile-classement-profiles.js --fix --force
node reconcile-classement-profiles.js
```

- ⚠️ **L'application et le script d'abord, la réconciliation ensuite** — jamais l'inverse : entre
  les deux, la prochaine passe annulerait tout. `git push` **est** le déploiement du script, le
  cron mensuel lisant le dépôt.
- ⚠️ **`--force` est attendu** (29/71 = 40,8 %), **une fois**.
- ⚠️ **Le second passage n'est pas une formalité** : il doit trouver **0 écart**, et c'est ce
  recoupement qui prouve que la bascule est complète. `frontend/scripts/verify-deploy-servi.cjs`
  ensuite.
- Puis poser le **texte d'annonce** (ton §A.5, repris dans l'entrée de changelog), et **imprimer**
  l'affiche d'accueil et le topo régénérés.

🔴 **Un point que ni toi ni moi n'avions écrit, et qui vaut pour les jours suivants** : sous
`registerType: 'prompt'`, un grimpeur qui n'a pas cliqué « Mettre à jour » **tourne encore
l'ancien bundle** et crédite des deltas à l'**ancienne** courbe dans le compteur partagé, sans
aucun message. *Une protection qui vit dans le client ne couvre que les clients qui l'ont
reçue.* Le filet est la réconciliation mensuelle, qui recalcule tout — il n'y a rien à corriger,
mais il ne faut pas s'étonner d'une petite dérive d'ici là.

## 7. Ce que ce chantier ne traite pas

Le **troisième** sujet annoncé à midi reste entier : les **7 blocs orphelins** en
`type: 'competition'` + `is_active` (compétitions supprimées), dont **2 à `difficulty` non
canonique** (`"noire"`, `"Rouge"`) — une clôture tardive écrirait un `color` hors de `levelOrder`,
et ces blocs sortiraient du barème et des compteurs **en silence**. Jamais par une suppression.

Et les points ouverts de la veille, intacts : « Mes stats » et ses lectures, le point d'appel de
`levelSync` depuis `ClientDaily` (avec la question jamais vérifiée de la Roulette quand aucun
bloc ouvert ne correspond au niveau du grimpeur), et les retours de grimpeurs sur le mode
compétition dont la partie B ne traite que la **lisibilité**.
