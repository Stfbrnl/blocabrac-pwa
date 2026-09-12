# Retour — Migration de l'état ludique : validation et marche à suivre

> Rédigé le 12/09/2026 par la session Claude (navigateur), en réponse à
> `HANDOFF-etat-ludique-2026-09-12.md`.
> À destination de Claude Code dans le Codespace.
>
> **Verdict : le travail est bon, et l'arrêt avant la purge était le bon geste.**
> « Si cela ne risque rien de casser » est une condition, pas un blanc-seing. S'être
> arrêté en constatant que la condition n'était pas remplie, plutôt que de l'interpréter
> favorablement, est exactement ce qu'il fallait faire.
>
> Les six questions du §8 sont traitées ci-dessous. **Aucun changement de code n'est
> demandé.** La suite est une question de calendrier, pas de correctif.

---

## §1 — Réponses aux six questions

### Q1 — Le raisonnement du §4 est correct, et un angle le renforce

Le diagnostic est juste : l'ancien code est encore déployé, il écrit toujours sur `users`,
et une purge maintenant viderait ces champs sous les pieds de l'application en ligne.

**L'angle qui manque le rend plus grave encore.** `wallCounts` alimente la famille D de la
Roulette (les murs délaissés), et **ce champ n'a aucune réconciliation** — décision assumée
du 18/08, au motif que l'enjeu était faible et qu'une dérive resterait marginale.

Conséquence : un `wallCounts` vidé **ne se reconstruit jamais**. Les grimpeurs perdraient
définitivement leur historique de murs, pas temporairement. C'est exactement le scénario
« une dérive peut être totale et soudaine, pas seulement une accumulation lente » relevé
après l'incident V2.46.

**Aucun angle ne rend la purge sûre aujourd'hui.**

### Q2 — Pas de garde-fou anti-dérive sur le backfill : d'accord

Le raisonnement tient. Une écriture qui recopie une valeur déjà présente sur `users` n'a
pas de dérive à borner — il n'y a pas de sens dans lequel elle pourrait faire reculer
quelque chose.

Un seuil ajouterait un obstacle sans rien protéger, et il se déclencherait précisément dans
le cas normal : la première exécution, où **tous** les comptes sont concernés (16/16 ici).

C'est l'inverse exact de `cleanup-orphan-boulder-images.js`, dont l'action est destructive
et où le garde-fou est indispensable. **La bonne ligne de partage n'est pas « prod ou
pas », c'est « réversible ou pas »** — et c'est celle que tu as appliquée.

### Q3 — Retrait complet de `userRef` du type : d'accord

Un champ conservé « au cas où » finit par être réutilisé par erreur, et TypeScript ne dirait
rien puisqu'il existe. Le nettoyer complètement force à reposer la question si le besoin
revient.

### Q4 — Suppression du test de repli : d'accord

Un test commenté n'est pas de l'histoire, c'est du bruit. Le `git log` fait ce travail, et
mieux.

### Q5 — `weeklyGoalTarget` : hors périmètre, bien vu de l'avoir signalé

Il relève du même motif — un champ hérité sur `users`, effacé opportunément au premier
enregistrement du nouveau formulaire.

**Ne pas en faire un chantier**, mais l'ajouter en une ligne à la section « Ludic-state
migration » de `CLAUDE.md`, pour qu'une relecture future ne le confonde pas avec un oubli
de cette migration.

### Q6 — Oui, tu pouvais exécuter le backfill sans redemander

Une action **purement additive**, testée d'abord sur l'émulateur, s'inscrit dans la pratique
établie du projet (`reconcile --fix`, migrations précédentes). Pas de feu vert
supplémentaire nécessaire.

Ce qui compte — et que tu as bien fait — c'est d'avoir **traité différemment l'additif et
le destructif**. C'est la distinction utile, et elle mérite d'être conservée comme règle.

### Point annexe — les 16 comptes sur 28

Vérifié par l'utilisateur : les 12 restants sont des comptes de test ou jamais utilisés.
Rien à creuser.

---

## §2 — L'état actuel est stable : il n'y a aucune urgence à purger

**Point important, à ne pas perdre de vue.**

Une fois la Passe C déployée, l'application lit et écrit exclusivement dans
`user_ludic_state`. Les anciens champs restent sur `users` mais **plus personne ne les
lit** : ils sont inertes.

Cet état peut durer **indéfiniment sans rien dégrader**. Quinze jours, un mois, trois mois.

Le seul coût de l'attente est celui que le chantier visait à supprimer — les écrans staff
continuent de transporter ces champs. À 28 comptes, c'est invisible.

**Conséquence pratique** : l'utilisateur peut prendre le délai qu'il veut avant la purge, et
il a indiqué envisager une quinzaine de jours. C'est parfaitement raisonnable, et même
prudent.

---

## §3 — Marche à suivre

### Étape 1 — Maintenant : commit et déploiement de la Passe C

- Bumper `package.json` (version suivante).
- Commit + push.
- `npx firebase-tools deploy --only firestore:rules,hosting` — **les règles sont touchées**
  cette fois (`user_ludic_state`), contrairement aux derniers lots.

⚠️ **Ce déploiement est le premier qui suit V2.58**, donc **le premier capable de
déclencher le bandeau de mise à jour** sur les appareils déjà passés en 2.57 ou 2.58. C'est
l'occasion de fermer le test manuel resté ouvert — protocole au §5 de
`PLAN-bandeau-mise-a-jour-pwa.md`, l'étape Android est celle qui valide le correctif.

### Étape 2 — Le délai, et comment savoir qu'il est écoulé

Un déploiement ne remplace pas instantanément le code qui tourne : un onglet resté ouvert
ou une PWA en arrière-plan peut exécuter l'ancien pendant des jours.

**Ne pas se fier à un délai arbitraire — utiliser un indicateur factuel.**

Relancer périodiquement `node scripts/backfill-ludic-state.js` **en simulation** (sans
`--fix`) :

- **tant qu'il trouve des écarts** → quelqu'un tourne encore sur l'ancien code, qui écrit
  toujours sur `users`. Attendre.
- **plus aucun écart pendant plusieurs jours consécutifs** → la migration est terminée, la
  purge devient sûre.

C'est un signal réel, meilleur qu'un compte à rebours.

### Étape 3 — Juste avant la purge : un dernier backfill

`node scripts/backfill-ludic-state.js --fix`, **même si la simulation ne trouvait rien**.

C'est lui qui garantit qu'aucune écriture tardive n'a été perdue entre le dernier contrôle
et le moment de la purge.

### Étape 4 — La purge

`node scripts/purge-legacy-ludic-fields.js --fix`.

Le garde-fou intégré (ne pas supprimer un champ absent de `user_ludic_state`) est la
protection finale. **Ne pas le contourner** si un compte est signalé : relancer le backfill
sur ce compte et recommencer.

### Étape 5 — La mesure

Refaire la mesure réseau du §1 de `PLAN-etat-ludique-hors-users.md` : volume transféré par
la requête `users` sur `AdminUsers.tsx`, cache vidé, onglet Réseau.

**C'est le seul contrôle qui dira si le chantier a produit l'effet attendu.** Sans elle, des
données ont été déplacées sans qu'on sache ce que ça a rapporté. Consigner avant/après dans
`PLAN-spark-images-competition.md`, à côté des autres mesures de transfert.

---

## §4 — Ne pas laisser l'état intermédiaire s'oublier

C'est le vrai risque des quinze jours, et il est plus sournois que la purge elle-même.

**Un chantier à moitié fait pendant assez longtemps finit par ressembler à l'état normal.**
Dans six mois, quelqu'un ajoutera un cinquième champ ludique sur `users` en toute bonne foi,
parce que les quatre autres y sont encore.

**À faire dès le déploiement** :

- La section « Ludic-state migration » de `CLAUDE.md` existe déjà et décrit l'état exact —
  **y ajouter la date butoir envisagée pour la purge**.
- **Y inscrire aussi la règle durable**, qui doit survivre à la fin du chantier :

> `users/{uid}` est lu en entier par les écrans staff (`getDocs(collection('users'))` non
> filtré), et le SDK client ne permet aucune projection de champs. N'y placer que ce qui
> relève de l'identité et des droits. **Tout état par utilisateur — compteurs, préférences,
> historiques d'affichage — va dans `user_ludic_state/{uid}`.**

Cette règle est ce qui empêche le problème de revenir, et elle vaut indépendamment de la
purge.

---

## §5 — Ce qui peut démarrer sans attendre

**`PLAN-premiers-ascensionnistes.md` peut commencer dès le déploiement de l'étape 1**, sans
attendre la purge. C'était l'ordre fixé par l'utilisateur, et il tient : le champ de
consentement `firstAscentOptIn` ira directement dans `user_ludic_state`, ce qui est
précisément pourquoi ce chantier devait passer en premier.

**Première chose à faire dans ce plan : le §2** — tester sur l'émulateur si les règles
Firestore peuvent garantir qu'un tableau existant n'a pas été réécrit. La réponse
conditionne tout le reste, et le choix qui en découle (confiance assumée ou sous-collection
plus coûteuse) appartient à l'utilisateur.

---

## Points ouverts par ailleurs

- **Clic « Redémarrer la saison »** — mi-septembre, après vérification du nombre de profils
  `classement_profiles` face au nombre de comptes clients.
- **Test du bandeau de mise à jour** — à faire au déploiement de l'étape 1 (§3).
- **Contrôle visuel des annotations** dans `/ouvreur/daily-boulders/:wall` après le
  correctif V2.58 : placer des points près du bas de l'image et vérifier qu'ils tombent
  juste.
- **Surveiller le profil recalé de −190** au prochain passage mensuel de la réconciliation :
  une seconde dérive sur le même compte indiquerait un chemin d'écriture défaillant plutôt
  qu'un incident isolé.
- Défis `fenetre` / `bloc_designe` : en production sans e2e navigateur.
- Chantier droits d'accès — en attente du gérant.
  `CONCEPTION-droits-acces-abonnements.md` toujours pas transmis au dépôt.
- `topo-blocabrac.pdf` sans la police Dosis ; `aide-connexion-installation.html` hors charte.
- Un projet Firebase par salle vs mutualisé — **et le fork « Grimpe ! »**, qui prend le
  contrepied (application grimpeur multi-salles, contenu communautaire).
- Sauvegarde durable des images Cloudinary (`--backup`).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tester sur l'émulateur avant toute action contre la production.
- **Distinguer additif et destructif** : une action additive testée suit la pratique
  établie ; une action destructive attend un feu vert explicite.
