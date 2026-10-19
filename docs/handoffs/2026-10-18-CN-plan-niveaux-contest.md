# ClaudeNav — plan des niveaux pour le contest, décision de Stéphane

> Rédigé le 18/10/2026. **Remplace** `2026-10-18-CN-arbitrage-niveaux.md`, dont les §1 et §2
> sont faux — ne pas les appliquer.
>
> ⚠️ **Mon amendement unique, et il simplifie tout le reste : le correctif des niveaux ne
> s'écrit pas avant le contest** — pas même préparé sans être déployé (§3, corrigé le 19/10 sur
> une objection de Stéphane). Le contest se traite entièrement à la main, et la connaissance qui
> rendra le correctif juste arrive **le 5 novembre au soir**.

---

## §1 — Ce qui est abandonné, et pourquoi

Trois choses que j'ai écrites ce midi sont fausses. Elles sont ici pour qu'elles ne soient pas
implémentées, pas pour la postérité.

| abandonné | raison |
|---|---|
| **Le niveau monotone** (`level = max(badge actif, baseLevel)`) | j'avais la bonne distinction avec les objets inversés. **Le badge est la proclamation** — et son caractère éphémère *est* sa valeur : montrer un noir exceptionnel quelques jours, c'est le projet de communauté. **Le niveau est la mesure** : il répond à « que lui proposer », et une réussite unique ne soutient pas une réponse permanente |
| **« Ne déployez pas le recalcul, il abîmerait 18 comptes »** | faux, conséquence du précédent. **La redescente est le comportement voulu.** Les 18 sont bien des niveaux qui auraient dû redescendre, et le recalcul posé dans `ClientDaily` est juste |
| **Reconstituer `baseLevel` depuis le plus haut niveau jamais atteint** (le 2 bis de Claude Code, et ma variante par `client_badges`) | même vice : `baseLevel` est le niveau **déclaré**, pas un plafond atteint. Le reconstituer depuis l'historique figerait un grimpeur sur une réussite exceptionnelle — exactement ce qu'il ne faut pas |

**Ce qui tient de ces documents :**

- le défaut n'est pas la **chute**, c'est le **plancher** : tomber sur `bleu` par défaut est une
  valeur inventée, qui peut être à quatre crans de la réalité (Océane Julien, violet au minimum,
  tomberait à bleu) ;
- l'attribution des badges est enfermée dans `ClientStats.tsx` au même titre que la synchro, et
  le correctif doit porter la chaîne entière ;
- la vérification à la main sur des noms réels a réfuté la colonne « attendu » deux fois sur
  deux ;
- ⚠️ **et sa limite, que Stéphane a dû me signaler** : il ne connaît pas tous les grimpeurs de la
  salle. J'avais généralisé depuis deux noms qu'il avait lui-même sélectionnés par ce qu'il
  savait — le troisième que je proposais, Thibault CHAZELLE, n'a pas reçu de réponse, et ce
  silence était la donnée. **Un échantillon choisi par ce que le témoin sait ne peut pas
  produire de contre-exemple.**

---

## §2 — La décision, en règles

Arbitrée par Stéphane. Le niveau de compétition de chaque participant est **fixé à la main** et
**verrouillé** (`levelOverride`) pour la durée de l'épreuve.

| situation du grimpeur | niveau retenu pour le contest |
|---|---|
| a déclaré son niveau, puis l'a vu élevé par des badges actifs | le niveau élevé, **fixé et gardé** |
| niveau élevé par un badge aujourd'hui éteint (le cas de Stéphane) | **aligné** sur le niveau justifié |
| compte créé le soir même | **déclaré** par le grimpeur, corrigé par l'admin s'il paraît biaisé |
| aucun `baseLevel` et aucun badge actif (les 7 comptes historiques) | **réglé à la main dans la même passe** — ils ne tombent pas à `bleu`, puisque aucun recalcul ne tourne |

Après le contest : **tous les verrous sont levés**, l'application reprend la main.

**Pourquoi les 7 comptes historiques ne sont plus un problème** : ils ne le devenaient qu'au
moment où un recalcul les faisait tomber sur la valeur par défaut. Si aucun recalcul ne tourne
d'ici au 5, ils gardent leur valeur actuelle et passent dans la même passe manuelle que les
autres. **La passe de verrouillage du soir est elle-même le moment de déclaration.**

---

## §3 — ⚠️ Le correctif ne s'écrit pas avant le contest

*Section corrigée le 19/10. La version précédente disait « il se prépare, se teste, et ne se
déploie pas ». C'était une faute, et Stéphane l'a vue avant moi.*

**« Préparé mais non déployé » n'existe pas sur une branche unique.** `firebase deploy` envoie
le contenu de `dist/`, construit depuis l'arbre courant. Un correctif d'urgence à déployer le
29 octobre emporterait avec lui tout ce qui dort sur `main` — y compris un changement sur la
chaîne qui pilote la Roulette, les défis `seuil` et la grille de missions, à une semaine de
l'épreuve.

> **Ce qui est sur `main` part au prochain déploiement, quel qu'en soit le motif.** Un travail
> qu'on ne veut pas voir partir doit être sur une branche, ou ne pas exister.

Et la garde `predeploy` ne couvre pas ce risque : elle vérifie que ce qu'on déploie est
**poussé**, pas que c'est ce qu'on **voulait** déployer.

**Deux sorties, et je recommande la seconde :**

| | |
|---|---|
| **une branche** `niveaux-apres-contest` | `main` reste déployable à tout instant. Coût : trois semaines de divergence et une fusion, sur une chaîne sensible |
| **ne pas l'écrire maintenant** ✅ | rien à fusionner, rien à oublier — et une raison positive, ci-dessous |

**La raison positive, qui me paraît décisive :** la sémantique du niveau a mis quatre échanges à
se stabiliser, et elle a failli partir deux fois dans le mauvais sens — ma règle monotone, puis
la reconstitution de `baseLevel` depuis l'historique. Ce qui l'a redressée les deux fois, ce
sont **des grimpeurs réels, nommés** : Hugo qui fait régulièrement des roses, Océane qui est
violet au minimum, et le noir exceptionnel de Stéphane qui doit rester exceptionnel.

Or le 5 novembre au soir, Stéphane va régler **à la main le niveau d'une vingtaine de grimpeurs,
nom par nom**. C'est précisément la donnée qui manque. Écrire le correctif avant, c'est l'écrire
sans elle.

**Donc : rien sur la chaîne des niveaux d'ici au 6 novembre, ni déployé, ni commité.** Il y a de
quoi faire par ailleurs — la répétition générale, le bouton de verrouillage, le topo, les deux
petits restes.

---

## §3 bis — Étiqueter les déploiements, qui règle le cas général

Le problème que Stéphane a soulevé ne concerne pas que ce lot : **tout ce qui dort sur `main`
entre deux déploiements part avec le suivant.** V2.74.2 est restée construite et non déployée
pendant une journée ; ç'aurait pu être trois semaines.

Le remède est de la même famille que « tout script dont la raison d'être est un effet doit
annoncer son effet » :

> **Poser une étiquette à chaque déploiement** (`deploy/v2.74.2`), et faire afficher par le hook
> `predeploy` la liste des commits entre la dernière étiquette et `HEAD`.

Un déploiement d'urgence qui emporterait trois semaines de travail sans rapport **s'annoncerait
alors tout seul**, au lieu d'être découvert après. C'est bon marché, ça s'applique à tous les
déploiements à venir, et ça rend visible une question qu'on ne se pose aujourd'hui qu'en y
pensant.

---

## §4 — Le correctif de code, à écrire **après** le contest

Inchangé sur le fond, sauf le plancher. Il est décrit ici pour mémoire, **pas pour être
écrit maintenant** (§3).

1. **Un module pur** portant la chaîne entière : attribution des badges manquants **puis**
   recalcul du niveau. La synchro seule ne ferait monter personne.
2. **Appelé depuis `ClientDaily`**, parce que c'est l'écran qui tient déjà l'inventaire des blocs
   actifs — la donnée d'entrée du calcul. Pas « l'écran le plus fréquenté » : l'écran où la
   donnée est déjà là.
3. **Le plancher, qui est le vrai correctif** :

   > **Quand plus aucun badge de couleur n'est actif et que `baseLevel` est absent, n'écrire
   > rien.** Le niveau reste à sa dernière valeur connue — justifiée par un badge à un moment —
   > au lieu d'être remplacé par `bleu`, qui est une valeur inventée.

   Deux lignes, et ça dégrade correctement : les comptes créés depuis V2.54.1 ont leur
   `baseLevel` dès l'inscription et redescendent normalement ; seuls les comptes historiques
   gardent leur valeur, et leur nombre décroît tout seul à chaque enregistrement de profil, qui
   est une re-déclaration.
4. **Le filet dans l'audit**, affiché à chaque exécution même à zéro : le nombre d'écarts entre
   `users.level` stocké et recalculé, **et** le nombre de comptes sans `baseLevel`. Les seconds
   ne sont pas un défaut à corriger, ce sont les comptes dont le plancher est inconnu — qu'on les
   voie décroître est l'information utile.
5. ⚠️ **Et une lecture à faire avant le point 2** : la Roulette se comporte-t-elle correctement
   quand aucun bloc ouvert ne correspond au niveau du grimpeur ? Le cas devient plus fréquent dès
   que les niveaux cessent d'être périmés.

---

## §5 — Le soir du 5, et ce qui rassure

**La procédure** : avant le coup d'envoi, passer les participants un par un, fixer le niveau,
verrouiller. Puis passer en « en cours », ce qui fige `level_at_start`.

⚠️ **À vérifier avant le jour J, pas pendant** : le verrouillage se fait-il un compte à la fois,
ou existe-t-il une action groupée ? Avec une vingtaine de participants et deux passes
(verrouiller puis déverrouiller), c'est une question à avoir tranchée à l'avance plutôt qu'à
découvrir au comptoir.

**Et sur la sous-cotation volontaire d'un compte créé le soir même : le dispositif ne repose pas
sur l'œil de l'admin.** La règle du gérant la neutralise déjà — le niveau retenu au classement
est le **maximum** entre le niveau de départ et la plus haute couleur réussie pendant l'épreuve.
Un grimpeur qui se déclare bleu et enchaîne un noir est classé parmi les noirs. La correction
manuelle est donc un filet de confort, pas la défense principale : il n'y a pas à l'attraper au
comptoir.

---

## §6 — Le déverrouillage d'après, et son ordre

Stéphane lève les verrous après le contest. ⚠️ **L'ordre compte** : déverrouiller avant que le
correctif du §4.3 soit déployé ferait tomber les comptes sans `baseLevel` sur `bleu` — c'est-à-dire
produire exactement le défaut qu'on vient d'éviter pendant l'épreuve.

> **Déployer d'abord le correctif, lever les verrous ensuite.**

Et il faut lever **tous** les verrous, sans en oublier : le code dit qu'un niveau verrouillé
n'est **plus jamais** touché par la synchronisation. Un verrou oublié, c'est un grimpeur dont le
niveau cesse définitivement de suivre ses badges — Roulette, défis et missions compris — sans que
rien ne le signale. **La liste des comptes verrouillés mérite d'être relevée avant le contest**,
pour que le déverrouillage se vérifie par comparaison plutôt que de mémoire.

C'est le même geste que ton `--expected` : le nombre écrit d'avance.

---

## §7 — Ce qui reste ouvert, et qui n'est pas de ce lot

- **Eddy Cizeron**, seul écart « trop bas » : badge jamais attribué faute d'ouverture de « Mes
  stats ». Il sera réparé par le correctif du §4.1, qui attribue les badges manquants.
- **La bonne source d'un `baseLevel` manquant, à terme, n'est ni Stéphane ni un script : c'est le
  grimpeur.** `ClientProfile` l'écrit déjà quand il enregistre son profil. Lui poser la question
  une fois, quand le cas se présente, est le vrai correctif.
  ⚠️ Et une phrase à revoir le jour où cette porte s'ouvre : l'aide client dit aujourd'hui que le
  niveau se met à jour tout seul et *« vous n'avez rien à saisir vous-même »* — ce qui décourage
  précisément le geste qui réparerait.
- **`users.level` reste un compteur entretenu sans filet** d'ici au déploiement du §4.4. C'est la
  même famille que `challenges.progress`, déjà sur la liste ouverte.
