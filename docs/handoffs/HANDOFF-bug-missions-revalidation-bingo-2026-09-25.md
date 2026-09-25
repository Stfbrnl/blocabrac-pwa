# Handoff ClaudeNav — V2.68.1 / V2.69 / V2.70 : grille de missions, règle de revalidation, grille « bingo »

> Session Claude Code (PC Windows de l'utilisateur, pas le Codespace), 25/09/2026.
> Implémente `docs/handoffs/RETOUR-bug-missions-et-revalidation.md` (ta réponse du 25/09 au
> matin), étapes §5.1 à §5.7. L'étape §5.8 (garde-fou dans les règles) n'a pas été faite.
> **3 commits séparés** (`a47c031` V2.68.1, `11230de` V2.69, `110094c` V2.70), **poussés
> sur `main` et déployés le 25/09 au soir** (`--only hosting`). **Aucun changement de
> `firestore.rules`** dans ces trois versions, donc pas de déploiement des règles.
> `topo-blocabrac.pdf` a été mis à jour et régénéré (§6).
> **Rien n'a encore été vérifié par l'utilisateur dans l'interface** (§5).

---

## 0. Comment ça s'est déroulé

J'ai suivi l'ordre de ton §5 en séparant le correctif de régression (V2.68.1) de la
décision produit (V2.69), comme tu le demandais. L'habillage de la grille (V2.70) est
livré à part.

L'utilisateur a validé en session :
- la règle « B sans fenêtre » ;
- la maquette du tampon (ta maquette, non livrée dans l'app), rangée depuis dans
  `docs/handoffs/apercu-tampon-RETOUR-bug-missions.png`.

---

## 1. V2.68.1 — correctif de la grille effacée

### Contrôles préalables

- **§1.2, « une première réussite repeuple-t-elle la grille ? »** : le bug a été
  **reproduit sur l'émulateur avant le correctif** avec `test/e2e-weekly-missions-flow.mjs`.
  L'e2e contient une étape dédiée (« Contrôle §1.2 ») : une première réussite après
  plusieurs flushs « missions seules » conserve tout l'état stocké et ajoute sa mission.
  Aucune seconde cause n'est apparue. **Pas de contrôle sur un compte de prod.**
- **§1.3, inventaire des écrivains de `user_ludic_state`** : tous passent par un `setDoc`
  avec `merge: true` ou par une transaction qui relit le document. Aucun `setDoc` sans
  merge n'existe.

| Écrivain | Avant | Après |
|---|---|---|
| Flush partagé (`classementFlushWrites`) | relisait seulement si `wallDeltas` non vide : **c'était la cause** | lectures dérivées de `pending` |
| `incrementRouletteCompleted` (M8) | recomposait depuis l'état React | transaction avec relecture |
| `recordDeclarativeMission` (M4 bis) | recomposait depuis l'état React | transaction avec relecture |
| `recordMissionGesture` (nouveau, V2.69) | — | transaction avec relecture |
| `updateLudicState` : `weeklyGoalItems` (`ClientScreen`), `firstAscentOptIn` (`ClientProfile`) | champs scalaires ou remplacés d'un bloc, merge | inchangé, sans risque |

### Correctif

- `classementFlushReadKeys(pending)`, fonction pure : l'ensemble des lectures est dérivé du
  même `pending` que les écritures.
- `ClassementFlushReadData.readKeys` distingue « non lu » de « document absent » (ta
  solution du §1.6). `buildClassementFlushWrites` **lève une exception** sur toute écriture
  vers un document non relu.
- Test de **propriété** (§1.5) sur les 1024 combinaisons présence/absence des champs de
  `pending`. Ajouter un champ à la transaction sans étendre les lectures fait échouer le
  test tout seul.
- `utils/ludicStateWrites.ts` (pur) calcule les patchs de M8 et de M4 bis.
  `mergeWeeklyMissionsForDisplay` fusionne la grille écrite avec celle en mémoire, qui peut
  contenir des missions dont le flush débouncé n'est pas encore parti.
- `CLAUDE.md` contient maintenant ta règle du §4 : « aucune écriture ne reconstruit un
  document à partir de l'état mémoire ».
- `scripts/audit-weekly-missions.js` fait en lecture seule le contrôle de ton §3.2
  (cohérence de `weeklyMissionsCompleted` et du badge en prod). **Il n'a pas encore été
  lancé**, voir §5.

---

## 2. V2.69 — la première réussite fait foi

Implémente ton §2 entier.

- **Bloc déjà réussi** : fiche en lecture seule (« Déjà validé le … en N essais »), plus de
  boutons « Réussi » ni « Échoué ». `handleValidateSuccess` revérifie aussi le résultat
  stocké : la règle ne repose pas seulement sur l'interface.
- **« Corriger ma saisie »**, sans limite de temps (§2.2) : change les essais ou annule la
  réussite, et le classement suit.
- **Nombre d'essais obligatoire** (§2.4, tranché : pas de valeur par défaut). « Réussi »
  reste désactivé tant qu'aucun nombre n'est choisi.
- **Écriture unique** de `client_boulder_results` (`utils/boulderResult.ts`, pur,
  `planResultWrite`) :
  - `merge: true`, avec **seulement** les champs pilotés par le geste. C'est la
    préservation structurelle du §2.5.
  - `createdAt` est repris du document stocké.
  - Le delta de classement n'est appliqué que si l'état réussite/essais a réellement changé.
- **Échec puis réussite** (§2.7) : la réussite compte comme une première réussite. La règle
  porte sur « déjà *réussi* », pas sur « déjà *saisi* ».
- **M3 (flash)** exige `neverTriedBefore` : aucun résultat stocké et `attempts === 1`
  (§2.6).
- **Gestes de mission** (§2.8) : « J'ai testé ce bloc » (bloc au-dessus du niveau pas
  encore réussi → M4) et « Je l'ai refait » (bloc déjà réussi → M1, et toute mission qu'il
  fait avancer). Ils passent par `recordMissionGesture`, hors de la transaction partagée,
  **sans jamais écrire de résultat** et sans interface optimiste. Chaque bouton n'apparaît
  que s'il fait réellement avancer la grille (`missionGestureAdvances`).
- **Grammaire des boutons** (§2.9) : un bouton qui écrit un résultat porte un adjectif
  d'état. Un bouton qui n'en écrit pas est à la 1re personne du passé, en contour, avec la
  légende « n'enregistre pas de résultat ». Le bouton Roulette a été aligné et M4 bis
  s'appelle « Je l'ai fait ».
- **Aide** (`ClientHelp.tsx`) : section « Missions de la semaine » et les trois gestes
  (enregistrer / faire avancer une mission / corriger).

---

## 3. V2.70 — grille « bingo » tamponnée (§2.11)

- **Mise en page** : `WeeklyMissionsGrid.tsx`, affichage seul. 8 tuiles, en 2×4 sur mobile
  et 4×2 au-delà.
- **Tampon** : c'est la marque de la salle sans typographie (`src/assets/marque.png`,
  masque alpha recoloré en CSS, texture griffée conservée).
  - Il arrive grand (~75 px) quand une mission est cochée pendant que l'écran est ouvert,
    puis se pose petit (~26 px) dans un coin. Aucune animation au premier affichage.
  - Inclinaison et opacité sont dérivées de la clé de la mission (`missionGridStyle.ts`,
    pur, testé), jamais tirées au hasard.
  - Encre `brandGreen` en thème sombre : `brandGreenDark` y était presque invisible.
- **Couleurs et pictogrammes** : accent de couleur de niveau pour M1/M3/M4 (bordure pour
  les couleurs pâles). Pictogrammes pour dévers, rétablissement et dalle. M2 en 4 segments.
- **En-tête** : niveau figé, « N / 8 », badge en silhouette qui s'allume à la complétion.
- **Accessibilité** : l'état validé est aussi donné en texte, le tampon est `aria-hidden`,
  et les animations sont coupées sous `prefers-reduced-motion`.
- **Ta condition est respectée** : le tampon n'est réutilisé nulle part ailleurs (badges,
  roulette) avant d'avoir été vu en vrai sur la grille.

---

## 4. Tests

| Vérification | Résultat |
|---|---|
| `npm test` | **290/290** (23 fichiers), relancé juste avant le déploiement |
| `npm run lint` | propre |
| `npm run build` | OK, refait **après** le bump 2.70 et juste avant le déploiement (la chaîne `2.70` est présente dans `dist/`) |
| `e2e-weekly-missions-flow.mjs` | **10/10** : nouveaux gestes, flush « missions seules » qui conserve la grille, contrôle §1.2, « Corriger ma saisie », M8 qui s'ajoute sans rien effacer, rechargement |
| e2e quotidien, défis, premiers ascensionnistes | verts, adaptés à la saisie obligatoire des essais |
| e2e saison (`season-classement`, `season-restart`) | **étapes d'interface vertes ; étapes pilotées par script en échec sur le PC** (voir §5) |
| `npm run test:rules` | non relancé : aucun changement de règles |

---

## 5. ⚠️ Ce qui n'a PAS été vérifié

1. **L'utilisateur n'a encore rien vu dans l'interface.** Seules des captures Playwright ont
   été faites : mobile, desktop, thème sombre, arrivée du tampon. À vérifier sur téléphone :
   - la bannière de mise à jour, puis « V2.70 » dans la Navbar ;
   - la fiche « Déjà validé » ;
   - « Corriger ma saisie » ;
   - un geste de mission ;
   - le tampon en vrai.
2. **`scripts/audit-weekly-missions.js` n'a pas été lancé sur la prod.** C'est ton contrôle
   §3.2. Il doit tourner depuis le Codespace, qui a la clé de compte de service : le PC ne
   l'a pas.
3. **Les e2e saison sont à relancer dans le Codespace.** Leurs étapes pilotées par script
   (`reconcile-classement-profiles.js`, `compute-classement-saison.js`) exigent
   `serviceAccountKey.json` même contre l'émulateur, et elle n'existe pas sur le PC. C'est
   un problème d'environnement, pas une régression présumée, mais c'est tout de même non
   vérifié.
4. **La grille de cette semaine de l'utilisateur reste effacée** jusqu'au lundi 28/09,
   conformément à ton §3.1 (pas de réparation).

---

## 6. Topo mis à jour

`topo-blocabrac-source.html`, régénéré (`npm run topo`, 10 pages, aucun débordement
vérifié page par page) :
- version V2.70 et date du 25/09 ;
- **Blocabrac quotidien** : essais obligatoires, première réussite en lecture seule,
  « Corriger ma saisie », note/commentaire/cotation toujours modifiables ;
- **Missions de la semaine** : grille « bingo » tamponnée, les deux gestes, flash seulement
  sur un bloc jamais essayé ;
- **Points de vigilance** : nouvel encadré « Une réussite ne se réécrit pas en revenant sur
  le bloc ».

---

## 7. Écarts par rapport à ton retour

1. **Transaction plutôt qu'`arrayUnion`** (§1.4). La remise à zéro hebdomadaire impose de
   lire `isoWeek` de toute façon, et `weeklyMissionsCompleted`/`completedAt` dépendent du
   contenu réel de `done`. Avec `arrayUnion`, une grille de la semaine précédente
   recevrait des missions de la semaine courante.
2. **« Je l'ai refait »** s'affiche dès qu'il fait avancer *une* mission (M1, mais aussi
   M2/M5/M6/M7 sur un nouveau mur ou type de mur), pas seulement M1.
3. **Note, commentaire et cotation proposée restent modifiables** hors de « Corriger ma
   saisie » (bouton « Enregistrer », `handleSaveNotes`, qui n'écrit jamais
   `success`/`attempts`). Ce ne sont pas des données de score.
4. **La règle n'est pas imposée dans `firestore.rules`.** Le propriétaire peut toujours
   réécrire son résultat librement. L'application passe par l'interface et par la garde de
   `handleValidateSuccess` : c'est suffisant selon la doctrine de confiance du projet, et
   ça évite une règle qui bloquerait aussi les corrections légitimes.
5. **Garde-fou du §1.7 (étape §5.8) non tenté.**
6. **Changelog** : seul `changelog[0]` est affiché dans « Quoi de neuf ». L'entrée 2.70
   reprend donc les points de la 2.69, pour qu'un grimpeur qui passe de 2.68 à 2.70 les
   voie. V2.68.1 n'a pas d'entrée : c'est un correctif invisible.

---

## 8. Questions ouvertes pour toi

- Le §1.7 vaut-il encore d'être tenté, maintenant que la garde est côté client et que le
  flush lève sur toute lecture manquante ?
- Si les missions devaient un jour rapporter des points au classement, les gestes (qui sont
  déclaratifs) ne doivent pas compter. C'est noté dans `CLAUDE.md`, sans rien de prévu.

---

## Points ouverts par ailleurs (reportés, inchangés sauf mention contraire)

- **Contrôle §3.2 en prod** (`audit-weekly-missions.js`, depuis le Codespace), **nouveau**.
- **Relancer les e2e saison dans le Codespace**, **nouveau**.
- Vérification visuelle de l'anecdote d'ouvreur et du carnet de méthodes (V2.66/V2.67) :
  toujours sans retour de l'utilisateur.
- Migration de l'état ludique : Passe C déployée en V2.61, la purge
  (`purge-legacy-ludic-fields.js --fix`) est toujours en attente.
- Clic « Redémarrer la saison » : à vérifier si l'utilisateur l'a déjà fait.
- Défis `fenetre` / `bloc_designe` : toujours en prod sans e2e navigateur.
- Chantier droits d'accès (rôle ouvreur trop large) : en attente du gérant.
- `topo-blocabrac.pdf` : on ne sait toujours pas si la police Dosis s'affiche réellement
  dans le PDF généré ; `aide-connexion-installation.html` est toujours hors charte.
- Un projet Firebase par salle ou un projet mutualisé ; fork « Grimpe ! ».
- Sauvegarde durable des images Cloudinary (`--backup`).
- Idée « mode flash » : écartée explicitement (voir `CLAUDE.md`).
