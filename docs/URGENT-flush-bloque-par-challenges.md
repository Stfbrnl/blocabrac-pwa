# 🔴 URGENT — Le flush du classement est tué par une lecture refusée sur `challenges`

> Rédigé le 02/10/2026 à 19h30, à partir de la console de production de l'utilisateur
> (V2.71.3, build `6ed827a`) et d'un test de validation en direct.
>
> **Le défaut est reproduit en production, avec sa trace et son effet mesuré.**
> Des écritures de classement sont perdues en continu, silencieusement.
>
> **Le §4 est une marche à suivre ordonnée. Le §0 dit ce qu'il ne faut pas faire d'ici là.**

---

## §0 — ⚠️ Trois choses à NE PAS faire avant le correctif

1. **Ne pas lancer `reconcile-classement-profiles.js --fix`.** Il restaurerait les points, mais
   la dérive repartirait dès la validation suivante — et on perdrait la trace du phénomène.
2. **Ne pas revalider les blocs perdus** pour « rattraper ». Le même flush échouera de la même
   façon et brouillera les preuves.
3. **Ne pas enchaîner sur la purge de l'état ludique.** Elle n'est pas urgente, ceci l'est.

Aucune donnée n'est perdue définitivement : `client_boulder_results` est intact, et la
réconciliation saura reconstruire les compteurs **une fois la cause traitée**.

---

## §1 — Ce qui est prouvé

### 1.1 — La trace

```
POST .../documents:batchGet  →  403 (Forbidden)
RPC 'BatchGetDocuments' failed: {"code":"permission-denied"}
request: {"documents":[".../challenges/Oln9qhIHF1oaYVDi8NqL"]}

Erreur lors de la mise à jour du classement: FirebaseError: Missing or insufficient permissions.
```

Pile d'appels, sans ambiguïté :

```
onClick (ClientDaily) → persist → useDebouncedFlushQueue
  → transaction : get(challenges/Oln9qhIHF1oaYVDi8NqL) → permission-denied
    → la transaction entière avorte
```

### 1.2 — L'effet, mesuré en direct

| | avant | après 3 validations | attendu |
|---|---|---|---|
| score | 5370 | **5495** | — |
| blocs validés | 34 | **36** | 37 |

Trois validations (un jaune, un bleu, un violet), **deux comptabilisées**. Erreurs console
datées 19:17, pendant la séquence.

### 1.3 — Deux écritures distinctes, un seul échec

| Écriture | Chemin | Sort |
|---|---|---|
| `client_boulder_results` | `setDoc` direct | ✅ réussit |
| compteurs (`classement_profiles`, `wallCounts`, missions, défis) | transaction débouchée | ❌ échoue |

Le bloc apparaît donc validé au grimpeur, mais son score ne bouge pas. La réconciliation
mensuelle retrouve les points un mois plus tard — **c'est exactement le +1725 du 1ᵉʳ octobre**.

### 1.4 — Pourquoi ça paraît intermittent

`classementFlushReadKeys(pending)` dérive les lectures du contenu du flush. **`challenges`
n'est lu que si le flush porte une progression de défi.** Donc seules meurent les validations
qui font avancer un défi — les autres passent.

Conséquences :
- le défaut frappe **sélectivement les grimpeurs ayant un défi actif**, c'est-à-dire les plus
  engagés, ce qui correspond au profil des comptes recalés le 1ᵉʳ octobre ;
- il perd un bloc de temps en temps, jamais tous : rien ne saute aux yeux ;
- et c'est **précisément le bloc qui aurait fait progresser le défi** qui est perdu.

---

## §2 — Cause probable

`permission-denied` sur un `get` de document unique, dans ce projet, a deux explications, et
**les deux sont des pièges déjà rencontrés ici** :

1. **Le document n'existe plus.** Une règle qui évalue `resource.data.x` sur un document
   inexistant **plante**, et un plantage se présente comme `permission-denied` (piège corrigé
   en V2.27 avec `resource.data.get('x', défaut)`, et une autre fois sur un `get()` non gardé
   par `exists()`).
2. **Le document existe mais ne satisfait plus la condition de lecture** — un défi hors
   fenêtre, ou `active: false`. Les défis `fenetre` et `bloc_designe` sont justement en
   production **sans e2e navigateur**, et figurent comme risque ouvert depuis des semaines.

---

## §3 — Le défaut de conception, au-delà de la cause

La progression d'un défi est un **bonus**. Le score du grimpeur ne l'est pas. Les deux n'ont
aucune raison de vivre ou de mourir ensemble dans la même transaction.

C'est le même raisonnement qu'en V2.69, où les gestes de mission ont été sortis de la
transaction partagée : **ce qui peut échouer sans conséquence ne doit pas partager le sort de
ce qui ne le peut pas.**

---

## §4 — Marche à suivre

### Phase 0 — Constater (lecture seule, ~15 min) — **ne rien modifier**

1. **Lire `classement_profiles/<uid de l'utilisateur>` côté serveur** et relever les
   `colorCounts` : lequel de jaune / bleu / violet n'a pas bougé ? Cela désigne le bloc perdu,
   donc le défi concerné.
2. **Lire `challenges/Oln9qhIHF1oaYVDi8NqL`** : existe-t-il ? Si oui, son contenu complet
   (type, fenêtre, `active`, champs présents et absents).
3. **Lire la règle `match /challenges/{id}`** dans `firestore.rules` et la confronter au
   document : quelle condition exactement échoue, ou quel champ manquant fait planter
   l'évaluation ?
4. **Remonter la référence** : quel document et quel champ, côté client, pointent vers cet
   identifiant de défi ? (défi actif stocké où ? `challenges.progress` ? autre ?)
5. **Compter la population touchée** : combien de comptes portent une référence vers un défi
   dans le même état ? Ce sont les comptes dont le classement est faux en ce moment.

**Sortie de la phase 0** : la cause exacte et le périmètre. À écrire dans le handoff avant de
coder.

### Phase 1 — Reproduire avant de corriger

C'est la discipline du projet, et elle a payé en V2.68.1 (bug reproduit sur l'émulateur avant
correctif).

6. **Un test de règles rouge** qui reproduit le `permission-denied` dans la situation trouvée
   en phase 0 (défi absent, ou défi hors fenêtre — selon le cas).
7. **Un test montrant que le flush meurt avec lui** : soit un e2e, soit un test unitaire sur
   le couple `classementFlushReadKeys` / `buildClassementFlushWrites` montrant qu'un `pending`
   portant une progression de défi entraîne la lecture fautive.

### Phase 2a — Arrêter l'hémorragie : les règles seules

8. **Corriger la règle de lecture** selon le cas :
   - document absent → `exists()` / `resource == null ||`, et `resource.data.get('champ',
     défaut)` partout où un champ peut manquer ;
   - condition trop stricte → un défi terminé doit rester **lisible**, même s'il n'est plus
     jouable.
9. `npm run test:rules` **vert** — non négociable : une règle fautive a déjà failli bloquer
   toutes les inscriptions, deux fois.
10. **Déployer les règles seules** : `firebase deploy --only firestore:rules`.

⚠️ **C'est pourquoi cette phase passe avant la 2b** : un déploiement de règles prend effet
**immédiatement pour tous les grimpeurs**, sans nouvelle version de l'application, sans
attendre la mise à jour du service worker. L'hémorragie s'arrête ce soir.

11. **Revérifier en direct**, même protocole : console ouverte, plusieurs validations dont une
    qui fait avancer un défi, puis lecture serveur de `classement_profiles`. Le compteur doit
    bouger de la valeur attendue.

### Phase 2b — Le correctif de fond, dans sa propre version

12. **Sortir la progression des défis de la transaction partagée** (§3), sur le modèle de
    `recordMissionGesture` en V2.69 : écrivain dédié, échec sans conséquence sur le
    classement.
13. **Étendre le test de propriété** des 1024 combinaisons pour que le classement ne dépende
    plus d'une lecture de `challenges`.
14. Version, build après bump, déploiement.

### Phase 3 — Réparer

15. **Une fois 2a déployée et vérifiée**, lancer `reconcile-classement-profiles.js` en
    simulation, puis `--fix`. Les points perdus reviennent.
16. Journal commité, comme le fait le workflow mensuel.

### Phase 4 — Durcir, pour que ça ne recommence pas en silence

17. ⚠️ **Rendre l'échec audible côté grimpeur.** `PROCESSUS-erreurs-avalees.md` a fonctionné —
    le message est dans la console, nommé, avec sa pile. Mais **personne ne regarde une
    console de production**. Une écriture de classement abandonnée après les trois tentatives
    du `failureThreshold` doit **le dire au grimpeur** : « ton score n'a pas pu être
    enregistré, réessaie ». Cela aurait fait remonter ce bug en vingt-quatre heures au lieu de
    deux semaines.
18. **Deux tests de règles permanents** : lecture d'un défi inexistant, lecture d'un défi hors
    fenêtre.
19. **Ligne pour `CLAUDE.md`** :

    > Une erreur journalisée n'est pas une erreur signalée. Si un échec peut rester invisible
    > pour l'utilisateur alors que ses données ne sont pas enregistrées, il doit remonter dans
    > l'interface, pas seulement dans la console.

---

## §5 — Ce que ça ne couvre pas

Ce défaut explique les compteurs **en retard** (le +1725). Il n'explique **pas** les trois
comptes du 1ᵉʳ octobre dont le compteur était **en avance** (46 blocs → 6, 22 jaunes
évaporés). L'hypothèse des documents `boulders` supprimés reste entière et **distincte** — le
décompte des résultats orphelins reste à faire, après celui-ci.

---

## §6 — Pour mémoire

C'est le **quatrième** membre de la famille déjà documentée dans `CLAUDE.md` : le `catch` qui
avale, l'état React juste pendant que Firestore est faux, le test qui sème sa propre donnée —
et maintenant **le résultat du bloc qui s'enregistre bien, donc le grimpeur croit que tout va
bien, pendant que son score ne bouge pas.** Ce qui rassure est encore une fois ce qui trompe.

Et le test terrain a tranché en quatre minutes ce que deux hypothèses d'analyse n'auraient pas
départagé. L'idée venait de l'utilisateur. **Quand un compte réel est disponible et que le
phénomène est reproductible, le reproduire passe avant le raisonner.**
