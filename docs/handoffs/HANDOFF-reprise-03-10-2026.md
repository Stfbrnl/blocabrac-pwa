# Handoff ClaudeNav — Reprise du 03/10/2026 : les trois chantiers en attente sont fermés

> Session Claude Code (PC Windows), 03/10/2026, matinée. Salle calme, comme prévu.
> Reprend l'ordre arrêté le 02/10 au soir (`HANDOFF-purge-etat-ludique-2026-10-02.md` §4 bis).
> Commits : `10ea335`, `24babf8`. Poussés sur `main`.

---

## §1 — V2.71.4 déployée, et vérifiée sur son chemin critique

Ce que tu n'avais pas pu obtenir le 02/10 (« revérification en direct : impossible sans
déploiement ») est fait.

Déploiement hosting depuis la racine, après `npm run build` relancé pour respecter la
doctrine du dépôt. Prod sert bien le nouveau lot : `index-yDA2eXVA.js`, empreinte identique
au `dist/` local, `2.71.4` retrouvée dans le bundle.

**Puis l'utilisateur a validé un bloc, et c'est ça qui compte.** Violet n°1 au Dévers 30°,
3 essais, à 08:06:22Z.

| | attendu (écrit avant la mesure) | mesuré |
|---|---|---|
| `score` | 6245 (+180 = 200 − 2×10) | **6245** ✅ |
| `bouldersValidated` | 40 | **40** ✅ |
| `bestColorRank` | 5, inchangé | **5** ✅ |
| `wallCounts` | clé « Dévers 30° » créée à 1 | **créée** ✅ |
| `colorCounts.violet` | 9 | **11** ❌ — voir §6 |

Les deux transactions découpées ont écrit, à deux secondes d'intervalle
(`classement_profiles` à 08:06:22, `user_ludic_state` à 08:06:24, avec la mission M2 cochée
et le mur enregistré). **Réconciliation : 0 écart** sur recalcul indépendant depuis
`client_boulder_results`. Le correctif tient.

⚠️ **Ce qui reste non exercé** : le chemin d'échec du réarmement de minuteur dans
`useDebouncedFlushQueue`. C'était le point faible annoncé du lot, il l'est toujours — la
validation nominale ne le traverse pas, et le dépôt n'a pas de harnais React. Inchangé.

Note au passage, qui confirme une autre doctrine : un enregistrement de notes du matin
(`rating: 3`) a laissé `createdAt` au 01/09 et `success`/`attempts` intacts. La préservation
structurelle de V2.69 fonctionne en production.

---

## §2 — Purge de l'état ludique : terminée, 0 compte candidat

Le chantier attendait depuis le 17/09.

**Ton §4 bis demandait une répétition sur un compte de test. Elle n'avait pas de sujet.**
Les seize candidats sont *tous* de vrais comptes de grimpeurs — vérifié en les listant avec
leurs identités. C'est logique et je ne l'avais pas anticipé : les comptes de test sont
postérieurs à la passe C, ils n'ont donc jamais porté ces champs. Une répétition sur compte
de test aurait exigé d'écrire d'abord ces champs en production pour les supprimer ensuite.

Arbitrage retenu, validé par l'utilisateur : la répétition s'est faite sur **son propre
compte**, le seul candidat sur lequel quelqu'un pouvait se connecter — ce qui préservait
l'essentiel de ton point 4 (ouvrir l'application sur le compte purgé).

Déroulé :

1. `--uid … --fix` → `users.wallCounts` supprimé, `weeklyGoalItems` correctement **retenu**
   par le garde-fou. Identité intacte (level, baseLevel, les quatre rôles, dateOfBirth).
2. Application ouverte par l'utilisateur : « tout fonctionne ».
3. Les quinze autres : **17 champs sur 16 comptes**, conforme au chiffre écrit d'avance.
4. La dérogation explicite pour `weeklyGoalItems`, sur décision de l'utilisateur.
5. Simulation de contrôle : **0 candidat**.

**Relecture compte par compte contre la sauvegarde du 02/10 : 0 champ perdu dans
`user_ludic_state`**, dont l'`updated_at` n'a pas bougé de toute l'opération.

Détail qui confirme la direction de la vérité, et qui vaut mieux qu'un raisonnement : la
copie figée sur `users` disait « Güllich 2, Réta 5 », la copie vivante dit « Güllich 4,
Réta 6 ». Le déchet était bien en retard.

`firestore.rules` n'avait rien à changer — **vérifié, pas supposé** : les quatre champs
n'apparaissent nulle part dans le fichier (une occurrence, dans un commentaire), et les clés
verrouillées sur `users` sont seulement `inscritAuxCours`/`inscritAuxCompetitions`/`role`/
`roles`/`levelOverride`. Ta dernière case du §5 est close.

---

## §3 — Le script de purge, et une affirmation de ton handoff à corriger

🔴 **`--uid` existait déjà, depuis V2.61.** Ton §4 bis point 1 disait « il ne l'a pas » et
le donnait comme du code à écrire. Vérifié par `git log -S` : présent dans le commit
`17625a3`, en-tête documenté compris. Rien à écrire de ce côté.

Ce qui a réellement été ajouté :

- **`--purge-unmigrated <uid>.<champ>`**, répétable, et **délibérément sans forme en masse** :
  le jugement « cette absence est la vérité » ne se prend que compte par compte. Un couple
  illisible ou un champ hors vocabulaire refuse avant toute lecture ; une dérogation qui ne
  sert pas avertit, au lieu de passer pour traitée.
- **Les deux formes d'absence enfin distinguées**, ce que le script confondait. Aucun
  `user_ludic_state` du tout = « jamais migré » certain : refusé, *et* la dérogation n'est
  même pas proposée, parce que ce serait une perte sèche. Document vivant auquel il ne manque
  que ce champ = le cas ambigu, signalé avec son `updated_at` pour que le jugement se fasse
  depuis la ligne d'avertissement elle-même. En production ça a immédiatement payé : le
  message a affiché « écrit le 2026-10-03T08:06 », donc un document écrit quelques minutes
  plus tôt — le cas (b) établi, et non plus seulement probable.
- **Un uid mal recopié échoue bruyamment**, au lieu d'afficher « 0 compte candidat », qui est
  indiscernable d'une purge déjà faite.
- **`backfill-ludic-state.js` marqué obsolète dans son propre en-tête**, et le renvoi vers lui
  retiré du garde-fou de la purge (il y figurait encore à deux endroits).

Chemin d'**écriture** exercé sur l'émulateur avant toute production, sur trois comptes semés
pour les trois situations : migré / supprimé en aval / jamais migré. C'est ta remarque qui
l'a motivé — une simulation n'exerce que la lecture et la comparaison.

---

## §4 — Fenêtre de saison enregistrée

Terrain propre avant : `app_config/classement_saison` **absent**, 0 profil avec une base,
0 `season.score`. Le cas idéal pour la saison à zéro.

Enregistrée par l'utilisateur via **« Enregistrer »** (jamais « Redémarrer »). Vérifié
ensuite, cinq prédictions sur cinq :

- fenêtre `2026-11-01 → 2027-05-31`, `cloturee: false` ;
- **61/61 profils à `season.baseScore = 0`**, 61 `baseColorCounts` vides ;
- aucun `season.score` résiduel.

La base étant écrite, la réconciliation couvre `season.*` dès le premier jour — pas sept
mois sans filet, qui était le risque de la V2.71.2.

**Audit prod : 0 erreur, 0 avertissement.** 777 résultats, 3 défis, 61 profils, 145 blocs,
0 référence morte.

---

## §5 — Ce qui reste ouvert

- 🟠 **La mesure du poids de la requête `users` dans `AdminUsers.tsx`.** C'était la
  justification chiffrée de toute la migration ludique, et sans elle le gain est argumenté
  mais pas démontré. L'utilisateur seul peut la faire, dans son navigateur, connecté en
  admin. **Le chantier n'est pas « terminé » tant qu'elle manque** — c'est ta formulation et
  elle reste juste, même maintenant que les champs sont partis.
- Le chemin d'échec de `useDebouncedFlushQueue` (§1), sans couverture.
- `challenges.progress` : compteur incrémental avec ni filet ni remontée d'erreur, les deux
  à la fois depuis le 02/10. Ta réserve du `RETOUR-v2714` tient toujours.
- L'arriéré visuel jamais vu sur un vrai appareil s'est réduit (l'utilisateur a ouvert l'app
  ce matin) mais n'a pas été passé en revue écran par écran.
- Défis `fenetre` / `bloc_designe` : toujours sans e2e navigateur.
- Finale non annoncée ; droits du rôle ouvreur en attente du gérant ; sauvegarde durable des
  images Cloudinary.

---

## §6 — 🔴 Une erreur de méthode de ma part, à retenir

`colorCounts.violet` est la seule des cinq prédictions du §1 qui ne tombait pas : j'avais
écrit 8 → 9, le réel était 10 → 11.

**Le barème et le delta étaient justes ; c'est ma valeur de départ qui était fausse.** J'ai
pris le « 8 » du tableau de ton handoff du 02/10 au lieu de lire la valeur vivante juste
avant de prédire.

Attribution faite, et non supposée : l'utilisateur avait validé **deux violets hier soir**
(n°11 Güllich à 17:17Z, n°13 Dévers 15° à 18:13Z), postérieurs à la mesure du handoff.
Violet est donc passé de 8 à 10, puis à 11 ce matin.

La leçon n'est pas « j'ai eu tort », c'est : **la prédiction doit s'appuyer sur une valeur de
départ relue à l'instant, pas sur un chiffre consigné la veille** — surtout dans un projet
dont les compteurs bougent entre deux séances. Le reste de la méthode a bien fonctionné :
c'est précisément parce que le chiffre était écrit d'avance que l'écart a sauté aux yeux et
a été attribué au lieu d'être expliqué par la première cause plausible.
