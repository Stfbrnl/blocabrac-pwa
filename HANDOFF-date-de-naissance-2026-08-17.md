# Handoff — État des lieux passage `age` → `dateOfBirth` (V2.42, aucun code modifié)

> Rédigé le 17/08/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur / ClaudeNav). Répond à `SUIVI-date-de-naissance.md` (tes trois
> vérifications §1/§2/§3). **Aucune modification de code effectuée** — l'utilisateur
> a demandé un état des lieux d'abord, et une relecture croisée avec toi avant tout
> changement.

---

## Résumé en trois phrases

Ta prémisse (deux champs qui divergent silencieusement, à la `role`/`roles`) ne
s'est pas concrétisée : le code lit déjà `dateOfBirth` en priorité via un utilitaire
unique (`getSeasonAge`), et plus aucun site n'écrit `age` sur un compte — la
migration de code de ton §1 est donc déjà quasi faite, sans que la note qui te l'a
signalé le sache. En creusant ton §3, j'ai trouvé une vraie fuite : la date de
naissance complète (pas seulement l'âge dérivé) est lisible par n'importe quel
compte client connecté via `classement_profiles`. Mesure prod pour ton §2 : 1 compte
sur 12 a déjà `dateOfBirth`, 0 mineur pour l'instant.

---

## §1 — Deux sources : le risque n'est pas là où tu l'attendais

- Le champ s'appelle `dateOfBirth`, pas `birthdate`.
- `utils/ageCategory.ts` a déjà `getSeasonAge(dateOfBirth, legacyAge, referenceDate)` :
  dérive l'âge depuis la date, replie sur l'ancien `age` seulement si `dateOfBirth`
  est absent. C'est très exactement l'utilitaire unique et testé que tu réclamais en
  Option A — déjà écrit, déjà utilisé partout où l'âge sert (catégories FFME,
  affichage admin, classement).
- **Vérifié par grep sur tout `frontend/src`** : `Register.tsx`, `AdminUsers.tsx`
  (création + édition), `ClientProfile.tsx` n'écrivent plus jamais `age` — seulement
  `dateOfBirth`. Le champ `age` ne subsiste que comme valeur legacy *lue* en repli
  sur les 11 comptes qui n'ont pas encore de date. Il n'y a donc plus de site qui
  réécrit un `age` figé aujourd'hui : pas de divergence qui s'aggrave dans le temps,
  contrairement au scénario `role`/`roles` que tu décrivais.
- Un bug de tri mineur trouvé en vérifiant : dans `AdminUsers.tsx`, le tri de la
  colonne "Âge" (`requestSort('age')`) trie sur `user.age` brut au lieu de l'âge
  dérivé par `getSeasonAge` — l'affichage de la cellule est correct, seul l'ordre
  est faux pour les comptes n'ayant qu'une `dateOfBirth`. Pas corrigé (pas
  bloquant, en attente de ton avis avant tout lot de correctifs).
- **Conclusion sur le choix A/B** : la question ne se pose quasiment plus. Le code
  se comporte déjà comme si l'option A avait été prise (dérivation systématique
  depuis `dateOfBirth`), sans que `age` ait été supprimé du schéma — c'est de facto
  une position hybride qui fonctionne, sans les inconvénients de l'option B (pas de
  recalcul périodique nécessaire, puisque rien ne relit `age` en dehors du repli).
  Est-ce suffisant à tes yeux, ou tiens-tu à la suppression complète du champ pour
  fermer le sujet formellement (renommer les 11 champs `age` restants, retirer
  `age?: number` des interfaces `User`) ?

## §2 — Comptes sans date de naissance

- `AdminUsers.tsx` a déjà un `TextField type="date"` en création **et** en édition
  → ta question "l'admin peut-il saisir la date de naissance d'un grimpeur ?" est
  déjà résolue, avant même que tu poses la question. Pas de blocage au comptoir.
- Repli propre déjà en place partout où `dateOfBirth` peut manquer (`?? null` sur
  les écritures Firestore, `getSeasonAge` retourne `undefined` proprement,
  `getFfmeCategory` retourne la catégorie "inconnue" plutôt que planter) — même
  logique que le genre non renseigné, comme tu le demandais.
- **Mesure prod** (script lecture-seule jetable, service account existant,
  `firestore-migration/count-dob.js`, gitignored) :

  ```
  { total: 12, clients: 12, withDob: 1, clientsWithDob: 1,
    withLegacyAgeOnly: 11, withNeither: 0, minorsWithDob: 0 }
  ```

  12 comptes, 1 seul a déjà `dateOfBirth`, 11 n'ont que l'ancien `age`, 0 mineur
  actuellement dans `dateOfBirth`. Ni un non-sujet ni un vrai chantier de masse —
  et de toute façon aucune migration en masse n'est possible : on ne peut pas
  reconstituer une date de naissance depuis un âge figé. La saisie restera
  volontaire/progressive, comme prévu par ta note.
- Contrôle YBT (16 ans et plus, refus explicite si date absente) : **pas encore
  implémenté** — logique, ça appartient au chantier droits d'accès pas encore
  démarré, pas à ce périmètre.

## §3 — Ta priorité absolue : confirmée, une vraie fuite trouvée

Tu avais raison de la mettre en premier. Deux points distincts :

1. **Lecture de `users` lui-même** : pas de problème. `firestore.rules` restreint
   déjà `users/{userId}` à `request.auth.uid == userId` ou staff
   (`admin`/`moniteur`/`ouvreur`) — un client ne peut pas lire le `users` d'un
   autre client. Les 7 `getDocs` non filtrés que tu listais (`CompetitionStats.tsx`,
   `AdminUsers.tsx`, etc.) sont tous dans des écrans réservés au staff.

2. **`classement_profiles/{uid}` — fuite réelle, correspond exactement à ton
   scénario.** Cette collection a `allow read: if request.auth != null` (n'importe
   quel compte connecté, y compris un simple client, peut lire le profil de
   n'importe qui d'autre — c'est le pattern de mirroring documenté dans
   `CLAUDE.md`, légitime pour le classement). Le problème : elle contient
   maintenant `dateOfBirth` **en clair, jour/mois/année**, écrit à trois endroits
   (`Register.tsx`, `ClientProfile.tsx`, `AdminUsers.tsx`). J'ai vérifié le seul
   lecteur (`ClientClassement.tsx`) : il n'utilise ce champ que pour calculer
   `getSeasonAge`/catégorie FFME côté client — la date brute n'est **jamais**
   affichée nulle part. C'est donc une exposition inutile (le strict nécessaire
   serait l'âge de saison ou la catégorie déjà dérivés, pas la date exacte),
   touchant potentiellement des comptes de mineurs dès qu'ils rempliront leur date.

   Correctif envisagé, pas encore fait : stocker dans `classement_profiles` un
   `seasonAge`/`ffmeCategory` dérivé (calculé au même moment que l'écriture
   actuelle, par le même code) au lieu du `dateOfBirth` brut, et retirer ce dernier
   champ du document. Impact : les 3 sites d'écriture + `ClientClassement.tsx` (lire
   le champ dérivé au lieu de recalculer) + potentiellement une petite migration
   d'écriture pour les documents `classement_profiles` déjà existants qui portent
   `dateOfBirth`.

## Point annexe signalé, pas encore recontextualisé

`CONCEPTION-droits-acces-abonnements.md`, que ta note cite comme source du §3/§7,
**n'existe pas dans ce repo** (ni fichier tracké, ni dans l'historique git).
L'utilisateur m'a dit que ce point vous serait transmis après la mise à jour de
tout ceci — je ne l'ai donc pas traité, je le mentionne pour mémoire.

---

## Questions pour toi avant toute modification

1. Es-tu d'accord avec la lecture de `classement_profiles.dateOfBirth` comme une
   vraie fuite à corriger (pas juste un choix de design déjà arbitré) ? Si oui, le
   correctif "stocker le dérivé, pas le brut" te semble-t-il le bon niveau, ou
   préfères-tu une restriction de règle Firestore en plus/à la place ?
2. Sur le §1 : suppression complète de `age` (nettoyage des 11 comptes restants +
   interfaces `User`), ou statu quo (le repli suffit, rien ne le réécrit) ?
3. Le bug de tri "Âge" dans `AdminUsers.tsx` : je le corrige dans le même lot que
   la fuite, ou séparément (c'est cosmétique, aucun impact données) ?

Rien n'est corrigé pour l'instant — j'attends ton retour (et le document droits
d'accès annoncé) avant d'écrire le moindre correctif.
