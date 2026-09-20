# Handoff ClaudeNav — État ludique : backfill en simulation, purge prête (non lancée)

> Session Claude Code (Codespace), 17/09/2026. Suite de
> `HANDOFF-etat-ludique-2026-09-12.md` (Passe C déployée le 12/09, V2.61).
> Demande utilisateur : relancer `backfill-ludic-state.js` en simulation pour voir où en
> est la migration, **sans rien écrire**. Aucune décision de purge prise — l'utilisateur a
> explicitement dit d'attendre.

---

## 1. Ce qui a été exécuté

Deux scripts, **tous deux en mode simulation** (sans `--fix`, donc aucune écriture réelle
en prod), depuis `scripts/` avec les identifiants `firestore-migration/serviceAccountKey.json`
(prod, pas l'émulateur — confirmé par l'absence de `FIRESTORE_EMULATOR_HOST`) :

```
node backfill-ludic-state.js
node purge-legacy-ludic-fields.js
```

Plus une investigation manuelle ad hoc (scripts jetables, supprimés après usage, jamais
committés) pour comprendre la NATURE des écarts trouvés par le backfill — voir §3, c'est le
point qui mérite le plus d'attention.

---

## 2. Résultat brut

**`backfill-ludic-state.js` (simulation)** :
- 16 comptes portent encore au moins un champ ludique legacy sur `users`
  (`weeklyGoalItems`, `wallCounts`, `rouletteChallengesCompleted`, `rouletteRecentChallenges`).
- 5 déjà identiques (au sens `JSON.stringify` du script) dans `user_ludic_state`.
- 11 signalés « différents » — auraient été écrits avec `--fix`.

**`purge-legacy-ludic-fields.js` (simulation)** :
- 16 comptes candidats (même liste).
- **0 champ signalé comme "jamais migré"** (la seule garde-fou du script : il ne supprime
  jamais un champ absent de `user_ludic_state`) → **les 16 comptes seraient intégralement
  purgeables** avec `--fix`, sans avertissement.

---

## 3. Pourquoi le chiffre "11 différents" du backfill ne veut pas dire ce qu'on pourrait
   croire — creusé à la main, pas pris au chiffre brut

Le risque de lecture naïve : "11 comptes différents entre `users` et `user_ludic_state`" =
"du vieux code écrit peut-être encore sur `users`, prudence". J'ai vérifié compte par
compte plutôt que de m'arrêter à ce chiffre.

- **10 des 11 sont des faux positifs** : mêmes valeurs, mêmes totaux par mur dans
  `wallCounts`, la seule différence est l'**ordre des clés** de l'objet JS (Firestore ne
  garantit aucun ordre stable ; le script compare par `JSON.stringify` brut, sensible à
  l'ordre — un défaut de la comparaison, pas une vraie dérive de donnée). Vérifié sur deux
  comptes en détail (comparaison champ par champ, y compris un `weeklyGoalItems` — tableau,
  donc l'ordre y est légitimement significatif, et il était identique) et sur les 8 restants
  en comparant la somme des valeurs de `wallCounts` (identique dans les 8 cas).
- **1 compte réellement différent, dans le bon sens** (`nP1TFARqrTgVTZf4Q9dcY1DVju52`) :
  `user_ludic_state.wallCounts` est **en avance** sur la copie figée de `users`
  (`{"Réta Adultes":6}` côté `users` vs `{"Dévers 15°":8,"Réta Adultes":7}` côté
  `user_ludic_state`, `updated_at: 2026-09-12T14:08:13Z`). Ce grimpeur a validé des blocs
  **après** le backfill du 12/09, et c'est bien exclusivement `user_ludic_state` qui a
  bougé — la preuve la plus concrète que le nouveau code (Passe C) est la seule chose qui
  écrit désormais, `users.wallCounts` restant figé sur sa valeur du backfill.

**Conclusion de l'investigation : aucune preuve, sur les 16 comptes, que du vieux code écrit
encore sur `users`.** C'est exactement le signal attendu avant de purger (`PLAN-etat-
ludique-hors-users.md` §6, retour ClaudeNav du 12/09).

⚠️ **Point à signaler pour un futur passage** : si `backfill-ludic-state.js --fix` avait été
relancé maintenant (il ne l'a pas été), il aurait **régressé** le compte
`nP1TFARqrTgVTZf4Q9dcY1DVju52` — réécrit la valeur figée et périmée de `users` par-dessus
la valeur plus récente de `user_ludic_state`. Le script n'a aucun garde-fou de sens
(contrairement à `purge-legacy-ludic-fields.js`, qui ne supprime jamais un champ absent
ailleurs) : il écrase dans les deux sens sans distinction. Pas un bug à corriger dans
l'urgence — le script est un outil de rattrapage ponctuel pour la fenêtre de déploiement,
pas un outil à relancer aveuglément une fois Passe C stabilisée — mais à garder en tête si
quelqu'un le relance par réflexe plus tard sans ce contexte.

---

## 4. État de la décision

**Purge non lancée — l'utilisateur a explicitement demandé d'attendre.** Techniquement,
d'après cette investigation, les conditions du plan sont réunies :
1. Passe C déployée et confirmée live depuis 5 jours (V2.61, 12/09).
2. Aucune trace de vieux code encore actif sur les 16 comptes vérifiés.
3. `purge-legacy-ludic-fields.js` en simulation ne signale aucun champ non migré.

Rien à faire côté agent tant que l'utilisateur ne donne pas le feu vert pour
`purge-legacy-ludic-fields.js --fix`. Une fois la purge faite, il restera la dernière étape
du plan : **remesurer le volume réseau d'`AdminUsers.tsx`** (déjà notée comme ouverte).

---

---

## 5. Retour ClaudeNav (même jour) : durci suite à revue

ClaudeNav a durci la conclusion du §3 : le script était **dangereux**, pas seulement
"à surveiller" — il écrasait dans les deux sens sans distinction, et rien dans son nom ni
son emplacement (`scripts/`, à côté d'outils qu'on relance sans y penser) ne le signalait.
Deux corrections demandées, faites le jour même dans `scripts/backfill-ludic-state.js` :

1. **Garde-fou structurel, pas un commentaire.** Plutôt que la piste suggérée (refuser
   `--fix` si un `updated_at` est postérieur au dernier passage — dépend d'un état
   persisté externe et d'un horodatage à faire confiance), choix d'un garde-fou plus fort
   et sans dépendance externe : **le script ne remplit désormais qu'un champ ABSENT de
   `user_ludic_state` ; un champ déjà présent n'est plus jamais réécrit, même avec `--fix`,
   quelle que soit sa valeur.** Exact symétrique du garde-fou déjà présent dans
   `purge-legacy-ludic-fields.js` (qui ne supprime jamais un champ absent ailleurs), lu
   dans l'autre sens. Un champ présent des deux côtés mais divergent est signalé
   (`⛔`), jamais résolu silencieusement dans un sens ou l'autre.
2. **Comparaison corrigée** : `canonicalize()` trie récursivement les clés des objets
   (`wallCounts`) tout en préservant l'ordre des tableaux (`rouletteRecentChallenges`, où
   l'ordre est significatif) — élimine la source des 10 faux positifs sur 11 du §3.

**Revérifié en simulation contre la prod avec le script corrigé** : `0 compte avec un champ
à combler`, `1 champ signalé comme divergent` (exactement le compte `nP1TFARq...` identifié
à la main au §3 — confirmé automatiquement en un lancement, plus besoin d'investigation
manuelle). **Testé aussi contre l'émulateur** (compte à champ absent → comblé ; compte à
champ présent divergent → non touché) avant de faire confiance au comportement `--fix`
contre la prod.

`CLAUDE.md` § "Ludic-state migration" mis à jour en conséquence (statut Passe C corrigé —
il était resté écrit "pas encore déployé" alors qu'il l'est depuis le 12/09 — et nouveau
paragraphe sur le garde-fou).

**Conséquence pratique** : le script est maintenant sûr à relancer à tout moment, y compris
avec `--fix` — mais la décision d'attendre la purge reste inchangée (§4), ce n'est pas ce
qui a changé aujourd'hui.

---

## Points ouverts par ailleurs (inchangés)

- **Purge état ludique** : prête, en attente du feu vert utilisateur (§4).
- Clic « Redémarrer la saison » — à vérifier si déjà fait par l'utilisateur mi-septembre.
- Défis `fenetre` / `bloc_designe` : toujours en prod sans e2e navigateur.
- Chantier droits d'accès (rôle ouvreur trop large) — en attente du gérant.
- `topo-blocabrac.pdf` sans police Dosis ; `aide-connexion-installation.html` hors charte.
- Un projet Firebase par salle vs mutualisé ; fork « Grimpe ! ».
- Sauvegarde durable des images Cloudinary (`--backup`).
