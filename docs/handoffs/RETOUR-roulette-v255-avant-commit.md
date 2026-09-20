# Retour — Lot Roulette V2.55, avant commit

> Rédigé le 06/09/2026 par la session Claude (navigateur), en réponse à
> `HANDOFF-roulette-v255-2026-09-06.md` (lot non commité, avis demandé avant commit).
> À destination de Claude Code dans le Codespace.
>
> **Verdict global : le lot est bon.** Le chiffrage du §4 est solide, la propriété
> « tirage = 0 lecture / 0 écriture » est préservée et vérifiée structurellement, et les
> quatre options écartées au §4.4 le sont pour les bonnes raisons — celle de la collection
> `roulette_completions` en particulier, qui aurait reproduit l'anti-motif de lecture non
> bornée corrigé en V2.26.
>
> **Deux points bloquent le commit** (§1 et §2), **un est à vérifier** (§3), le reste est
> validé sans changement.

---

## §1 — BLOQUANT : assertion e2e sur `rouletteChallengesCompleted`

**Réponse au point ouvert (e) : oui, avant le commit.**

`rouletteChallengesCompleted` est le **troisième compteur incrémental** du projet, après
`colorCounts` et `wallCounts`. La règle posée au §4 de `PROCESSUS-erreurs-avalees.md` le
vise directement :

> Tout compteur incrémental doit avoir une assertion e2e sur sa valeur résultante.

Cette règle n'est pas née d'un principe abstrait : elle vient de `wallCounts`, resté mort
un jour entier parce que `e2e-daily-flow.mjs` validait un bloc sans jamais vérifier l'effet
de l'écriture.

**À faire** : dans `e2e-daily-flow.mjs`, ouvrir la Roulette, cliquer « J'ai relevé le
défi », puis vérifier via `firebase-admin` que `users/{uid}.rouletteChallengesCompleted`
vaut 1 et que `rouletteRecentChallenges` porte une entrée. Le harnais existe déjà (c'est
exactement le motif de l'assertion `wallCounts` ajoutée en V2.47), l'ajout est court.

---

## §2 — BLOQUANT : rollback de l'UI optimiste

**Réponse au point ouvert (a) : oui, et ce n'est pas indépendant du §1.**

`handleValiderRoulette` incrémente l'affichage **avant** `await updateDoc`, et le `catch`
ne rétablit pas l'état. Conséquences combinées avec l'absence d'assertion e2e :

- une écriture qui échoue **durablement** affiche quand même un compteur qui monte ;
- rien côté tests ne le détecterait ;
- c'est la configuration exacte de l'incident `wallCounts` de V2.46.

Le `setError` atténue — l'utilisateur voit une erreur — mais il voit **simultanément** son
compteur passer à n+1. Cette contradiction est pire qu'un simple échec : elle laisse penser
que l'erreur est cosmétique.

**À faire** : capturer la valeur précédente avant le `setSelfProfile` optimiste, et la
restaurer dans le `catch`, en plus du `console.error` et du `setError` déjà présents.
Quelques lignes, aucun coût, et ça supprime l'état incohérent.

---

## §3 — À VÉRIFIER avant commit : fermeture obsolète sur `rouletteRecentChallenges`

**Complément au point ouvert (b).** La décision de ne pas utiliser de transaction est
**validée** — le compteur est protégé par `increment()`, et perdre une entrée parmi dix
dans une liste ludique n'a aucune conséquence. Même parti que `weeklyGoalItems`, cohérent.

Mais il y a un cas distinct de celui des deux onglets, et il est bien plus probable :

`nextRecent` est recomposé depuis `selfProfile`. **Si `handleValiderRoulette` lit cet état
par fermeture plutôt que par une ref**, deux validations rapprochées dans la même session
partent de la même base — la seconde écrase la première dans le tableau. Le compteur reste
juste (`increment()` est atomique), la liste perd silencieusement une entrée.

C'est le même motif que la fermeture obsolète trouvée en V2.28 sur le flush `pagehide`, où
un effet à dépendances vides figeait la fonction sur le premier rendu.

**À vérifier, pas à supposer.** Si le cas se confirme, le patron de ref est déjà employé
ailleurs dans le projet (`flushPendingResultsRef`), avec la contrainte connue : mettre la
ref à jour dans un effet séparé, jamais pendant le rendu (règle ESLint `react-hooks/refs`).

---

## §4 — Validé sans changement

### (c) `levelOffset` plutôt qu'un palier `max-2` — bon choix

La raison de fond : **sélection du palier** et **résolution de la couleur** sont deux
préoccupations distinctes. Un vrai palier `max-2` obligerait à réviser la pondération
70/20/10 pour y insérer un quatrième pourcentage que personne n'a demandé, et à toucher
tous les tests d'index. `levelOffset` ne déplace que la couleur résolue, sans rien changer
à la sélection du pool.

Le fait que le chip « Niveau visé » affiche la couleur décalée est ce qui rend la solution
honnête plutôt qu'un contournement.

Détail sans gravité : chez un grimpeur au plancher, `levelOffset` est absorbé par le clamp
et ne fait rien. C'est le bon comportement — B37 et B40 sont simplement relativement plus
exigeants pour eux.

### (d) Lecture de l'invariant famille E — correcte

L'invariant porte sur `client_boulder_results`, parce qu'y écrire fausserait classement,
badges et niveau automatique. Un compteur ludique séparé ne touche à rien de tout ça.
Compter la famille E et la roulette de la mort est cohérent avec la demande.

⚠️ **Frontière à tenir, à inscrire dans `CLAUDE.md`** : ce compteur est **entièrement
déclaratif**, pour toutes les familles — même « un bloc à ton niveau » n'est jamais
vérifié. Il ne doit donc **jamais devenir une entrée d'autre chose**. Un futur badge
« 10 défis Roulette relevés » serait auto-attribuable en dix clics, et rouvrirait par la
bande le problème que l'invariant famille E ferme.

### (f) Document équipe séparé — d'accord

Un diff binaire de 300 Ko sans rapport avec le commit est une raison suffisante à elle
seule. S'y ajoute que les deux documents s'adressent à des lecteurs différents. La
séparation de `npm run topo` et `npm run topo:roulettes` est le bon découpage.

### B45 / B46 (chauve-souris, Yaniro) — clos, aucune action

J'avais soulevé un risque de chute. **Correction : c'est une technique d'escalade
courante**, et il existe des départs chauve-souris dès le niveau rouge. La borne
`minLevel: 'blanc'` répond à « à partir de quand ça vaut la peine de s'y entraîner », pas à
une question de danger — c'est une question de compétence et de pertinence pédagogique.

Le `details` et la page vigilance du doc équipe suffisent. **Ne rien changer.**

### Autres confirmations demandées

- **Proposition « pieds silencieux » abandonnée** (doublon de B8) : confirmé, bien vu.
- **B38 en une entrée avec la variante dans le texte** : d'accord, et réversible si le
  catalogue devient trop dense.
- **Absence de validation serveur de `rouletteRecentChallenges`** (§3.7) : acceptable,
  exposition identique à `weeklyGoalItems` et `wallCounts`. Un client ne peut gonfler que
  son propre document, lu par lui seul — mais voir le §5 ci-dessous, qui nuance ce dernier
  point.

---

## §5 — À NOTER, pas à traiter maintenant : `users` grossit et est lu en entier

Point non soulevé dans le handoff, et sans urgence — mais c'est le moment de l'inscrire.

`users/{uid}` accumule désormais `weeklyGoalItems`, `wallCounts`, et
`rouletteRecentChallenges` (dix objets portant chacun un libellé résolu complet).

Or plusieurs écrans staff font toujours un `getDocs(collection(db, 'users'))` **non
filtré** — liste relevée en section 2c du handoff quotas du 14/08 : `CompetitionStats`,
`AdminCompetitionStats`, `AdminCompetitionRegistration`, `AdminUsers` (×4), `BoulderStats`,
`CompetitionBoulderStats`.

**Et le SDK client ne permet aucune projection de champs.** C'est exactement la contrainte
qui avait imposé de sortir les images base64 de `boulders` : tout ce qui vit dans un
document est transporté à chaque lecture de ce document.

Chaque ouverture d'un écran staff transporte donc l'état ludique complet de tous les
comptes. À douze comptes, invisible. À plusieurs centaines — perspective multi-salles — ça
devient le même problème que les images, et **la solution sera la même : déplacer, pas
optimiser la requête**.

Nuance sur le §3.7 du handoff : « lu par lui seul » n'est pas tout à fait exact. Un
`rouletteRecentChallenges` gonflé par un client serait aussi transporté à chaque ouverture
d'écran staff. Ça ne change pas la conclusion (acceptable), mais ça déplace le coût
potentiel du client vers le staff.

**Action recommandée** : une ligne dans `CLAUDE.md` notant que `users` est devenu le
dépotoir de l'état par utilisateur, et que le jour où ça pèsera, il faudra un document
séparé (`user_ludic_state/{uid}` ou équivalent). Le noter coûte une ligne ; le découvrir
plus tard coûtera une migration.

---

## §6 — Récapitulatif avant commit

| Point | Statut |
|---|---|
| §1 — assertion e2e `rouletteChallengesCompleted` | **à faire** |
| §2 — rollback de l'UI optimiste | **à faire** |
| §3 — fermeture obsolète sur le tableau | **à vérifier** |
| (b) absence de transaction | validé |
| (c) `levelOffset` | validé |
| (d) famille E comptée + frontière à inscrire | validé |
| (f) doc équipe séparé | validé |
| B45/B46 | clos, aucune action |
| §5 — note `users` dans `CLAUDE.md` | à ajouter, non bloquant |

Une fois §1 à §3 traités, le lot peut partir.

---

## Points ouverts par ailleurs (inchangés)

- **`topo-blocabrac.pdf` n'embarque pas la police Dosis** (constat du §5 du handoff). Le
  `@import` Google Fonts ne passe pas dans le Codespace, le rendu retombe sur une police
  système. Le nouveau document est cohérent avec l'existant, donc rien d'urgent — mais la
  charte visuelle a justement été alignée en V2.40, et ces PDF y échappent. À traiter en
  même temps que `aide-connexion-installation.html`, qui est hors charte pour une raison
  différente.
- **Défis `fenetre` et `bloc_designe`** : en production sans e2e navigateur.
- **Chantier droits d'accès** — en attente des réponses du gérant.
  `CONCEPTION-droits-acces-abonnements.md` toujours pas transmis au dépôt.
- Réplique matérielle HDMI à froid ; ligne de base de lectures quotidiennes ; concurrence à
  90 utilisateurs simultanés ; plan de repli quota ; un projet Firebase par salle vs
  mutualisé ; sauvegarde durable des images (`--backup`).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
