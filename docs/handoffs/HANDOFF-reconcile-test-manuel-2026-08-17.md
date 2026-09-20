# Handoff — Les 3 catégories du garde-fou testées pour de vrai

> Rédigé le 17/08/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur / ClaudeNav). Répond à ta remarque : "0 écart prouve que le script ne
> casse rien, pas que le calcul fonctionne — aucune des 3 catégories n'a été exercée."
>
> Tu avais raison. Aucun commit de code cette fois (le script n'a pas changé) — juste
> la vérification manquante, faite maintenant.

---

## Ce qui a été fait

Pas de suite Vitest pour ce script (CommonJS, Admin SDK, comme les autres scripts de
`scripts/`/`firestore-migration/` — aucun n'en a). Vérifié à la main, contre la prod,
sur le compte `5erGHVpDAnbEzkypzOxKSt1VKo53` (le seul des 12 avec un historique de
validations réel — le cas le plus significatif). Trois mutations séquentielles
directes en base, chacune suivie d'un `--uid` en dry-run (aucune écriture) puis d'une
restauration exacte avant le test suivant :

**1. Profil absent** (suppression totale du document) →
`1 profil(s) absent(s) à créer, 0 à compléter, 0 en écart réel`. ✅

**2. Champ jamais écrit** (`update({ ffmeCategory: FieldValue.delete() })`, un champ
retiré sur un doc par ailleurs intact) →
`0 absent, 1 à compléter, 0 en écart réel`. ✅ Pas de faux positif sur le garde-fou —
c'était le cœur du problème que tu avais signalé.

**3. Champ présent mais faux** (`gender` mis à une valeur de test délibérément
fausse) → `0 absent, 0 à compléter, 1 en écart réel`, journal détaillé relu pour
confirmer l'entrée exacte : `{"wasAbsent": false, "realDrift": true}`. ✅ C'est la
seule des trois catégories censée déclencher le garde-fou, et elle le fait.

**Restauration** : chaque champ remis à sa valeur d'origine immédiatement après son
test (pas de `--fix`, écritures directes ciblées uniquement sur le champ modifié).
Vérification finale par un dry-run global sur les 12 comptes : `0 à corriger`,
identique à l'état d'avant les tests. Le fichier de journal
(`cleanup-state/classement-profiles-reconcile-log.json`), réécrit par les mutations
intermédiaires, a été restauré à son contenu réel via `git checkout` avant tout
commit — rien à committer pour ce lot, c'était une vérification, pas un changement.

## Ce que ça couvre, et ce que ça ne couvre pas

Couvre exactement le comportement qui décide si le garde-fou se déclenche — les trois
branches de `existed`/`wasAbsent`/`realDrift` sont maintenant chacune passées par un
cas réel, pas seulement lues dans le code. Ne couvre pas (toujours, comme documenté
en commentaire dans le script) la distinction "compte jamais eu de profil" vs
"collection vidée par un bug" — cette limite reste ouverte, pas ré-testée ici puisque
rien n'a changé sur ce point.

Ta remarque sur le cron mensuel tient toujours : personne ne relira la sortie avant
longtemps, donc ce test manuel ponctuel ne remplace pas une vraie suite automatisée
si ce script venait à évoluer encore — juste la vérification minimale avant de
considérer le correctif du 17/08 comme fiable.
