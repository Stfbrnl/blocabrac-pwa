# Retour ClaudeNav — après lecture du DOM

> Rédigé le 03/10/2026, en réponse au `RETOUR-labels-dom-lu.md`.
>
> **§1 : une conséquence concrète que le retour n'a pas tirée — la spécification du filet doit
> changer, sinon il sera rouge sur 73 libellés corrects.**
> **§3 : le §6 « hors sujet » mérite d'être remonté, et le correctif proposé le ferait
> disparaître des tests.**

---

## §1 — ⚠️ L'assertion du §4.1 doit accepter `aria-labelledby`, sinon elle reproduit l'heuristique de Chrome

C'est la conséquence directe du §3, et elle n'y est pas écrite.

Si l'assertion se formule *« tout `<label>` porte un `for` qui résout vers un champ »*, elle
sera **rouge sur les 73 libellés que vous venez d'établir comme corrects** — puisque le motif
MUI pour un `Select` est précisément de ne pas poser de `for`. Elle reproduirait exactement
l'heuristique de Chrome, c'est-à-dire le défaut qu'on vient de disqualifier.

**Spécification correcte :**

> Un libellé est considéré comme associé s'il satisfait **l'une** des deux conditions :
> - il porte un `for` qui résout vers un **élément étiquetable** (`input`, `select`,
>   `textarea`, `button`, `meter`, `output`, `progress`) ;
> - **ou** il porte un `id` référencé par l'`aria-labelledby` d'un élément interactif.
>
> Et la vérification « tout champ porte un `id` ou un `name` » **exclut les éléments
> `aria-hidden`** (votre §6.3).

Formulée ainsi, l'assertion est **meilleure que l'outil de Chrome** : elle vérifie ce qui
compte pour un lecteur d'écran — qu'un contrôle porte un nom accessible — sans exiger le
mécanisme particulier par lequel ce nom lui arrive.

Et elle garde sa valeur de filet : elle sera rouge sur les quatre vrais défauts du §4, où il
n'y a **ni `for`, ni `aria-labelledby`**. C'est bien là qu'on veut la voir rouge d'abord.

---

## §2 — Mon §0.2 était faux, et l'erreur mérite d'être nommée précisément

Vous le démontrez sur trois relevés concordants : le nœud était bien l'`InputLabel`, et ce que
j'ai pris pour sa règle propre était une règle **d'ancêtre** listée par DevTools.

L'erreur est instructive parce que **ma prémisse était vraie** : `background-color` n'est
effectivement pas héritée en CSS. J'en ai tiré « donc le blanc ne peut pas venir d'un ancêtre,
donc le nœud inspecté est celui qui le déclare, donc c'est le `body` ». Le maillon manquant :
**le volet Styles de DevTools affiche aussi les règles des ancêtres**, et y barre ce qui ne se
transmet pas. Le blanc venait d'une règle `body` *listée sous* le nœud, pas appliquée à lui.

Une prémisse vraie employée pour autoriser une inférence fausse — et c'est précisément sa
justesse qui rendait la conclusion convaincante. C'est le troisième relevé de DevTools que
j'interprète de travers en deux jours. Pour la suite : **je ne conclurai plus d'un volet de
l'inspecteur sans que soit précisé lequel, et sur quel nœud sélectionné.**

---

## §3 — Le §6 n'est pas hors sujet, et le correctif n°1 effacerait la preuve

C'est la trouvaille la plus importante du retour, et elle est rangée en dernier avec une
étiquette qui la minimise.

**Ce qui est en jeu** : un compte dont `roles` ne contient pas `client` rend l'application
**totalement inutilisable** — pas dégradée, bloquée, écran scintillant. `Home` pousse vers
`/client/screen`, `ProtectedRoute` renvoie vers `/`, `Home` repousse.

**Et cet état est atteignable en deux clics depuis l'écran admin.** L'invariant « tout compte
porte `client` » est tenu par une **convention d'écriture**, pas par une contrainte : rien
n'empêche de décocher `client` sur un compte ouvreur dans `AdminUsers.tsx`. La personne
concernée ne pourrait alors plus ouvrir l'application du tout, et le seul recours serait une
édition directe dans la console Firebase.

⚠️ **Et le prochain chantier planifié est précisément celui qui touchera aux rôles** : « droits
d'accès, rôle ouvreur trop large », en attente du gérant. La bombe est latente aujourd'hui et
le prochain lot est celui qui l'amorce.

### 3.1 — Attention au correctif n°1 : il ferait disparaître le symptôme, pas la cause

Corriger le seed en `roles: ['ouvreur', 'client']` est présenté comme « sûr ». Il l'est — mais
il supprime **la seule chose qui a jamais exercé ce chemin**. Après ce correctif, plus aucun
test ne produira de compte sans `client`, et le défaut redeviendra invisible.

C'est le motif documenté quatre fois dans ce projet : un signal qu'on fait taire plutôt que la
cause qu'il désignait.

**L'ordre correct** : corriger l'application d'abord, puis **garder délibérément un compte sans
`client`** dans un test, comme cas d'épreuve — et asserter qu'il aboutit à un écran et non à
une boucle.

### 3.2 — L'invariant à inscrire, qui vaut au-delà de ce cas

> **Une cible de redirection doit être une page terminale, jamais une route qui redirige à son
> tour.**

`ProtectedRoute` renvoie vers `/`, qui redirige. Mettre `replace` au lieu de `push` ne change
rien, vous le notez justement : le ping-pong demeure. Les deux correctifs sont complémentaires
et le second est le robuste :

1. `Home` aiguille **selon le rôle** au lieu de supposer `client` ;
2. `ProtectedRoute` renvoie vers une **page d'accès refusé** — un écran qui dit « ton compte
   n'a pas accès à cet espace, contacte l'accueil » et qui ne redirige vers rien.

Le second supprime la classe entière : aucune combinaison de rôles, présente ou future, ne peut
plus produire de boucle.

---

## §4 — Votre §7 point 4 est l'acquis de la journée

> **« 4 → 3 » s'est produit, et le motif était faux.**

Mon critère de sortie ne prédisait qu'un compteur, et il a été satisfait par un **reclassement**
de Chrome plutôt que par une correction. C'est un défaut de ma méthode, pas de son application.

La règle qui en sort est générale et dépasse ce chantier :

> **Un critère de sortie doit prédire *tous* les compteurs observables, y compris ceux dont on
> n'attend aucun mouvement. Un seul compteur qui bouge dans le sens espéré mesure l'espoir.**

C'est le pendant exact de la règle du 02/10 — *écrire l'écart attendu d'avance, puis attribuer
l'écart* — appliquée aux cas où l'on observe plusieurs grandeurs à la fois. À verser dans
`CLAUDE.md` avec les autres.

Et votre hiérarchie des preuves mérite d'y figurer telle quelle : **le DOM rendu a tranché, la
source de la bibliothèque a induit en erreur, la documentation n'a pas servi, et un compteur
allant dans le bon sens a failli valider un motif faux.**

---

## §5 — Ce que devient le chantier

| | |
|---|---|
| **À corriger** | les **4** libellés sans `id` du §4 — `ClientCourseSession` ×2 (en boucle), `ClientProfile` ×2. Motif : `id` + `labelId`, **jamais** `htmlFor`. |
| **À documenter** | deux déviations imputables à MUI — le `Select` labellisé par `aria-labelledby`, et le textarea fantôme de `TextareaAutosize`. Avec leur raison, à la manière des `KNOWN_EXCEPTIONS`. |
| **À livrer** | le filet du §4.1, **avec la spécification du §1 ci-dessus**. |
| **À abandonner** | `htmlFor` sur les 77 ; `eslint-plugin-jsx-a11y` (zéro `<label>` brut, il ne verrait rien) ; tout critère formulé en « zéro signalement Chrome ». |
| **À remonter** | la boucle de redirection (§3), qui n'est pas de l'hygiène. |

Le chantier s'est réduit de 77 corrections à 4, et son produit principal est désormais le
filet plus les deux déviations consignées. C'est un résultat, pas une déception : **on a surtout
établi que 73 libellés qu'on croyait fautifs étaient corrects.**
