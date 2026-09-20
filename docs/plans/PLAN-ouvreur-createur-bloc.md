# Plan — Attribution d'un bloc à son ouvreur

> Rédigé le 13/09/2026 par la session Claude (navigateur), à partir d'un retour du gérant
> de la salle.
> À destination de Claude Code dans le Codespace.
>
> **Le besoin** : à la création d'un bloc, pouvoir désigner **l'ouvreur qui l'a réellement
> ouvert**, choisi dans un menu déroulant listant les comptes portant le rôle ouvreur.
>
> **La raison** : permettre à des membres du staff de saisir les blocs le soir quand
> l'ouvreur officiel n'a pas eu le temps de le faire, **sans lui retirer la paternité de son
> travail**.
>
> **Coût** : un champ sur `boulders`, aucune lecture supplémentaire côté grimpeur (le
> document du bloc est déjà chargé). Une lecture par écriture si la validation serveur est
> retenue — voir §5.

---

## §1 — Le principe : ajouter, ne pas remplacer

⚠️ **Le point le plus important du plan.**

Le document `boulders` porte probablement déjà une trace de **qui l'a créé** (à vérifier —
`created_by` ou équivalent, sur le modèle de `entitlements.created_by` ou
`client_badges.awardedBy`).

**Conserver cette trace et ajouter un champ distinct.** Les deux informations ne sont pas
la même chose :

| Champ | Sens | Écrit par |
|---|---|---|
| `created_by` (existant) | qui a **saisi** le bloc dans l'application | automatique, uid connecté |
| `openedBy` (nouveau) | qui a **ouvert** le bloc sur le mur | choisi dans le menu |

C'est ce qui rend le dispositif honnête. En cas de litige sur une attribution, la trace de
saisie répond à « qui a désigné cet ouvreur ». Écraser l'une par l'autre priverait de cette
réponse — et c'est exactement le genre d'information qu'on regrette de ne pas avoir.

**Si `created_by` n'existe pas encore sur `boulders`, l'ajouter dans le même lot.**

---

## §2 — Modèle de données

### Sur `boulders/{id}`

```
openedBy: {
  uid: string,
  displayName: string,   // dénormalisé, figé à la saisie
} | null
```

**Le nom doit être dénormalisé.** Le résoudre à l'affichage supposerait de lire `users`,
restreint au staff (`request.auth.uid == userId || isUserRole(...)`) — **un grimpeur ne
verrait rien**. Stocker le nom est ce qui permet l'affichage côté client à coût nul.

Conséquence assumée : un ouvreur qui change de nom garde l'ancien sur ses blocs passés.
Cohérent avec `firstAscents`, `classement_profiles` et le reste du projet.

**`null` est une valeur valide** : les blocs existants n'ont pas ce champ, et un ouvreur
peut légitimement ne pas renseigner (bloc ancien, ouvreur extérieur, doute). L'affichage
doit le supporter sans message d'erreur.

### Alimentation du menu déroulant

Requête sur `users` filtrée sur le rôle ouvreur.

⚠️ **Fusionner `roles[]` et le champ scalaire `role` hérité** — c'est la convention du
projet, et c'est exactement le bug qui avait vidé la liste des destinataires dans
`MoniteurScreen.tsx`. Modèle : `MessagesList.tsx`.

Cette requête est faite **par un ouvreur, sur un écran staff** : les règles l'autorisent
déjà, et la fréquence est faible (ouverture d'un formulaire). Aucun enjeu de quota.

---

## §3 — Le cas de l'ouvreur qui quitte la salle

**Point facile à manquer, et il faut le trancher explicitement.**

Si le menu est construit à partir des comptes portant actuellement le rôle ouvreur, un
ouvreur dont on retire le rôle **disparaît de la liste** — mais son nom **reste sur les
blocs déjà créés**, puisqu'il y est dénormalisé.

**C'est le bon comportement** : la paternité d'un travail ne s'efface pas quand son auteur
change de poste.

La question à trancher est l'autre sens : **peut-on encore attribuer un nouveau bloc à
quelqu'un qui n'est plus ouvreur ?** Réponse recommandée : non, et la liste s'en charge
toute seule sans code supplémentaire.

**À vérifier** : l'affichage d'un bloc dont l'`openedBy` ne correspond plus à aucun compte
ouvreur actif ne doit pas casser. Il affiche le nom stocké, point.

---

## §4 — Où l'afficher, et la question que ça soulève

**À trancher avec le gérant avant d'implémenter** — c'est une décision de produit, pas
technique.

### Option A — côté ouvreur seulement

Le champ apparaît dans les listes et formulaires ouvreur, et dans les statistiques. C'est un
**outil de gestion** : savoir qui a ouvert quoi, équilibrer les secteurs entre ouvreurs.

### Option B — visible aussi par les grimpeurs

Le nom apparaît sur la fiche du bloc. C'est une **signature**, et c'est probablement ce que
vise le gérant puisqu'il parle de légitimité et de propriété intellectuelle.

⚠️ **Dans le cas B, une question de consentement se pose**, comme pour les premiers
ascensionnistes : un ouvreur veut-il nécessairement voir son nom affiché à tous les
grimpeurs ? Pour un professionnel qui signe son travail, la réponse est probablement oui —
**mais ça se demande plutôt que ça ne se suppose**.

Si un doute existe, la voie la plus simple est un réglage par ouvreur (affichage public
oui/non), sur le modèle de `firstAscentOptIn`. À ne faire que si le besoin est réel : ne pas
ajouter un consentement dont personne ne veut.

### Cas particulier — les blocs de compétition

Un bloc `type: 'competition'` a une cotation cachée. **Le nom de l'ouvreur ne révèle rien
de la difficulté**, donc il n'y a pas d'objection de principe à l'afficher — contrairement
aux premiers ascensionnistes.

À confirmer tout de même auprès du gérant : dans une compétition, savoir qui a ouvert un
bloc peut être une information que l'on préfère garder pour après l'épreuve.

---

## §5 — Règles Firestore : ce qu'elles peuvent et ne peuvent pas

**Elles peuvent** vérifier que `openedBy.uid` correspond à un compte portant le rôle
ouvreur, via un `get()` dans la règle d'écriture. Coût : **une lecture par écriture de
bloc** — négligeable, les blocs sont créés par le staff, quelques dizaines par rotation.

**Elles ne peuvent pas** empêcher un ouvreur d'en désigner un autre à tort. Le contrôle est
**social**, et à l'échelle d'une salle c'est suffisant — tout le monde sait qui a ouvert
quoi.

**Recommandation** : ajouter la validation `get()`, qui empêche au moins une valeur
aberrante ou un uid inventé, et ne pas chercher plus loin. Ajouter les tests
correspondants dans `firestore.rules.test.ts`, sur le modèle des tests `challenges`.

⚠️ Vérifier que la règle gère le cas `openedBy == null` sans planter — c'est exactement le
piège rencontré en V2.27, où `resource.data.submitted != true` faisait échouer toute
l'évaluation quand le champ n'existait pas. Utiliser `resource.data.get('openedBy', null)`
ou un garde explicite.

---

## §6 — Point de vigilance hors périmètre technique

**Le rôle ouvreur donne accès à plus que la saisie de blocs.**

D'après `firestore.rules` et les écrans existants, il ouvre notamment la lecture de
`client_boulder_results`, `competition_participants` et `competition_results`, ainsi que
l'onglet « Classement Compétitions » qui affiche un classement nominatif complet.

**Élargir le rôle ouvreur à des membres du staff pour qu'ils puissent saisir les blocs
élargit donc aussi ces accès.** Ce n'est pas un défaut de cette fonctionnalité — c'est une
conséquence de la distribution du rôle, et **le gérant doit le savoir avant de le
distribuer largement**.

Si c'est un problème, la réponse propre serait un rôle « saisie » distinct — mais c'est un
chantier bien plus lourd (règles, `ProtectedRoute`, `Navbar`, `AdminUsers`, invariant
`hasClientRole()`). **Ne pas l'engager sans que le besoin soit confirmé.**

Rappel : cet écart entre l'intention (« l'ouvreur ne devrait voir que ses propres blocs »)
et l'implémentation avait déjà été relevé le 14/08, et l'utilisateur avait choisi le statu
quo. Cette fonctionnalité en augmente la portée.

---

## §7 — Implémentation

1. **Vérifier l'existence de `created_by`** sur `boulders` ; l'ajouter si absent (§1).
2. **Schéma** : `openedBy` sur `boulders`, nullable (§2).
3. **Formulaires** : menu déroulant dans `DailyBoulderForm.tsx` **et**
   `CompetitionBoulderForm.tsx` (même traitement dans les deux, comme pour le correctif
   d'annotation de V2.58 — le second est systématiquement oublié).
   - liste alimentée par les comptes ouvreurs, fusion `roles[]` + `role` ;
   - **valeur par défaut : l'utilisateur connecté s'il est ouvreur** — c'est le cas le plus
     fréquent, et ça évite une saisie inutile ;
   - une entrée « non renseigné » explicite.
4. **Mode édition** : le champ doit être modifiable après coup — c'est tout l'intérêt, un
   ouvreur pourra corriger une attribution faite par un tiers.
5. **Règles + tests** (§5).
6. **Affichage** selon l'option retenue au §4.
7. **Listes ouvreur** (`DailyBoulderForm.tsx` « Blocs existants », `CompetitionBouldersList.tsx`) :
   afficher le nom, utile pour repérer les blocs non attribués.
8. `ClientHelp.tsx` si l'option B est retenue, `changelog.ts`, `CLAUDE.md`.

---

## §8 — Vérification

- **Test unitaire** sur la fonction de construction de la liste des ouvreurs : fusion
  `roles[]` / `role`, compte sans nom, liste vide.
- **Tests de règles** : un ouvreur peut créer un bloc avec un `openedBy` valide ; il ne
  peut pas désigner un uid qui n'est pas ouvreur ; `openedBy` absent ou `null` est accepté ;
  un client ne peut toujours pas écrire sur `boulders`.
- **e2e** : étendre le parcours ouvreur existant — créer un bloc en désignant un autre
  ouvreur, vérifier la valeur en base, puis modifier l'attribution.
- **Contrôle visuel** : un bloc ancien sans `openedBy` s'affiche normalement, et un bloc
  attribué à un ancien ouvreur (rôle retiré) aussi.

---

## §9 — Ce qui reste à décider par l'utilisateur et le gérant

1. **Affichage côté grimpeur ou non** (§4) — c'est la question qui détermine la nature de la
   fonctionnalité.
2. **Consentement de l'ouvreur** si l'affichage est public (§4).
3. **Blocs de compétition** : nom affiché pendant l'épreuve, ou seulement après (§4) ?
4. **Distribution du rôle ouvreur** : le gérant a-t-il conscience des accès que ça ouvre
   (§6) ?

---

## Points ouverts par ailleurs (inchangés)

- **Migration de l'état ludique** : Passe C déployée en 2.61. Purge en attente — relancer
  `backfill-ludic-state.js` **en simulation** périodiquement ; tant qu'il trouve des écarts,
  quelqu'un tourne encore sur l'ancien code. Puis backfill final, purge, et **mesure réseau
  sur `AdminUsers.tsx`**. Date butoir et règle durable à inscrire dans `CLAUDE.md`.
- **Bandeau de mise à jour** : correctif `registerType: 'prompt'` à appliquer
  (`CORRECTIF-bandeau-mode-prompt.md`) — **non observable à la transition suivante**, il
  faut attendre celle d'après.
- **`PLAN-premiers-ascensionnistes.md`** : commencer par son §2 (expressivité des règles sur
  l'émulateur), qui conditionne tout le reste.
- **Clic « Redémarrer la saison »** — après vérification du nombre de profils.
- **Contrôle visuel des annotations** après le correctif V2.58.
- Surveiller le profil recalé de −190 au prochain passage mensuel de la réconciliation.
- Défis `fenetre` / `bloc_designe` : en production sans e2e navigateur.
- Chantier droits d'accès — en attente du gérant.
- `topo-blocabrac.pdf` sans la police Dosis ; `aide-connexion-installation.html` hors charte.
- Un projet Firebase par salle vs mutualisé, et le fork « Grimpe ! ».
- Sauvegarde durable des images Cloudinary (`--backup`).

## Conventions rappelées

- Commentaires en français, marqueurs `// ✅` sur les changements notables.
- Bumper `package.json` (`V2.XX`) à chaque commit versionné.
- `npm run build` avant de considérer une modification terminée ; `npm run lint`,
  `npm test`, `npm run test:rules` selon la portée.
- Toute requête « tous les utilisateurs de rôle X » doit fusionner `roles[]` et le champ
  scalaire `role` hérité.
- Vérifier par `git diff` qu'aucun garde-fou de test temporairement levé n'est resté.
