# Retour ClaudeNav — séance du 18/10

> Rédigé le 18/10/2026, en réponse au `HANDOFF-seance-2026-10-18.md`.
>
> **Deux choses du handoff sont rangées comme de la propreté et sont, à mon avis, les deux
> faits les plus importants de ces trois jours :**
>
> ⚠️ **§1 — pendant trois jours, le code de la production n'existait que sur ton poste.** Le
> handoff le présente comme un écart refermé. C'est aussi un risque qui s'est réalisé sans
> conséquence, et rien n'empêche qu'il se reproduise lundi.
>
> ⚠️ **§2 — `CLAUDE.md` était tronqué en silence, et la tranche perdue était la plus récente.**
> Ça fournit une explication mesurable à quelque chose qu'on observait depuis deux semaines sans
> l'expliquer : les règles « réapprises ».
>
> Le reste : un principe qui réconcilie trois conventions divergentes (§3), la synthèse des
> préconditions d'un rouge (§4), et le calendrier du 5 novembre (§6), où l'arriéré d'appareil
> réel est devenu le risque principal.

---

## §1 — ⚠️ La production n'existait que sur ton poste

Le §1 du handoff dit l'essentiel en une phrase, puis passe : *« ces 11 commits existaient
seulement sur le poste de l'utilisateur, alors même que V2.74 et V2.74.1 étaient déjà déployées
en production »*.

Autrement dit, du 15 au 18, l'application que les grimpeurs utilisaient avait **une seule copie
de sa source au monde**, sur une machine. Un disque qui lâche, un ordinateur volé, et il restait
un bundle minifié en production et rien pour le reconstruire. C'est, de loin, le plus gros
risque pris depuis que je suis ce projet — plus gros que tout ce que les revues de déploiement
ont examiné, parce qu'il ne portait pas sur ce que le code fait mais sur son existence.

**La cause est structurelle, pas humaine** : `firebase deploy` fonctionne depuis un arbre sale
et non poussé. Rien ne couple le déploiement à la publication. L'invariant « ce qui est déployé
est poussé » est tenu par le fait de s'en souvenir — c'est exactement la forme du défaut du
03/10 et de celui de `inscritAuxCompetitions`, et c'est la troisième fois.

**Le remède tient dans la procédure de déploiement déjà écrite** : avant `firebase deploy`,
refuser si `git rev-parse HEAD` ne se trouve pas sur `origin/main`, ou si l'arbre est sale. Un
`git fetch` puis une comparaison, trois lignes. Et il se vérifie comme le reste : le voir rouge
une fois, sur un commit volontairement non poussé.

Deux remarques qui en découlent :

- **le bundle porte une version, pas une provenance.** `2.74.1` dans le bundle prouve qu'un
  bump a eu lieu avant la construction, pas quel commit l'a produit. Si la question « quel code
  tourne exactement en prod ? » doit avoir une réponse, c'est le hash qu'il faut y écrire, pas
  le numéro ;
- **la clé de service vit déjà sur ce poste**, par choix assumé. Le poste était donc déjà un
  point unique de défaillance pour une chose ; il l'était pour deux.

---

## §2 — ⚠️ La troncature explique peut-être les règles « réapprises »

Le §4 est la vraie trouvaille de la séance, et sa conséquence rétrospective n'y est pas tirée.

190 000 caractères pour une limite de 150 000, **et une troncature coupe la fin**, c'est-à-dire
le tiers le plus récemment ajouté. Or le tiers le plus récent, dans ce projet, c'est précisément
la doctrine la plus chèrement acquise : les familles de faux verts, les règles de méthode, les
leçons des incidents de septembre et d'octobre.

Mets ça en regard de ce qu'on lit depuis deux semaines dans les handoffs :

> *« Ta règle du 03/10, que j'ai réapprise. »* — à propos du code de sortie après un tube.

Et les quatre faux verts du 14/10, tous de la famille « un garde portant sur l'agrégat ». Et le
`&&` sur `tail`. On avait rangé ça en oubli, ou en difficulté intrinsèque de la règle. **Une
explication plus simple était disponible : la règle n'était pas lisible.**

Je ne l'affirme pas — c'est mesurable, et ça vaut les deux minutes :

> `git log --format='%h %ad' --date=short -- CLAUDE.md`, puis la taille du fichier à chaque
> commit, pour trouver **quand il a franchi 150 000 caractères**. Toute séance postérieure à
> cette date a travaillé avec le tiers le plus récent invisible.

Si la date tombe avant le 03/10, l'hypothèse est confirmée et elle disculpe plusieurs constats
rangés en erreurs de méthode. Si elle tombe après, tant pis pour l'hypothèse — mais on saura.

**Et le point qui compte pour la suite : rien ne mesure la taille du fichier.** Le découpage a
eu lieu parce que quelqu'un l'a remarqué, et le handoff le dit lui-même — *« s'il regrossit,
c'est que du récit s'y est réinstallé »*. C'est une prédiction, pas une garde.

La forme est déjà établie dans ce dépôt, c'est celle du contrôle d'accès aux compétitions :
**un nombre affiché à chaque exécution de l'audit**, même quand il est bon. « `CLAUDE.md` :
81 420 / 150 000 caractères ». Un compte qui s'affiche sans qu'on l'ait cherché est un
invariant surveillé ; un seuil qu'on se promet de surveiller est un relevé daté.

Une note sur le découpage lui-même : il est bien fait, et le déplacement tel quel pour préserver
`git log -S` est la bonne attention. Le risque change de nature plutôt que de disparaître — on
passe de « tronqué à l'insu de tous » à « lien 📖 non suivi ». C'est strictement mieux : la
seconde défaillance se voit dans le travail produit, la première était invisible. Mais c'est de
nouveau une convention, et ce projet sait ce que deviennent les conventions.

---

## §3 — Trois conventions pour la même question, et le principe qui les réconcilie

Ton défaut ① est le troisième de la même famille en trois semaines, et c'est en les mettant côte
à côte qu'on voit qu'il ne s'agit pas d'un défaut mais d'une **divergence de convention** :

| | ce qui est stocké | une recotation ultérieure… |
|---|---|---|
| `client_boulder_results` | **pas** la couleur | …réécrit rétroactivement le score (02/10) |
| `client_course_results` | `boulderColor` **figée** | …ne change rien |
| `competition_rankings` | le **résultat entier** figé, immuable | …ne change rien |

Trois réponses différentes à une même question, dans un même dépôt. Et le défaut ① n'est rien
d'autre que deux écrans en désaccord sur laquelle appliquer.

**Le principe qui les justifie toutes les trois**, et qui n'est écrit nulle part :

> **Une recotation corrige une erreur de mesure. Elle corrige donc rétroactivement tout ce qui
> *mesure* une capacité, et jamais un résultat déjà *proclamé*.**

- le classement général **mesure** ce dont un grimpeur est capable aujourd'hui → il doit suivre
  la cotation corrigée → ne pas stocker la couleur est **juste** ;
- le classement d'une séance a été **proclamé** aux élèves présents ce soir-là → figer la couleur
  est **juste** ;
- le palmarès d'une compétition est proclamé avec une remise de prix → le figer entièrement et le
  rendre immuable est **juste**.

Le critère opérationnel, pour la prochaine fonctionnalité qui posera la question :
**ce nombre sera-t-il annoncé à quelqu'un ?** Si oui, il se fige au moment de l'annonce. Sinon,
il se recalcule.

C'est ce que je soutenais le 02/10 sans en avoir la forme générale. À inscrire dans
`CLAUDE.md` — c'est inconditionnel, donc ça y reste — avec le tableau des trois collections,
pour que la divergence soit lue comme **délibérée** et non « corrigée » par quelqu'un dans six
mois.

---

## §4 — Les trois préconditions pour qu'un rouge veuille dire quelque chose

Ta trouvaille du §3 en est la troisième, et elle complète un ensemble. Elles sont indépendantes,
et chacune a produit un vert trompeur dans ce projet :

| | question à se poser | quand elle a mordu |
|---|---|---|
| **l'entrée** | le jeu de données peut-il **exprimer** le défaut ? | 03/10 — et encore le 15/10 (un seul cas rendait « 1 » et « 2 » indiscernables) |
| **le décor** | la mise en scène produit-elle l'effet attendu **à la place du code** ? | 18/10 — le `reload()` remettait l'état à `false` tout seul |
| **l'assertion** | nomme-t-elle ce qui doit **différer**, pas seulement ce qui doit être égal ? | 15/10 — `published_at`, sans quoi on compare un document à lui-même |

Entrée, environnement, spécification : trois endroits distincts où un test peut être
**incapable d'échouer**, et aucun des trois ne se voit en lisant le test.

Ta formulation — *« se demander ce qui, dans le décor, produirait l'effet attendu à la place du
code »* — est la meilleure des trois, parce que c'est la seule qui dit **où regarder**. Les deux
autres gagneraient à être réécrites sur ce modèle.

---

## §5 — Un script dont la raison d'être est un effet doit annoncer son effet

Ton §5.5 est le deuxième membre d'une famille dont le premier est le `perl` du 15/10 : la
commande réussit, l'effet n'a pas lieu. `node test/emulator-reset.mjs` sur un module qui ne fait
qu'exporter **sort en 0 sans rien faire** — pas d'erreur, pas de sortie, rien à quoi s'accrocher.

Coupler le seed à `resetEmulators()` règle ce script. Ça ne règle pas la classe, et la classe
est générique :

> **Tout script dont la raison d'être est un effet de bord doit annoncer son effet.**
> « 3 collections vidées, 47 documents supprimés » rend trois exécutions empilées impossibles à
> manquer. Un succès silencieux est indiscernable d'un no-op.

C'est bon marché, ça s'applique à tous les scripts du dépôt, et ça a un effet secondaire utile :
un script qui annonce son effet se relit, et on voit tout de suite quand il n'annonce rien.

---

## §6 — Le 5 novembre : l'arriéré d'appareil réel est devenu le risque principal

Dix-huit jours. Et la liste des non-vérifiés dit maintenant, en substance : **tout ce qui servira
le 5 novembre a été vérifié par des tests et des émulateurs, et rien par un œil sur un
téléphone.** L'arriéré court depuis V2.70.1 ; il ne s'agit plus d'un retard d'hygiène, c'est la
seule catégorie de défaut que votre dispositif ne peut pas attraper.

Et deux des quatre non-vérifiés **se ferment dans la même séance**, parce qu'ils exigent tous
deux un appareil réel :

1. l'arriéré d'écrans — ceux du 5 novembre en priorité : inscription, « Mes compétitions »
   pendant l'épreuve, palmarès après publication ;
2. le §4.4 (cache IndexedDB), qui ne se constate que sur un appareil ayant ouvert la page **avant**
   la publication — ouvrir la page des compétitions, publier depuis le poste, recharger sur le
   téléphone.

Une quarantaine de minutes, dans la salle, avec un vrai compte client. C'est le meilleur emploi
possible d'une heure d'ici au 5, et c'est aussi la seule chose de la liste que ni moi ni Claude
Code ne pouvons faire.

**Et le topo est à imprimer**, pas seulement à relire : il sera utilisé sur papier à l'accueil,
le débordement découvert aujourd'hui fait disparaître un pied de page, et le rendu d'une
imprimante n'est pas celui d'un lecteur PDF.

---

## §7 — L'ordre pour la mini-compétition de la monitrice

Il y a une séquence à respecter, sinon son essai est perdu pour rien.

Les cinq défauts du §5.2 sont corrigés **dans V2.74.2, qui n'est pas déployée**. Si elle refait
son essai maintenant, elle rencontre les cinq — dont la pastille illisible et le classement qui
disparaît — et son retour portera sur des défauts déjà réparés. Donc :

1. déployer V2.74.2 (`dist/` est construit après le bump, vérifié) ;
2. **puis** lui transmettre les deux gestes manquants du §5.1, qui sont humains et qu'elle ne
   peut pas deviner : mettre les élèves dans le groupe, et **activer la séance le jour même** ;
3. et seulement ensuite lui demander son retour.

Le point 2 mérite d'être dit avec ses mots à elle : tant que la séance n'est pas activée, ses
élèves ne voient rien **et le serveur refuse leurs validations**. Ce n'est pas un défaut, mais
de son point de vue c'est indiscernable d'une application qui ne marche pas.

---

## §8 — Deux petites choses

**Un inventaire des rangs.** Le défaut ② est celui que tu avais corrigé sur les écrans de
compétition le 03/10, retrouvé intact sur les écrans de cours — et uniquement parce que Stéphane
a posé une question sans rapport. La question qui ferme la classe est un `grep` : **y a-t-il
d'autres endroits qui calculent un rang par `index + 1` ?** Le module pur est la bonne réponse
une fois qu'on sait où il manque ; l'inventaire est ce qui dit où.

**Et le défaut ③ mérite une ligne pour ce qu'il illustre** : deux couleurs sur huit
fonctionnaient, par coïncidence de vocabulaire. Un mécanisme qui marche pour un sous-ensemble
est **plus difficile à trouver** qu'un mécanisme qui ne marche jamais, parce que le
sous-ensemble devient la preuve que le mécanisme est bon. C'est la même structure que le
compteur « 4 → 3 » satisfait par un reclassement : une observation juste, employée à valider
autre chose qu'elle.
