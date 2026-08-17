# Handoff — Réponse à la relecture du garde-fou `reconcile-classement-profiles.js`

> Rédigé le 17/08/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur / ClaudeNav). Répond à ta relecture du run `--fix --force` de V2.43
> (deux observations sur `scripts/reconcile-classement-profiles.js`).
>
> Corrigé, commité et poussé : `59ceab9`. Pas de bump de version ni de déploiement —
> script serveur seul, aucun changement côté frontend.

---

## Résumé en trois phrases

Les deux observations étaient justes et corrigées dans le même commit. Chaque champ
porte désormais `wasAbsent` (valeur brute jamais écrite) et chaque profil porte
`existed`/`realDrift` ; le garde-fou anti-dérive ne se base plus que sur `realDrift`,
donc un futur ajout de champ ne le redéclenchera plus jamais. Validé en dry-run puis
`--fix` contre la prod : 0 écart constaté (déjà nettoyée par le run précédent),
confirmant que le nouveau calcul retombe juste sans rien casser.

---

## 1. Profil absent vs profil en écart

Le script confondait les deux — `storedData = {}` pour un profil inexistant était
traité exactement comme un profil existant avec des champs faux. Corrigé : chaque
profil porte maintenant `existed` (le document `classement_profiles` existait-il déjà
avant ce run ?). Le journal
(`cleanup-state/classement-profiles-reconcile-log.json`) et la sortie console
distinguent désormais trois catégories, comptées séparément :

- profils absents créés,
- profils existants complétés (au moins un champ jamais écrit avant),
- écarts réels (au moins un champ déjà écrit et faux).

## 2. Le garde-fou confondait backfill et vraie dérive

Chaque entrée de `drift` porte maintenant `wasAbsent`, calculé sur la valeur **brute**
stockée (`storedData.champ === undefined`, avant tout `|| defaut` appliqué en
lecture) — donc vrai aussi bien pour un champ jamais écrit sur un profil existant que
pour un profil entièrement absent (tous ses champs y sont `undefined`). Un profil est
`realDrift` seulement s'il porte au moins un champ dont la valeur était *déjà écrite
et fausse*.

**Le garde-fou (`DRIFT_GUARD_RATIO`/`DRIFT_GUARD_ABSOLUTE_MIN`) se base désormais
uniquement sur `realDrift`**, plus sur `drifted` (qui incluait les backfills). Résultat
concret : le prochain champ ajouté à `classement_profiles` ne déclenchera plus le
garde-fou, `--force` redevient l'exception plutôt qu'un passage obligé à chaque
évolution de schéma.

## Limite assumée, pas résolue

Documentée en commentaire dans le script, pas cachée : ce calcul ne peut pas
distinguer « ce compte n'a jamais eu de profil » d'un effacement en masse de la
collection — les deux se présentent identiquement comme document absent
(`existed: false`). Détecter le second cas demanderait de comparer à un état persisté
du run précédent (comme `cleanup-state/state.json` le fait pour
`cleanup-orphan-boulder-images.js`), ce qui n'existe pas pour cette collection. Pas
fait ici faute d'un tel état déjà en place — à construire si ce risque devient concret
plutôt que supposé couvert par le correctif actuel.

## Sur ton dernier point (le drift `gender`)

D'accord sans réserve : c'était la première vraie dérive observée depuis l'existence
du script, et elle valide le mécanisme lui-même. C'est exactement ce que `realDrift`
isole maintenant explicitement — ce genre de cas continuera de déclencher le
garde-fou normalement ; seul le bruit des backfills en a été retiré.

## Vérification

- Dry-run puis `--fix` contre la prod (12 comptes) : `0 profil(s) vérifié(s), 0 à
  corriger` dans les deux cas — la prod était déjà propre depuis le run
  `--fix --force` de V2.43, donc rien à réécrire ; confirme que le nouveau calcul ne
  regresse pas et retombe juste.
- `--uid <uid>` testé isolément sur un compte réel : fonctionne, résultat identique.
- `node --check` : syntaxe valide.

Pas de test unitaire dédié pour ce script (comme les autres scripts
`firestore-migration`/`scripts/`, il n'est pas dans `npm test`, hors périmètre des
tests Vitest du frontend) — vérifié par relecture + exécution réelle contre la prod
en dry-run avant tout `--fix`.
