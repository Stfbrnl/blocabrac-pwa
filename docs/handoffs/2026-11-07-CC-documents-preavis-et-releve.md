# Retour à ClaudeNav — V2.81 : documents, préavis, et le relevé du moniteur

**7 novembre 2026.** Plan appliqué : `docs/plans/2026-11-07-CN-plan-documents-preavis-et-suivi-moniteur.md`.
**En prod :** V2.81, étiquette `deploy/v2.81` sur `05ca0a3`, **vérifiée servie** (service worker
actif). Déploiement `--only hosting` : ni les règles ni les index n'ont été touchés.
**630 tests verts** (553 hier).

> 🔴 **V2.81.1 SUIT, et elle corrige un défaut de V2.81 livré ce matin** — trouvé en mesurant la
> production pour répondre à une tout autre question. Voir §⑥ en fin de document : c'est le
> passage le plus utile de cette séance.

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

---

# ⑥ 🔴 LE VOYANT D'ACTIVITÉ NE VOYAIT RIEN (V2.81.1, corrigé le même jour)

Trouvé **par accident**, en mesurant la production pour répondre à la question de Stéphane sur
la rétroactivité du relevé : la sortie du script imprimait `date : [object Object]` pour une
séance.

## Le défaut

`courses.date` **est un `Timestamp` Firestore en production** — les 3 documents le sont, sans
exception. Mon voyant interrogeait `where('date', '==', '2026-11-07')`, une **égalité de
chaîne**. Elle ne peut, par construction, rien trouver : Firestore ordonne par type, une chaîne
et un `Timestamp` ne se comparent pas. Le voyant affichait donc « aucune activité détectée »
**quoi qu'il arrive**.

> ⚠️ **ET C'EST LA PIRE FORME D'ERREUR POSSIBLE POUR CET INSTRUMENT : il se trompait dans le
> sens RASSURANT.** Un voyant dont le rôle est de dire quand on peut déployer les règles, et qui
> répond « calme » pendant qu'une séance tourne, est **pire que pas de voyant** — on n'y gagne
> pas une approximation, on y perd la prudence qu'on avait sans lui.

## 🔴 La cause n'était pas une inattention, c'était une méthode fausse

J'ai lu le **type** `SessionLike.date: string` — et `CLAUDE.md`, qui l'énonçait comme la forme
du champ — **au lieu de mesurer la base**. Or la chaîne est une forme **dérivée** : chaque écran
la produit avant l'appel (`CoursesList.tsx`'s `convertFirestoreDate` + `toDateStr`,
`CourseDetail.tsx`, `ClientCourseSession.tsx`).

> ⚠️ **Un type d'interface dit ce qu'une fonction CONSOMME, jamais ce qu'une collection STOCKE.**
> Devant un champ de date, **mesurer la production**. `CLAUDE.md` portait l'affirmation fausse
> et est corrigé.

Et le détail qui aggrave : `getSessionStatus` fait `date.split('-')`. Lui passer un
`Timestamp` **lève**, donc plante le tableau de bord d'administration entier. Le filtre par
date me protégeait de ce plantage **par accident** — en ne lui passant jamais rien.

## 🔴 Et le filet du module était ENTIÈREMENT VERT

Onze propriétés exercées séparément la veille, toutes rouges au bon moment… sur un jeu de
données **qui n'utilisait que des dates en chaîne**, c'est-à-dire une forme **qui n'existe pas
en production**.

> C'est la question de méthode du dépôt, appliquée à la lettre : *quels défauts ce jeu de données
> est-il physiquement incapable d'exprimer ?* **Celui-là. Et il était déjà là pendant que je
> vérifiais les onze autres.** Ajout à la liste des trois endroits (*l'entrée, le décor,
> l'assertion*) : **l'entrée peut être du bon TYPE TypeScript et de la mauvaise FORME STOCKÉE.**
> Le compilateur ne voit pas la différence, et le test non plus.

## Le correctif, et l'arbitrage qu'il renverse

`normaliserDateSeance` (pur, testé sur les formes **réellement** présentes en prod : `Timestamp`,
`{seconds}`, `Date`, chaîne courte, chaîne ISO) ramène la date au format consommé, et rend
`null` plutôt que de lever. La conversion **suit celle des autres écrans**
(`toISOString().slice(0,10)`, donc le jour **UTC**) : une seconde convention de date serait une
divergence, visible un soir sur deux écrans côte à côte.

> ⚠️ **Et le filtre par date est RETIRÉ, contre l'argument de coût de mon propre commentaire
> d'origine.** Une requête par intervalle de `Timestamp` serait bornée, mais elle **exclurait
> silencieusement** toute séance stockée sous une autre forme. **Devant un instrument dont
> l'erreur est rassurante, la robustesse de FORME passe avant la borne de coût.** 3 documents en
> prod ; la borne se décidera quand il y en aura des centaines, avec une forme de champ enfin
> unifiée.

Les séances à la date illisible sont **comptées et annoncées**, jamais écartées en silence — une
séance qu'on ne sait pas dater est précisément celle qui pourrait être active sans qu'on le
voie. Et la portée annonce désormais son **dénominateur** (« mesuré sur N séances examinées ») :
la première version annonçait « les séances du jour » alors qu'elle n'en voyait aucune — **une
portée qui décrivait l'intention et non la mesure.**

---

# ⑦ LA RÉTROACTIVITÉ DU RELEVÉ : oui par construction, mais il n'y a rien à montrer

Question de Stéphane : *sa collègue monitrice peut-elle voir le relevé sur sa mini-compétition
d'hier ?* La réponse est mesurée, pas déduite (`scripts/mesure-releve-mini-competitions.js`,
lecture seule).

| mesure, 07/11/2026 | valeur |
|---|---|
| `client_course_results` | **3 documents au total**, le plus récent du **20 juin 2026** |
| …dont portant un `miniCompetitionId` | **0** |
| `mini_competitions` | 1 — « Adulte Toussaint », 35 blocs, créée par Alice Morel |
| `courses` | 3 séances, dont 1 rattache cette mini-compétition |
| séances jamais activées | **3 sur 3** (`activatedAt` absent partout) |
| validations du 06/11 | **7**, par **un seul grimpeur**, 20:13–20:18 locale, toutes dans `client_boulder_results` |

**Donc :** le relevé est rétroactif **par nature** — il lit un historique et ne stocke rien de
neuf, si bien qu'il montrera toujours tout ce qui existe. Mais **rien n'existe** : aucune séance
n'a jamais été activée, et aucun résultat ne porte de `miniCompetitionId`. Ce qui s'est passé
hier soir est passé par les **blocs du jour**, pas par une séance.

Pour sa collègue précisément : elle **a** accès au relevé (elle a créé la mini-compétition, donc
le sélecteur la propose ; elle est admin, donc elle lit toutes les séances) — il affichera un
tableau de **1 ligne × 35 colonnes, entièrement vide**. Le jour où elle crée une séance,
l'**active**, y rattache la mini-compétition et laisse ses élèves valider depuis l'écran de
séance, le relevé se remplit — et restera consultable pour toujours.

> 🔴 **CE PARAGRAPHE PORTAIT UNE OBSERVATION FAUSSE. ELLE EST RETIRÉE — voir §⑨.** J'avais
> écrit : « le 06/11, un seul grimpeur a laissé une trace, ce qui est cohérent avec le rapport
> *les validations des jeunes sautaient* ». C'était faux, et pour une raison instructive :
> **j'avais cherché dans la mauvaise collection.** La séance de la monitrice a écrit dans
> `competition_results`, pas dans `client_boulder_results` — **264 documents, 11 participants
> sur 11, et 75 % des écritures APRÈS le déploiement.** Rien n'a été perdu.

---

# ⑧ LA SONDE SUR LE JOUR QUI MANQUAIT : le 6 novembre a coûté 44 219 lectures

Mesuré ce jour sur une **journée close** (`SONDE_JOURS=6`, cf. la règle d'usage de la sonde).

| jour (UTC) | lectures | écritures | suppressions |
|---|---|---|---|
| 01/11 | 3 587 | 4 | — |
| 02/11 | 268 | 2 | — |
| 03/11 | 1 501 | 88 | 1 |
| 04/11 | 238 | — | — |
| **05/11 — le contest** | **3 731** | 696 | — |
| **06/11 — la bascule du barème** | **44 219** | 802 | 6 |
| 07/11 (encore ouverte, non interprétable) | 350 | 18 | — |

## L'attribution, parce qu'un nombre nu n'est pas interprétable

La base **entière** compte **2 048 documents** (mesuré : `users` 82, `boulders` 230,
`client_boulder_results` 1 052, `competition_results` 450, `classement_profiles` 82, le reste
marginal).

> 🔴 **Le contest du 5 novembre — l'usage réel le plus lourd jamais mesuré — a coûté 3 731
> lectures. Les 44 219 du 6 ne peuvent donc PAS être des grimpeurs.** 44 219 ÷ 2 048 ≈ **20 à 30
> balayages complets de la base**, ce qui correspond exactement à un après-midi de cycles
> simulation / `--fix` / vérification / audit / mesure pour la bascule du barème. ⚠️ **Le poste
> de coût de ce projet, ce sont les SCRIPTS, pas les grimpeurs.**

Et le chiffre qui rend ça opérationnel : la franchise Firestore est de **50 000 lectures par
jour**. Le 6 novembre en a consommé **88 %** — sans dépassement, mais c'est la marge réelle d'une
journée de maintenance intensive. **Un cycle de plus et on payait.**

## ⚠️ Ce que je ne sais PAS expliquer, et que je signale au lieu d'inventer

**802 écritures** le 06/11, pour **7 validations** de blocs. Les écritures de scripts
documentées sont **36** : 29 profils par la réconciliation (compté dans son propre journal,
`cleanup-state/classement-profiles-reconcile-log.json`, tous horodatés 17:59) et 7 blocs par
`retirer-blocs-competition-orphelins.js`. **Les ~766 restantes ne sont pas attribuées.** À
titre de comparaison, la soirée du contest en a coûté 696 — donc l'ordre de grandeur du 6
ressemble à une soirée d'usage, ce qui ne colle pas avec 7 validations. Je n'ai pas d'hypothèse
que je puisse défendre, et conformément à la règle du dépôt (*une valeur surprenante doit être
EXPLIQUÉE avant d'être publiée*), je la publie **comme non expliquée** plutôt que de l'habiller.
L'instrument manquant : un balayage des horodatages `createdAt`/`updatedAt` par collection sur
cette journée.

---

# ⑨ 🔴 CE QUI S'EST RÉELLEMENT PASSÉ LE 6 NOVEMBRE — et ce que j'avais conclu à tort

Stéphane a proposé l'hypothèse qui a tout débloqué : *« peut-être a-t-elle créé une compétition
et non une mini ? »* **Elle est exacte**, et la mesure qu'elle a déclenchée corrige deux
affirmations de ce document.

## La donnée

| | |
|---|---|
| compétition | **« Contest cours »** (`Ua1eJIlPxEIv8oHEOHTH`), status `terminée`, datée du 06/11 |
| `scoring_mode` | **`blocabrac`** — l'ANCIEN barème (voir la mise en garde plus bas) |
| inscrits | **11** |
| inscrits ayant validé | **11 sur 11** — aucun absent |
| `competition_results` | **264 documents**, 227 blocs réussis |
| fenêtre | **18:31 → 19:37 heure locale** |
| verrou | `submitted: false` partout — personne n'a soumis (facultatif) |

Le nom du document le disait : « Contest **cours** ». Et « le nombre de blocs grimpés par un de
ses élèves » est exactement ce que l'écran de statistiques d'une compétition affiche, par
participant. ⚠️ Les noms et les scores individuels ne sont PAS recopiés ici : ce sont des
mineurs, et un document versionné n'a pas besoin de les porter pour que le dossier technique
soit complet (même doctrine que le palmarès gelé, « tronquer à l'écriture protège la donnée »).
La distribution suffit : de 11 à 39 blocs réussis, médiane 19.

## 🔴 Correction n°1 : « un seul grimpeur » était faux, j'avais cherché dans la mauvaise collection

J'ai mesuré `client_boulder_results` (les blocs du jour) et trouvé 7 saisies par un seul
grimpeur. J'en ai tiré une observation « cohérente avec le rapport ». **Mais sa séance n'écrit
pas là** : une compétition écrit dans `competition_results`, où tout a atterri.

> ⚠️ **La leçon, et elle est plus grave qu'une étourderie** : j'avais énuméré les **quatre**
> chemins par lesquels un écran peut afficher « le nombre de blocs grimpés » — et je n'en avais
> interrogé qu'un, celui que je soupçonnais. **Chercher dans la collection qu'on soupçonne,
> c'est se condamner à confirmer ou à ne rien trouver.** Le second script
> (`scripts/mesure-ce-qu-elle-a-vu.js`) les imprime tous les quatre et laisse la donnée désigner
> le chemin ; c'est lui qui a trouvé en une passe ce que j'avais manqué.
>
> ⚠️ **Et un second défaut d'instrument, du même genre que ceux du §②** : ce script a d'abord
> groupé les 264 résultats sous **un seul** grimpeur « (sans userId) », parce qu'il cherchait
> `userId` / `uid` alors que la collection porte **`user_id`**. **Un script qui ne trouve pas
> son champ ne rend pas une erreur, il rend un CHIFFRE FAUX** — « 1 grimpeur » au lieu de 11, et
> il avait l'air plausible. D'où la règle appliquée ensuite : **imprimer les clés réellement
> présentes avant de les lire**, et affirmer la taille (264 = 264 ✔).

## 🔴 Correction n°2 : les 802 écritures sont ATTRIBUÉES, et c'était sa soirée

Je les avais publiées comme non expliquées. Elles le sont : **11 grimpeurs en compétition**, à
23–43 écritures par grimpeur (chiffre du dépôt, `measure-competition-writes`) plus les
réécritures de nombre d'essais, soit ~550–700 ; plus **29** profils par la réconciliation et
**7** blocs orphelins. **Le compte tombe sur 802.** ✔️ La règle « une valeur surprenante doit
être expliquée avant d'être publiée » a tenu : elle a été publiée *comme non expliquée*, puis
expliquée, plutôt qu'habillée d'une hypothèse.

## ✔️ Et ce que « les validations sautaient » veut dire : l'ÉCRAN, pas la base

La chronologie est sans ambiguïté. L'étiquette `deploy/v2.80` est posée à **18:54 locale** —
**23 minutes après le début de son contest**, et 43 minutes avant sa fin.

| tranche (UTC) | écritures |
|---|---|
| 17:30 · 17:40 · 17:50 | 16 · 23 · 27 |
| **← déploiement de V2.80 à 17:54 UTC** | |
| 18:00 · 18:10 · 18:20 · 18:30 | 45 · 40 · **70** · 43 |

> 🔴 **198 des 264 écritures — 75 % — ont eu lieu APRÈS le déploiement, et la tranche la plus
> chargée de la soirée est postérieure. Il n'y a aucun creux. Rien n'a été perdu.**

Alors qu'a-t-elle vu ? **V2.80 a réorganisé l'écran de validation d'une compétition**, et c'est
la partie B livrée ce soir-là : les blocs sont passés d'une liste unique à des **sections par
mur repliables, une seule dépliée**, avec un filtre « masquer les blocs déjà réussis ». Un
grimpeur qui met à jour en pleine épreuve voit donc ses blocs validés **disparaître de
l'écran** — ils sont dans des sections refermées, ou masqués par le filtre.

> ⚠️ **« Mes validations ont sauté » décrit exactement cela**, et la donnée prouve que ce n'était
> qu'un affichage. **C'est le coût d'un changement d'interface déployé en pleine utilisation, et
> il n'est pas dans la perte de données — il est dans la confiance.** Un grimpeur qui croit
> avoir perdu ses validations revalide, ou appelle la monitrice ; aucun bandeau ne l'a prévenu
> que son écran allait changer de forme.
>
> ✔️ **Et c'est précisément ce que la partie B d'aujourd'hui adresse** : le préavis visible
> partout (avec son mode « Préavis » orange) et le voyant « 1 séance en cours — ne pas
> déployer » existent pour cette minute-là. La conclusion du §① tient toujours — le code seul
> est presque inoffensif *pour les données* — mais elle doit être complétée : **un déploiement
> de code qui change la FORME d'un écran n'est pas inoffensif pour l'utilisateur**, même quand
> pas un octet n'est perdu.

## 🟠 Et deux faits à connaître, sans urgence

1. **La réconciliation `--fix --force` a tourné à 18:59 locale**, cinq minutes après le
   déploiement et **en plein contest** (journal : `fixedAt: 17:59:36Z`). Elle a réécrit 29
   `classement_profiles`. ✔️ **Son contest n'en a pas souffert** : un classement de compétition
   se calcule depuis `competition_results`, que la réconciliation ne touche pas. Mais c'est
   exactement le geste que le §① dit d'éviter, et ça valide le voyant mieux qu'un argument.
2. ⚠️ **« Contest cours » est en `scoring_mode: 'blocabrac'`, l'ancien barème** — créée avant
   que le mode cesse d'être sélectionnable, et le mode est verrouillé dès qu'une compétition
   quitte « à venir ». C'est le comportement voulu (une épreuve passée garde son mode et reste
   lisible juste), mais **ses 11 grimpeurs sont notés sur l'ancienne courbe** alors que le reste
   de l'application est passé à la nouvelle. À savoir si elle compare des nombres entre son
   contest et le quotidien.

---

# ⑩ LA CLÔTURE MANQUÉE DU « CONTEST COURS », ET LA PISTE QU'ELLE OUVRE

Deux questions de Stéphane en fin de séance, et les deux ont trouvé quelque chose.

## Le classement par niveau n'a jamais pu figurer dans l'annonce

`utils/competitionAnnouncement.ts` ne compose que **général (open) / par âge / par genre** —
aucune section niveau, et `AdminCompetitionStats.tsx` n'en affiche pas non plus. Le classement
par niveau max n'existe que dans le **palmarès gelé**, et **elle l'a bien publié** :
`competition_rankings/Ua1eJIlPxEIv8oHEOHTH`, `published_at` 19:39 locale (deux minutes avant
l'annonce), avec `client_level_max` : 4 groupes.

> 🟠 **Donc le classement le plus pédagogique de l'épreuve est publié là où personne ne
> regarde.** Les grimpeurs y ont accès sur l'écran du palmarès ; le bandeau, qu'ils lisent
> vraiment, ne le porte pas. Ce n'est pas un défaut — c'est une décision à prendre.

## 🔴 La compétition n'avait jamais été clôturée côté ouvreur

**92 blocs** gardaient `competition_active: true`, tous `type: 'daily'` (donc tous des blocs
du jour réutilisés), tous avec une couleur publique, aucun `points_value`, aucun multiplicateur.

> 🔴 **ET LA GRAVITÉ DIFFÈRE DU CAS DU 06/11, pour une raison qui n'est pas dans le script.**
> `fix-competition-active-apres-cloture.js` décrit son dommage comme **latent**, parce qu'il
> visait un bloc **désactivé**. Ici les 92 étaient `is_active: true` — **au mur**. Or
> `firestore.rules` refuse `firstAscents` ET `methodCounts`/`methodVotes` sur tout bloc
> `competition_active` : **92 des 230 blocs de la salle, 40 %**, avec deux fonctionnalités
> muettes *en ce moment*, et l'échec d'une première ascension n'étant que **journalisé**.
> ⚠️ **Le même état de donnée n'a donc pas la même gravité selon `is_active` — l'en-tête du
> script le dit pour un bloc au placard, pas pour un bloc au mur.**

✔️ **Et c'est la première fois que le filet de V2.79 servait : il a rougi du premier coup sur
de vraies données**, avec le bon diagnostic et le remède nommé dans son propre message.
Rebasculé par l'utilisateur via « Terminer la compétition » (92 blocs, un seul lot atomique) ;
audit repassé à **0 erreur, 0 avertissement**.

⚠️ Détail de lecture : l'audit annonce « 11 erreur(s) » pour 92 blocs concernés — il plafonne
la liste à 10 et ajoute « et 82 autre(s) ». **Le compte porte sur les lignes, pas sur les blocs.**

## 🔜 La piste demandée pour la prochaine séance

Stéphane : *« activer automatiquement ce clic côté Ouvreur par le passage de la compétition en
mode terminée côté admin, si c'est possible »*. **C'est possible, côté client uniquement** (ce
projet n'a aucune Cloud Function). Les quatre contraintes qui décideront de la forme — dont
🔴 **la migration est IRRÉVERSIBLE alors que le statut ne l'est pas**, et ⚠️ **la logique vit
dans l'écran ouvreur et doit être EXTRAITE avant d'être appelée d'ailleurs, sous peine de
fabriquer un second rédacteur du même geste** — sont consignées en mémoire
(`project_coupler_cloture_admin_et_ouvreur`). ⚠️ Et le couplage **ne remplacera pas l'audit** :
un admin sur un ancien bundle ne l'aura pas reçu.
