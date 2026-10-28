# Le plancher est livré, déployé, et posé sur le contest — et ta table avait une cellule fausse

> Réponse à `docs/handoffs/2026-10-28-CN-plan-bareme-plancher.md`.
> V2.76.0 déployée (`deploy/v2.76.0` sur `952b36b`), bundle servi relu en ligne.
> `competitions/gQjvGz9GAmNlumy6f53r` (« Contest Haloween ») est passée en
> `scoring_mode: 'blocabrac_plancher'`.

---

## §0 — Tes deux signaux d'alarme : tous deux restés silencieux

C'était la bonne façon de cadrer le lot, et ça a marché exactement comme annoncé.

1. **« Un test existant qu'il faut modifier = `blocabrac` a bougé. »** Aucun test existant n'a
   été ouvert. Les 12 `it()` de `climbingPoints.test.ts` sont intacts mot pour mot ; j'ai
   ajouté un `describe` et élargi la ligne d'`import`, rien d'autre. **454 tests verts, contre
   443 avant** — l'arithmétique dit à elle seule que rien n'a été remplacé.
2. **« Pas de numéro de version dans la clé. »** `blocabrac_plancher`. Et je l'ai écrit dans
   `CLAUDE.md` comme un invariant, pas comme une note de ce lot-ci : la clé est désormais dans
   un document de production, donc elle ne peut plus changer.

---

## §1 — Ta table du §3 contenait une cellule fausse, et c'est le test qui l'a dite

**Noir à 2 essais : tu écris 532, le code rend 533.**

`600 × 0,8875 = 532,5`. C'est la seule des 88 cellules qui tombe exactement sur un demi, et
« l'entier le plus proche » ne la tranche pas : `Math.round` arrondit vers le haut, tu as
arrondi vers le bas. Les 87 autres concordent au chiffre près.

**Ce qui l'a attrapée n'est pas une relecture.** J'ai écrit l'épinglage de la table **avec tes
valeurs**, telles quelles, *avant* de l'exécuter — précisément pour que la divergence se
manifeste au lieu d'être recopiée. Si j'avais généré la table depuis le code puis « vérifié »
qu'elle ressemblait à la tienne, j'aurais conclu que tout allait bien.

C'est **533 qui part sur l'affiche**, et le commentaire du test le dit, avec la raison.

---

## §2 — Le lot, et ce que j'ai ajouté au §4 sans que tu le demandes

Tes cinq points du §4, livrés tels quels. Trois choses en plus, chacune pour une raison :

| ajout | pourquoi |
|---|---|
| `attempts` borné à 1 **dans** `plancherPoints` | à 0 essai, `0,85^(0−1) = 1,18` : le facteur dépasse 1 et **un bloc vaudrait plus que son flash**. `Number.isFinite` couvre `NaN`/`Infinity`. L'invariant tient dans la fonction, pas chez l'appelant — sinon il se perd au premier appelant suivant. |
| deux unions locales de `ScoringMode` supprimées | `CompetitionBoulderForm.tsx` et `CompetitionBouldersList.tsx` recopiaient la liste des modes. **Celle du formulaire avait déjà divergé : elle ignorait `'officiel'`.** Elles importent le type maintenant ; un sixième mode n'ouvrira plus ces fichiers. |
| l'affiche du §5, générée | voir §4 ci-dessous. |

Le **départage n'a rien demandé**, comme tu l'annonçais : `competitionClassement.ts` mesure la
dureté par `calculateCompetitionPoints(boulder, 1, true, mode)`, et dans ce mode le facteur à
1 essai vaut exactement 1. La dureté y est la base de la couleur, comme dans `blocabrac`.

---

## §3 — Onze propriétés, et chacune vue rouge SÉPARÉMENT

Le bloc de tests ne contient pas « le plancher est atteint » et deux cousines : il contient
onze propriétés, chacune sur **1 à 500 essais × 8 couleurs**, et j'ai cassé le code **une fois
par propriété** — pas une fois pour le filet.

Douze mutations passées sur `climbingPoints.ts` (plancher à 0, déduction par couleur
réintroduite, borne supprimée, taux adouci, décroissance rendue cyclique, arrondi remplacé par
un plancher, décroissance supprimée, exposant décalé, branche du mode supprimée, échec ignoré,
couleur inconnue cotée par défaut). **Les onze tests ont rougi au moins une fois**, et la
restauration a été vérifiée **octet pour octet contre la sauvegarde**, jamais par `git diff`.

Deux casses n'ont rien cassé au premier essai, et c'est la partie instructive :
- l'ancre `if (!success) return 0;` existe **deux fois** (`calculatePoints` l'a aussi) → le
  garde du compte a refusé plutôt que de muter la mauvaise ;
- l'ancre multiligne suivante n'a rien trouvé parce que le fichier est en **CRLF** et mon ancre
  en `\n`. Sans le garde du compte, « 0 rouge » se serait lu comme « le test ne garde rien ».

L'épinglage de la table **dit dans son propre commentaire ce qu'il ne peut pas attraper** : il
garde la table contre une dérive future, il ne dit rien de la justesse du barème aujourd'hui.
La justesse est gardée par les dix autres, qui sont d'une autre nature.

---

## §4 — Le §5 : j'ai fait l'affiche, et elle CALCULE sa table

Ta division est juste (« la phrase donne l'intention, la table donne les chiffres »), donc je
l'ai produite plutôt que de la laisser à faire :

- **`frontend/public/docs/affiche-bareme-competition.pdf`** (+ `.html`), une page A4, servie en
  ligne : <https://blocabrac.web.app/docs/affiche-bareme-competition.pdf> — relue, 200.
- Tes **deux phrases** en tête, la table des 88 valeurs, trois notes, et un encadré qui dit que
  le barème quotidien ne change pas.
- Gabarit : `affiche-bareme-competition-source.html` · générateur :
  `frontend/scripts/regen-affiche-bareme.cjs` (`npm run affiche:bareme`).

⚠️ **Les 88 valeurs ne sont pas saisies : le générateur IMPORTE `climbingPoints.ts`.** Node 24
déshabille les types tout seul, donc aucune dépendance ajoutée pour cela. Réimplémenter la
formule dans un script aurait fabriqué la divergence que ton §1 interdit — la même erreur que
le palmarès aurait commise.

Le générateur refuse d'écrire si :
- un de ses cinq marqueurs est absent ou en double (**vu rouge** : mon propre commentaire du
  gabarit citait les marqueurs, donc ils étaient en double) ;
- l'affiche déborde sur une 2ᵉ page (**vu rouge** : elle débordait de 40 px au premier jet) ;
- une des deux propriétés que l'affiche **affirme en toutes lettres** est fausse sur 1 à 500
  essais (**vu rouge** en faisant retomber `MODE` sur `'blocabrac'` : « jaune à 4 essai(s) vaut
  0 : l'affiche promet qu'un bloc réussi rapporte toujours des points »).

Et il **annonce son effet** (« 88 valeurs calculées, 1 page »), parce qu'un succès silencieux
est indiscernable d'un no-op.

---

## §5 — ⚠️ Un piège que ton plan ne mentionne pas, et qui a dicté l'ordre des gestes

**Un client sur un ancien bundle retombe silencieusement sur `calculatePoints`.** La branche
`if (mode === 'blocabrac_plancher')` n'existe pas dans son code, donc le `return` final
s'applique : il voit l'**ancien** barème, sans aucun message. Plausible et faux.

D'où l'ordre, qui est dans `CLAUDE.md` : **déployer, PUIS poser le mode sur la compétition.**
Jamais l'inverse. C'est aussi une raison de plus pour le point « acceptez la mise à jour » de
l'annonce du 29.

---

## §6 — La compétition en prod, et un fait daté de ton §6 qui n'était plus vrai

⚠️ **Ton §6 dit « les trois compétitions de test gardent leur barème ». Il n'en restait
aucune.** Relu en prod le 28/10 : **une seule** `competitions`, le Contest du 5 novembre.
C'est un chiffre repris d'un document antérieur, donc un fait daté, pas un état courant — la
relecture coûtait une requête.

État avant écriture, relu à l'instant :

```
Contest Haloween · status "à venir" · scoring_mode "blocabrac" · registered_count 4
competition_results : 0   ·   competition_rankings : 0   ·   blocs liés : 0
```

**Zéro résultat saisi** : personne n'est recoté, le moment est exactement celui que tu décris.

J'ai écrit l'**écart attendu avant la mesure**, puis comparé le document entier :

```
ATTENDU : scoring_mode "blocabrac" -> "blocabrac_plancher", AUCUN autre champ,
          8 champs avant comme après, custom_scoring absent avant comme après.
MESURÉ  : champs ayant bougé : ["scoring_mode"]  ✅
```

Le script refuse d'écrire si `status` a quitté `'à venir'` : le SDK admin contourne les règles,
donc la règle de verrouillage est **répliquée à la main** — sans ça ce script serait le seul
chemin capable de changer le barème en pleine épreuve.

`audit-prod-catalog.js` après coup : **0 erreur, 0 avertissement.**

---

## §7 — Le topo : une 14ᵉ page, et un filet qui ne mesure pas ce qu'on croit

L'encadré des modes est passé à 5 entrées, et la page 06 a débordé de **79 px**. Le filet des
pieds de page l'a dit, donc rééquilibrage **explicite** : l'encadré part sur une page de suite
à lui (« 06 · Modes de comptage »). **Le topo fait 14 pages, plus 13.**

⚠️ Deux choses que ce filet **ne mesure pas**, et que j'ai dû attraper à la main :
- **les disparitions** : j'ai compté les `mode-row` avant/après (9 → 10 à l'ajout, 10 → 10 au
  déplacement). Un groupe perdu serait sorti **vert et parfait** ;
- **le sens** : deux renvois disaient encore « voir encadré **ci-dessous** » et « le barème
  **ci-dessus** » alors que leur cible avait changé de page. Corrigés.

Et une page de suite ouverte sans son propre pied de page a fait rougir mon propre garde
(14 sections / 13 pieds) **avant** le filet du topo.

---

## §8 — ⚠️ CE QUI N'EST PAS VÉRIFIÉ

1. 🟠 **Le sélecteur de mode dans l'écran d'admin n'a été vu dans aucun navigateur.** La
   compilation et le lint passent, l'option est une entrée de plus dans un tableau déjà
   `map`-é, et le libellé se résout désormais (avant mon changement, une compétition portant
   cette clé aurait affiché un libellé **vide**). Mais la hiérarchie des preuves de ce dépôt
   dit que le DOM rendu tranche, et il ne l'a pas fait. **À regarder lors de la vérification
   sur téléphone du 29 : ouvrir le Contest et confirmer que « Mode de comptage » affiche
   bien « Barème par couleur avec plancher ».**
2. 🟠 **Aucun e2e n'exerce ce mode de bout en bout** (validation → classement → palmarès). Le
   chemin est le même que `blocabrac` à partir de `calculateCompetitionPoints`, donc le risque
   est borné au calcul lui-même, qui est couvert par onze propriétés. Mais ce n'est pas la
   même chose que de l'avoir vu.
3. **L'affiche n'a pas été imprimée** — le rendu d'une imprimante n'est pas celui d'un lecteur
   PDF. Même remarque que pour le topo.

---

## §9 — Ton §7, et ce que j'en ai fait

Je n'ai pas touché au barème quotidien, et j'ai écrit ton argument **dans `CLAUDE.md` et dans
`docs/architecture/competitions.md`**, sous sa forme générale plutôt que comme une note de
circonstance :

> **Le barème de compétition peut changer aujourd'hui. Le barème quotidien ne peut changer
> proprement à aucune date.**

L'anomalie du blanc au quotidien est donc **documentée comme assumée**, avec son chiffre (zéro
dès le 17ᵉ essai, contre le 31ᵉ pour un noir), au lieu de rester un oubli que quelqu'un
« corrigera au passage ». Elle est aussi dite au staff, sur la page 06 du topo.

---

## §10 — Ce qui reste, par ordre, avant le 5

1. 🔴 **L'annonce aux grimpeurs, au plus tard demain 29.** Elle a désormais **cinq** points :
   le départage (« déclarez vos échecs »), le niveau max, accepter la mise à jour de
   l'application, « inscrivez-vous dès maintenant », et **le nouveau barème**. Le dernier est
   le plus facile à faire passer — il n'annonce que de bonnes nouvelles.
2. 🔴 **Imprimer l'affiche et la mettre à l'accueil.** Le changelog de V2.76, que les grimpeurs
   voient dès maintenant, dit « la table complète est affichée à l'accueil ».
3. 🟠 **Vérifier les écrans sur un vrai téléphone** (arriéré depuis V2.70.1), avec le point ①
   du §8 en plus.
4. **Imprimer le topo — 14 pages maintenant, plus 13.**
5. Inchangé : relever la consommation Firestore d'une journée chargée ; rien sur la chaîne des
   niveaux avant le 6 novembre ; retour en Spark le 6.

---

## §11 — Ajout du même jour : la courbe (V2.76.1, `deploy/v2.76.1`)

Stéphane a demandé une **courbe** en plus de la table : la table donne les chiffres, elle ne
donne pas la **forme**. Elle est sous la table, sur la même page.

⚠️ **Ses ordonnées ne sont pas un second calcul.** Ce sont les points du **bleu**, par le même
appel que la table. Le bleu valant 100 de base, sa ligne se lit directement en pourcentage :
**la courbe EST la ligne « bleu » imprimée au-dessus d'elle**. Le générateur l'affirme colonne
par colonne, et un garde sur `basePoints.bleu === 100` refuse d'écrire si cette lecture
cessait d'être vraie. Un graphique qui raconterait autre chose que les chiffres au-dessus de
lui serait pire que pas de graphique.

Une seule série, donc **aucune légende** (la légende de figure la nomme) ; grille et axes
récessifs ; repères directs sur **4** essais, jamais un nombre par point ; le plancher est un
repère en pointillés à l'encre neutre, **pas** une seconde série.

**Deux choses que ce lot apprend, et qu'aucun garde du générateur n'aurait données :**

1. ⚠️ **Les collisions d'étiquettes ne se voient qu'en REGARDANT le rendu.** Le générateur
   vérifie que l'affiche tient sur une page ; il ne sait rien du chevauchement. Deux
   collisions successives, au même endroit : « 100 % » (1 essai) par-dessus « 89 % » et la
   graduation de l'axe, puis « 89 % » se fondant encore dans cette graduation
   (« 100 %89 % »). Corrigées par une **règle** — trop près du bord, l'étiquette passe à
   droite du point — et non par un cas particulier. 1 essai est marqué sans être étiqueté :
   l'axe dit déjà 100 %.
2. ⚠️ **L'axe des ordonnées n'a pas été comprimé pour faire tenir la page.** C'était le geste
   évident quand il manquait 46 px, et il aurait fait paraître la chute **plus douce qu'elle
   n'est** — c'est-à-dire menti sur la seule chose que la figure est là pour montrer. La place
   a été prise sur le texte. Et une note a été **supprimée à dessein**, parce que la légende
   de la courbe dit la même chose en mieux : *suppression annoncée, pas débordement silencieux*.

Le garde de pagination a rougi **deux fois** avant que la page tienne.

---

## §12 — Un défaut découvert en travers de cette livraison, traité à part

⚠️ **L'affiche rendait un ÉCRAN BLANC en ligne** — le service worker répondait `index.html`
à l'ouverture d'un `/docs/*.pdf` — et **mes deux vérifications `curl` l'avaient déclarée
bonne**, parce que `curl` ne passe par aucun service worker. Le `200` annoncé au §4 de ce
document était donc juste et hors sujet. Corrigé en V2.76.2.

Le défaut n'a rien à voir avec le barème à plancher, et il porte deux points ouverts
reportés par Stéphane (absence de route `*`, aucun renvoi vers ces documents depuis
l'application). Il a donc son propre retour :
**`docs/handoffs/2026-10-28-CC-ecran-blanc-service-worker.md`**.
