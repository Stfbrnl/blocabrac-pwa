# Processus — Détecter et corriger les erreurs avalées dans les chemins d'écriture

> Rédigé le 19/08/2026 par la session Claude (navigateur), après le bug de transaction
> découvert en V2.46.
> À destination de Claude Code dans le Codespace.
>
> **Le point de départ.** Le bug du 18/08 n'était pas la violation de la règle Firestore
> « toutes les lectures avant toute écriture » — celle-là se corrige en cinq minutes. Le
> vrai défaut est que **l'erreur a été avalée par un `catch` qui remettait les deltas en
> attente**, produisant un réessai perpétuel qui ne pouvait jamais aboutir. Aucun symptôme,
> aucune trace, un compteur mort pendant un jour sans que rien ne le dise.
>
> **Ce document ne traite pas ce bug** (déjà corrigé) mais **la classe de bugs** qu'il
> représente : une erreur permanente déguisée en réessai temporaire.
>
> Quatre étapes. Les §1 et §2 sont mécaniques et se font aujourd'hui. Les §3 et §4 sont ce
> qui empêche la récidive — et sont plus importants que les deux premiers.

---

## §1 — Inventaire : par ESLint, pas par grep

`grep catch` produirait des dizaines de résultats sans distinguer le légitime du
dangereux. Il existe un détecteur bien plus fiable de ce défaut précis :

> **Un `catch (err)` où `err` n'est jamais utilisé** est presque la définition d'une erreur
> avalée.

### Configuration

Dans la config ESLint du frontend :

- **`@typescript-eslint/no-unused-vars`** avec l'option **`caughtErrors: 'all'`** —
  signale toute variable d'erreur capturée mais jamais lue.
- **`no-empty`** avec **`allowEmptyCatch: false`** — attrape les blocs `catch {}` vides.

Lancer une première fois **en mode rapport** (sans échouer le build) pour obtenir la liste
complète. Ne pas activer en erreur bloquante avant d'avoir traité l'existant, sinon le
build casse et la règle sera désactivée plutôt que respectée.

### Tri de la liste

Deux catégories, à traiter différemment :

- **`catch` en chemin de lecture** avec repli sur une valeur par défaut : souvent
  **légitime**. Un `getDocsFromCache` qui échoue et retombe sur le serveur est le
  comportement voulu. Journaliser quand même (§2), mais rien de plus.
- **`catch` en chemin d'écriture** : **presque jamais légitime**. Une écriture qui échoue
  signifie qu'une donnée utilisateur est perdue. Si le code décide de continuer comme si
  de rien n'était, il faut au minimum que quelqu'un puisse le savoir.

Priorité absolue aux chemins de flush débouncé — `ClientDaily.tsx`,
`ClientCompetitions.tsx`, `ClientCourseSession.tsx`, et le chemin des défis. C'est là que
le motif « rattraper, remettre en file, réessayer » a été introduit par les chantiers de
debounce, et donc là où une erreur permanente devient invisible.

---

## §2 — Rendre les erreurs bruyantes, à trois niveaux

### Niveau 1 — `console.error`, partout, sans exception

Le minimum, et souvent suffisant. L'erreur apparaît alors dans la console pendant les
tests, et dans la capture d'écran qu'un utilisateur envoie quand il signale un problème.

**L'erreur du 18/08 aurait sauté aux yeux dès le premier flush.**

Message utile : contexte (quelle écriture), identifiant concerné, et l'erreur complète —
pas seulement `err.message`, qui perd la pile.

### Niveau 2 — compteur d'échecs consécutifs

**C'est le correctif direct de la classe de bug rencontrée.** Une erreur permanente
déguisée en réessai temporaire est indétectable tant que le code réessaie indéfiniment
sans compter.

Au-delà de 2 ou 3 échecs successifs sur le même flush : arrêter de réessayer en silence,
journaliser en erreur explicite, et remonter au niveau 3.

Distinguer clairement un échec **transitoire** (réseau coupé — le réessai est le bon
comportement, c'est même tout l'intérêt de la file d'attente hors ligne) d'un échec
**déterministe** (règle Firestore violée, donnée malformée — le réessai ne servira jamais
à rien). Le compteur est le seul moyen simple de faire cette distinction sans inspecter le
type d'erreur.

### Niveau 3 — retour visible pour l'utilisateur

Quand une écriture échoue durablement, le grimpeur doit le savoir. Un `Snackbar` discret
(« ta validation n'a pas pu être enregistrée, réessaie ») vaut infiniment mieux qu'une
séance entière perdue découverte à la fin.

Le motif existe déjà ailleurs dans l'application — le réutiliser, ne pas en inventer un
second.

### Optionnel — tampon d'erreurs consultable

Conserver les 10 dernières erreurs dans `localStorage`, consultables depuis l'info-bulle
de version déjà présente en Navbar (V2.25). Coût Firestore nul, et ça donne un diagnostic à
distance quand un utilisateur décrit un comportement bizarre sans savoir l'expliquer.

À faire seulement si les niveaux 1 à 3 sont en place.

---

## §3 — Rendre la faute impossible plutôt que détectable

**C'est le point le plus important de ce document.**

Le bug de transaction n'était pas une inattention isolée. `flushClassementWrite` accumule
désormais `classement_profiles`, `wallCounts`, et les défis actifs concernés. Chaque ajout
futur devra respecter la règle « toutes les lectures avant toute écriture » — **et un jour
quelqu'un l'oubliera à nouveau**, exactement comme le 18/08.

Une convention qu'il faut se rappeler de tenir est une convention qui sera violée.

### Pour la transaction

Restructurer le helper pour qu'il prenne :

1. **une liste de références à lire** ;
2. **une fonction pure** qui, à partir des données lues, produit les écritures à appliquer.

L'ordre n'est plus une discipline, il est **imposé par la signature**. Ajouter un nouveau
compteur devient une entrée de plus dans la liste, sans possibilité matérielle de se
tromper.

Bénéfice secondaire : la fonction pure devient testable unitairement, sans émulateur.

### Pour les flush débouncés

Même raisonnement. Il existe aujourd'hui **quatre implémentations distinctes** du même
motif (`ClientDaily`, `ClientCompetitions`, `ClientCourseSession`, défis), chacune avec sa
propre gestion du minuteur, du flush sur `pagehide`, de la comparaison à la dernière
valeur persistée et du `catch`.

Un helper unique — journalisation, compteur d'échecs et remontée à l'interface **à
l'intérieur** — supprime la possibilité qu'une cinquième implémentation oublie l'un des
quatre.

⚠️ **Ne pas faire cette refactorisation en même temps que §1/§2.** Elle touche quatre
écrans en production dont trois ont déjà été corrigés une fois pour perte de données. La
faire seule, avec les e2e existants comme filet, et bumper une version dédiée.

---

## §4 — Faire porter les tests sur l'effet, pas sur l'absence de plantage

**La cause profonde de l'invisibilité est là.**

`e2e-daily-flow.mjs` validait un bloc et vérifiait que le classement était juste, mais
**n'avait aucune assertion sur `wallCounts`**. Le test passait — et il passait précisément
parce que l'erreur était avalée. Un test qui ne vérifie que « rien n'a planté » ne peut
pas détecter un `catch` silencieux : c'est le même mécanisme qui produit le bug et qui fait
passer le test.

### La règle à poser

> **Tout compteur incrémental doit avoir une assertion e2e sur sa valeur résultante.**

À appliquer rétroactivement :

- `users.wallCounts` — aucune assertion aujourd'hui. **C'est celui qui a été perdu.**
- `classement_profiles.season.*` — vérifié par `e2e-daily-flow.mjs` ? À confirmer.
- `challenges.progress` — couvert pour `seuil`/`declaratif`, **pas pour `fenetre` ni
  `bloc_designe`** (point ouvert du handoff V2.46).
- `classement_profiles` all-time — à confirmer également.

Peu coûteux : une lecture de document et une comparaison, dans un test qui existe déjà et
qui a déjà fait le travail difficile (authentification, seed, parcours navigateur).

### Corollaire

Un test qui vérifie une valeur après écriture **détecte aussi les erreurs avalées**, sans
qu'on ait besoin de les chercher. C'est pour ça que le §4 est plus efficace que le §1 sur
le long terme : le §1 trouve les `catch` existants, le §4 attrape ceux qui seront écrits
demain.

---

## Ordre d'exécution recommandé

1. **§1** — activer les règles ESLint en mode rapport, produire l'inventaire, trier
   lecture/écriture. Sans modifier de code.
2. **§2 niveaux 1 et 2** — `console.error` et compteur d'échecs sur tous les chemins
   d'écriture identifiés. Peu risqué, gros gain de visibilité.
3. **§4** — ajouter les assertions e2e manquantes, en commençant par `wallCounts`.
4. **§2 niveau 3** — retour utilisateur sur échec durable.
5. **§3** — refactorisation du helper de transaction, puis du helper de flush. **Chantier
   séparé, version dédiée.**
6. Activer les règles ESLint en **erreur bloquante**, une fois l'existant traité.

Les étapes 1 à 4 sont indépendantes et livrables séparément. L'étape 5 est celle qui a le
plus de valeur durable, et la seule qui présente un risque de régression.

---

## Ce que ce processus ne couvre pas

- **Les erreurs qui ne lèvent pas d'exception.** Une écriture qui réussit avec une mauvaise
  valeur ne sera jamais attrapée par un `catch`, quel qu'il soit. C'est le rôle de la
  réconciliation — laquelle n'existe pas pour `wallCounts` ni pour `challenges`, par
  décision assumée.
- **Une leçon à retenir de l'incident** : un compteur incrémental **ne se rattrape jamais
  tout seul**. Une période d'incréments perdus l'est définitivement, puisque rien ne relit
  l'historique. La justification du 18/08 pour dispenser `wallCounts` de réconciliation
  était « une dérive ne produit qu'un écart marginal » — l'incident montre qu'une dérive
  peut être **totale et soudaine**, pas seulement une accumulation lente. Ça ne renverse pas
  la décision (l'enjeu de `wallCounts` reste faible), mais **à rouvrir si les défis
  s'appuient un jour sur les murs pour désigner un vainqueur**.

---

## Points ouverts par ailleurs (inchangés)

- **Défis `fenetre` et `bloc_designe`** : en production sans e2e navigateur. Usage
  surveillé.
- **Clôture automatique de `fenetre`** : risque de course avec un flush débouncé encore en
  vol. Parade suggérée — ne figer le vainqueur qu'au-delà de `ends_at` plus quelques
  minutes.
- **Proposition A2 de la Roulette** (« un bloc que tu n'as jamais validé ») : la promesse
  du libellé dépasse ce que les données garantissent (session en cours seulement).
  Reformulation recommandée.
- **Chantier droits d'accès** — en attente des réponses du gérant.
  `CONCEPTION-droits-acces-abonnements.md` toujours pas transmis au dépôt.
- Réplique matérielle HDMI à froid ; ligne de base de lectures quotidiennes ; concurrence à
  90 utilisateurs ; plan de repli quota ; un projet Firebase par salle ; sauvegarde durable
  des images ; `aide-connexion-installation.html` hors charte.

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
