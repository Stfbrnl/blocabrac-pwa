# Handoff — Modes de comptage des points en compétition (V2.33)

> Rédigé le 15/08/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur). Fait suite à `HANDOFF-quota-ecritures-version-2026-08-15.md`
> (dernier handoff, sections 7-8 traitées). Pas de `SUIVI-*.md` en amont cette
> fois : demande directe de l'utilisateur, pas un document que tu avais écrit.
>
> Déployé en production (https://blocabrac.web.app), commit `b98fed7` sur
> `main` (hosting + firestore:rules).

---

## Résumé en trois phrases

L'utilisateur voulait pouvoir choisir, par compétition, entre plusieurs façons
de compter les points (le barème habituel, un comptage "blocs validés" à
points fixés par bloc, un barème entièrement personnalisable) — jamais pour
le classement annuel des grimpeurs, qui reste inchangé par construction.
Un quatrième mode discuté (le comptage officiel coupe de France/du monde, par
tops/zones) a été volontairement **écarté du périmètre** : ce n'est pas une
somme de points mais un tri multi-critères, incompatible avec l'architecture
de calcul existante — traité comme un chantier séparé si besoin un jour.
Les 3 modes retenus sont livrés, verrouillés côté `firestore.rules` (pas
seulement l'UI) une fois la compétition déclenchée, avec tests unitaires et
tests de règles.

---

## 1. Les 3 modes

Choisis par compétition via un bouton → menu dans `AdminCompetitionManagement.tsx`
(`competitions.scoring_mode`, `'blocabrac' | 'blocs_valides' | 'personnalise'`,
défaut `'blocabrac'` si absent) :

- **Blocabrac** : barème actuel inchangé (comportement par défaut, rien à
  faire pour les compétitions existantes).
- **Blocs validés** : chaque bloc porte sa propre valeur en points
  (`boulders.points_value`), fixée par l'ouvreur/l'admin, invisible des
  grimpeurs, rapportée intégralement si réussi — **sans dégression aux
  essais**. Raison : la cotation est cachée en compétition ("Mystère"), donc
  un barème par couleur ne reflète pas la difficulté réelle perçue ; l'ouvreur
  fixe directement les points à la place.
- **Personnalisé** : barème par couleur propre à la compétition
  (`competitions.custom_scoring`, `{base, deduction}` par couleur), avec sa
  propre dégression aux essais — pré-rempli avec le barème par défaut à
  l'ouverture du menu.

## 2. Où vit `points_value` (mode "Blocs validés"), et pourquoi il s'efface

Deux origines de blocs de compétition (voir CLAUDE.md, section "Boulders: one
collection, several lifecycles") :

- **Bloc créé pour l'épreuve** (`type: 'competition'`) : `points_value` est un
  champ obligatoire du formulaire (`CompetitionBoulderForm.tsx`) quand le mode
  est actif, et reste sur ce doc pour toujours — le doc lui-même est
  intégralement scopé à cette compétition.
- **Bloc quotidien réutilisé** (`type: 'daily'` + `competition_active`) : le
  même doc physique peut être retagué dans une compétition future, avec un
  mode ou une valeur différente. `points_value` est donc **effacé
  (`deleteField()`)** à chaque sortie de compétition : retrait manuel
  (`handleConfirmRemove`) et "Terminer la compétition"
  (`handleConfirmMigrate`, les deux branches — bloc réutilisé *et* bloc créé
  pour l'épreuve qui redevient quotidien). Sans ça, un ancien réglage
  survivrait silencieusement sur une compétition sans rapport.

## 3. Verrouillage — même patron que `liveDisplayEnabled`

`scoring_mode`/`custom_scoring` ne sont plus modifiables une fois
`status != 'à venir'`, **appliqué côté `firestore.rules`** (pas seulement un
bouton désactivé côté UI) :

```
allow update: if request.auth != null &&
  (((isUserRole("admin") || isUserRole("ouvreur")) &&
    (resource.data.status == 'à venir' ||
     !request.resource.data.diff(resource.data).affectedKeys()
       .hasAny(['liveDisplayEnabled', 'scoring_mode', 'custom_scoring']))) ||
   ...)
```

Testé dans `frontend/test/scoring-mode-lock.test.ts`, calqué mot pour mot sur
`live-display-flag-lock.test.ts` (mêmes 6 cas : admin/ouvreur avant
déclenchement, admin/ouvreur après, client jamais, autres champs toujours
modifiables après déclenchement).

## 4. Ce qui a été explicitement écarté — le mode officiel

Discuté avec l'utilisateur puis reporté sur sa propre décision : le comptage
IFSC/FFME classe par nombre de tops, puis nombre de zones, puis essais-au-top
et essais-à-la-zone en départage — un tri multi-critères, pas une addition de
points. L'app ne capture aujourd'hui que réussite + nombre d'essais par bloc,
pas de notion de "zone atteinte". Le construire demanderait :

- un nouveau champ à saisir à la validation (zone oui/non, en plus de
  réussi/échoué),
- un algorithme de classement différent (tri, pas somme) dans
  `competitionClassement.ts`, incompatible avec `ScoreEntry { score: number }`
  tel qu'il existe — nécessiterait probablement un type de retour distinct.

Rien n'a été préparé en amont pour ce mode (pas de champ réservé, pas de
branche `ScoringMode` fantôme) — un futur chantier repartira de zéro sur ce
point précis plutôt que de compléter une ébauche.

## 5. Fichiers modifiés (commit `b98fed7`, 15 fichiers)

- `frontend/src/utils/climbingPoints.ts` : `calculateCompetitionPoints`,
  `ScoringMode`, `CustomScoringTable` — séparé de `calculatePoints`
  (inchangé).
- `frontend/src/utils/competitionClassement.ts` : `scoringMode`/
  `customScoring` en paramètres optionnels de `getParticipantScores`/
  `getClassementByCategory` (défaut `'blocabrac'`, rétrocompatible).
- `frontend/src/pages/AdminCompetitionManagement.tsx` : bouton → menu,
  formulaires création/édition, verrou UI (`isScoringModeEditable`).
- `frontend/src/pages/Ouvreur/CompetitionBoulders/CompetitionBoulderForm.tsx` :
  champ `points_value` (blocs créés pour l'épreuve).
- `frontend/src/pages/Ouvreur/CompetitionBoulders/CompetitionBouldersList.tsx` :
  colonne `points_value` inline (blocs quotidiens réutilisés), effacement à
  la sortie de compétition.
- `frontend/src/pages/AdminCompetitionStats.tsx`,
  `frontend/src/pages/Ouvreur/CompetitionBoulders/CompetitionStats.tsx`,
  `frontend/src/pages/AdminCompetitionLiveDisplay.tsx` : lecture du mode,
  transmission aux calculs de classement.
- `frontend/src/pages/Client/Competitions/ClientCompetitions.tsx` : aperçu de
  points pendant la validation, respecte désormais le mode (affichage
  uniquement, n'affecte pas `competition_results`).
- `firestore.rules` : verrou serveur (section 3 ci-dessus).
- Tests : `climbingPoints.test.ts`, `competitionClassement.test.ts` (nouveaux
  cas), `frontend/test/scoring-mode-lock.test.ts` (nouveau fichier).
- `CLAUDE.md` : nouvelle section "Competition scoring modes (`scoring_mode`)".
- `frontend/package.json`/`package-lock.json` : version → `2.33.0`.

Build/lint/`npm test` (70 tests)/`npm run test:rules` (71 tests) tous verts
avant commit et déploiement.

## 6. Ce qui reste ouvert

- **Mode officiel IFSC/FFME** (section 4) — non commencé, pas de préparation
  en amont.
- Tout ce qui était déjà ouvert dans le handoff précédent (section 6 de
  `HANDOFF-quota-ecritures-version-2026-08-15.md`) reste ouvert et inchangé
  par ce chantier : écran live TV matériellement pas encore testé en salle
  (§8 de `CONCEPTION-ecran-live-competition.md`), multi-salles, stockage
  durable des sauvegardes d'images, lecture non bornée au premier montage de
  `ClientDaily`, correction admin des résultats après verrouillage.

Aucun bug trouvé en vérifiant ce chantier (contrairement aux deux handoffs
précédents) — feature nouvelle plutôt que correctif sur code existant, portée
volontairement réduite à 3 modes sur 4 discutés.
