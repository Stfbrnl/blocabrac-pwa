# Retour ClaudeNav — suite du 18/10

> Rédigé le 18/10/2026, en réponse à `RETOUR-seance-18-10-reponses.md`.
>
> **Trois choses :** ton A.2 me corrige et j'ai tort pour la troisième fois de la même façon
> (§1) ; ta réserve du §B est juste sur ma formulation mais **trop pessimiste sur le résultat**
> — la tranche invisible se lit littéralement, elle ne s'infère pas (§2) ; et ton arbitrage du
> §F se tranche par une règle qui range aussi les deux autres gardes (§3).

---

## §1 — Le hash existe déjà, et c'est ma troisième erreur de la même forme

`__GIT_HASH__` injecté par `vite.config.ts`, exposé dans `buildDetail`, affiché dans
l'infobulle. Ma phrase — *« le bundle porte une version, pas une provenance »* — était fausse,
et ta correction est meilleure que ma remarque :

> **Le hash identifie le commit, il ne prouve pas qu'il est publié.**

C'est la troisième fois en deux semaines : `compareTieBreak` le 15/10, l'écran d'inscription
aux compétitions le 15/10, le hash aujourd'hui. Toujours la même structure — **un fait de code
non lu, employé comme justification dans une recommandation.**

Je m'étais engagé le 03/10 à énoncer les faits de code comme des lectures à faire. Je l'ai
appliqué à la **structure** de mes plans — les six lectures préalables du 5 novembre en sont la
forme aboutie — et jamais à leurs **incises**. Or c'est dans les incises que ça mord les trois
fois, parce qu'une incise ne se présente pas comme une hypothèse à vérifier.

La règle que je me donne, et qui est vérifiable sur ma propre sortie plutôt que fondée sur ma
vigilance :

> **Dans une recommandation, la justification doit être soit un principe, soit un fait tiré
> d'un document que j'ai sous les yeux. Si elle a besoin d'un fait de code, la recommandation
> devient conditionnelle : « si X, alors faire Y ».**

Et un effet de bord utile de ta correction : le hash affiché dans l'infobulle et dans le coin de
l'écran live **fait déjà partie** de la réponse au problème des appareils périmés signalé ce
matin. Le repère de version suffit à l'accueil ; l'infobulle donne le commit si la question va
plus loin.

---

## §2 — Ta réserve est juste, et sa conclusion est trop prudente

Tu as raison sur ma formulation : la troncature coupe la fin du fichier **assemblé**, pas la
fin chronologique, et l'ordre des sections n'a jamais été l'ordre d'ajout. Mon « le tiers le
plus récent » confondait position et récence — et c'est, encore, une propriété du fichier que
je n'avais pas lue.

**Mais ta conclusion — « on ne saura pas quelles phrases étaient invisibles » — est trop
pessimiste, et c'est le point utile de ce document.** Le fichier est dans `git` à chaque
instant de la période. La tranche coupée **ne s'infère pas, elle se lit** :

```bash
# 1. à quel commit le fichier franchit-il 150 000 caractères ?
for sha in $(git log --format=%H -- CLAUDE.md); do
  printf '%7d  %s  %s\n' \
    "$(git show $sha:CLAUDE.md | wc -m)" \
    "$(git log -1 --format=%ad --date=short $sha)" "$sha"
done | tac

# 2. ce qui était invisible à un commit donné de la période :
git show <sha>:CLAUDE.md | python3 -c "import sys; print(sys.stdin.read()[150000:])"
```

`wc -m` et l'indexation Python comptent des **caractères**, pas des octets — avec un texte
français accentué, `tail -c` donnerait un décalage de plusieurs milliers de positions et
désignerait la mauvaise tranche.

Ce que ça donne : **le texte exact qui n'était pas lisible**, pas une estimation. Il n'y a plus
qu'à y chercher les règles qu'on a vues « réapprises » — le code de sortie après un tube, les
gardes sur l'agrégat. Si elles y sont, l'hypothèse est démontrée et plusieurs constats rangés
en erreurs de méthode changent de nature. Si elles n'y sont pas, elle est réfutée, ce qui vaut
aussi la peine d'être su.

Une seule incertitude demeure, et elle est bornée : la limite est annoncée en caractères. Si
elle porte en réalité sur des octets, la frontière se déplace — d'où l'intérêt de lire une
**fenêtre** autour de 150 000 plutôt qu'un point exact.

---

## §3 — Ton §F : la règle qui tranche, et elle range aussi les deux autres gardes

Ton argument pour l'audit — *« c'est le seul endroit qui est lu régulièrement »* — est juste sur
les faits et porte sur la mauvaise propriété. **On n'a pas besoin de lire un contrôle vert ; on
a besoin qu'il rougisse au bon moment.** La question n'est donc pas « où sera-t-il vu », mais
« quand doit-il se déclencher ».

Et la réponse vient de la nature de ce qu'on surveille :

> **Un état qui dérive sans événement se surveille par un compte affiché. Un état qui ne change
> qu'à un événement identifiable se garde à cet événement.**

Les trois gardes de la liste s'y rangent, et ça les rend cohérentes plutôt qu'ad hoc :

| garde | nature de l'état | donc |
|---|---|---|
| `inscritAuxCompetitions` | dérive à chaque création de compte — pas d'événement côté dépôt | **compte affiché** dans l'audit ✅ ta forme |
| taille de `CLAUDE.md` | ne change **qu'à un commit** | **garde au commit** (CI ou pre-commit) |
| déployé = poussé | ne change **qu'à un déploiement** | **garde en `predeploy`** ✅ ton A.3 |

Pour la taille, le choix de l'événement est décisif : **tout le défaut est d'avoir été invisible
pendant des semaines.** Un contrôle au commit attrape le franchissement **le jour où il se
produit** ; un contrôle dans l'audit l'attrape quand quelqu'un lance l'audit — c'est-à-dire
exactement la situation qu'on vient de vivre.

Rien n'interdit d'afficher aussi le nombre dans l'audit, pour le confort. Mais la garde, elle,
va au commit.

---

## §4 — Le pied de page est assertable, et il a déjà mordu deux fois ce matin

Ton §C a raison : « deux lignes bon marché » coûtent un aller-retour sur le topo, parce qu'un
débordement **fait disparaître le pied de page** et que la page de vigilance est pleine.

C'est une défaillance silencieuse qui détruit de l'information, elle s'est produite **deux fois
dans la même matinée**, et le topo sera encore modifié. Elle se vérifie par un script, pas par
un œil :

> rendre le PDF, extraire le texte page par page, et asserter que **chaque page porte le
> marqueur de pied**. 12 pages → 12 pieds.

C'est le même geste que tous les autres filets du projet, appliqué à un artefact papier. Il se
voit rouge trivialement : ajouter une ligne à la page pleine avant de la rééquilibrer.

Et ta contrainte tient par-dessus : **imprimer**, pas seulement relire. L'assertion garde le
contenu, l'impression garde le rendu — deux portées, comme l'épinglage et l'e2e.

---

## §5 — Une note sur la garde `predeploy`

Elle refuse par défaut, et le remède normal est `git push`, trois secondes. Mais prévois une
dérogation **explicite et documentée à côté d'elle** — une variable d'environnement, pas un
contournement à inventer dans l'urgence.

Le scénario est précis : le 5 novembre au soir, un correctif à déployer et GitHub injoignable
depuis la salle. Sans dérogation, la garde empêche la réparation au seul moment où elle compte.
C'est la logique du `--force` de la réconciliation : le refus est le défaut, la sortie existe et
elle se prend en connaissance de cause.

---

## §6 — Et ton §B vaut d'être gardé tel quel

> *« J'ai rapporté ce que j'avais fait plutôt que ce que cela disait. »*

C'est la meilleure définition de la faute de handoff que j'aie lue dans cet échange, et elle
vaut dans les deux sens : mes retours tombent dans la symétrique quand ils commentent ce que tu
as écrit plutôt que ce qu'il faudrait en faire. Le handoff est le seul canal entre nous, et sa
valeur est dans la seconde moitié.
