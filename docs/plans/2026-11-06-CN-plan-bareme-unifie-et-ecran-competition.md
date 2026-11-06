# Barème unifié et lisibilité de l'écran de compétition

**Pour ClaudeCode — 6 novembre 2026, fin de journée**

Deux chantiers indépendants, dans un seul document parce qu'ils sortent de la même soirée.
Ils ne partagent aucun fichier et peuvent être livrés séparément. **Ordre recommandé : A puis B**
— A est petit en code et lourd en procédure, B est l'inverse.

---

# PARTIE A — Le barème quotidien adopte la courbe à plancher

## A.0 La décision, et le raisonnement qui l'a produite

Le quotidien adopte la courbe de `blocabrac_plancher` :
`points = arrondi(base × (0,25 + 0,75 × 0,85^(essais−1)))`.

**Ce n'est pas la variante la moins perturbante** — la mesure en avait trouvé une meilleure sur
ce critère (déduction proportionnelle à 1/30, aucun compte en baisse). Elle a été écartée par
l'utilisateur, pour deux raisons qui priment :

1. **Le compteur général ne qualifie à rien.** Il ne nourrit ni les badges, ni le niveau, ni
   aucun classement de compétition. C'est un totaliseur de vitrine. Les 26 comptes qui baissent
   ne coûtent donc rien de réel — seulement une annonce.
2. **L'uniformité est le critère gouvernant.** *Quand on compte des points avec les essais, il
   doit y avoir une seule façon de le faire, quel que soit le processus compétitif.* Une
   troisième courbe au quotidien aurait contredit exactement ce principe.

Ce qui est corrigé au passage : **l'inversion des couleurs**. Vérifié sur 8 couleurs × 40 essais,
le barème actuel contient quatre inversions (blanc < noir aux essais 8-30, rose < noir 15-30,
blanc < rouge 15-20, blanc < violet 17-20) — une couleur plus dure valant moins qu'une plus
tendre au même nombre d'essais. La courbe à plancher n'en contient **aucune**, par construction :
la couleur se factorise.

## A.1 ⚠️ Les trois signaux d'alarme

**1. 🔴 `reconcile-classement-profiles.js` porte sa propre copie de `calculatePoints`** (ligne 158,
CommonJS, parce qu'il ne peut pas importer le module TypeScript). **Si le script garde l'ancienne
formule, sa prochaine passe mensuelle réécrit silencieusement tous les comptes à l'ancien barème
— en croyant les réparer.** Le changement est alors annulé sans que personne ne l'apprenne. C'est
le défaut le plus grave du lot et il est déjà en place, pas introduit par lui.

**2. `calculatePoints` ne disparaît pas.** Elle reste la formule des **mini-compétitions** et du
mode de compétition `blocabrac`. Doctrine : *une mini-compétition a été **proclamée** le soir
même, elle se fige ; le classement général **mesure**, il se recalcule.* Un diff qui supprime
`calculatePoints` est faux.

**3. L'uniformité doit être tenue par un test, pas par l'intention.** Voir A.4 : sans lui, la
prochaine modification fera dériver une seule des deux fonctions, en silence, et le principe sera
perdu sans qu'aucun test ne rougisse.

## A.2 Lectures à confirmer avant d'écrire

1. **Les trois sites d'appel de `classementScore.ts`** — ce sont eux qui basculent.
2. **`baseScore` / `baseColorCounts`** : que contiennent-ils exactement, à quel barème ont-ils été
   figés, et la réconciliation les recalcule-t-elle ? S'ils restent à l'ancien barème, le total
   d'un grimpeur sera un **mélange des deux** de façon permanente. Décidable (le compteur est
   cosmétique) mais à **décider**, pas à subir.
3. **Le garde-fou de dérive de la réconciliation** : à quel seuil refuse-t-il, et faut-il
   `--force` quand 26 comptes sur 34 bougent d'un coup ?
4. **Le sélecteur de mode à la création d'une compétition** : où est-il, et le mode `blocabrac`
   peut-il en être retiré sans casser l'affichage des compétitions passées qui l'utilisent ?

## A.3 Le lot

**Commit 1 — la fonction partagée.** `calculateDailyPoints(color, attempts, success)` qui **appelle
la même implémentation** que la branche `blocabrac_plancher` de `calculateCompetitionPoints` — pas
une copie de la formule, le même code. Les trois sites de `classementScore.ts` basculent.
`calculatePoints` reste intacte.

**Commit 2 — la copie CommonJS.** La formule de `reconcile-classement-profiles.js` passe au
plancher, et son accord avec la version TypeScript est verrouillé par le test de A.4.

**Commit 3 — le retrait du mode `blocabrac` du sélecteur.** Il reste **lisible** pour l'historique
(une compétition passée dans ce mode doit continuer de s'afficher juste), mais n'est plus
**sélectionnable** à la création. Sinon l'ancienne courbe revient par une liste déroulante, un
soir où personne n'y pensera.

**Commit 4 — le changelog et l'annonce.** Entrée visible du grimpeur, plus un texte pour le
bandeau d'annonces (le CRUD existe). Voir A.5.

## A.4 Les tests

**Le test qui porte la décision** — et c'est le cœur du lot :

```
pour chaque couleur × chaque nombre d'essais de 1 à 60 :
  calculateDailyPoints(couleur, essais, true)
    === calculateCompetitionPoints({color: couleur}, essais, true, 'blocabrac_plancher')
```

Il transforme « même comptage quel que soit le processus compétitif » d'une intention en un
invariant qui rougit. C'est la seule chose qui empêchera les deux de dériver.

**Le second, pour la copie CommonJS** : la même table de valeurs figées, consommée par les deux
implémentations — la TypeScript et celle du script de réconciliation. Un seul tableau, deux
clients. Si l'une dérive, elle rougit.

⚠️ **Et la clause d'absence** : `calculatePoints` rend toujours exactement ses valeurs actuelles,
sur les 8 couleurs × 60 essais. Si ce test doit être modifié, les mini-compétitions ont bougé.

**Signal d'alarme :** aucun test existant ne doit avoir besoin d'être modifié, sauf ceux qui
portent explicitement sur le classement quotidien.

## A.5 La procédure de bascule — l'ordre n'est pas négociable

1. **Prédire d'avance**, par écrit : combien de comptes bougent, de combien, et combien de rangs
   changent. Le simulateur existe (`simule-bareme-plancher-quotidien.js`), sa ligne B est déjà
   mesurée : −5 868 points, 26 comptes en baisse, 9 rangs, dont le 6ᵉ/7ᵉ.
2. **Déployer l'application ET le script** dans le même déploiement. Jamais l'un sans l'autre :
   entre les deux, la prochaine réconciliation annule tout.
3. **Lancer la réconciliation UNE fois**, avec le compte attendu écrit d'avance, pour normaliser
   les compteurs incrémentaux — qui sont sinon un mélange des deux barèmes.
4. **Vérifier l'effet, pas le message de succès** : relancer la réconciliation une seconde fois,
   elle doit trouver **zéro** écart. C'est le recoupement qui prouve que la bascule est complète.
5. **Annoncer.** Deux phrases suffisent :
   > « Le barème des blocs du jour devient le même que celui des compétitions : un bloc réussi
   > rapporte toujours au moins un quart de sa valeur, quel que soit le nombre d'essais. »
   >
   > « En contrepartie, les points baissent un peu plus vite sur les premiers essais. Votre total
   > cumulé peut donc bouger légèrement — c'est un compteur de vitrine, il ne change rien à vos
   > badges ni à votre niveau. »

⚠️ **Ne pas s'appuyer sur « vous l'avez déjà approuvé ».** À 93,7 % de flash au Contest, presque
personne n'a vu la courbe : à 1 essai les deux barèmes rendent **exactement** la même valeur. Ce
qui a été plébiscité est le **principe** (plus jamais zéro), pas la courbe. Les 17 % de
validations qui ne sont pas des flashs verront, elles, des nombres plus petits — un noir en 2
essais passe de 580 à 533. C'est le prix du plancher : pour financer le quart garanti, la courbe
mord plus tôt.

---

# PARTIE B — Sous-menus par mur sur l'écran de compétition

## B.0 Le diagnostic, plus précis que « pas de numéros »

Six grimpeurs devant 92 blocs dans une liste plate. **Les numéros existaient** — ils sont
attachés au **mur**, pas à la salle. Un tri global par numéro met donc tous les n°1 des sept murs
ensemble : il **entrelace les murs**, ce qui avait un sens pour 30 blocs créés pour une épreuve
et aucun pour toute la salle.

**Conséquence de conception, et elle évite un chantier entier : le regroupement par mur rend les
numéros par mur non ambigus.** Il n'y a donc **rien à renuméroter** côté blocs quotidiens — la
section porte le mur, la ligne porte le numéro, et ça correspond à ce qui est écrit sur la prise.

**Et le bon tri existe déjà dans le dépôt** : `fetchCandidates` fait
`a.wall.localeCompare(b.wall) || (a.number||0) - (b.number||0)`. Une ligne à propager, pas à
inventer. (⚠️ À vérifier : je n'ai pas lu le tri de l'écran de validation client, seulement celui
de l'ouvreur.)

## B.1 ⚠️ Le signal d'alarme de cette partie

🔴 **Replier une section démonte ses lignes. Une écriture débouncée en attente doit survivre.**
Le debounce est à **2 500 ms** : un grimpeur règle son nombre d'essais, replie la section dans la
foulée, et la validation peut être perdue — sans message, sur l'écran où l'on ne perd jamais une
validation.

`validationQueue` semble vivre au niveau du composant parent (`enqueue(boulderId, result)`), donc
survivre au démontage d'une ligne. **À vérifier, pas à supposer**, et à verrouiller par un test :
*une mise en file suivie d'un démontage de la ligne doit quand même écrire.*

## B.2 Les quatre éléments

**1. Sections repliables par mur.** Tri mur puis numéro. En-tête portant le nom du mur et un
compte **« validés / total »** — c'est lui qui donne envie d'ouvrir la bonne section. Bénéfice
secondaire qui comptera à 80 grimpeurs : seule la section ouverte se rend.

**2. Filtre « masquer les blocs déjà validés ».** C'est probablement la plus grosse réduction de
défilement du lot, et c'est du pur état local — aucune lecture, aucune écriture. ⚠️ Il doit être
un **basculement délibéré** : un bloc qui disparaît sous le doigt à l'instant où on le valide est
déroutant. La ligne ne s'efface qu'au prochain basculement du filtre, ou à la réouverture de la
section.

**3. L'affichage de la couleur : par bloc, quand elle est publique.** Un bloc quotidien réutilisé
porte une `color` que le grimpeur lit déjà sur le mur — la cacher dans l'application ne cache
rien. Un bloc créé pour l'épreuve n'en porte pas : il n'affiche rien.

**4. 🔴 Le tri par couleur : tout ou rien, et dérivé de la donnée.**

Offrir le tri par couleur **seulement si TOUS les blocs de la liste portent une `color`
publique.** La raison est qu'un format mixte est possible, et qu'alors un tri par couleur
**placerait les blocs à cotation cachée quelque part** — leur position dans la liste triée
révélerait leur cotation. Le tri deviendrait la fuite exacte que la cotation cachée existe pour
empêcher.

⚠️ **Et la condition se dérive de la donnée, jamais d'un réglage de compétition.** Un réglage peut
être posé à tort par un ouvreur pressé ; une condition lue sur le contenu réel de la liste ne peut
pas mentir. C'est la même forme que la décision prise pour le multiplicateur.

(Variante si le besoin se présente un jour : en format mixte, trier les blocs publics par couleur
et ranger les blocs cachés dans un groupe « non coté » séparé et nommé. Pas de fuite, mais plus de
complexité — à ne faire que sur demande réelle.)

## B.3 La numérotation globale, pour une compétition de blocs créés

Pour une compétition de 30 à 35 blocs **créés pour l'épreuve**, une numérotation globale 1..N
reste naturelle et l'ouvreur la contrôle déjà (« Réorganiser les numéros »).

⚠️ **Jamais sur des blocs quotidiens réutilisés** — leurs numéros correspondent à ce qui est écrit
sur le mur, et les renuméroter désynchroniserait l'application du physique : un grimpeur
chercherait le bloc 47 devant une étiquette qui dit 3.

Et un détail à penser une fois : si l'ouvreur numérote dans l'ordre où il ouvre, et qu'il ouvre du
facile au dur, **le numéro devient un indice de cotation** sur une compétition à cotations
cachées.

## B.4 Les tests

- **La condition tout-ou-rien du tri par couleur** : avec une liste entièrement publique le tri
  est offert ; avec **un seul** bloc à cotation cachée il ne l'est pas. Les deux assertions, pas
  seulement la première.
- **La survie de l'écriture débouncée au démontage** (B.1).
- **Le regroupement** : un jeu d'essai à plusieurs murs rend bien N sections, chacune triée par
  numéro, et aucun bloc perdu entre les sections — le total des sections doit égaler le total de
  la liste. ⚠️ Affirmer la **taille** avant le contenu.
- **Le filtre** : masquer les validés ne change jamais ce qui est écrit, seulement ce qui est
  montré.

---

## Ce que ce plan ne touche pas

Rien sur les badges, ni sur `users.level`, ni sur `level_at_start`, ni sur le multiplicateur, ni
sur `competition_results`. La chaîne des niveaux et celle des points sont indépendantes : un
changement de barème ne touche pas les badges, qui dépendent des couleurs.

Et il ne traite pas non plus les points ouverts d'hier : « Mes stats » et ses lectures, les 7
blocs orphelins, la garde devenue fausse de la sonde, et la question jamais vérifiée de la
Roulette quand aucun bloc ouvert ne correspond au niveau du grimpeur — celle-là étant devenue
vivante depuis le déverrouillage de ce matin.
