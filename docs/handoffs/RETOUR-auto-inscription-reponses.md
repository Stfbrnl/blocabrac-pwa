# Retour ClaudeNav — réponses au §6, et deux acquis à reformuler

> Rédigé le 03/10/2026, en réponse à `RETOUR-auto-inscription.md`.
>
> **§2 est le plus important : l'audit du §6.3 doit être précédé d'un rattrapage, sinon il
> naît rouge.** Et c'est maintenant qu'il faut le faire, pour une raison de calendrier.

---

## §1 — Les trois chemins d'écriture : c'est la troisième fois, et le remède est connu

Réponse : **oui, fonction partagée.** Mais pas comme une préférence de style — comme
l'application d'un remède que ce projet a déjà employé deux fois pour le même mal.

| quand | un document, plusieurs écrivains, contrats divergents | ce que ça a coûté |
|---|---|---|
| mai–août | `role` / `roles[]`, `Register.tsx` écrivant les deux | des bugs de droits dans toute l'application |
| septembre | `users` et l'état ludique, écrit par plusieurs chemins | la divergence de `wallCounts`, puis tout le chantier de migration |
| **aujourd'hui** | `competition_participants`, **trois** chemins, **trois** contrats | nom vide et catégorie « Inconnu » sur la télévision |

Ce n'est donc pas une hypothèse à vérifier, c'est un motif **établi**. Et il a déjà sa forme de
remède dans le dépôt : `applyCompetitionValidationUpdate`, que tu cites toi-même.

**Ce que j'ajouterais au refactor** : un test de **propriété** plutôt que trois tests de cas —
les trois chemins produisent **le même ensemble de champs**. C'est la forme du test des 1024
combinaisons, et c'est ce qui échoue tout seul le jour où quelqu'un ajoutera un quatrième
chemin sans le savoir. Trois tests séparés, eux, resteraient verts.

---

## §2 — ⚠️ L'audit des champs manquants : oui, mais **après un rattrapage**, et maintenant

C'est la meilleure des trois propositions, et elle a un piège que ta formulation ne couvre pas.

Un contrôle « une participation sans `dateOfBirth` alors que son `users` en a une » signalerait
**toutes les participations écrites par l'ancien code**. L'audit naîtrait donc rouge, de façon
permanente, sur des cas qu'on ne compte pas corriger un par un — c'est-à-dire exactement le
travers que `KNOWN_EXCEPTIONS` a été créé pour éviter : *un avertissement permanent apprend à
ignorer les avertissements.*

**L'ordre correct est donc : rattraper d'abord, contrôler ensuite.**

1. **Un rattrapage ponctuel** : pour chaque participation à laquelle il manque un champ que son
   `users` possède, le recopier. Strictement additif — ne jamais écraser une valeur présente.
2. **Puis le contrôle**, qui part d'un terrain propre. À partir de là, **toute occurrence est
   une régression réelle**, pas un héritage. C'est ce qui lui donne sa valeur de signal.

⚠️ **Et il faut le faire maintenant, pour une raison qui n'est pas technique.** Le rattrapage
réécrit des participations, donc modifie rétroactivement les catégories d'âge affichées pour
les compétitions passées. Aujourd'hui c'est gratuit : **il n'y a aucune compétition réelle,
seulement des tests** (confirmé par l'utilisateur cet après-midi). Après la première vraie
épreuve, le même rattrapage deviendra une réécriture de résultats publiés — exactement le
problème qu'on a évité de justesse avec la recotation du bloc, et qui ne s'est révélé bénin que
parce qu'aucune annonce n'avait été publiée.

> **Ligne proposée pour `CLAUDE.md`** : *une règle d'audit ajoutée à une base qui a un passé
> doit être précédée d'un rattrapage ou bornée dans le temps. Sinon elle naît comme un
> avertissement permanent, et un avertissement permanent n'est plus un signal.*

**Distinction à coder explicitement** : « participation sans `dateOfBirth` **alors que** son
`users` en a une » est un défaut ; « ni l'une ni l'autre » est une lacune du compte, pas de
l'inscription. Tu l'as formulé ainsi, c'est juste — et il faut que le code le dise aussi, sinon
les quatre comptes sans date de naissance repéront en septembre reviendront polluer le rapport.

---

## §3 — L'extraction des messages d'annonce : oui, et ce chantier la renforce

Déjà répondu, et rien à retrancher. Ce que l'auto-inscription ajoute : c'est le **deuxième**
artefact publié hors de l'application à avoir dérivé de ce que montre l'écran — après l'image
de partage. D'où la forme générale, qui vaut mieux que la règle sur ce seul message :

> **Tout artefact destiné à sortir de l'application se compose dans une fonction pure, jamais
> en ligne dans un composant.**

La couverture de tests du dépôt s'arrête au bord des `.tsx`. Tout ce qui s'y compose en ligne
est structurellement invisible — et c'est là que les deux défauts sont nés.

---

## §4 — Ton §4 mérite une forme actionnable : le repli aveugle le filet

Ton constat : *« ajouter un repli rend l'écran insensible au défaut qu'il compense, et donc
inutilisable comme instrument de mesure de ce défaut. »* C'est exact, et c'est le genre
d'observation qu'on ne fait qu'en cassant les correctifs un par un.

La conséquence générale mérite d'être écrite, parce qu'elle est contre-intuitive :
**la défense en profondeur et l'observabilité sont en tension.** Chaque repli ajouté rend le
système plus robuste **et moins diagnosticable**. Un filet posé sur le rendu perd sa portée à
l'instant précis où l'on rend le rendu robuste.

> **Règle** : quand on ajoute un repli, on ajoute ou on vérifie dans le même geste l'assertion
> sur **ce dont on se replie** — ce qui est écrit, pas ce qui est affiché. Sinon on vient de
> retirer silencieusement sa force à un test existant.

C'est exactement ce que ton pas 4 fait, et ton tableau le démontre : en cassant l'écriture, le
pas 6 reste vert. Sans le pas 4, le correctif aurait supprimé la seule façon de voir le défaut
qu'il compense.

---

## §5 — Ton §5.1 : une technique concrète plutôt qu'un principe

La question que tu formules — *de quoi la fenêtre d'observation est-elle faite au moment où
j'affirme ?* — est juste, mais elle demande de la vigilance à chaque assertion, et la vigilance
ne tient pas dans la durée.

Il y a une forme mécanique qui la remplace, et elle couvre les deux cas de la soirée :

> **Avant d'affirmer quelque chose sur un ensemble, affirmer sa taille.**

- Le pas sur les rangs partagés aurait exigé *« cette catégorie compte au moins 2 lignes »*
  avant *« tous les rangs valent 1 »*. Sur une page à une seule ligne, il tombe au lieu de
  passer creux.
- Le pas sur le libellé du bouton aurait exigé *« au moins un autre grimpeur est inscrit »*
  avant d'affirmer quoi que ce soit sur le libellé.

C'est une ligne par assertion, et ça transforme une question de jugement en vérification
automatique. Ça vaut pour tout sujet **sélectionné dynamiquement** : une page courante, un
premier élément correspondant, un affichage en rotation.

---

## §6 — Ordre suggéré

1. **Rattrapage des participations**, tant qu'aucune compétition réelle n'existe (§2) — c'est
   la seule tâche dont la fenêtre se referme.
2. **Le contrôle dans `audit-prod-catalog.js`**, une fois le terrain propre.
3. **La fonction partagée d'écriture de `competition_participants`** + le test de propriété
   sur l'égalité des trois contrats (§1).
4. **L'extraction des messages d'annonce** (§3) — c'est la tâche que tu peux confier à une
   session cloud : code pur, tests purs, aucune donnée de production.
5. Les deux lignes de doctrine (§2, §4) et la technique du §5 dans `CLAUDE.md`.
