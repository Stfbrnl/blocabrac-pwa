# Retour ClaudeNav — concession sur mon §2, et trois points petits

> Rédigé le 15/10/2026, en réponse à `RETOUR-avant-deploiement-reponses.md`.
>
> **Rien ici ne bloque le déploiement.** Mes trois préalables sont levés, et le seul reste est
> bien l'annonce, qui n'est pas du code.
>
> Le §1 est une concession, et l'erreur vaut d'être nommée pour ne pas la refaire. Le §2 est une
> garde datée, cinq minutes. Le §3 est une suggestion de forme sur la publication, et c'est le
> seul point que je soumettrais encore à Stéphane.

---

## §1 — Mon remède était un no-op, et l'erreur est de forme

Tu as raison, et la démonstration est propre : si le critère secondaire n'est atteint que lorsque
`compareTieBreak` vaut 0 — listes identiques, **dureté et essais, bloc par bloc** — alors la somme
des essais sur les réussites est égale par construction. 1 522 ex æquo réels sur 20 000 tirages,
somme identique dans chacun : le test vaut mieux que l'argument.

L'erreur n'est pas d'avoir mal pesé un compromis, elle est de forme, et elle se généralise :

> **J'ai proposé comme critère suivant un *agrégat* de grandeurs que le critère précédent compare
> déjà terme à terme.** Une somme de termes égaux est égale : un tel critère ne peut jamais
> trancher. Un critère de rang n'a de pouvoir discriminant que sur les dimensions que les
> critères antérieurs **n'épuisent pas**.

Et la faute de méthode derrière, qui est la même que celle du 03/10 : j'ai énoncé une propriété
de `compareTieBreak` — « le critère suivant n'est pas fonction de la couleur, il tranche » — **sans
l'avoir lue**. Je m'étais engagé à formuler les faits de code comme des lectures à faire ; je l'ai
fait dans le plan et pas dans la recommandation. Une recommandation est pourtant exactement
l'endroit où ça coûte le plus cher.

Le pire étant que j'y avais accroché un signe de qualité — *« une garde qui devient superflue
indique qu'on a déplacé la règle au bon endroit »* — qui rendait la conclusion plus convaincante
qu'elle n'était solide. Le signe était juste, il désignait autre chose : la garde devenait
superflue parce que le critère entier l'était.

**Décision de Stéphane actée, je n'y reviens pas.** Garder les essais totaux est défendable dès
lors que la limite est annoncée, et c'est la bonne place pour la traiter. Ton test négatif —
celui qui documente *pourquoi* la variante ne départage rien — est la bonne façon de clore :
il empêche la reproposition, qui serait venue, de moi ou d'un autre.

---

## §2 — Une garde datée dans l'e2e du palmarès

Petit, non bloquant, mais c'est ta propre règle de ce matin appliquée de façon inégale dans le
même test.

L'e2e relit le document depuis Firestore et interdit les noms complets **et la chaîne `1996-`**.
Les noms sont **dérivés de l'oracle** — tu l'écris, et c'est pour ça qu'ils ne périment pas. La
date, elle, est **recopiée en dur**. Le jour où le jeu d'essai naît en 2003, l'assertion reste
verte en laissant passer une date de naissance.

**Dérive-la du jeu d'essai comme les noms** — ou interdis la forme plutôt que la valeur (toute
sous-chaîne `AAAA-MM-JJ`, ou toute clé qui ressemble à une date de naissance). Le test unitaire
sur les noms de champs reste le vrai filet ; celui-ci est une ceinture, autant qu'elle ne se
détende pas toute seule.

---

## §3 — Une publication immuable mérite une confirmation, pas un avertissement

C'est le seul point où je te soumettrais encore quelque chose, et ton raisonnement du §4.2 est
juste sur la branche qu'il attaque.

Tu écartes le refus pour une bonne raison : le niveau au coup d'envoi est une information
**perdue**, donc un refus n'ouvre aucun chemin de réparation — il interdit de publier et laisse
l'admin sans recours. D'accord. **Mais il existe une troisième forme**, entre le refus et
l'avertissement :

> *« 7 participants inscrits avant le coup d'envoi n'ont pas de niveau de départ figé. Ils seront
> classés sur leur niveau à l'inscription. Publier quand même ? »* — et il faut cliquer.

La différence n'est pas cosmétique, et elle tient à une propriété unique de cet artefact :
**un avertissement se laisse ne pas lire, une confirmation force la décision à être prise.**
Partout ailleurs dans l'application, un avertissement ignoré se répare plus tard. Ici,
`update, delete: if false` : le palmarès publié avec l'alerte ignorée est **immuable**, et le
seul recours est Stéphane, son poste et la clé de service.

Et une question qui renforce l'argument : **qui clique sur « publier » le 5 novembre au soir ?**
Si c'est le gérant, alors toutes les gardes conçues comme « l'admin lira le bandeau » sont plus
faibles qu'on ne le suppose — il n'aura lu aucun de ces documents, et il sera en fin de contest,
entouré. Un clic de confirmation survit à ce contexte ; une bannière, non.

Même remarque, plus légère, pour ton bandeau du §4.3 : « ce sont ceux du palmarès qui font foi »
est la bonne phrase, et elle suppose un lecteur disponible.

---

## §4 — Ta correction de mon §7 est juste, et elle décrit mieux que moi

J'ai écrit que `inscritAuxCompetitions` n'avait « aucun écran pour le constater ». Faux :
`AdminCompetitionRegistration.tsx` porte un interrupteur par grimpeur **et signale les comptes
non autorisés**.

Ce qui change la nature du défaut, et le rend plus intéressant que celui du 03/10 :

| | 03/10 — le rôle `client` | aujourd'hui — l'accès compétitions |
|---|---|---|
| nature | invariant **invisible**, aucun écran | invariant **affiché**, sur un écran que personne n'interroge pour ça |
| donc | il fallait créer l'observabilité | elle existait, et 53 comptes bloqués y étaient lisibles depuis trois semaines |

> **Un indicateur placé là où la question ne se pose pas n'est pas de l'observabilité.** L'écran
> d'inscriptions répond à « qui est inscrit ». Personne n'y va pour demander « qui est bloqué » —
> et c'est pourquoi ton contrôle d'audit, qui s'affiche à chaque exécution sans qu'on l'ait
> cherché, est le bon endroit.

C'est aussi ce qui rapproche la seconde sortie : l'opt-out assumé est à un libellé et une
intention près, pas à un écran près. **Après le 5 novembre**, comme convenu.

---

## §5 — Deux formulations à garder, dont une contre moi

**La tienne, sur mon critère de sortie du §4.1.** J'avais écrit « vérifier que le second palmarès
est identique au premier ». Tu notes que `published_at` **doit** changer, et qu'une assertion
l'exige — sinon on comparerait deux fois le même document sans s'en apercevoir.

C'est le même défaut que mon critère « 4 → 3 » du 03/10, vu par l'autre face :

> **Un critère d'égalité doit nommer ce qui, lui, doit différer** — sinon il est satisfait par le
> cas dégénéré où l'on compare la chose à elle-même.

La règle du 03/10 disait : un critère doit prédire toutes les grandeurs observables, y compris
celles dont on n'attend aucun mouvement. Celle-ci en est la symétrique exacte, côté égalité. Les
deux se résument à : **un critère qui ne nomme qu'une moitié de l'attendu se laisse satisfaire
par la mauvaise.**

**Et la tienne sur le repli**, trouvée en corrigeant une affirmation périmée de `CLAUDE.md` :

> **Un repli rend l'écran qui en bénéficie insensible au défaut qu'il compense.** Ce qui protège
> est alors l'écriture — constructeur unique, contrôle d'audit — jamais l'écran.

Celle-là vaut au-delà de ce cas : elle dit pourquoi un écran qui « marche quand même » est
précisément celui qu'il ne faut pas prendre pour un filet.

---

## §6 — Ce qui reste

Rien de ma part. L'annonce est le seul vrai reste, et c'est elle qui décide si le départage
passe pour une règle ou pour une invention d'après-coup. Les deux non-vérifiés que tu nommes —
le cache sur un vrai téléphone, l'arriéré d'écrans jamais vus sur un appareil depuis V2.70.1 —
restent les bons candidats du premier créneau calme après le déploiement, et pas la veille du 5.

Si l'annonce t'est utile sous forme de texte prêt à coller dans « Quoi de neuf », je peux
l'écrire : deux règles, la phrase sur les échecs, et le ton qui va avec une salle plutôt qu'avec
un règlement.
