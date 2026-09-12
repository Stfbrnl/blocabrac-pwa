# Plan — Premiers ascensionnistes sur les blocs difficiles

> Rédigé le 09/09/2026 par la session Claude (navigateur), à partir d'un retour utilisateur
> reçu en salle.
> À destination de Claude Code dans le Codespace.
>
> **Le besoin** : sur l'écran de validation d'un bloc de couleur difficile (noir, blanc,
> rose), afficher les **cinq premiers grimpeurs** l'ayant validé, dans l'ordre, avec leur
> nom et la date de leur première validation. Sur option — un grimpeur choisit d'y
> apparaître ou non.
>
> ⚠️ **Correction de cadrage importante : ce n'est pas un compteur incrémental.** C'est une
> **liste ordonnée plafonnée à 5**. La forme des données est différente, et c'est ce qui
> rend la fonctionnalité très bon marché — voir §1.
>
> **Coût : ~0 lecture supplémentaire, au plus 5 écritures par bloc sur toute sa vie.**
> Moins cher que la Roulette.

---

## §1 — Pourquoi ce n'est pas un compteur, et pourquoi c'est bon marché

Un compteur s'incrémente indéfiniment. Ici, la liste **se ferme après cinq entrées** : le
sixième grimpeur et tous les suivants ne déclenchent aucune écriture.

### L'emplacement décide de tout

**Stocker la liste sur le document du bloc** (`boulders/{id}.firstAscents`) :

| Poste | Coût |
|---|---|
| Lectures | **0** — le document du bloc est déjà chargé par `ClientDaily.tsx` |
| Écritures | **≤ 5 par bloc, définitivement** |
| Index | aucun |

Ordre de grandeur : ~15 blocs durs par rotation × 5 = **75 écritures par cycle de
rotation**, face à un plafond de 20 000 par jour.

### Les alternatives, et pourquoi elles sont écartées

**Interroger `client_boulder_results`** (`where boulder_id`, `orderBy createdAt`,
`limit 5`) : **bloqué par les règles**. Un client ne peut pas lire les résultats d'un autre
— c'est la raison d'être même de `classement_profiles`. S'y ajouteraient un index composite
et la résolution des noms depuis `users`, également restreint.

**Sous-collection `boulders/{id}/first_ascents/{uid}`** : plus propre en intégrité
(documents immuables, `update, delete: if false`, impossible de réécrire l'histoire), mais
**5 lectures à chaque ouverture de fiche** et **une écriture par grimpeur sans plafond**.
À retenir seulement si le §2 se révèle infaisable.

---

## §2 — ⚠️ À VÉRIFIER EN PREMIER : l'intégrité du tableau côté règles

**C'est le point qui décide de la faisabilité. À tester sur l'émulateur avant d'écrire quoi
que ce soit d'autre.**

Écrire sur `boulders` est aujourd'hui réservé au staff. Il faut ouvrir une écriture client
strictement bornée. Le motif existe déjà (`challenges.progress`, V2.46) :

```
allow update: if request.auth != null
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['firstAscents'])
  && request.resource.data.firstAscents.size() <= 5
  && request.resource.data.firstAscents.size() == resource.data.get('firstAscents', []).size() + 1
  && <la nouvelle entrée porte uid == request.auth.uid>
```

### La question ouverte

Les règles Firestore savent vérifier la **taille** d'une liste et l'**appartenance** d'un
élément. **Ce que je ne peux pas garantir, c'est la vérification que le préfixe existant
n'a pas été réécrit** — il n'existe pas d'opérateur de découpe, et l'indexation par
position est limitée.

Concrètement, sans cette garantie : un client qui remplace `[A, B, C]` par `[X, Y, Z, moi]`
passerait le contrôle de taille (3 → 4).

**À tester explicitement sur l'émulateur** :

- la concaténation de listes (`resource.data.firstAscents + [entrée]`) est-elle supportée
  dans une comparaison d'égalité ?
- l'indexation (`request.resource.data.firstAscents[0]`) fonctionne-t-elle ?

**Si oui** : la règle peut être rendue étanche, écrire la version stricte.
**Si non** : deux options, à trancher avec l'utilisateur —

1. **Accepter**, au titre de la doctrine de confiance déjà retenue (classement saisonnier,
   compteur de défis relevés). Réécrire la liste demande de forger une écriture Firestore à
   la main ; et dans une petite salle, tout le monde sait qui a fait quoi.
2. **Basculer sur la sous-collection** (§1), étanche par construction, au prix de 5 lectures
   par ouverture de fiche.

⚠️ **Nuance importante par rapport aux décisions précédentes** : la doctrine de confiance a
été retenue jusqu'ici pour des **compteurs privés sans enjeu**. Une liste publique de
prestige est **le premier endroit de l'application où mentir rapporte quelque chose**. Ce
n'est pas un blocage, mais c'est un changement de nature à assumer explicitement, pas à
hériter par défaut.

---

## §3 — Modèle de données

### `boulders/{id}.firstAscents`

Tableau, au plus 5 entrées, ordonné par ordre d'arrivée :

```
firstAscents: [
  { uid: string, displayName: string, at: string /* ISO */ }
]
```

**`displayName` est dénormalisé** (figé à l'écriture). Un changement de nom ne se propagera
pas — cohérent avec le reste du projet, et c'est ce qui permet le zéro lecture. Le stocker
est ce qui évite d'aller lire `users`, restreint.

**`uid` est conservé** même s'il n'est pas affiché : il sert au script de purge (§4) et à
détecter que le grimpeur est déjà dans la liste.

### Le consentement — un champ dédié

**Ne pas réutiliser `classementOptIn`** : il couvre le classement général, pas cette liste.
Un grimpeur peut vouloir l'un sans l'autre.

Nouveau champ sur le profil, par exemple `firstAscentOptIn: boolean`, **défaut `false`**
(personne n'apparaît sans l'avoir choisi), réglable depuis « Mes informations ».

⚠️ **L'emplacement dépend du chantier en cours** : si `PLAN-etat-ludique-hors-users.md` est
engagé, ce champ va dans la nouvelle collection. Sinon sur `users`, en notant qu'il ajoute
une ligne au document déjà lu en entier par le staff.

### Couleurs concernées

`['noir', 'blanc', 'rose']` — **dans `gymConfig.ts`, pas en dur dans un composant**. C'est
propre à cette salle, et le fork « Grimpe ! » aura d'autres seuils.

---

## §4 — Le retrait du consentement n'est pas réversible tout seul

Si un grimpeur désactive l'option **après** être entré dans une liste, son nom y reste : il
est figé dans les documents des blocs, et rien ne parcourt l'ensemble des blocs pour l'en
retirer.

**Trois traitements possibles, à trancher :**

1. **L'annoncer clairement** dans l'interface : « votre nom restera sur les blocs déjà
   validés ». Honnête, coût nul.
2. **Script de purge** dans `scripts/` (suivi par git), dry-run par défaut, `--fix`, qui
   retire toutes les entrées d'un uid donné. Cohérent avec l'outillage existant. À lancer à
   la demande.
3. **Les deux** — recommandé. La mention prévient, le script permet d'honorer une demande
   explicite.

⚠️ Le script doit retirer l'entrée **sans réordonner ni combler** : une liste à quatre
entrées est préférable à une promotion automatique du sixième, qui réécrirait l'histoire.

---

## §5 — Les blocs de compétition doivent être exclus

**Une liste de premiers ascensionnistes sur un bloc à cotation cachée renseigne sur sa
difficulté** — c'est exactement ce que le format « Mystère » protège.

Filtrer sur `type === 'daily'`, et ne pas afficher la liste sur un bloc
`competition_active`. À vérifier dans les deux sens : ni affichage, ni écriture.

Rappel du cycle de vie : un bloc quotidien réutilisé en compétition garde `type: 'daily'` +
`competition_active`. Le filtre doit donc porter sur les deux champs.

---

## §6 — Écriture : où, et sous quelles conditions

Dans `ClientDaily.tsx`, au moment de la validation, **au même endroit que les autres
écritures dérivées** (`classement_profiles`, `wallCounts`, défis).

Conditions à réunir **avant** d'écrire (toutes vérifiables localement, sans lecture) :

1. `success === true` ;
2. la couleur du bloc est dans la liste de `gymConfig` ;
3. le bloc est `type: 'daily'` et non `competition_active` ;
4. `firstAscents` compte moins de 5 entrées ;
5. l'uid n'y figure pas déjà ;
6. le grimpeur a `firstAscentOptIn === true`.

Si l'une manque : **aucune écriture**. C'est ce qui borne le coût.

### Points d'attention

**La condition 6 est évaluée à la validation.** Un grimpeur qui active l'option plus tard
n'entrera pas rétroactivement dans les listes des blocs déjà validés. À dire dans
l'interface — sinon ce sera signalé comme un bug.

**Concurrence** : deux grimpeurs qui prennent la 5ᵉ place simultanément. Une transaction
règle proprement le cas. ⚠️ **Si la transaction partagée `flushClassementWrite` est
réutilisée, ajouter la référence du bloc à la liste des lectures — jamais un `get()` en
ligne.** C'est exactement la configuration du bug de V2.46. Le helper V2.48 impose l'ordre
par sa signature ; il suffit de ne pas le contourner.

**Ne pas débouncer cette écriture.** Elle est déclenchée par le clic Réussi, qui est déjà
immédiat, et elle est unique par bloc.

---

## §7 — Affichage

Sur l'écran de détail d'un bloc concerné :

- les entrées **dans l'ordre**, numérotées, avec le nom et la date de première validation ;
- si la liste est vide : une invitation plutôt qu'un vide — « personne n'a encore validé ce
  bloc » ;
- si elle compte moins de 5 entrées : montrer les places restantes, c'est ce qui motive ;
- **mettre en évidence sa propre entrée** si le grimpeur y figure.

Ne pas afficher le bloc entier de la liste sur la carte en vignette — seulement sur la
fiche de détail, pour ne pas alourdir la liste d'un mur.

⚠️ **Un bloc désactivé conserve sa liste.** C'est de l'histoire, et c'est bien. Décider si
elle reste consultable après une rotation (un « palmarès » du mur précédent) ou si elle
disparaît avec le bloc — le premier est plus valorisant, et ne coûte rien puisque le
document existe toujours (invariant « ne jamais supprimer un document `boulders` », V2.56).

---

## §8 — Vérification

**Tests de règles** (`test/firestore.rules.test.ts`), sur le modèle de
`challenges` :

- un client peut ajouter **sa propre** entrée sur un bloc dont la liste compte moins de 5 ;
- il **ne peut pas** ajouter l'entrée d'un autre uid ;
- il **ne peut pas** écrire quand la liste est pleine ;
- il **ne peut pas** modifier un autre champ du bloc dans la même écriture
  (`affectedKeys`) ;
- il **ne peut pas** supprimer une entrée existante ;
- le staff conserve son accès complet.

**Test unitaire** sur la fonction pure décidant si l'écriture doit avoir lieu (les six
conditions du §6) — extraite dans un utilitaire, testable sans Firestore.

**e2e** : étendre `e2e-daily-flow.mjs`. Deux comptes valident successivement un bloc noir,
vérifier l'ordre et le contenu de `firstAscents`. **Ajouter aussi le cas de la liste
pleine** : un sixième compte ne déclenche aucune écriture — c'est la propriété qui borne le
coût, donc celle qu'il faut verrouiller.

---

## §9 — Ordre d'exécution

1. **§2** — tester l'expressivité des règles sur l'émulateur. **Si le résultat est négatif,
   revenir vers l'utilisateur avant de continuer** : le choix entre confiance et
   sous-collection lui appartient.
2. Champ de consentement (§3) + réglage dans « Mes informations ».
3. Règles + tests de règles.
4. Écriture dans `ClientDaily.tsx` (§6) + utilitaire pur + test unitaire.
5. Affichage (§7).
6. e2e (§8).
7. Script de purge (§4) si l'option 2 ou 3 est retenue.
8. `ClientHelp.tsx` + `changelog.ts` + `CLAUDE.md`.

L'étape 1 conditionne tout le reste. Les étapes 2 et 3 ne changent aucun comportement
visible.

---

## §10 — Points à trancher par l'utilisateur

1. **Que faire si les règles ne peuvent pas garantir l'intégrité du tableau** (§2) :
   confiance assumée, ou sous-collection plus coûteuse ?
2. **Retrait du consentement** (§4) : mention seule, script de purge, ou les deux ?
3. **Liste conservée après rotation** (§7) : palmarès historique ou disparition avec le
   bloc ?
4. **Les trois couleurs** sont-elles les bonnes, et faut-il pouvoir les changer sans
   redéploiement ?

---

## Points ouverts par ailleurs (inchangés)

- **Clic « Redémarrer la saison »** ~mi-septembre, après vérification des 28 profils.
- **Test du bandeau de mise à jour** à la transition 2.58 → 2.59.
- **Contrôle visuel des annotations** dans `/ouvreur/daily-boulders/:wall` après le
  correctif V2.58 — les points près du bas de l'image doivent tomber juste.
- Surveiller le profil recalé de −190 au prochain passage mensuel de la réconciliation.
- `PLAN-etat-ludique-hors-users.md` — **interagit avec le §3 de ce plan** (emplacement du
  champ de consentement).
- Défis `fenetre` / `bloc_designe` : en production sans e2e navigateur.
- Chantier droits d'accès — en attente du gérant.
- `topo-blocabrac.pdf` sans la police Dosis ; `aide-connexion-installation.html` hors charte.
- Un projet Firebase par salle vs mutualisé.
- Sauvegarde durable des images Cloudinary (`--backup`).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Tout compteur incrémental doit avoir une assertion e2e sur sa valeur résultante
  (`PROCESSUS-erreurs-avalees.md` §4) — ici, l'assertion porte sur le contenu et l'ordre de
  la liste, **et sur le non-écrasement quand elle est pleine**.
