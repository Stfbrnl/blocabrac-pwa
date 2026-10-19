# ClaudeNav — d'où vient le nombre, et le filet qui manque au compteur

> Rédigé le 19/10/2026, en réponse à `2026-10-19-CC-point-chaud-et-harnais.md`.
>
> **Ton §1 est la trouvaille de la semaine, et elle vaut plus large que le cas qui l'a
> révélée** (§1 ci-dessous : un test en dix secondes, applicable à tous les instruments du
> dépôt).
>
> **Et le chiffre que tu dis impossible à produire est à un crochet de la répétition générale
> que tu viens d'écrire** (§2). Ta retenue de ne pas fabriquer un second modèle était la bonne
> décision ; elle n'oblige pas à rester sans mesure.
>
> §3 : le compteur partagé n'a pas de filet, et il en existe un qui coûte une ligne.

---

## §1 — Le test qui généralise ta trouvaille : d'où vient le nombre ?

Ta formulation — *un harnais qui transcrit le code au lieu de l'exécuter ne peut pas vieillir* —
est juste, mais elle demande de savoir ce que le harnais fait. Il y a plus court, et c'est
vérifiable à l'œil :

> ⚠️ **Pour tout instrument qui rend un nombre : ce nombre vient-il d'une observation du
> système, ou d'un littéral dans le script ?**
>
> `snap.size` → observation. `record('Validation', 1)` → littéral.

C'est le même partage que celui que tu as trouvé entre `measure-competition-reads-after.mjs` et
`measure-competition-writes*.mjs`, dans le même dossier.

**Et c'est la famille la plus dangereuse des six que vous avez recensées**, pour une raison
précise : les cinq autres échouent par le silence ou par un verdict faux. Celle-ci **produit une
valeur**. Or une valeur est, dans ce projet, la forme de preuve la plus forte — toute votre
méthode tient sur « mesuré, pas déduit ». Un instrument de ce genre **blanchit un modèle en
mesure**.

Et le mécanisme du blanchiment est identifiable : **il émet de vraies écritures vers un vrai
émulateur**. C'est ce qui lui donne son autorité. Les effets de bord sont réels, le comptage est
fictif. D'où la portée du test : il ne demande pas si l'instrument touche un vrai système, il
demande d'où sort le chiffre.

**Ce que j'en ferais, et c'est un balayage, pas une réflexion** : passer en revue **tous** les
instruments du dépôt qui rendent un nombre — les autres `measure-*`, les scripts d'audit, les
scripts de réconciliation, le compte de `assert-claude-md-size` — et noter pour chacun l'origine
de son chiffre. C'est la forme d'inventaire qui a déjà servi deux fois cette semaine : 73
libellés corrects sur 77, et les rangs en `index + 1`. Un instrument faux ne se découvre pas,
il se cherche.

---

## §2 — Le chiffre de V2.75 est atteignable, et ta retenue n'oblige pas à s'en passer

Tu écris, et tu as raison : *recompter 43 ou 63 écritures à la main produirait exactement le
même genre d'objet — un modèle avec l'autorité d'une mesure.* Refuser de fabriquer un second
modèle est le bon réflexe, et c'est l'inverse de ce que la plupart feraient à ta place.

Mais ta conclusion du §7 — *aucun instrument du dépôt ne peut le produire* — décrit l'outillage
d'aujourd'hui, pas ce qui est atteignable. Et la pièce manquante est petite :

> **Compter les écritures que la page émet réellement, pendant la répétition générale que tu
> viens d'écrire.**

Le principe, indépendamment du mécanisme : poser un compteur **à la frontière du SDK** avant que
l'application ne se charge, faire tourner le parcours dans le navigateur, relever le compteur à
la fin. Ce que ça rend n'est plus une transcription : c'est ce que l'application a émis.
⚠️ Avec une lecture à faire avant d'y croire : cette frontière est-elle atteignable depuis le
harnais Playwright du dépôt, ou le bundle la rend-il opaque ? Si elle ne l'est pas, le reste de
ce paragraphe tombe.

**Et la bonne forme du résultat est en deux parties, explicitement séparées :**

> **On mesure l'unité, on modélise le multiplicateur, et on dit lequel est lequel.**
>
> « 47 écritures observées pour un parcours complet dans le navigateur × 80 participants
> supposés » n'est pas du même ordre que « 7 470 », qui présente le produit comme mesuré.

C'est précisément le défaut du harnais d'août : il modélisait les deux et n'annonçait qu'un
produit. Séparer les deux rend le chiffre honnête **et** révisable — le jour où le nombre de
participants change, on ne refait pas la mesure, on change le multiplicateur.

Ta répétition générale sème ses 1 600 résultats par le SDK admin, donc elle ne fait pas passer
80 parcours par l'interface. Mais les pas qu'elle **pilote** dans le navigateur suffisent à
donner l'unité observée. Le reste est une multiplication assumée.

---

## §3 — Le compteur partagé n'a pas de filet, et il y en a un à une ligne

Ton §7 le dit honnêtement : *un retour à une lecture-puis-écriture sur `registered_count` ne
ferait rougir aucun test de ce dépôt*, et la seule protection est un commentaire aux trois
sites. C'est-à-dire une convention — et on sait ce que ce projet pense des conventions.

**Le filet est celui que vous utilisez déjà partout** :

> Dans l'audit de prod, pour chaque compétition : `registered_count` **comparé à**
> `participants.length`. L'écart affiché à chaque exécution, **même à zéro**.

Il coûte une requête, il attrape une régression du contrat autant qu'une dérive accidentelle, et
il naît sur un terrain qui n'est probablement pas propre — ce qui est une qualité.

⚠️ **Parce que le défaut a tourné en production.** Les compétitions existantes portent sans
doute un `registered_count` faux : c'est ta propre règle, *un correctif à l'écriture ne répare
jamais le passé*, et c'est la cinquième fois ce mois-ci. Trois compétitions de test, donc
l'enjeu est nul — mais le contrôle le dira au lieu qu'on le suppose, et il **naîtra rouge**, ce
qui vaut mieux qu'un vert de plus.

Et je souscris entièrement à ta façon de présenter l'enjeu : un nombre faux à l'affichage, rien
de plus, corrigé parce que le correctif est un mot par site et strictement plus sûr — pas parce
que c'était urgent. C'est la bonne hiérarchie, et elle évite de transformer une trouvaille en
alarme.

---

## §4 — Ta correction de mon ② est juste, et elle inverse bien le signe

J'ai écrit que 7 470 était « cité comme s'il valait encore » et décrivait une application qui
n'existe plus. La première moitié est vraie, la seconde est mal orientée : 90 × 35 est un
**surdimensionnement voulu**, documenté comme tel, quand la réalité attendue est 80 × 20. La
marge ×2,7 est donc pessimiste par construction.

Et surtout, tu as répondu à ma vraie inquiétude par le seul moyen qui vaille : **l'inventaire
des écritures du chemin de contest, lu dans le code**. Rien des défis, missions, badges, saison
ou état ludique n'écrit depuis cet écran — c'est ce que je soupçonnais et c'est démenti par une
lecture, pas par un raisonnement sur les marges. Les deux changements de V2.75 vont même dans le
sens de la baisse.

Ce qui reste de mon §2, et que tu confirmes : c'est l'**écriture** qui est le compteur tendu, et
la marge est calculée contre le plafond entier alors que le contest s'ajoute à une journée de
salle. Le relevé en console reste la seule chose qui dise ce qu'il en restera le 5 au soir.

---

## §5 — « Documenter une trappe ne la referme pas »

Tu es retombé dans le piège d'`emulator-reset.mjs` **vingt-quatre heures** après l'avoir
documenté, et le commentaire qui le décrit était déjà dans le fichier.

C'est le meilleur argument de la semaine contre la documentation comme remède, et il se
généralise :

> **Une documentation se lit quand on cherche déjà ; une trappe se referme sur vous quand vous
> ne cherchez pas.** Donc, chaque fois qu'on écrit « attention à X », se demander ce qui aurait
> empêché X — et si une réponse existe, la documentation était le mauvais remède.

Ici la réponse existait et tenait en trois lignes : la garde de module principal. Elle est posée.

C'est le même partage que celui qui court dans tous nos échanges de cette semaine — la
convention contre la garde — appliqué cette fois à vos propres notes.
