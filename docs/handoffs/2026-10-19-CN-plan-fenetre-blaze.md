# ClaudeNav — la fenêtre Blaze : que mesurer, et comment en sortir

> Rédigé le 19/10/2026. Le projet est passé en Blaze ce soir, crédit d'essai de **264 €**,
> essai jusqu'au **18 janvier 2027**. **Retour en Spark décidé pour le 6 novembre.**
>
> ⚠️ **§1 — ne construis pas de collecteur quotidien.** Cloud Monitoring garde l'historique :
> la série entière se récupère **rétrospectivement**, en un seul passage. Ce qui ne se récupère
> pas après coup, c'est le **contexte** (§2) — et c'est la seule chose à noter au fil de l'eau.
>
> ⚠️ **§4 — la mesure la plus décisive de toute cette affaire est aussi la plus simple, et ce
> n'est pas une requête : c'est le crédit.**
>
> **§5 — le retour en Spark n'est pas un rappel, c'est une garde** : la sonde elle-même le
> détecte.

---

## §1 — Pas de collecteur quotidien : l'historique est déjà collecté

Le réflexe serait de poser une tâche planifiée qui relève les chiffres chaque nuit. C'est
inutile, et c'est de l'infrastructure construite pendant la fenêtre de gel.

**Cloud Monitoring conserve ses séries.** Une requête lancée le 6 novembre sur un intervalle du
19 octobre au 6 novembre rend les dix-huit jours d'un coup. Il n'y a donc **aucune discipline
quotidienne à tenir**, et aucun trou à craindre les jours sans séance.

⚠️ **À confirmer dès le premier passage, et c'est mesurable** : jusqu'où remonte réellement
l'historique ? Interroge un intervalle de 30 jours et regarde à quelle date les données
s'arrêtent. Ça **mesure** la rétention au lieu de la supposer — et si elle était plus courte que
la fenêtre, il faut le savoir maintenant, pas le 6 novembre.

Si la rétention couvre la fenêtre, un seul relevé suffit, le 6 au matin. Deux ou trois passages
intermédiaires restent utiles pour vérifier que rien ne casse, pas pour collecter.

---

## §2 — Ce qui doit être noté au jour le jour : le contexte, jamais les chiffres

C'est l'asymétrie qui structure tout :

> **Les nombres se récupèrent après coup. Le contexte, non.** Personne ne reconstituera le
> 6 novembre ce qui s'est passé le 24 octobre.

Donc un fichier plat, une ligne par jour notable, écrite **le jour même** :

```
2026-10-19 : passage en Blaze, 2 déploiements, saisie de blocs par Stéphane, plusieurs audits
2026-10-2x : répétition générale à 80
2026-10-2x : séance écrans sur téléphone réel, en salle
2026-11-05 : CONTEST — n participants, m blocs, horaires de début et de fin
2026-11-06 : relevé final, retour en Spark
```

Un nombre sans son contexte cesse d'être interprétable dès le lendemain. Une série de dix-huit
nombres sans contexte ne vaut rien ; la même avec cinq lignes d'annotations répond à toutes les
questions du §3.

---

## §3 — Les trois questions auxquelles cette fenêtre doit répondre

**① Que consomme une journée normale ?** C'est la ligne de base, et c'est ce qui manquait depuis
ce matin : sans elle, on ne sait pas quelle part du plafond journalier reste disponible le soir
d'un contest. Plusieurs jours calmes suffisent.

**② Que consomme réellement la soirée du contest ?** Le chiffre que rien n'a jamais produit.

**③ Et surtout : le modèle tenait-il ?** C'est le vrai enjeu, et il clôt le travail de la
journée. On a d'un côté **une unité mesurée** au navigateur — 23 à 43 écritures par grimpeur —
et de l'autre **un multiplicateur supposé**. Le 5 novembre donne le produit réel. Le diviser par
le nombre de participants rend l'unité réelle, et c'est **la seule occasion de savoir si la
mesure au navigateur disait vrai**.

> Un modèle qu'on ne confronte jamais à son terrain reste un modèle, aussi bien mesurée que soit
> son unité. Cette fenêtre est la confrontation.

Note les trois résultats séparément, en gardant la distinction « mesuré / supposé » dans la
sortie, comme pour l'instrument au navigateur.

---

## §4 — ⚠️ La mesure la plus décisive ne demande aucune requête

Le crédit est à **264 € sur 264 €**, intact.

Sur Blaze, les allocations gratuites s'appliquent toujours et **seul le dépassement tire sur le
crédit**. D'où ceci, qui répond en un coup d'œil à la question posée depuis ce matin :

> **Si le crédit n'a pas bougé le 6 novembre au matin, c'est que les quotas gratuits n'ont
> jamais été dépassés** — ni pendant les dix-huit jours, ni pendant le contest.

C'est binaire, sans interprétation, sans modèle, et ça ne coûte pas une requête. Toutes les
mesures du §3 restent utiles pour *savoir où l'on se situe* dans la marge ; celle-ci dit
simplement si le mur aurait été touché.

⚠️ Avec une réserve de lecture : **l'affichage des coûts retarde de plusieurs heures, parfois
plus de 24 h.** Donc le relevé du 6 au matin peut ne pas encore refléter la soirée du 5. À
reregarder le 7 ou le 8 — et c'est une raison de plus pour que le retour en Spark du §5 ne
dépende pas de ce chiffre.

---

## §5 — Le retour en Spark : la sonde est son propre rappel

La décision est prise et datée : **retour en Spark le 6 novembre**, dans la séquence qui a déjà
lieu ce jour-là — déployer le correctif des niveaux, lever les verrous, **redescendre le
forfait**. Pas une tâche séparée qui vit dans la mémoire de quelqu'un.

**Le geste est côté Stéphane**, console Firebase (⚙ → Utilisation et facturation → Modifier le
forfait → Spark). Ni toi ni moi ne pouvons le faire.

Mais tu peux faire mieux qu'un rappel, et ça tient en deux lignes dans la sonde :

> **Ajoute à sa sortie : « ⚠️ `timeSeries` a répondu 200 → le projet est en Blaze. Après le
> 6 novembre 2026, c'est un oubli de retour en Spark. »**

L'instrument qui a besoin de Blaze devient le détecteur de Blaze resté allumé. Toute exécution
ultérieure de la sonde le dit, sans que personne ait à y penser — c'est la forme « garde » plutôt
que « convention », et elle ne coûte rien.

**Et son dernier passage déclenche sa propre extinction** : le 6 au matin, relevé final de toute
la série, puis redescente. L'ordre est naturel, il n'y a rien à retenir.

⚠️ **Après la redescente, la sonde cessera de fonctionner, et c'est le comportement attendu.**
À écrire dans son en-tête, pour que personne ne la « répare » dans six mois.

---

## §6 — Ce que cette fenêtre ne doit pas devenir

- **Pas de collecteur planifié**, §1 ;
- **pas d'écran, pas de document `usage_stats`, pas d'alerte** : tout ça supposait une API
  disponible en permanence. Elle ne le sera que dix-huit jours, et le chantier du tableau de bord
  reste clos ;
- **pas de dépendance de l'application à Blaze.** Rien dans `frontend/` ne doit se mettre à
  supposer qu'un quota est illimité : le 6 novembre, le plafond revient ;
- **et surtout, pas de relâchement de la discipline d'écriture.** Le plafond ne mord pas pendant
  dix-huit jours ; il mordra de nouveau le 7. Ce qui est mesuré pendant la fenêtre vaut pour un
  projet en Spark, pas pour un projet sans limite.

La fenêtre sert à **savoir**, pas à **dépenser**.
