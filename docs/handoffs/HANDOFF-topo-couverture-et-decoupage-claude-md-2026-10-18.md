# Handoff ClaudeNav — topo, couverture de l'interrupteur, et découpage de `CLAUDE.md`

**Séance du 18/10/2026 (Claude Code).** Pas de nouveau plan, pas de nouveau code applicatif :
cette séance ferme les deux points de l'ordre décidé le 15/10 au soir, dans cet ordre.
**V2.74.1 reste la version en production, inchangée. Rien n'a été déployé.**

⚠️ **Le point qui te concerne le plus directement est le 3 : `CLAUDE.md` a été découpé. Une
partie de la doctrine que tu cites n'y est plus, elle est dans `docs/architecture/`.**

---

## 1. Topo papier à jour (dernière étape du rituel du 15/10, restée en plan faute de crédits)

Le chantier du 5 novembre n'était décrit **nulle part** dans le topo, alors que c'est
l'ouvreur ou l'admin qui actionnera le bouton de publication le soir même.

| Où | Ce qui a été ajouté |
| --- | --- |
| Page neuve « 06 (suite) » | « Palmarès officiel d'une compétition » : les **cinq** classements gelés, les deux gestes (aperçu → confirmation définitive), pourquoi un gel plutôt qu'un recalcul, le départage et ce qu'il faut annoncer au micro, le nom tronqué et l'absence de date de naissance |
| Table Admin | ligne « Publier le palmarès » ; et le passage en « en cours » **fige le niveau de départ** |
| Table Client | ce que « Mes compétitions » montre et ne montre pas pendant l'épreuve (**aucun classement**), et la section « Palmarès officiels » après |
| Points de vigilance | « Publier le palmarès est définitif » ; « Inscrire les participants avant le coup d'envoi » |
| Sommaire | « 06 Barème, classements & palmarès » |

**Deux débordements traités**, et c'est la partie non triviale : un débordement accidentel
**fait disparaître le pied de page** de la page concernée.
- La page « 04 Admin + 05 Options » était pleine à ras bord **avant** cet ajout : une seule
  ligne de table la faisait déborder. Coupée en deux pages explicites, chacune avec son pied.
- La page « 07 Points de vigilance » débordait à son tour : son groupe « Cours & séances » est
  passé sur la page de suite, qui avait la place.

**Vérifié en relisant le PDF rendu, pas en supposant** : 12 pages pour 12 sections, un pied de
page partout.

Corrigé au passage : `.warn b` est en `display:block` (c'est le **titre** de l'encadré), ce
dont héritait une emphase à l'intérieur du paragraphe — elle cassait la ligne avant et après
elle (« Seul le classement / de saison / (nouveau)… »). Une règle `.warn p b` la repasse en
`inline`.

## 2. L'interrupteur « Je publie quand même » est enfin exercé

C'était le chemin non couvert nommé explicitement en fin de séance du 15/10. Le seed figeait
`level_at_start` sur **toutes** les participations, donc `niveauxNonFiges` valait 0 : ni
l'avertissement, ni le bouton inerte, ni l'interrupteur n'étaient jamais atteints.
`e2e-palmares-flow.mjs` passe de **17 à 19 pas**, tous verts.

**Le seed exprime désormais les DEUX absences, de part et d'autre du coup d'envoi** — et c'est
ce qui donne sa valeur au contrôle :
- Chloe inscrite **avant** `started_at`, sans `level_at_start` → défaut réel, **doit** être
  comptée ;
- Victor inscrit **après**, sans `level_at_start` → retardataire **légitime**, ne doit **pas**
  l'être ;
- `competitions.started_at` ajouté, sans lequel l'écran ne peut pas trancher et avertit sans
  distinguer — le seed doit exercer la branche où il **tranche**.

L'attendu est donc **1, pas 2**. Avec un seul cas, « 1 » et « 2 » seraient indiscernables et
une garde comptant naïvement toutes les absences resterait verte. (`level_at_start` valant
`level` partout dans ce seed, son absence ne déplace **aucun** classement : aucun rang attendu
n'a eu à bouger.)

**Trois cassures, une par propriété, chacune vue rouge séparément** — ta règle du 15/10 :
1. Victor ramené avant le coup d'envoi → pas 3 **et** pas 7 rouges (le compteur passe à 2) ;
2. la condition `!risqueAssume` retirée du bouton → pas 7 rouge (bouton actif) ;
3. `setRisqueAssume(false)` retiré → pas 8 rouge.

### ⚠️ Et la troisième a d'abord produit du VERT. C'est le vrai enseignement de la séance.

La vérification de la remise à zéro vivait dans le pas de **republication**, qui survient après
un `reload()`. Or **un rechargement remonte le composant et remet l'état à `false` tout seul** :
l'assertion ne pouvait pas rougir. Ce n'est pas le jeu de données qui empêchait le défaut de
s'exprimer — c'est le **décor du pas**.

Elle vit maintenant dans un pas dédié qui **ferme et rouvre l'aperçu sans rechargement**, seul
endroit où la remise à zéro explicite est la seule explication possible. La forme générale est
ajoutée aux règles de méthode de `CLAUDE.md` : **se demander ce qui, dans le décor, produirait
l'effet attendu à la place du code.**

Deux précisions mineures trouvées en chemin :
- le `Switch` de MUI pose `role="switch"`, qui l'emporte sur le rôle implicite de son
  `<input type="checkbox">` : `getByRole('checkbox')` renvoie **0**. Lu dans le DOM rendu ;
- une exécution interrompue laissait la sauvegarde d'essai de `unpublish-*` sur le disque et
  faisait échouer le pas « la simulation n'écrit rien » **sur un fichier qu'elle n'avait pas
  créé** — un rouge qui ne désigne pas son défaut. Le flux la supprime à son démarrage.

## 3. ⚠️ `CLAUDE.md` découpé : 190 ko → 80 ko

Le fichier avait atteint **≈ 190 000 caractères pour une limite de 150 000**. Il était donc
tronqué en silence — et une troncature coupe le tiers **le plus récent**, c'est-à-dire le plus
utile. Découpage accepté « pour après » le 15/10 ; c'était maintenant.

**Le critère est la NATURE, jamais l'ancienneté :**
- **reste dans `CLAUDE.md`** ce qui s'applique **sans condition** — invariants, ⚠️ courts,
  interdits, procédures (bump de version, déploiement), et les **règles de méthode**, qui sont
  les plus courtes et les plus chères à redécouvrir ;
- **part dans `docs/architecture/`** le **récit** : l'histoire, les incidents, les arbitrages,
  les chiffres de mesure, les variantes rejetées et pourquoi.

Huit documents (180 ko au total) : `blocs.md`, `classement-et-saison.md`, `competitions.md`,
`jeu-et-missions.md`, `etat-ludique.md`, `badges-et-niveaux.md`,
`cache-et-service-worker.md`, `tests-et-fiabilite.md`.

**Le texte n'a pas été réécrit : il a été DÉPLACÉ tel quel**, titres compris, pour qu'un
`git log -S` retrouve encore sa formulation d'origine.

Les **33 sections** d'architecture de `CLAUDE.md` sont toutes conservées, dans le même ordre,
et chacune porte en tête un lien 📖 vers son document. ⚠️ **Ce lien est un DÉCLENCHEUR DE
LECTURE, pas une référence de courtoisie : le résumé suffit pour comprendre, pas pour
toucher.** La règle d'écriture qui évite la rechute est énoncée dans le fichier : une
nouveauté qui ne s'applique pas sans condition enrichit le document d'architecture, pas
`CLAUDE.md`. S'il regrossit, c'est que du récit s'y est réinstallé.

**Ce que cela change pour toi** : quand tu cites « `CLAUDE.md` dit que… », vérifie d'abord si
la phrase est encore là ou si elle a migré. Les ⚠️ les plus structurants y sont restés (74 ⚠️
dans `CLAUDE.md`, 51 dans les documents d'architecture) ; ce qui a migré, ce sont les récits
d'incident et les mesures.

**Vérifications faites** : les 33 titres sont là et dans l'ordre ; les huit liens résolvent et
aucun document n'est orphelin ; aucun lien markdown relatif n'a été cassé (les documents ne
citent leurs sources qu'en code inline) ; les 51 ⚠️ restés dans les documents d'architecture
ont été relus un par un pour vérifier que leur part inconditionnelle figure bien dans
`CLAUDE.md`.

---

## Ce qui n'a PAS été vérifié, dit plainement

- **Aucun écran n'a été ouvert sur un vrai appareil.** L'arriéré court depuis V2.70.1.
- **Le §4.4 reste à faire à la main** (ouvrir la page des compétitions avant une publication,
  publier, recharger) : la persistance Firestore est désactivée de force sous
  `VITE_USE_EMULATOR`, donc aucun e2e ne peut l'exercer.
- **Le PDF a été relu page par page, mais n'a pas été imprimé.**
- **Rien n'est poussé** : 14 commits d'avance sur `origin/main` (11 du 15/10 + 3 d'aujourd'hui,
  plus celui des règles de méthode). Aucun ne touche le code applicatif.

## Points ouverts par ailleurs (repris du 15/10, aucun traité)

1. **L'annonce orale dans la salle le 5 au matin** — trois points, texte prêt dans
   `RETOUR-avant-deploiement-reponses.md`. Le changelog ne la remplace pas.
2. **Contexte unique des rôles**, avec le chantier « droits d'accès, rôle ouvreur trop large ».
   ⚠️ Jamais justifié par l'économie de lectures.
3. **`inscritAuxCompetitions` lui-même** : à supprimer ou à assumer en opt-out — après le
   5 novembre.
4. Le chemin d'**échec** du réarmement de minuteur dans `useDebouncedFlushQueue`.
5. `challenges.progress` : compteur incrémental sans filet **et** à échec silencieux.
6. `assertNoOrphanLabels` n'est branché que sur 3 e2e ; `assertNoFullLastName` sur 1.
7. Défis `fenetre` / `bloc_designe` : toujours sans e2e navigateur.
8. Finale non annoncée ; sauvegarde durable des images Cloudinary.
