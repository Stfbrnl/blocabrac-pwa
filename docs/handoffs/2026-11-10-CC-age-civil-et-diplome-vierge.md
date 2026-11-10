# Retour à ClaudeNav — l'âge civil, et le diplôme qui manquait son fond (V2.83, 10/11/2026)

> **V2.83 est en production, déployée et VÉRIFIÉE SERVIE** (`verify-deploy-servi.cjs` : version
> servie, service worker actif, les **sept** documents de `/docs/` ouverts par navigation — le
> septième est le diplôme vierge livré ce jour). Étiquette `deploy/v2.83` sur `92d9bfd0`.
> **684 tests unitaires verts**, contre **646 avant la séance** — mesuré en comptant les cas
> ajoutés (+17 sur `ageCategory`, +4, +11, +6 sur trois fichiers neufs), pas repris d'un
> document antérieur. Lint propre, `tsc -b` propre.
>
> ⚠️ **Non lancés, et ça se dit** : les tests de règles (`npm run test:rules`) — `firestore.rules`
> n'a pas été touché — et l'audit de production. Trois déploiements `--only hosting`, **aucune
> règle déployée**.

---

# ① Ce qui était demandé

Deux demandes successives de Stéphane, le 10/11 :

1. *« Vérifier si la catégorie d'âge des utilisateurs se calcule sur l'année ou la date de
   naissance exacte »* — motivée par un constat (« l'appli affiche que j'ai 51 ans alors que je
   ne les aurai que le 29 novembre ») **et** par un projet à venir : des comptes de mineurs sous
   pseudonyme, sans adresse mail propre.
2. *« Ajouter le diplôme au menu de documents en version non remplie. »*

---

# ② L'âge : la réponse à la question, puis le correctif

## ⓐ La réponse

`getSeasonAge` ne lit que **l'année** (`dateOfBirth.slice(0, 4)`), convention FFME « âge atteint
au 31 décembre ». Le mois et le jour ne sont consommés **nulle part** — vérifié sur les ~60 sites
qui touchent `dateOfBirth`, tous passent par cette fonction. C'est épinglé par un test nommé
explicitement depuis l'origine.

Donc **51 ans n'était pas un bug de calcul**. Le défaut était que ce nombre s'affichait sous une
colonne intitulée « Âge », dans quatre écrans. Juste pour la FFME, faux comme âge civil pour
quiconque n'a pas encore eu son anniversaire — **la moitié de la salle à tout instant**.

## ⓑ Pour le projet « comptes de mineurs sous pseudonyme »

Trois faits, à garder pour ce chantier :

- **L'année de naissance suffit.** Saisir `AAAA-01-01` donne une catégorie exactement correcte,
  pour toujours. ⚠️ Mais le jour/mois sont **réaffichés bruts** dans deux champs date : une
  convention `01-01` est indiscernable d'une vraie date, elle doit être écrite quelque part.
- 🔴 **Le point d'exposition n'est pas l'âge, c'est le NOM.** `classement_profiles` porte
  `first_name`/`last_name` et `firestore.rules` l'ouvre à `request.auth != null` — **tout compte
  authentifié**, opt-in ou pas : le filtre `classementOptIn == true` est seulement dans la
  *requête* de `ClientClassement.tsx`, pas dans la règle. Et le classement annuel imprime le
  **nom complet**, pas la forme tronquée (les compétitions, elles, passent par
  `shortParticipantName`). **Le pseudonyme devra vivre dans `first_name`/`last_name`.**
- **L'email reste structurellement obligatoire** (Firebase Auth). Une adresse synthétique
  fonctionne, mais `handleCreateUser` finit par `sendPasswordResetEmail` et affiche *« Un email
  de réinitialisation a été envoyé »* — **faux** pour une adresse non délivrable. Et ce compte
  n'aura aucun chemin de récupération : seul un admin pourra le réinitialiser.

## ⓒ Le correctif, et la décision de forme

`getCivilAge` dérive l'âge révolu, au jour près, **et ne décide de rien**. Les deux cohabitent
dans `utils/ageCategory.ts`.

⚠️ **La règle à retenir n'est pas « un seul point de dérivation »** — il y en a deux,
légitimement — **mais : rien qui dérive une catégorie, un classement ou un seuil ne consomme
l'âge civil.** L'inverse est permis : afficher ne décide rien.

**Pas de repli sur le champ hérité `age`** dans `getCivilAge` : un nombre figé sans date ne peut
pas produire un âge civil, et en rendre un serait affirmer une précision qu'on n'a pas.

🔴 **La décision de forme, soumise avant d'écrire une ligne d'écran : on SUPPRIME un nombre, on
ne l'étiquette pas.** L'âge de saison n'est plus affiché nulle part — il redevient un
intermédiaire interne. Les écrans montrent « 50 ans · Vétérans 2 ». Deux nombres côte à côte
(« 50 (saison : 51) ») auraient demandé de **lire une étiquette pour savoir lequel compte** ;
une catégorie ne se confond avec aucun âge. Et c'est la grandeur dont l'admin a réellement
besoin : l'âge de saison ne sert qu'à la produire.

Sous le champ date de « Mon profil », le grimpeur lit maintenant son âge, sa catégorie, **et la
règle qui la produit** — le seul endroit de l'application où cette règle peut être *expliquée*
plutôt que subie.

## ⓓ Le filet

`test/contrats/ageCivilEtSaison.test.ts`, quatre clauses d'**ABSENCE** qu'aucun test d'exécution
n'attrape. ⚠️ **La forme du défaut qu'elles gardent mérite d'être nommée** : un
`getFfmeCategory` nourri par l'âge civil rendrait la **bonne** catégorie onze mois sur douze, et
la mauvaise pour le douzième, **pour les seuls grimpeurs dont l'anniversaire n'est pas passé**.
Saisonnier, minoritaire et silencieux — un U16 affiché U14 en janvier, de retour à U16 après son
anniversaire, sans qu'aucun écran ne signale rien.

Les quatre clauses ont été vues rouges **séparément**, et chaque sabotage n'en fait rougir
**qu'une** : aucune ne se cache derrière une autre. ✔️ Et **aucun test existant n'a eu besoin
d'être touché** — le signal le moins cher que rien n'a bougé dans le chemin des catégories.

---

# ③ Le diplôme : ce qu'on cherchait, et ce qu'on a trouvé

## ⓐ Le gabarit était écrit DEUX fois

91 lignes de `document.createElement` dans `ClientStats.tsx`, 102 dans `StatsList.tsx`,
**identiques ligne pour ligne à une exception près**. Composées dans des `.tsx`, donc
structurellement invisibles aux tests.

Il fallait un **troisième** lecteur : le diplôme vierge. ⚠️ Le recopier dans un script aurait
fabriqué la panne que ce dépôt sait nommer — *une transcription littérale ne bouge pas quand la
donnée bouge* — et ce document-ci est **imprimé, donc définitif**. D'où `utils/diplomaTemplate.ts`,
unique composition, et `scripts/regen-diplome-vierge.cjs` qui l'**importe** (Node ≥ 22.18
déshabille les types, comme `regen-affiche-bareme.cjs` importe `climbingPoints.ts`).

## ⓑ 🔴 L'exception, c'était un défaut livré

`ClientStats.tsx` passait `logoAssetUrl` comme fond. **Le diplôme que le grimpeur téléchargeait
sortait sans l'œuvre** : du doré pâle sur du blanc, presque illisible, pendant que le moniteur en
décernait un complet. La zone de texte (38 %–92 %, 68 % de large, texte doré ombré) est calibrée
sur les diagonales de `diploma-background.png` : **le fond n'était pas un choix de style, c'était
la condition de lisibilité du texte.**

> ⚠️ **POURQUOI PERSONNE NE L'AVAIT VU, ET C'EST LA LEÇON DE LA SÉANCE.** Les deux écrans ne sont
> **jamais ouverts côte à côte** : le moniteur décerne, le grimpeur télécharge, chacun ne voit
> que le sien. **Un écart entre deux chemins qui ne sont jamais empruntés ensemble ne se
> manifeste jamais comme un écart** — il se manifeste comme un document médiocre qu'on suppose
> normal. Aucun test d'exécution ne pouvait l'attraper : les deux codes marchaient.
>
> Ce qui l'a trouvé : avoir **rendu les deux documents** et les avoir regardés. La hiérarchie des
> preuves de `CLAUDE.md` — *le DOM rendu tranche* — vaut aussi pour un PDF.

Le fond est désormais un **paramètre pour une raison technique** (les écrans reçoivent l'URL du
bundler, le générateur une `data:` URI), pas pour laisser le choix : les trois passent la même
œuvre, et `test/contrats/gabaritDiplome.test.ts` l'exige — en affirmant d'abord qu'il n'y a
**qu'une** valeur distincte, puis laquelle. Le défaut était une divergence, pas une mauvaise
valeur en particulier.

## ⓒ Ce que le passage à une chaîne HTML a coûté, et qu'il a fallu payer

⚠️ `textContent` échappe tout seul ; une chaîne HTML, non. Et **sur l'écran du moniteur,
`titulaire` est le nom de QUELQU'UN D'AUTRE**, lu dans Firestore. Tout champ est échappé dans le
module, les cinq caractères, et un test l'épingle. ⚠️ Ce test a d'ailleurs dû être **corrigé** :
sa première version exigeait l'absence du mot `onerror=`, qui subsiste légitimement en **texte
inerte** — elle rougissait sur un échappement juste. L'assertion porte maintenant sur ce qui rend
l'injection *possible* (chevrons et guillemets), pas sur la présence d'un mot.

## ⓓ Le générateur

Trois gardes **avant** `page.pdf()` — 0 chiffre dans le document **rendu**, 4 traits à remplir,
police EB Garamond chargée. ⚠️ Placés après, ils crieraient juste **tout en laissant sur le
disque le PDF fautif**, celui qu'on imprime (leçon du 07/11 sur le filet des pieds de page).
Le premier garde a d'ailleurs rougi à tort au premier essai — `innerText` rend les espaces
insécables tels quels et je n'avais normalisé qu'un côté : **un garde qui échoue à tort coûte
aussi cher qu'un garde qui laisse passer.**

Mise à l'échelle par `transform: scale`, jamais en redimensionnant le bloc : les tailles de
police sont en **pixels**, calibrées pour 800 × 600.

---

# ④ Les deux défauts trouvés en chemin et NON corrigés

Ni l'un ni l'autre n'était dans le périmètre, les deux sont réels.

1. **Le PDF produit dans l'application est rogné** d'environ 6 % en bas. `jsPDF` met l'image à la
   largeur de la page : 600/800 × 297 = **222 mm sur une page de 210**. Le « Félicitations pour
   votre progression ! » frôle la coupe. Le vierge, lui, est mis à l'échelle sur la **hauteur**,
   donc entier — les deux documents ne sont donc pas tout à fait cadrés pareil, et c'est
   l'application qui est en tort.
2. **Le fond du diplôme est sombre** : on n'écrit pas dessus au stylo bille. Un stylo gel blanc
   ou doré fonctionne. C'est dit dans la ligne de description de l'écran, à l'endroit où on
   choisit d'imprimer — pas dans un document que personne n'ouvrira.

---

# ⑤ Un fait de processus à retenir

🔴 **GitHub a refusé le push (GH007 : « Your push would publish a private email address »)**,
alors que les ~200 commits précédents portent la **même** adresse et étaient passés : la
protection a été activée depuis. Sur décision de Stéphane, les commits de cette séance passent
sous `284562435+Stfbrnl@users.noreply.github.com`, et le dépôt est configuré pour la suite.

⚠️ **Le dépôt est PUBLIC et l'adresse reste dans l'historique déjà publié** : ça arrête l'ajout,
ça ne retire rien. Et l'historique devient hétérogène — deux adresses pour un seul auteur.

✔️ Au passage, **le garde `predeploy` a fait exactement son travail** : il a imposé l'ordre
commit → push → déploiement. C'est lui qui a rendu le refus GitHub *bloquant* au lieu de le
laisser silencieux, et c'est la raison pour laquelle il existe (V2.74 avait tourné en prod avec
une seule copie de sa source au monde).

---

# ⑥ Le topo, et la forme de péremption la plus discrète

Le topo papier **énumère** les documents du menu. Dès l'ajout du diplôme vierge, cette
énumération était incomplète.

⚠️ **Ce n'est pas une affirmation devenue fausse, c'est une LISTE devenue courte.** Rien ne la
signale — pas de contradiction interne, pas de chiffre faux — et un lecteur qui cherche le
diplôme dans le topo en conclut qu'il n'existe pas. Régénéré : *14 sections, toutes dans une
page, toutes avec leur pied*, estampille V2.83 dérivée.

---

# ⑦ Ce qui reste ouvert

- Les **deux défauts du §④** (PDF rogné, fond sombre).
- Le **chantier « comptes de mineurs sous pseudonyme »**, pour lequel le §②ⓑ donne les trois
  contraintes réelles — dont celle qui compte : *le point d'exposition est le nom, pas l'âge.*
- Rien de ce qui précède ne touche `firestore.rules`, donc **aucun test de règles n'a été
  rejoué** — à garder en tête si le chantier pseudonyme ouvre les règles de `classement_profiles`.
