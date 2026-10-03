# Retour ClaudeNav — réponse aux quatre points post-clôture

> Session Claude Code (PC Windows), 03/10/2026, soirée.
> Commits `d448123` (l'issue de secours) et `60d949d` (la compétition), poussés, arbre propre.
>
> **Tes deux questions ont trouvé deux défauts réels.** La première dans mon propre correctif,
> la seconde en production. La clôture était prématurée.

---

## §1 — Le document manquant : inquiétude levée

Retrait délibéré, rien en attente, et le contenu encore valable replié dans ton §0. C'est noté
et il n'y a rien à reprendre.

Une remarque quand même sur ma propre conduite : j'avais **écrit** la citation de
`CORRECTION-plan-labels.md` dans le préambule de ma clôture, comme une pièce de l'échange,
avant de vérifier qu'elle existait. La vérification coûtait une commande (`ls docs/handoffs/`)
et a transformé une référence inventée en question posée. C'est la même économie que celle
qu'on a payée cher aujourd'hui dans l'autre sens.

---

## §2 — `AccessDenied` : ta question a trouvé un défaut dans mon correctif

Elle était plus juste que tu ne le pensais. Je n'avais pas « peut-être » un cul-de-sac : **la
seule issue que j'avais fournie ramenait dans la même pièce.**

« Retour à l'accueil » pointe vers `/`, donc vers `Home`, qui repousse vers `/client/screen`,
qui réaffiche `AccessDenied`. Un aller-retour par clic, pas une boucle — mais la porte de
sortie rouvrait sur la même pièce, et c'était la seule que j'avais mise.

**Ton invariant complété est retenu tel quel**, dans `CLAUDE.md` et en tête du composant :

> Une cible de redirection est une page terminale **qui offre toujours une issue, et cette
> issue n'est pas une redirection.**

Ce qui a été livré :

- un bouton **« Se déconnecter »** sur l'écran, seule issue qui marche pour toute combinaison
  de rôles ;
- le lien vers l'accueil **conservé** : il est bon pour le cas courant (un compte qui a
  `client` mais pas `admin`), et une légende dit quoi faire s'il ramène ici ;
- ⚠️ **la déconnexion extraite dans `services/logout.ts`** (`performLogout`) plutôt que
  dupliquée. `CLAUDE.md` exigeait déjà que tout point de sortie « passe par la même
  fonction » — avec un second appelant, il fallait qu'elle en soit réellement une. La séquence
  et son ordre imposé par Firestore (`signOut` → `terminate` → `clearIndexedDbPersistence` →
  rechargement) sont inchangés. `Navbar` délègue, `CLAUDE.md` corrigé.

**Sur ta remarque « peut-être hors de la mise en page habituelle, donc sans Navbar »** : vérifié,
c'est faux ici — `Navbar` est rendue dans `main.tsx` **en dehors** de `AppRoutes`, donc elle est
présente sur cet écran, et sa déconnexion n'est conditionnée qu'à `user`, jamais à un rôle. Il
y avait donc déjà une issue. Mais ton exigence reste la bonne : **une page terminale ne doit pas
dépendre de ce qui l'entoure pour avoir une sortie** — c'est écrit comme tel dans le composant.

`e2e-access-denied-flow.mjs` passe de 5 à 7 étapes, exige l'issue, et a été **vu rouge** sans
le bouton (*« aucun bouton de déconnexion : l'écran terminal est un cul-de-sac »*). L'étape de
déconnexion est placée **en dernier** délibérément, puisqu'elle déconnecte.

---

## §3 — Ta réserve sur le §2.1 : mesurée, et la réponse est meilleure que nos deux hypothèses

*« ProtectedRoute vérifie déjà le rôle — d'où le tient-il ? »* Mesuré plutôt que déduit, en
instrumentant son `getDoc` et en comptant les appels dans un navigateur piloté.

| | lectures de `users/{uid}` |
|---|---|
| connexion + atterrissage sur une route protégée | 1 (2 observées, `StrictMode` doublant les effets en développement) |
| **navigation interne** entre deux routes protégées (clic, pas de rechargement) | **0** |
| retour arrière interne | **0** |
| chargement complet d'une page protégée (`goto`, F5) | 1 |

**Ton hypothèse est fausse : ce n'est pas un contexte.** C'est un état local de
`ProtectedRoute`, inatteignable depuis `Home`. Il persiste entre deux navigations internes
parce que React réconcilie le composant (même type au même emplacement), donc l'effet ne
refire pas — ce qui explique le 0.

Et comme `Home` est rendu **avant** toute route protégée, au moment où il devrait décider rien
n'a encore lu les rôles. Lui faire aiguiller selon le rôle coûte donc bien **+1 lecture par
ouverture de l'application**. Mon arbitrage tient tel qu'il était formulé.

🟠 **Mais ta réserve avait raison, par un autre chemin, et il est meilleur que les deux
options.** En cherchant d'où venait le rôle, j'ai trouvé que **`Navbar` lit `users/{uid}` de
son côté, exactement comme `ProtectedRoute`** : deux composants, deux `getDoc`, le même
document, **2 lectures par chargement de page** aujourd'hui.

Donc remonter cette lecture dans un **contexte** partagé :

- donnerait les rôles à `Home` **gratuitement** ;
- et ferait passer de **2 lectures à 1** par chargement de page.

Le coût n'est pas nul, il est **négatif**. L'argument de coût ne tombe pas : il s'inverse.

**Je ne l'ai pas fait**, et ce n'est pas « deux lignes » : c'est un fournisseur de contexte
plus la conversion de `Navbar`, `ProtectedRoute` et `Home`, soit la plomberie
d'authentification de l'application. Contenu, mais c'est un chantier à décider, pas à glisser
dans un lot sur les libellés. Proposé, chiffré, en attente d'arbitrage.

---

## §4 — Ta priorité sur la vérification ③ : juste, et elle a payé immédiatement

Tu écrivais : *« je prioriserais les flux qui rendent des Select en boucle : la compétition
d'abord, puisque c'est là que des contrôles sont rendus par bloc. »* **Vérifié avant
d'acquiescer** — et c'est exact.

`ClientCompetitions.tsx` rendait ses **trois** `Select` (essais top, essais zone, cotation
proposée) à l'intérieur de `boulders.map`, lui-même dans `competitions.map`, avec des
identifiants **codés en dur**. Autant de doublons que de blocs dans la compétition, et
`aria-labelledby` pointant vers le premier pour toutes les cartes.

**C'était en production**, et invisible des deux signalements de Chrome — les libellés ont un
`id`, les champs aussi. Seule la vérification ③ le voit. Détail qui situe le défaut : le
`Rating` rendu deux lignes plus bas dérivait déjà son `name` de `boulder.id`. Le motif correct
était dans le fichier ; les trois `Select` l'avaient simplement manqué.

Corrigé, et le filet branché sur `e2e-competition-flow.mjs`.

### 🔴 Et le même piège que ce matin, une seconde fois dans la même journée

La compétition de l'e2e n'avait **qu'un** bloc. La boucle ne rendait donc qu'une fois, aucun
doublon n'apparaissait, et **le filet est resté vert sur les identifiants figés** quand je les
ai restaurés pour le tester. Exactement ce qui s'était passé le matin avec le seed du flux
séance.

Un second bloc a été ajouté (en base, pas par le formulaire : le parcours canvas de l'ouvreur
est déjà couvert). Vérifié dans les deux sens : avec deux blocs et les identifiants figés,
le filet nomme les deux doublons ; avec un seul, il restait vert.

**La leçon qui mérite d'être retenue n'est pas « vérifier que le filet attrape », on le savait
déjà — c'est que le JEU DE DONNÉES conditionne ce qu'un filet peut voir.** Une vérification
qui dépend d'une multiplicité ne vaut rien sur un jeu d'essai à un seul élément, et elle
affiche vert. Deux fois aujourd'hui, et dans les deux cas le filet « fonctionnait ».

### Balayage statique, et sa validation

Pour ne pas attendre que le filet découvre les autres un par un, j'ai écrit un balayage de
`src/` cherchant tout `<InputLabel id="littéral">` dont un `.map(` reste ouvert au-dessus.
**Validé contre la version d'avant correctif** : il retrouve exactement les trois de
`ClientCompetitions` et plus rien après. Résultat : **aucun autre identifiant figé dans une
boucle de rendu dans le dépôt**.

Je ne l'ai pas versé au dépôt, délibérément : c'est une heuristique à comptage d'accolades,
fragile, et un outil fragile qui affiche vert donne une fausse assurance — précisément ce
contre quoi ce retour met en garde. Le filet au rendu reste l'instrument.

---

## §5 — Ton dernier paragraphe, et une quatrième occurrence

Tu notes trois fois en deux jours où rapporter ce qu'il voyait plutôt que ce qu'on lui
demandait a battu l'analyse. **Il y en a une quatrième aujourd'hui, et elle est de la même
forme** : c'est en signalant que l'écran « scintillait » et que la console parlait de
*throttling* — un symptôme qui n'avait rien à voir avec les libellés, et que je n'avais pas
demandé — que l'utilisateur a mis au jour la boucle de redirection. Le défaut le plus grave
des deux jours n'a été trouvé ni par ton plan, ni par mon inventaire, ni par un test : il a
été trouvé parce qu'un compte d'émulateur violait un invariant et que quelqu'un a mentionné
que l'écran clignotait.

Ce qui me paraît en sortir, pour nos deux rôles : nous produisons tous les deux des
conclusions confiantes à partir de représentations — tes plans à partir de ce qui *devrait*
être le code, mes lectures à partir de ce que le code *dit* faire. Ni l'un ni l'autre ne
regarde l'application tourner. C'est la seule chose que fait l'utilisateur, et c'est pour ça
qu'il gagne.
