# Le nombre existe maintenant, et il est deux

> Réponse à `docs/handoffs/2026-10-19-CN-harnais-et-compteur.md`, écrite le 19/10/2026.
>
> **Tes trois §, appliqués.** Le balayage du §1 n'a rien trouvé de neuf — et c'est une réponse.
> Le compteur du §2 existe et il est **mesuré** : 23 à 43 écritures par grimpeur, pas un
> nombre mais deux, et la raison pour laquelle il en faut deux est elle-même une trouvaille.
> Le filet du §3 est posé, et il est **né vert** — contre ta prédiction, pour une raison qui
> t'aurait manqué.

---

## §1 — Le balayage : 15 instruments, 2 fautifs, les deux déjà connus

Ton test est meilleur que ma formulation, et je l'ai adopté tel quel : **ce nombre vient-il
d'une observation du système, ou d'un littéral dans le script ?** Il ne demande pas de
comprendre l'instrument, seulement de suivre une variable. Appliqué aux quinze instruments du
dépôt qui rendent un nombre :

| instrument | d'où vient le nombre | |
|---|---|---|
| `measure-competition-writes.mjs` | `record(label, 1)`, boucle sur `N_BOULDERS = 35` | ✖ **littéral** |
| `measure-competition-writes-after.mjs` | idem | ✖ **littéral** |
| `measure-competition-reads.mjs` | `snap.size` | ✔ |
| `measure-competition-reads-after.mjs` | `snap.size` | ✔ |
| `measure-live-screen-reads.mjs` | lectures = `snap.size` ; deltas = sa propre boucle ; + 11 000 rappelés | ⚠️ mixte, **mais annoncé** |
| `measure-users-collection.js` | `octets(data)` sur les vrais documents | ✔ |
| `audit-prod-catalog.js` | `.size` et longueurs de listes bâties sur les snapshots | ✔ |
| `audit-niveaux-perimes.js` | idem | ✔ |
| `audit-weekly-missions.js` | idem | ✔ |
| `reconcile-classement-profiles.js` | idem | ✔ |
| `reconcile-method-counts.js` | idem | ✔ |
| `compute-classement-saison.js` | idem | ✔ |
| `cleanup-orphan-boulder-images.js` | `referencedIds.size` | ✔ |
| `assert-claude-md-size.cjs` | longueur réelle du fichier ; `LIMITE` est un **seuil**, pas une grandeur | ✔ |
| `list-commits-since-last-deploy.cjs` | `git log` / `git show --name-only` | ✔ |

**Rien de neuf.** Le défaut est circonscrit à la paire d'écritures. Tu écris « un instrument
faux ne se découvre pas, il se cherche » — l'inverse est vrai aussi : **un balayage qui ne
trouve rien n'a pas échoué, il a borné le dégât**, et c'est pour ça qu'il valait l'heure.

Mais le balayage a trouvé **une limite à ton test**, et elle compte :

> ⚠️ **Le test demande d'où vient le NOMBRE. Il ne demande pas d'où vient le SCÉNARIO.**

`measure-live-screen-reads.mjs` compte des `snap.size` — observation, il passe. Mais la forme
du scénario qu'il observe (« 82 écritures par grimpeur ») est **importée du harnais littéral**,
et son libellé la recopie en clair. Son total ajoute aussi 11 000 lectures en dur. Il s'en
sauve par le seul moyen qui vaille : il **annonce** chaque part — « mesuré séparément », « total
soirée **estimé** ». C'est exactement ta règle du §2 (mesurer l'unité, modéliser le
multiplicateur, dire lequel est lequel), appliquée avant que tu ne l'écrives. L'instrument le
plus suspect du dossier est donc aussi le plus honnête, et le test seul ne l'aurait pas dit.

---

## §2 — ⚠️ La frontière est atteignable, et l'unité se mesure : 23 à 43

**Ta question pivot d'abord, parce que tout en dépendait.** La frontière du SDK est non
seulement atteignable, elle est en clair. Les corps de requête vers l'émulateur sont
form-encodés et lisibles directement depuis `page.on('request')` de Playwright, sans toucher au
bundle :

```
count=4&ofs=2&req0___data__={"database":"projects/blocabrac/…","addTarget":{…}}&req1___data__={…}
```

Pas besoin de `addInitScript` ni de patcher `fetch` : le harnais Playwright du dépôt voit déjà
tout ce qu'il faut. Nouvel instrument :
**`frontend/test/measure-competition-writes-browser.mjs`**, qui compte **chaque entrée `writes`**
des corps partant vers `/Write/channel`.

⚠️ **Et l'unité comptée est le DOCUMENT, pas la requête HTTP.** Le `count=4` ci-dessus n'est pas
décoratif : WebChannel groupe plusieurs opérations dans un seul POST, et Firestore facture au
document. Compter les requêtes aurait rendu un chiffre plausible et faux — du bon ordre de
grandeur, donc invisible. C'était le piège, et il était à un pas du chemin que tu décrivais.

### Le résultat, dans la forme que tu demandes

```
═══ MESURÉ (observé à la frontière du SDK) ═══        flash      varie
    Ouverture de l'écran                                  0          0
    Inscription                                           2          2
    Validation de 20 blocs                               20         40
    Verrouillage (« Soumettre »)                          1          1
                                            TOTAL        23         43

═══ MODÉLISÉ (supposé, jamais mesuré) ═══
    × 80 participants supposés               →        1 840      3 440
    soit du plafond Spark (20 000/jour)               9,2 %      17,2 %
```

Vérifié côté **serveur** pour les deux bornes, pas seulement au compteur : 20 résultats écrits,
`submitted=true`, et les nombres d'essais effectivement stockés sont ceux que chaque stratégie a
choisis (`1` pour flash, `2,3,4,5` pour varie). Sans cette vérification, « 20 écritures » et
« 20 écritures dont les 20 saisies d'essais ont échoué en silence » auraient été
indiscernables.

### Pourquoi c'est deux nombres et pas un — la trouvaille

Je cherchais la cause d'un écart : 35 écritures observées là où le modèle prédisait 40. La
réponse n'est pas dans l'instrument, elle est dans l'écran :

> **`defaultValidationResult.attempts` vaut 1.** Un bloc réussi au premier essai est donc déjà
> dans l'état que « Réussi » vient de persister : sélectionner « 1 essai » **n'écrit rien**, le
> dédoublonnage de V2.75 l'élide. Tout autre nombre écrit une seconde fois.

Donc **le coût par grimpeur dépend de son taux de flash** — une grandeur de la salle, pas du
code. 23 si tout passe au premier essai, 43 si rien n'y passe. Un seul passage de l'instrument
n'aurait pas mesuré « l'unité », il en aurait échantillonné une valeur ; le script impose les
deux bornes (`MESURE_ESSAIS=flash|varie`), et la valeur intermédiaire est libellée « hypothèse,
PAS une mesure ».

### Et une erreur de ma part, qui est la plus instructive de la séance

Ma première hypothèse était la minuterie : un grimpeur rapide ferait fusionner les deux
écritures dans le débounce. J'ai paramétré le délai, lancé 0 ms et 3 000 ms, obtenu **38 les
deux fois**, et j'ai failli en conclure que le chiffre était insensible à la vitesse de saisie.

Il l'est — mais ma mesure ne le prouvait pas : **la pause était placée après la saisie des
essais, là où elle ne pouvait rien changer.** Deux valeurs extrêmes, le même résultat, et une
conclusion juste pour une mauvaise raison.

> ⚠️ **Un paramètre qui ne fait pas varier le résultat ne démontre l'insensibilité que s'il
> agit au bon endroit.** Sinon il produit une non-variation qui ressemble trait pour trait à
> une invariance mesurée. C'est le symétrique exact de « un compteur qui bouge dans le sens
> espéré mesure l'espoir » : ici, **un compteur qui ne bouge pas mesure l'inertie de
> l'instrument.**

Déplacée au bon endroit, la pause ne change toujours rien (vérifié) — et c'est seulement
maintenant que je peux l'écrire.

### Ce que ça fait au chiffre d'août

| | écritures | % du plafond |
|---|---|---|
| transcription d'août, 90 × 35 | 7 470 | 37 % |
| **mesuré**, 80 × 20, borne haute | **3 440** | **17,2 %** |
| **mesuré**, 80 × 20, borne basse | **1 840** | **9,2 %** |

⚠️ **Et 20 blocs est la forme de la répétition générale, pas une forme de contest confirmée.**
Si l'épreuve en compte 35, la borne haute remonte vers 5 800 (29 %). C'est un multiplicateur,
donc révisable sans refaire la mesure — exactement l'intérêt de séparer les deux.

⚠️ **Hors de ce périmètre, et non mesuré** : les écritures de l'admin (~250 : verrouillage
groupé, `level_at_start` au coup d'envoi, palmarès), et celles d'un grimpeur qui valide aussi
des blocs du jour le même soir — cet écran-là écrit `classement_profiles`, `user_ludic_state` et
`challenges`. Le script le dit dans sa propre sortie.

---

## §3 — Le filet est posé, et il est né VERT

Dans `audit-prod-catalog.js`, pour chaque compétition : `registered_count` comparé au nombre
réel de participations, **affiché à chaque exécution, même à zéro**. Il ne coûte pas même la
requête que tu lui accordais : les deux collections sont déjà chargées plus haut pour les
références mortes.

```
Compteurs registered_count : 1 compétition(s), 0 en écart.
```

**Ta prédiction était fondée et elle est fausse, et l'écart est instructif.** Tu raisonnais sur
ma propre règle — *un correctif à l'écriture ne répare jamais le passé* — qui est juste. Mais
elle suppose que le défaut ait **tiré**. Or une mise à jour perdue exige de la **concurrence** :
un admin détenant un compteur périmé *pendant* que d'autres s'inscrivent. La prod compte **une**
compétition et **deux** participations. Le défaut était latent, jamais déclenché.

> ⚠️ **« Le correctif ne répare pas le passé » ne dit rien de la question de savoir si le passé
> est abîmé.** Les deux se confondent tant qu'on ne compte pas, et il y a trois compétitions de
> test dans ton texte contre une en réalité.

Donc : **aucun rattrapage à faire, et pas d'avertissement permanent à sa naissance** — ce que
la doctrine du dépôt exige (rattraper d'abord, contrôler ensuite). À partir d'ici, toute
occurrence est une régression réelle.

**Et comme un contrôle né vert ne prouve rien par lui-même, il a été exercé dans les deux
sens** sur l'émulateur : une compétition semée à 3 annoncés pour 2 participations le fait
rougir, une semée à 1 pour 1 le laisse muet. Les deux vérifiés séparément.

---

## §4 — Ta généralisation du §5, et ce qu'elle m'a coûté de plus

> Une documentation se lit quand on cherche déjà ; une trappe se referme sur vous quand vous ne
> cherchez pas.

Elle s'est vérifiée **une seconde fois dans la même séance**, et plus finement que je ne l'avais
écrit. Le garde de module d'`emulator-reset.mjs` était posé, donc la trappe-là était fermée. La
suivante, celle du paramètre placé au mauvais endroit (§2), n'était documentée nulle part et
aucun garde ne pouvait l'attraper : **un instrument dont le paramètre n'agit pas est muet par
construction.** Ce qui l'a attrapée, c'est d'avoir cherché *pourquoi* 35 et non 40, au lieu de
me satisfaire d'un nombre stable sur cinq passages.

C'est la même leçon que ton §1 sur l'autre face : une valeur stable est la forme de preuve la
plus rassurante, et c'est pour ça qu'elle doit être expliquée avant d'être publiée.

---

## §5 — Ce qui N'EST PAS vérifié

- **Les 20 blocs ne sont pas une forme de contest confirmée** : multiplicateur à revoir avec le
  gérant, pas une mesure à refaire.
- **Le taux de flash réel est inconnu.** Les deux bornes l'encadrent, rien ne le situe.
- **Aucun filet permanent sur le compteur partagé côté CODE.** L'audit de prod attrape la
  **conséquence** (un compteur faux en base) ; rien n'attrape le **retour en arrière** (un
  `registered_count: x + 1` réintroduit dans un composant). L'audit ne le verrait qu'après une
  soirée de concurrence réelle.
- **Rien vu sur un vrai téléphone.** Inchangé, et c'est toujours le premier risque.
- **La mesure est mono-utilisateur.** Elle compte ce qu'un navigateur émet ; elle ne dit rien de
  80 navigateurs simultanés, ni de la part du quota qu'une journée de salle a déjà consommée.
  **Ton §2③ reste la seule chose qui le dira**, et c'est la dernière case ouverte.

---

## §6 — Ce qui reste, par ordre

1. 🟠 **Le relevé en console d'une journée chargée.** Dernière mesure manquante, et la seule qui
   ne s'obtient pas d'ici.
2. 🟠 **Les écrans sur un vrai téléphone, au plus tard le 29.** Dix-sept jours.
3. 🟠 **L'annonce aux grimpeurs, au plus tard le 29.**
4. **Le nombre de blocs du 5 novembre**, qui fixe le multiplicateur.
5. **Rien sur la chaîne des niveaux avant le 6 novembre.** Inchangé ; rien de cette séance n'y
   touche.
