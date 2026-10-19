# Claude Code — les deux lectures, les boutons, et la répétition générale à 80

> En réponse à `2026-10-19-CN-80-inscrits.md`, `2026-10-18-CN-plan-niveaux-contest.md` et la
> fiche `2026-10-18-CN-contest-5-novembre-a-faire.pdf`.
>
> **Rien n'est déployé.** V2.75 est commitée et construite, la production tourne toujours
> V2.74.2. **Rien n'a touché la chaîne des niveaux** — ton §3 est respecté à la lettre : le
> verrouillage groupé fige `users.level`, il ne le recalcule jamais.
>
> Trois de tes prémisses sont fausses, et deux de tes questions ont une réponse mesurée. Le
> reste est livré.

---

## §1 — La date de naissance est obligatoire. Ton §2 ① est levé.

`Register.tsx:42` la refuse vide, avec `required` sur le champ. C'est le chemin de
l'auto-inscription — **celui que prendront les comptes créés au comptoir le 5.**

Mesuré en production, pas déduit :

| | |
|---|---|
| comptes | 63 |
| sans `dateOfBirth` | 10, **tous les 10 portant le champ hérité `age`** |
| **catégorie « Inconnu » au palmarès** | **0** |
| sans genre | 0 |

Stéphane a posé la question qui tranche vraiment : parmi ces 10, combien ont moins de 20 ans ?
**Trois — et les trois sont des comptes d'essai** (« Bebe », « Enfant », « Ado » Tartanpion,
dans une liste qui contient aussi un Gaspard de 102 ans et une Gertrude de 128). Les deux
seules vraies personnes de la liste ont 33 et 44 ans. **Aucun mineur réel n'est concerné : le
sujet est clos.** Un `age` figé ne dérive que d'un an par an, ce qui ne change pas de bande
pour un adulte.

**Le seul trou, et ce n'est pas le chemin du comptoir** : `AdminUsers.handleCreateUser`
n'exige ni la date ni le genre. Non corrigé **volontairement** — rendre le champ bloquant
gênerait l'admin qui crée un compte sans connaître la date de naissance, dans la file. C'est
deux lignes le jour où Stéphane le décide.

---

## §2 — ⚠️ Le quota a été mesuré, et c'est l'ÉCRITURE qui est tendue, pas la lecture

> « Le quota Firestore du plan Spark devient un risque binaire, **et personne ne l'a jamais
> mentionné.** »

C'est l'inverse, et la correction change ta conclusion. Ce fut un chantier entier en août 2026,
avec des harnais de mesure sous émulateur toujours dans le dépôt
(`test/measure-competition-reads*.mjs`, `-writes*.mjs`, `measure-live-screen-reads.mjs`) et
deux documents (`docs/suivi/SUIVI-quota-lectures-competition.md`,
`docs/suivi/SUIVI-quota-ecritures.md`). **Dimensionné à 90 participants × 35 blocs — plus gros
que l'événement du 5.**

| compteur | plafond/jour | mesuré à 90 participants | marge |
|---|---|---|---|
| lectures | 50 000 | **≈ 3 500** (7 %) | ×14 |
| écritures | 20 000 | **7 470** (37 %), après V2.27/V2.28 | ×2,7 |

Les plafonds sont confirmés sur la doc Google (50 000 lectures, 20 000 écritures), et ils se
**remettent à zéro à minuit heure du Pacifique, soit 9 h du matin en France** : la journée de
quota du contest commence le 5 au matin et porte aussi toute la fréquentation normale de la
salle ce jour-là. C'est un fait opérationnel qu'aucun de nos documents ne disait.

**Et ton suspect n°1 est le mieux construit de l'application.** L'écran live monte deux
`onSnapshot` **une seule fois**, ne refait jamais de requête, et recalcule depuis la mémoire :
le coût d'une soirée y est le nombre de documents modifiés, pas le produit des deux. Son
dimensionnement a son propre document (`docs/plans/CONCEPTION-ecran-live-competition.md` §3)
et son critère de sortie.

Ce que j'ai chiffré moi-même aujourd'hui, par lecture du code aux tailles réelles de la prod
(91 blocs actifs, 934 résultats, 77 au maximum sur un compte) :

| écran | lectures par montage |
|---|---|
| Accueil | ≈ 5 (compte neuf) à ≈ 90 (habitué — il relit tout son historique de réussites) |
| Blocs du jour | **≈ 98**, dont 91 blocs, **non** cache-first |
| Mes compétitions | ≈ 5, + ≈ 25 à la première ouverture de fiche |
| Mes stats | **≈ 170 (médiane) à 280** — un `getDoc` par résultat, N+1 |
| Classement | ≈ 145 |
| Écran live | ≈ 250 au montage, puis ≈ 1 par écriture de la soirée |

**Le vrai poste dominant n'est ni les validations ni l'écran live : c'est le nombre de montages
d'écran.** Et le pire d'entre eux, « Mes stats », est exactement l'écran où vit la chaîne des
niveaux — donc intouchable jusqu'au 6 novembre. C'est noté pour après, pas oublié.

⚠️ **Ce qui reste réellement ouvert, et que ton §1 a raison de vouloir**, c'est le relevé en
console d'une journée chargée : toutes nos mesures sont **mono-utilisateur extrapolées**, et
aucune ne dit rien de la **contention** (Firestore plafonne vers une écriture par seconde
soutenue sur un même document). Seul le jour J ou une vraie salle le montreront.

---

## §3 — Les boutons (V2.75), et les deux questions « AVANT LE 5 » de la fiche

**Le déverrouillage groupé existait déjà ; le verrouillage, non.** Et le faire compte par
compte coûtait **80 × 143 = 11 440 lectures, ~23 % du quota quotidien** — parce que
`handleUpdateUser` relit toute la collection `users` après chaque édition. Ton §4 avait raison
de le dire nécessaire ; il l'était pour une raison de plus que celles que tu donnais.

Trois propriétés, chacune née d'un défaut réel :

1. **Les deux gestes relisent `users` depuis le serveur avant d'agir.** Ton scénario — on
   clique, des gens arrivent, on reclique — est précisément celui où la liste chargée au
   montage ment : les retardataires en sont absents, et l'écran afficherait pourtant un compte
   rendu rassurant. Le déverrouillage d'après-contest avait le même piège, en pire : silencieux
   et définitif.
2. **Les comptes sans rôle `client` sont écartés avant le lot, et annoncés.** Les règles
   refusent une écriture d'admin sur leur document (`hasClientRole`) et un `writeBatch` est
   atomique. ⚠️ **Mesuré en retirant l'exclusion : 6 comptes verrouillés au lieu de 79,
   `permission-denied`, le lot entier perdu.** Il n'y en a **aucun** en production (0 sur 63) —
   c'est exactement pourquoi la production ne peut pas servir de terrain d'essai pour cette
   branche-là, et pourquoi le seed en fabrique deux.
3. **Les deux compteurs des libellés sont complémentaires** : leur somme est le nombre de
   comptes, donc « Verrouiller (0) » dit « personne n'a été oublié » sans écran de plus. C'est
   ton besoin du §4, sans liste à tenir à la main.

### Les deux questions de la fiche, tranchées

> **« Au passage en "en cours", le niveau de départ est-il lu sur `users.level` à ce moment-là,
> ou sur la valeur copiée à l'inscription ? »**

**Sur `users.level`, à cet instant précis** (`utils/competitionLevelSnapshot.ts` :
`estRenseigne(niveauCourant) ? niveauCourant : p.level`, le niveau d'inscription n'étant qu'un
repli pour un compte illisible). → **Corriger les niveaux le soir même suffit. Il n'y a rien à
rafraîchir sur les inscriptions déjà faites.** La procédure du soir est inchangée.

> **« Le verrouillage se fait-il un compte à la fois, ou existe-t-il une action groupée ? »**

Groupée, désormais, et idempotente. Deux clics et deux confirmations pour les 80.

---

## §4 — La répétition générale, à l'échelle réelle : 7/7

`test/seed-repetition-generale.mjs` + `test/e2e-repetition-generale.mjs`. 80 participants,
20 blocs (hybride : blocs de compétition **et** blocs du jour réutilisés), 1 600 résultats, et
la procédure complète du soir — verrouiller, retardataires, recliquer, coup d'envoi, écran
live, déverrouiller.

**L'écran live rend ses 10 premières lignes en 3,2 s sur 1 600 résultats, sans exception.**
C'est ta ligne « le comportement de l'écran live avec 80 lignes » : il tient.

⚠️ **Et le vert ne prouvant rien, chacune des quatre propriétés a été vue rouge SÉPARÉMENT** :
la relecture serveur (pas 4 seul en échec), l'exclusion (6/79), l'annonce des comptes écartés,
et la source du niveau de départ (12 comptes).

> ⚠️ **La dernière ne pouvait pas rougir au premier jet.** Le seed donnait le même niveau à
> `users.level` et à l'inscription : les deux sources étaient indiscernables, et l'assertion
> « le niveau de départ vient de `users.level` » était verte **quelle que soit** la réponse.
> Corrigé en semant 12 inscriptions au niveau périmé. C'est l'angle mort « quels défauts ce jeu
> de données est-il physiquement incapable d'exprimer ? », et il se serait refermé sur la seule
> question que la fiche demandait de trancher.

---

## §5 — Ton §3 bis est livré, et sa mesure est éloquente

Deux scripts branchés dans `firebase.json` :

- **`predeploy` → `list-commits-since-last-deploy.cjs`** : l'inventaire de ce qui part depuis la
  dernière étiquette `deploy/v*`. **Ce n'est pas une garde et il n'échoue jamais** — un
  garde-fou de plus qui refuserait au moindre commit en attente deviendrait un obstacle qu'on
  apprend à contourner. Chaque ligne porte `[app]` ou `[doc]`, parce qu'une file de
  documentation est sans danger et qu'une file qui touche `frontend/src` change ce que les
  grimpeurs reçoivent.
- **`postdeploy` → `tag-deploy.cjs`** : pose `deploy/v<version>`. Jamais en `predeploy` :
  l'étiquette dit « ceci EST en production », la poser avant l'envoi la rendrait fausse au
  premier déploiement qui échoue.

**La mesure du jour, qui est ton argument mieux que n'importe quel raisonnement :**

```
Depuis deploy/v2.74.2 (2026-10-18) : 11 commit(s), dont 1 touchant l'application.
```

⚠️ **Et le rattrapage a révélé un piège dans ta propre proposition.** J'ai relevé le commit
**réellement servi** dans le bundle en ligne (`__GIT_HASH__ = 571601a`) au lieu de le déduire du
commit qui a bumpé la version : **les deux diffèrent de cinq commits.** Une étiquette posée
rétroactivement « à la version » aurait menti dès le premier usage. Et sans rattrapage du tout,
le contrôle serait né en listant onze commits déjà partis — *une règle de contrôle ajoutée à une
base qui a un passé doit être précédée d'un rattrapage, sinon elle naît comme un avertissement
permanent.*

Dernier détail, par application de notre propre règle sur les instruments faits maison : j'ai
**vérifié à la main un cas tiré de la liste**. `be31a29` était classé `[app]` pour un simple
ajout de script npm dans `package.json`. Seul le champ `version` de ce fichier atteint le
bundle — corrigé, et le compte est passé de 2 à 1.

---

## §6 — Le topo, et une alerte sur la liste de la fiche

**Les deux lignes que la fiche demande d'ajouter y étaient déjà** (ajoutées le 18/10, lignes
« Publier le palmarès est définitif » et « Un grimpeur ne voit pas le palmarès ? Regarder son
repère de version »). Ce qu'il fallait vraiment ajouter, c'est V2.75 : les deux boutons groupés
(page 04) et un point de vigilance sur l'ordre.

⚠️ **Le filet des pieds de page a attrapé le débordement que cela créait** (71 px), puis un
second quand j'ai rééquilibré trop vite. D'où une **page 13 de suite explicite**. 13 sections,
toutes avec leur pied, pages 04, 07 et 13 relues dans le PDF rendu.

> ⚠️ **Et un incident qui vaut une règle.** En défaisant un rééquilibrage, j'ai **supprimé** le
> groupe « Comptes & rôles » au lieu de le remettre. Le filet ne l'a pas vu — **il mesure les
> débordements, pas les disparitions**, et le document régénéré paraissait parfait. Trouvé en
> comptant les occurrences des titres avant/après. *Un filet de mise en page ne garantit rien
> sur le contenu : après tout déplacement de bloc, compter ce qu'on a déplacé.*

**Reste à faire, et toi seul peux le faire : imprimer.** Le rendu d'une imprimante n'est pas
celui d'un lecteur PDF.

---

## §7 — Un de tes « deux petits restes » est déjà clos

> « La garde "1996-" codée en dur dans le test du palmarès, qui se périmera avec son jeu
> d'essai. »

**Corrigée le 15/10 en V2.74.1**, trois jours avant que la fiche ne la liste — remplacée par une
garde de **forme** : aucune chaîne `AAAA-MM-JJ` nulle part dans le document gelé, hors les deux
champs où une date est légitime (`competition_date`, `published_at`), nommés explicitement. Ta
liste est périmée sur ce point.

**Le second reste ouvert**, et c'est volontaire : la colonne de rang de l'écran Classement est
**à proposer au gérant**, pas à implémenter de notre initiative. Ta formulation est la bonne et
je la garde telle quelle — *le rang est une propriété du grimpeur, pas de l'affichage* : calculé
au score avec ex æquo partagés, affiché dans sa propre colonne, identique quel que soit le tri.

---

## §8 — ⚠️ Ce qui N'EST PAS vérifié

La section qui compte le plus.

1. **Aucun écran n'a été vu sur un vrai téléphone.** L'arriéré court depuis V2.70.1 et couvre
   tout le chantier du 5 novembre. C'est la seule catégorie de défaut que les tests ne peuvent
   pas attraper, et la fiche a raison de la dater au 29 octobre.
2. **Le §4.4 (cache IndexedDB avant publication) reste intestable ici** : la persistance
   Firestore est désactivée de force sous émulateur. Même appareil, à la main.
3. **La concurrence n'est mesurée nulle part.** Tout mon seed écrit par le SDK admin, en lots,
   depuis un seul processus. 80 téléphones écrivant en même temps restent hors de portée.
4. **Le relevé en console d'une journée chargée n'est pas fait** (ton §6, ligne 1) — je ne peux
   pas ouvrir la console Firebase.
5. **V2.75 n'est pas déployée**, donc les deux boutons n'ont jamais tourné contre la vraie base.
   Ils ont tourné contre 85 comptes d'émulateur.
6. **Le verrouillage n'a pas de test de règles dédié** : sa propriété serveur est établie par la
   répétition générale, qui se lance à la main.

---

## §9 — Points ouverts par ailleurs, repris du handoff précédent

- Le **correctif des niveaux** : non écrit, non commité, conformément à ton §3. La connaissance
  qui le rendra juste arrive le 5 au soir.
- **Contexte unique des rôles**, à faire avec le chantier « droits d'accès, rôle ouvreur trop
  large ». Jamais justifié par l'économie de lectures.
- **`inscritAuxCompetitions`** : à supprimer ou à assumer en opt-out. Après le 5 novembre.
- **`challenges.progress`** : compteur incrémental sans filet et à échec silencieux.
- Chemin d'**échec** du réarmement de minuteur dans `useDebouncedFlushQueue`, sans couverture.
- Défis `fenetre` / `bloc_designe` toujours sans e2e navigateur.
- Finale non annoncée ; sauvegarde durable des images Cloudinary.
- **L'annonce orale du 5 au matin**, et son quatrième point que tu as raison d'ajouter :
  « inscrivez-vous dès maintenant, pas le soir du contest ».

---

## Ce qui a changé dans le dépôt

| fichier | |
|---|---|
| `frontend/src/pages/AdminUsers.tsx` | verrouillage groupé, relecture serveur partagée, exclusion annoncée |
| `frontend/package.json` | 2.74.2 → **2.75.0** (pas d'entrée de changelog : rien de visible du grimpeur) |
| `frontend/test/seed-repetition-generale.mjs` | **neuf** — 80 comptes, 20 blocs, 1 600 résultats |
| `frontend/test/e2e-repetition-generale.mjs` | **neuf** — 7 pas, la procédure du soir |
| `scripts/list-commits-since-last-deploy.cjs` | **neuf** — inventaire `predeploy` |
| `scripts/tag-deploy.cjs` | **neuf** — étiquette `postdeploy` |
| `firebase.json` | les deux hooks, sur `hosting` et `firestore` |
| `topo-blocabrac-source.html` / `.pdf` | boutons page 04, vigilance page 07, **page 13 de suite** |

**Vérifications** : `lint` vert · `test` 441/441 · `test:rules` 165/165 · `build` vert ·
répétition générale **7/7**, chaque propriété vue rouge séparément.
