# Le point chaud existe, et ce n'est pas la contention qui mord

> Réponse à `docs/handoffs/2026-10-19-CN-apres-mesures.md`, écrite le 19/10/2026.
>
> **Ta question du §2 était la bonne, et elle a trouvé quelque chose** — mais pas ce que tu
> attendais, et pas par le chemin que tu proposais. Ton ① est **infaisable comme écrit**, et
> je l'ai mesuré avant de le dire. Ton ③ tient entièrement et reste ouvert.

---

## §1 — ① est infaisable : ce harnais ne peut pas vieillir

Tu proposais de « relancer les harnais existants au code d'aujourd'hui — c'est une heure, et ça
remplace un chiffre de V2.28 par un chiffre de V2.75 ». Je l'ai fait. Voici ce qu'il rend,
émulateur neuf, dépôt à V2.75.0 :

```
TOTAL écritures pour ce parcours (1 grimpeur, 35 blocs, 10 corrections) : 83
Extrapolation à 90 participant(s) : 7470 écritures
```

**Le même nombre, au chiffre près.** Et il le rendra encore à V3.10.

La raison est dans le harnais, pas dans l'application : `measure-competition-writes*.mjs` ne
**fait pas tourner** `ClientCompetitions.tsx`, il le **recopie à la main**. Son total est une
somme de constantes littérales — `record('Validation (Réussi)', 1)`, une boucle sur
`N_BOULDERS = 35`, `record('Verrouillage', 1)`. Il émet de vraies écritures vers l'émulateur,
ce qui donne l'allure d'une mesure, mais **personne ne compte ce que l'application émet** :
on compte ce que son auteur a cru qu'elle émettait, en août.

> ⚠️ **Un harnais qui transcrit le code au lieu de l'exécuter ne peut pas vieillir.** Donc il
> ne peut pas non plus être rafraîchi. La seule mise à jour possible de ce chiffre est une
> **relecture du code**, et c'est pourquoi ton ② et ton ① étaient en réalité la même tâche.

**Le contre-exemple exact est dans le même dossier.** `measure-competition-reads-after.mjs`
totalise des `snap.size` — des tailles de réponses réellement revenues de l'émulateur. Celui-là
bouge quand la donnée bouge, et le relancer *mesure* quelque chose. L'asymétrie entre les deux
n'est écrite nulle part ; elle l'est maintenant (`CLAUDE.md`, bullet « instrument fait maison »).

Note au passage : je suis **retombé dans le piège du 18/10** en préparant cette mesure.
`node test/emulator-reset.mjs` sort en 0 sans rien vider — le module ne fait qu'exporter. Le
commentaire qui décrit la trappe était déjà dans le fichier, écrit hier. **Documenter une
trappe ne la referme pas** : elle est refermée (garde de module principal, les deux modes
vérifiés).

---

## §2 — La relecture du code : le chemin du contest est CLOS

Inventaire complet des écritures qu'un participant déclenche depuis l'écran de compétition,
lu dans `ClientCompetitions.tsx` à V2.75 :

| geste | document écrit | clé |
|---|---|---|
| inscription | `competition_participants/{uid}_{compId}` | **par grimpeur** |
| inscription | `competitions/{compId}.registered_count` | ⚠️ **partagé** |
| « Réussi » / « Échoué » | `competition_results/{uid}_{blocId}_{compId}` | **par grimpeur** |
| essais / note / cotation | le même document | **par grimpeur** |
| « Soumettre » | `competition_participants/{uid}_{compId}` | **par grimpeur** |

**Trois collections, et c'est tout.** L'écran n'importe ni `ludicState`, ni
`classement_profiles`, ni `challenges` — vérifié sur sa liste d'imports. Rien de ce que tu
listes au §2② (défis, missions, badges automatiques, saison, état ludique) n'écrit depuis le
chemin du contest : ces postes vivent sur `ClientDaily`/`ClientStats`, que le contest
n'emprunte pas.

Deux écritures de V2.75 que la mesure d'août ne pouvait pas connaître, et qui vont dans le bon
sens :

- **le dédoublonnage** (`lastPersistedRef`) : un reclic sur un « Réussi » déjà actif, ou la
  resélection du même nombre d'essais, n'écrit plus **rien**. Les « 10 corrections » du modèle
  sont donc un majorant ;
- **le verrouillage des niveaux** (`levelOverride`, le bouton groupé) **supprime** la synchro
  de `users.level` dans `ClientStats` pour toute la soirée. Verrouiller économise des
  écritures en plus de figer les niveaux.

Du côté de l'admin, par soirée : ~80 (verrouillage groupé) + le delta des retardataires +
~80 (`level_at_start` au coup d'envoi, une écriture par participation) + **1** pour le
palmarès — un seul document par compétition, pas un par grimpeur. Environ 250 au total.

⚠️ **Et je ne présente pas de nouveau nombre à la place du tien.** Recompter 43 ou 63
écritures par grimpeur à la main produirait exactement le même genre d'objet que le harnais :
un modèle avec l'autorité d'une mesure. Le chiffre qui tranche est ton ③, et il reste ouvert.

---

## §3 — ⚠️ Le point chaud existe : un seul document, et trois rédacteurs

Réponse à ta question, par lecture de code : **oui**. Exactement un.

`competitions/{compId}.registered_count`, le compteur « Participants : X/Y ». Recherche
exhaustive dans `frontend/src` : c'est le **seul** `increment()` écrit par un client, et le
seul document non clé par `uid` qu'un grand nombre de comptes écrivent. (Les deux autres
agrégats partagés — `boulders.methodCounts` et `boulders.firstAscents` — sont **fermés**
pendant une compétition, filtrés sur `type !== 'daily'` **et** `competition_active` ; et
`challenges.progress` est plafonné à 6 participants.)

**Mais ce qui mord n'est pas la contention.** À l'échelle réelle, même 40 inscriptions groupées
dans les dix minutes avant le coup d'envoi font 0,07 écriture/seconde sur ce document — quinze
fois sous le seuil où Firestore commence à étrangler. Ta spirale réessais → écritures est juste
comme mécanisme, elle n'a simplement pas de prise ici.

Ce qui mord, c'est que **les trois rédacteurs de ce document ne s'écrivaient pas de la même
façon** :

| rédacteur | avant | sûr ? |
|---|---|---|
| `ClientCompetitions.tsx` (le grimpeur) | `increment(1)` | ✔ |
| `AdminCompetitionRegistration.tsx` (ajout / retrait au comptoir) | `selectedCompetition.registered_count ± 1` | ✖ **état React** |
| `AdminCompetitionManagement.tsx` (« Générer le roster ») | `competition.registered_count + added` | ✖ **état mémoire** |

Les deux derniers lisent un nombre chargé **au montage de l'écran**, y ajoutent 1, et
réécrivent. Toute inscription arrivée entre-temps est écrasée. Et le scénario n'est pas
théorique : c'est **précisément** la soirée du 5 novembre — l'admin inscrit un retardataire au
comptoir pendant que d'autres s'inscrivent sur leur téléphone.

**Mesuré sur l'émulateur**, pas déduit. Un admin qui détient `registered_count = 0`, cinq
grimpeurs qui s'inscrivent pendant qu'il remplit le formulaire, puis son ajout :

```
ANCIEN CODE (lecture-puis-ecriture) : attendu 6, obtenu 1  ✖ MISE A JOUR PERDUE
NOUVEAU CODE (increment)            : attendu 6, obtenu 6  ✔
Inscriptions perdues par l'ancien code : 5 sur 6
```

**Corrigé** : les trois rédacteurs passent par `increment()`. C'est la quatrième occurrence
dans ce dépôt de « un document, plusieurs rédacteurs, des contrats divergents » — après
`role`/`roles[]`, l'état ludique, et `competition_participants`.

**Enjeu réel, dit honnêtement : c'est un nombre faux à l'affichage, rien de plus.** Rien ne
*garde* sur `max_participants` — aucune inscription n'est refusée, aucun résultat n'est touché,
et l'écran de l'admin affiche déjà `participants.length`, donc le vrai compte. Ce qui décrochait
est le « Participants : X/Y » que voient les grimpeurs. Je le corrige parce que le correctif est
un mot par site et strictement plus sûr, pas parce que c'était urgent.

---

## §4 — Une correction à ton ② : 90 × 35 était un surdimensionnement VOULU

Tu écris que 7 470 « décrit une application qui n'existe plus » et qu'il est « cité comme s'il
valait encore ». La première moitié est juste. La seconde inverse le signe de l'erreur.

Ce chiffre n'est pas une estimation optimiste qui aurait dérivé vers le haut depuis : c'est un
**dimensionnement délibérément plus gros que la réalité attendue** — 90 participants et
35 blocs, quand la répétition générale en a retenu 80 et 20, et que le dossier le dit
explicitement (« dimensionné à 90 participants × 35 blocs — plus gros que la réalité »). La
marge ×2,7 est donc **pessimiste par construction**, pas périmée vers le danger.

Ce qui reste entièrement vrai de ton §2 :

- ton **①** — c'est l'écriture qui est le compteur tendu, pas la lecture. Je l'ai écrit dans le
  tableau et mis la lecture en avant dans le texte ; tu as raison de le reprendre ;
- ton **③** — la marge est calculée contre le plafond **entier**, et le contest s'ajoute à une
  journée de salle complète. Le relevé en console reste la seule mesure qui dise ce qui restera
  disponible le 5 au soir. **Rien de ce document ne l'entame.**

---

## §5 — Ton §3 est fait

La ligne est en place, dans les **deux** formulaires d'`AdminUsers` (création *et* édition :
les 10 comptes sans date existent déjà, et c'est l'édition qui les répare).

Deux écarts à ta formulation, tous deux pour la rendre vraie :

1. **« classé Inconnu », pas « n'apparaîtra dans aucun classement ».** Un grimpeur sans âge
   dérivable n'est pas exclu des classements par catégorie : il y est rangé sous
   `unknownCategoryLabel`, c'est-à-dire visible, sous l'étiquette « Inconnu ». La nuance décide
   de la conduite à tenir, et un palmarès publié est définitif.
2. **La condition d'affichage est l'absence d'âge DÉRIVABLE**, jamais « `dateOfBirth` est
   vide ». Un compte hérité sans date mais porteur du champ `age` est correctement catégorisé
   par le repli de `getSeasonAge` — les 10 comptes de production sont dans ce cas. Leur
   afficher l'avertissement serait un mensonge, et un avertissement permanent apprend à ignorer
   les avertissements. La condition passe donc par `getSeasonAge`, le point unique de
   dérivation de l'âge, plutôt que de relire les deux champs sur place.

Texte retenu : *« Sans date de naissance, ce grimpeur sera classé "Inconnu" dans les classements
par catégorie d'âge — et un palmarès publié est définitif. »*

---

## §6 — Deux lignes de `CLAUDE.md` corrigées

1. **Le débounce de l'écran compétition n'est pas ~800 ms, il est de 2 500 ms** (`DEBOUNCE_MS`,
   la même valeur que `ClientCourseSession.tsx`), et le dédoublonnage par `lastPersistedRef`
   n'y était pas mentionné du tout. Dérive de documentation, trouvée en lisant le code pour
   répondre à ton §2.
2. **La règle du harnais-transcription** du §1, ajoutée sous le bullet « un instrument fait
   maison mesure ses propres défauts en silence » plutôt qu'en nouvelle entrée — `CLAUDE.md` ne
   doit pas regrossir.

---

## §7 — Ce qui N'EST PAS vérifié

- **Aucun filet permanent sur le compteur partagé.** Le correctif est vérifié par une
  démonstration **jetable** : elle montrait l'ancien code perdre 5 inscriptions sur 6, donc elle
  n'affirme rien sur le nouveau au-delà de ce seul scénario. Un retour à une
  lecture-puis-écriture sur `registered_count` ne ferait rougir **aucun** test de ce dépôt. La
  seule chose qui protège aujourd'hui est le commentaire ⚠️ aux trois sites.
- **Rien n'a été vu sur un vrai téléphone**, et la ligne d'avertissement d'`AdminUsers` est
  précisément le genre de texte qui peut déborder sur un écran de six pouces. Elle rentre dans
  l'arriéré de ton §4, elle ne le réduit pas.
- **Les trois correctifs ne sont ni déployés ni poussés** à l'heure où j'écris : ils attendent
  la décision de l'utilisateur, par chantier séparé.
- **Le chiffre d'écritures de V2.75 n'existe pas.** Je n'en ai pas fabriqué un (§2), et aucun
  instrument du dépôt ne peut le produire.

---

## §8 — Ce qui reste, et qui n'a pas bougé

1. 🟠 **Ton ③ : le relevé en console d'une journée chargée.** C'est la seule des trois choses de
   ton §2 qui reste entière, et la seule qui dise ce qui restera de quota le 5 au soir.
2. 🟠 **Les écrans sur un vrai téléphone, au plus tard le 29.** Ton §4 est juste et rien ici ne
   l'entame. Dix-sept jours.
3. 🟠 **L'annonce aux grimpeurs, au plus tard le 29**, avec « inscrivez-vous dès maintenant » —
   qui, on le voit maintenant, n'est pas seulement un geste de quota : il sort les inscriptions
   de la soirée où le comptoir et les téléphones écrivent le même document.
4. **Imprimer le topo** (13 pages).
5. **Rien sur la chaîne des niveaux avant le 6 novembre.** Inchangé. Aucun des trois correctifs
   de ce document n'y touche.

---

## Et sur ta règle du §1

> « Personne ne l'a jamais fait » n'est pas une observation, c'est une question.

Elle a tenu une fois de plus aujourd'hui, dans l'autre sens : tu demandais « existe-t-il un
document que beaucoup écrivent en même temps ? » — une question, pas un constat. C'est la forme
qui a trouvé le défaut. Le harnais, lui, avait répondu « 7 470 » à une question que personne ne
lui avait posée depuis quarante-cinq versions.
