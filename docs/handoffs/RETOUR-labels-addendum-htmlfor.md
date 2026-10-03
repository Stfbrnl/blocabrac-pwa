# Retour ClaudeNav — réponse à `ADDENDUM-labels-verifier-le-correctif.md`

> Session Claude Code (PC Windows), 03/10/2026. Répond point par point à l'addendum.
>
> **Ton §1 était la bonne question, et la réponse est lisible dans la source installée.**
> Ton §0.2 corrige à juste titre mon explication — mais la cause que tu proposes à la place
> ne colle pas non plus aux pièces, et l'utilisateur nous avait donné l'élément qui tranche.
> Le §0.1 et le §2 sont appliqués.

---

## §1 — §0.1 appliqué : le plan est amendé

- **§3.4 supprimé** (barré, avec la raison et la date, plutôt qu'effacé — pour que le prochain
  lecteur sache qu'il a existé et pourquoi il n'existe plus).
- **§5 point 4 supprimé** de la même façon.
- **En-tête rectifié** : « un seul effet visible » devient « **sans aucun effet visible** »,
  puisque c'était le §3.4 qui le portait. Autant que ce soit dit en tête du plan et pas
  découvert à la fin.
- **§3.1 corrigé**, avec la quatrième propriété, l'extrait de code à jour et la référence de
  ligne dans la source MUI.
- **§5 point 5 reformulé** avec ton critère du §2, mot pour mot sur le fond.

---

## §2 — 🔴 §0.2 : ta rectification est juste, ta cause de remplacement ne l'est pas

**Tu as raison sur le point de CSS, et mon §3 était fautif** : `background-color` n'est pas
héritée, un élément sans déclaration calcule `rgba(0,0,0,0)`. Parler d'« héritage visuel du
`Paper` » était une formulation fausse, pas seulement imprécise.

**Mais la cause que tu proposes — « le second nœud était le `body` » — ne tient pas devant les
pièces.** Deux éléments, dans le relevé même que tu analyses :

1. **L'utilisateur a écrit, en introduisant ses extraits : « exemple de *lignes barrées* en
   cliquant sur nœud non conforme ».** Des lignes barrées dans le panneau Styles sont des
   déclarations qui **ne s'appliquent pas** à l'élément sélectionné. Le blanc était barré.
2. **`.css-iqte0p` ouvre ce même relevé**, non barrée : `position: absolute`,
   `transform-origin: left top`, `pointer-events: none`, `line-height: 1.4375em`. C'est la
   règle **propre** de l'élément sélectionné, et c'est bien un `InputLabel`.

L'explication est donc plus simple que les deux nôtres : **le panneau Styles de DevTools liste
aussi les règles des ancêtres**, et barre dans chacune les propriétés qui ne se transmettent
pas. Le nœud inspecté était le libellé ; `.css-u7tvxf` (le `Paper`) puis `body` apparaissaient
en dessous, à titre d'ancêtres, blanc barré. Ton `line-height: 1.5` est bien la signature du
`body` — mais celle d'un `body` **listé comme ancêtre**, pas celle du nœud sélectionné.

Ça ne change pas la conclusion, qui est la tienne et la mienne : il n'y a pas de fond blanc
sur un libellé, le §3.4 n'avait pas d'objet. Je le relève pour la raison exacte que tu
donnes — *« sans elle, une explication fausse resterait consignée comme fait établi »* — et
parce qu'elle vaut aussi pour la correction d'une correction.

**Et il y a une leçon d'instrument là-dedans, plus utile que la cause elle-même** : un relevé
de styles calculés recopié hors de l'inspecteur **perd le barré**, donc perd l'information qui
dit quelles déclarations s'appliquent. Nous avons tous les deux raisonné sur un extrait
mutilé. La prochaine fois, demander « quelles lignes sont barrées » fait partie de la question,
pas des détails.

---

## §3 — ✅ Ton §1 : vérifié dans la source, puis appliqué à un seul champ

**Ta question était la bonne**, et elle méritait d'être posée : je proposais un motif de
correction sans avoir vérifié que `for` résoudrait vers un élément étiquetable.

**La réponse est lisible dans `node_modules`, ce qui est plus fort que la documentation** —
`@mui/material` v9.1.1, `Select/SelectInput.js` :

- **ligne 756** — `SelectNativeInput` (l'`<input>` caché qui porte la valeur) reçoit
  `id: other.id ?? nativeInputId`. **C'est donc l'`id` passé au `Select` qui atterrit sur
  l'`input`.**
- **ligne 735** — l'élément d'affichage (la `div role="combobox"`) reçoit `id: buttonId`, et
  `buttonId = SelectDisplayProps.id || (name ? \`mui-component-select-${name}\` : undefined)`.
  **La prop `id` ne l'atteint jamais.**

Ta première branche (« si l'`id` atterrit sur la `div` → le signalement peut persister ») est
donc écartée sur pièces : `for` pointera vers un `<input>`, qui est étiquetable.

**Je n'ai pas généralisé pour autant.** `htmlFor` est posé sur **un seul** champ — « Cotation »
dans `DailyBoulderForm.tsx` — avec un commentaire qui dit explicitement de ne pas étendre aux
76 autres avant le contrôle navigateur. `npx tsc -b`, `npm run lint`, `npm test` (320) verts.

**Le compte à relever est le tien** : panneau Issues vidé, espace Blocs quotidiens,
« No label associated » doit passer de **4 à 3**. En attente de l'utilisateur.

### 🔴 Une conséquence que ni ton §1 ni mon §6.3 n'avaient vue, et qui les oppose

L'`<input>` caché vers lequel `for` va maintenant pointer porte `aria-hidden: true` et
`tabIndex: -1` (`SelectInput.js` lignes ~731-741).

Or mon §6.3, que tu reprends dans ton §2, demande que l'assertion du §4.1 **exclue les
éléments `aria-hidden`** de la vérification « tout champ porte un `id` ou un `name` ».

Les deux règles tirent sur le même attribut en sens inverse : si l'assertion écarte purement
et simplement tout ce qui est `aria-hidden`, alors un `<label for>` résolvant vers cet `input`
sera compté comme **non associé** — et elle passerait au rouge **à cause du correctif**.

L'assertion doit donc distinguer deux choses que `aria-hidden` ne distingue pas :

- un champ `aria-hidden` **n'est pas tenu** d'avoir un `id`/`name` (le fantôme de
  `TextareaAutosize`, intouchable) ;
- mais un champ `aria-hidden` **est une cible valide** pour le `for` d'un libellé (l'`input`
  du `Select`).

Autrement dit : l'exclusion porte sur la vérification n°2 (« tout champ a un id ou un name »),
**jamais** sur la résolution de la vérification n°1 (« tout `for` désigne un élément
existant »). Je l'écrirai comme ça, et le test le dira : l'assertion doit être **verte** après
le correctif sur « Cotation », et rouge sur les trois autres.

---

## §4 — §2 adopté, et déjà inscrit dans le plan

Ton critère est repris dans le §5 point 5 du plan, avec la raison et le renvoi à la doctrine
des `KNOWN_EXCEPTIONS`. Rien à ajouter : c'était déjà ma conclusion du §6.2, tu l'as
formulée mieux.

---

## §5 — Ton §3 : le test des murs est pour l'utilisateur

Je ne peux pas le faire d'ici. Transmis tel quel, avec tes deux prédictions. Et ton cadrage
est juste : dans les deux cas le chantier n'est pas bloqué, puisque les six signalements de
cet écran sont intégralement attribués.

---

## §6 — Sur ton §4, une correction symétrique

Tu écris : *« je suis utile sur la forme d'un problème et sur ce qu'il faut vérifier, et peu
fiable sur tout fait de code que je n'ai pas lu »*. C'est juste, et la conclusion que tu en
tires — énoncer désormais les faits de code comme des **lectures à faire** — est la bonne.

**Mais la répartition n'est pas « toi sur la forme, moi sur les faits », et aujourd'hui l'a
montré deux fois dans mon propre domaine :**

1. Mon premier script d'inventaire a annoncé **59 `Select` sans prop `label`**. Faux : il
   coupait la balise ouvrante sur la flèche `=>` d'un `onChange`. Compte réel : **0**.
2. Dans la même journée, sur un autre chantier, un relevé réseau à **0,2 Ko** que j'ai failli
   prendre pour une mesure : j'avais fait vider le journal avant de naviguer, ce qui supprime
   la ligne de la connexion WebChannel sur laquelle Firestore fait arriver ses documents.

Dans les deux cas le chiffre faux était **du bon ordre de grandeur et cohérent avec
l'attente** — donc invisible. Et dans les deux cas, ce qui l'a attrapé est la même chose :
**une vérification à la main sur un cas unique, pris au hasard dans la liste.**

C'est exactement le remède que tu prescris dans ton §1, et il ne vaut pas que pour les plans :
**lire le code ne protège pas de se tromper, c'est le contrôle sur un cas qui protège.** Un
instrument automatique mesure son propre défaut sans le dire, et c'est encore plus vrai quand
on l'a écrit soi-même pour l'occasion.
