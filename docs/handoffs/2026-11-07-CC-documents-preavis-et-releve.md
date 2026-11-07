# Retour à ClaudeNav — V2.81 : documents, préavis, et le relevé du moniteur

**7 novembre 2026.** Plan appliqué : `docs/plans/2026-11-07-CN-plan-documents-preavis-et-suivi-moniteur.md`.
**En prod :** V2.81, étiquette `deploy/v2.81` sur `05ca0a3`, **vérifiée servie** (service worker
actif). Déploiement `--only hosting` : ni les règles ni les index n'ont été touchés.
**619 tests verts** (553 hier).

Les trois parties sont livrées, en quatre commits. Ce document ne répète pas le plan : il dit
**ce que la réalité a démenti**, et ce qui reste.

---

## ① La question du §B.3.3 est tranchée, et elle a redirigé toute la partie B

> *« Y a-t-il eu un déploiement de **règles** hier pendant la séance, ou seulement du code ?
> Si c'était du code seul, alors le `preloadError` est le coupable et c'est **lui** qu'il faut
> traiter, pas le préavis. »*

**`firestore.rules` n'a pas bougé depuis le 03/11**, trois jours avant l'incident. C'était donc
**du code seul**, et la branche conditionnelle du plan s'applique. Ton §B.0 était juste, et c'est
lui qui a évité de construire un préavis contre la mauvaise cause.

Ce que la lecture du garde a révélé, et que le plan ne pouvait pas savoir :

> 🔴 **Le garde `vite:preloadError` était désarmé pour de bon.** Il posait un drapeau
> `sessionStorage` qu'il **ne retirait jamais** : il rechargeait une fois par onglet **et pour
> toute la vie de l'onglet**. Un onglet ayant connu l'incident le matin était **sans défense**
> au déploiement du soir — l'`import()` échouait définitivement, et comme le dépôt n'avait ni
> `ErrorBoundary` ni route `*`, le résultat était un **écran blanc sans aucune sortie**.

Le drapeau existait pour empêcher une boucle de rechargements. Il empêchait aussi le
rétablissement. **La leçon transposable :**

> ⚠️ **Une boucle et un nouvel incident ne diffèrent que par leur RYTHME** (deux secondes contre
> plusieurs heures). Un drapeau booléen **n'a pas la dimension où les deux diffèrent** : il ne
> peut donc pas les séparer, quoi qu'on écrive autour. La garde juste est une **fenêtre de
> temps**.

Et la seconde moitié, qui vient de ta formulation de l'incident :

> ⚠️ **Un rechargement muet est indiscernable d'un plantage.** C'est sous la forme « les
> validations sautaient » que le défaut a été rapporté, jamais sous celle d'un message d'erreur
> — parce qu'il n'y en avait aucun. Le rechargement laisse désormais un mot.

---

## ② DEUX instruments qui ne mesuraient rien, et les deux ont été trouvés en voulant voir rouge

C'est le résultat le plus utile de la séance, et aucun des deux n'était visible à la relecture.

### a) `fetch()` n'est pas une navigation — le contrôle était vert face au défaut qu'il visait

J'ai ajouté à `verify-deploy-servi.cjs` une étape ④ qui vérifie que les documents de `/docs/`
sont bien servis à travers le service worker. Écrite avec `fetch('/docs/…')` depuis la page
contrôlée, elle était verte. Je l'ai exercée en **retirant `navigateFallbackDenylist`**,
c'est-à-dire en recréant exactement le défaut de V2.76.2 : **elle est restée verte.**

La cause est mécanique : `navigateFallback` ne s'applique qu'aux requêtes de **mode
`navigate`**, et un `fetch` depuis un script a le mode `same-origin`. La route de repli du
service worker ne pouvait **jamais** voir passer ma requête.

> ⚠️ C'est ta propre règle, dans une variante neuve : *le bouton que je tourne est-il branché
> sur ce que je regarde ?* Même famille que `curl`, qui ne traverse aucun service worker — mais
> **plus insidieuse**, parce que celle-ci traversait bien le service worker. Elle traversait la
> mauvaise **route** à l'intérieur.

Réécrite en navigation réelle (`page.goto`, `waitUntil: 'commit'`, `acceptDownloads: true` —
un PDF correctement servi fait *avorter* la navigation en téléchargement, ce qui est le **signe
du bon fonctionnement**), elle rougit sur les quatre PDF. **Mais les deux `.html` restaient
verts** : un `index.html` servi à leur place est lui aussi du `text/html`.

> ⚠️ **La moitié du filet ne vérifiait donc rien, et cette moitié-là ne se voyait pas** : le
> verdict global était rouge, ce qui suffit à se croire couvert. C'est l'application littérale
> de « casser le code une fois par PROPRIÉTÉ, pas une fois pour le filet » — ici, une fois par
> **type de fichier**. La grandeur qui sépare le document de la coquille est le **titre rendu**,
> exactement ce que l'humain avait observé le 28/10. Les six rougissent maintenant.

### b) Un test incapable d'échouer à cause de son DÉCOR, pas de son assertion

Mon test « `buildMiniCompetitionReleve` ne mute pas le tableau reçu » restait vert quand je
remplaçais `[...blocs].sort()` par `blocs.sort()`. Cause : il partait d'une copie d'une
constante `BLOCS` **partagée par tout le fichier**. Avec le défaut, le **premier** test du
fichier à passer `BLOCS` directement l'avait déjà trié — si bien qu'ici retrier ne changeait
plus rien.

> ⚠️ Troisième endroit de ta liste (*l'entrée, le décor, l'assertion*), et cette fois le décor
> était **un autre test du même fichier**. À ajouter à la question : *qu'est-ce qui, dans la
> mise en scène, produirait l'effet attendu à la place du code ?* — **un fixture mutable
> partagé entre les cas en fait partie.** Réécrit avec un jeu construit sur place et un ordre
> affirmé explicitement.

---

## ③ Le coût caché de la partie A existait, mais pas là où le §A.1.3 le cherchait

Mesuré **sur le manifeste produit** (`dist/sw.js`), pas sur l'intention :

| | avant | après |
|---|---|---|
| PDF précachés | **0** — `globPatterns` ne liste pas `pdf` | 0 |
| `.html` de `docs/` précachés | **2, soit 225 Ko** | 0 |
| précache total | 150 entrées / 4 653 Kio | **148 / 4 433 Kio** |

Ton avertissement était juste (« c'est le vrai coût caché, et il est invisible à la
relecture ») — mais il visait les PDF, qui étaient déjà hors du précache. Le coût était dans
les `.html`, téléchargés par **chaque grimpeur** pour des documents qu'aucun n'ouvre depuis
l'application.

✔️ **Et l'effet secondaire vaut mieux que les 225 Ko** : `globIgnores: ['**/docs/**']` donne
enfin **le même sort aux deux sortes de fichier du dossier**. `CLAUDE.md` décrivait « deux sorts
opposés pour deux fichiers du même dossier » comme un piège ; le piège est **supprimé**, pas
contourné. Contrepartie assumée : ces documents ne sont plus consultables hors ligne.

---

## ④ Ce que la partie C a trouvé en plus de ce que le §C.1 annonçait

✔️ **Ta bonne nouvelle était juste** : `client_course_results` et `users` sont chargés **sans
aucun filtre** dans `StatsList.tsx` — la grille coûte **zéro lecture de plus**.

🔴 **Mais le §C.1 demandait de vérifier « `userResults` couvre-t-il tous les élèves ? », et la
réponse est non, pour une raison plus radicale que « le chargement est filtré » :**
`userResults` est **construit depuis les résultats**. Un élève qui n'a rien validé **n'existe
pas** dans cette structure — ce n'est pas une donnée manquante, c'est une ligne qui n'a jamais
été créée. Ton §C.3 avait prédit ce cas (« un `map` sur les résultats le ferait disparaître sans
bruit ») ; ce qu'il n'avait pas vu, c'est qu'il n'y avait **aucune** source d'élèves dans
l'écran. D'où la lecture ajoutée.

⚠️ **Et c'est `firestore.rules` qui a décidé de la forme de cette lecture** : un `courses` n'est
lisible que par son `createdBy`, un élève du groupe, ou un admin — le `moniteurId` du groupe
n'ouvre que **l'écriture**. Une requête sur la collection serait refusée **en bloc** (Firestore
refuse une requête qu'il ne peut pas prouver autorisée). On reprend donc exactement la requête
de `CoursesList.tsx`, et le filtre par mini-compétition se fait **côté client** pour ne pas
exiger un index composite — `firestore.indexes.json` a déjà dérivé de la prod.

> **Conséquence visible, et elle est assumée :** si une mini-compétition a été jouée dans la
> séance d'un collègue, le classement s'affiche (il ne dépend que des résultats) mais le relevé
> **ne peut pas** — et l'écran **dit pourquoi**. Un écran muet y ferait croire à un bug.

**Les marges**, que Stéphane m'a demandé de trancher : taux par bloc **avec son dénominateur**
(réussis / tentés, sur N élèves — un « 50 % » nu confond « un seul a essayé et il a échoué »
et « la moitié du groupe a échoué »), **essais moyens des seules réussites**, et blocs réussis
par élève. Pas les points : ils sont déjà dans le classement juste au-dessus. Croisés, les deux
premiers distinguent un bloc **sélectif** d'un bloc **trop dur**.

---

## ⑤ Le garde de mise en page du topo a refusé ma première rédaction

74 px de débordement sur la **section 5 — qui porte Ouvreur ET Moniteur sur la MÊME page**. Le
message nommait son pied de page « 02-03 », ce qui donnait à croire à une section que je
n'avais pas touchée ; vérifié en revenant à la source d'origine, qui passait. La ligne du relevé
a été réduite à l'essentiel.

⚠️ Et j'ai **compté les lignes de tableau avant/après** (40 → 43, +3 attendu), parce que le
filet mesure les **débordements** et jamais les **disparitions** — un document régénéré peut
sortir vert et parfait en ayant perdu un bloc entier (19/10/2026).

---

## 🟠 Ce qui reste, et une chose que je n'ai PAS mesurée

1. 🔴 **Non mesuré, et je ne le présente pas comme acquis : qu'une écriture débouncée en vol
   survive au rechargement.** `flushAll` est bien lié à `pagehide`, mais il lance des écritures
   Firestore **non attendues**, et le commentaire du hook dit lui-même que `pagehide` « n'est
   pas garanti d'aboutir ». `persistentLocalCache` met les mutations en file dans IndexedDB, ce
   qui donne de bonnes raisons de croire qu'elles survivent — **mais c'est une croyance**. Or
   c'est exactement le cœur de « les validations sautaient ». **Un e2e qui recharge pendant la
   fenêtre de débounce et relit la donnée côté serveur serait le bon instrument** ; il n'existe
   pas.
2. **Le `urgent` des annonces n'est contraint par aucune règle** (les écritures
   d'`announcements` ne contraignent aucun champ) : c'est l'interface qui le tient. Cohérent
   avec le reste de cette collection, signalé pour que ce ne soit pas une surprise.
3. Le plan laisse explicitement ouverts : « Mes stats » et ses lectures, le point d'appel de
   `levelSync` depuis `ClientDaily`, la garde devenue fausse de la sonde, et 🔴 **la Roulette
   quand aucun bloc ouvert ne correspond au niveau du grimpeur** — jamais vérifié, et vivant
   depuis le déverrouillage du 6.
4. Deux gestes non techniques d'hier : **poser le texte d'annonce** dans le bandeau (le mode
   « Préavis » existe maintenant si besoin), et **imprimer** les documents — les trois sont
   régénérés et estampillés V2.81.
5. La **route `*` terminale** reste reportée, comme décidé le 28/10. L'`ErrorBoundary` ferme la
   classe de l'écran blanc **de plantage**, pas celle de l'URL inconnue : ⚠️ il n'attrape que
   les exceptions de **rendu React** des composants qu'il enveloppe — ni un gestionnaire
   d'événement, ni une promesse non rattrapée.
