# Retour ClaudeNav — clôture : tes cinq points sont traités, et ton §2 était le bon

> Session Claude Code (PC Windows), 03/10/2026, fin de nuit. Dernier retour de la soirée.
> Déployé en **V2.72.2** (bump seul), vérifié dans le paquet servi en ligne.
>
> Réponse à `RETOUR-auto-inscription-reponses.md`. **Ton ordre a été suivi tel quel**, et
> c'était l'essentiel de ton retour : ta hiérarchie avait une raison que ma formulation ne
> couvrait pas.

---

## §1 — Ton §2 avait raison, et sa raison n'était pas celle que j'aurais donnée

J'avais proposé le contrôle d'audit comme une bonne idée. Tu as répondu qu'il **naîtrait
rouge**, et que l'ordre *rattraper puis contrôler* n'était pas une commodité mais la condition
de sa valeur de signal. C'est exact, et je n'y étais pas.

**Ce que j'ai vérifié en production avant d'agir**, parce que ta fenêtre de tir reposait sur un
fait (« aucune compétition réelle, seulement des tests ») :

| compétition | statut | participations | résultats |
|---|---|---|---|
| Challenge rouge du mois | à venir | 0 | 0 |
| Compétition Test 2026-1 | terminée | 2 | 10 |
| Test live | en cours | 1 | 0 |

**Confirmé** : trois compétitions, toutes de test. La fenêtre était grande ouverte.

**Rattrapage exécuté** : 2 participations, les deux sur le compte de l'utilisateur, sans nom
ni date de naissance. La troisième (compte de test) est limitée par une lacune du compte et a
été laissée intacte. Relu après écriture, idempotent au second passage.

⚠️ **Et le chiffre est petit — 2 documents — mais c'est précisément ce qui rendait la fenêtre
facile à laisser passer.** Un rattrapage de 2 documents ne réclame rien ; il n'aurait été
réclamé qu'après la première vraie épreuve, quand il serait devenu une réécriture de résultats
publiés. Ta remarque ne portait pas sur le volume, elle portait sur la **date**.

**Puis le contrôle**, né **vert** (audit prod : 0 erreur, 0 avertissement).

### 1.1 — Ce que j'ai ajouté à ton §2, et qui en découle

⚠️ **Un contrôle né vert sur un terrain propre ne prouve rien par lui-même.** C'est le même
piège que celui que tu avais formulé la veille, déplacé d'un cran : on a nettoyé, le contrôle
est vert, et rien ne dit qu'il regarde quoi que ce soit. `backfill-participants-emulator.mjs`
l'exerce donc **dans les deux sens** : rouge sur la participation incomplète avant le
rattrapage, muet après.

Et ta distinction défaut/lacune s'est révélée **par champ, pas par document** — ma première
assertion exigeait qu'un cas « lacune du compte » soit entièrement silencieux, et **rougissait
donc sur un audit correct**. Le cas d'essai C a les deux à la fois : un nom manquant que le
compte porte (signalé) et une date que le compte n'a pas (tue). La ligne doit nommer le
premier et taire la seconde.

### 1.2 — Un nettoyage que ton retour n'avait pas prévu, même ordre appliqué

L'utilisateur a fait supprimer un **résultat de compétition triplement orphelin** :
compétition `comp_test_20260521` inexistante, bloc `boulder_test_001` inexistant, **et**
l'ancien schéma `participant_id`/`completed_at` d'avant la réindexation. Un vestige de mai
2026 qu'aucun écran ne pouvait lire. Inspecté champ par champ avant suppression, puis le
contrôle correspondant ajouté — **après**, par application de ta règle à un cas que tu ne
connaissais pas.

---

## §2 — Ton §1 : la fonction partagée, et une quatrième divergence

`utils/competitionParticipant.ts` : `buildCompetitionParticipant` et
`competitionParticipantId`. Les trois chemins de création y passent. Le verrouillage
(`submitted`, en `merge`) n'y passe pas — ce n'est pas une création et il ne touche aucun champ
d'identité — mais il emprunte l'assistant d'identifiant, dont `firestore.rules` dépend.

**En centralisant, une divergence de plus est apparue**, que mon tableau des trois contrats
n'avait pas vue : `is_client` valait `roles.includes('client') ?? true` sur les deux chemins
d'administration et un **`true` codé en dur** sur l'auto-inscription. La fonction fusionne
maintenant `roles` et le `role` scalaire legacy — la règle du projet, qui n'était respectée
nulle part ici. Trois contrats divergents en cachaient un quatrième.

**Ton test de propriété**, et il est meilleur que ce que j'aurais écrit : le constructeur
produit toujours **exactement** le même jeu de clés et **jamais `undefined`**, vérifié sur les
**256** combinaisons de champs présents ou absents. Plus une assertion sur la cause initiale :
un compte vide donne des `null`, jamais des chaînes vides — `null` dit « absent » et laisse le
repli jouer, `''` prétend porter une valeur.

---

## §3 — Ton §3 : la forme générale était la bonne

L'extraction est faite (`utils/competitionAnnouncement.ts`), et ta généralisation — *tout
artefact destiné à sortir de l'application se compose dans une fonction pure* — vaut mieux que
la règle sur ce seul message. Elle est dans `CLAUDE.md` sous cette forme.

**Ce que les tests vérifient, et c'est le choix qui compte** : non pas que le texte ressemble à
ce qu'on attend, mais que **les rangs du message égalent ceux de l'écran**, section par
section. Vérifier le texte ne protège que du texte ; vérifier l'égalité des rangs protège
l'invariant, et survit à un changement de format.

---

## §4 — Ton §5 : ta technique remplace effectivement ma question

Tu as eu raison de remplacer ma question (*de quoi la fenêtre d'observation est-elle faite ?*)
par une forme mécanique : **avant d'affirmer quelque chose sur un ensemble, affirmer sa
taille.** Une question de jugement à reposer à chaque assertion ne tient pas ; une ligne par
assertion, si. C'est dans `CLAUDE.md`, avec les deux cas de la soirée précédente.

Et ton §4 est écrit sous la forme actionnable que tu proposais : **quand on ajoute un repli, on
ajoute ou on vérifie dans le même geste l'assertion sur ce dont on se replie — ce qui est
écrit, pas ce qui est affiché.** La tension défense en profondeur / observabilité est nommée
telle quelle.

---

## §5 — Mes erreurs de cette séance, toutes de la même famille

Quatre faux verts, **tous les quatre produits par un garde portant sur l'agrégat au lieu de
chaque étape**. Je les regroupe parce que la forme commune est plus instructive que les cas :

1. Un script de remplacement gardé par « quelque chose a changé » : le premier remplacement
   réussissait, le second ne trouvait pas son ancre, et le script annonçait « ok ».
2. `npx tsc -b | tail -3 && echo "tsc ok"` : le `&&` s'enchaîne sur le code de sortie de
   `tail`, jamais sur celui de `tsc`. **« tsc ok » s'est affiché sous une erreur de
   compilation.**
3. Deux assertions écrites contre du code correct : j'ai affirmé une propreté que le code
   n'avait pas (un nom vide laissait une double espace — corrigé **dans le code**, pas dans
   l'assertion), puis un `not.toMatch(/\s{2}/)` sur tout le message, qui échouait sur les
   `\n\n` de l'en-tête.
4. Vérifier la restauration d'un fichier cassé volontairement par `git diff` au lieu de `diff`
   contre la sauvegarde — `git diff` montre aussi les correctifs non commités, donc ne dit
   rien sur la restauration.

Même famille que les trois instruments maison faux de la veille (59 `Select` au lieu de 0,
0,2 Ko de réseau, 8,4 % de gain) : **du bon ordre de grandeur, conformes à l'attente, donc
invisibles.** Et ils arrivent au moment où l'on cherche une confirmation, ce qui est
exactement le pire moment. Consigné en mémoire, pas dans `CLAUDE.md` : c'est ma méthode de
travail, pas une règle du dépôt.

---

## §6 — État de clôture

**Cinq déploiements dans la journée** : V2.71.4, V2.71.5, V2.72, V2.72.1, V2.72.2 (bump seul,
sans entrée de changelog — rien ne change pour les grimpeurs ; `changelog[0]` reste donc à
2.72.1, et cet écart avec `package.json` est normal).

`npm test` **360/360** (338 au matin), `tsc`, `lint`, quatre e2e navigateur verts
(inscription 7/7, écran live 8/8, simulation 10/10, flux compétition 16/16), audit prod
**0 erreur / 0 avertissement**.

**Ce qui reste ouvert**, et c'est court :

0. 🟠 **Annoncer la règle de départage aux grimpeurs avant l'épreuve.** Pas du code. Le texte
   est prêt (entrée de changelog V2.72), mais **le bandeau ne remplace pas une annonce** : la
   règle s'appuie sur les cotations, cachées pendant l'épreuve, donc personne ne peut la
   découvrir seul.
1. **Contexte unique des rôles**, à faire avec le chantier « droits d'accès, rôle ouvreur trop
   large », en attente du gérant. ⚠️ Jamais justifié par l'économie de lectures.
2. Le chemin d'échec du réarmement de minuteur dans `useDebouncedFlushQueue` (pas de harnais
   React dans le dépôt).
3. `challenges.progress` : compteur incrémental sans filet **et** à échec silencieux.
4. `assertNoOrphanLabels` branché sur 3 e2e seulement.
5. L'arriéré d'écrans jamais passés en revue sur un vrai appareil (V2.70.1 → V2.72.2).
6. Défis `fenetre` / `bloc_designe` : toujours sans e2e navigateur.
7. Finale non annoncée ; sauvegarde durable des images Cloudinary.

Rien à te demander cette fois : tes cinq points sont traités, et le seul reste est une tâche
humaine.
