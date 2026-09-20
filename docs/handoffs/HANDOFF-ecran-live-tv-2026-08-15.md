# Handoff — Écran live de classement compétition, V2.29 → V2.32

> Rédigé le 15/08/2026 par Claude Code (Codespace) à destination de Claude
> (navigateur), auteur de `CONCEPTION-ecran-live-competition.md` (le document
> suivi pour ce chantier). Fait suite à
> `HANDOFF-quota-ecritures-version-2026-08-15.md` (V2.25→V2.28).
>
> Actuellement en production (https://blocabrac.web.app), déployé avec le
> reste du dépôt aujourd'hui. Cinq commits sur `main` : `33df75d` (V2.29),
> `c21d77a` (§2/§3, non versionné — mesure/vérification, pas de code
> applicatif), `7ffeb30` (V2.30), `e9af13b` (V2.31), `449ce1b` (V2.32).

---

## Résumé en quatre phrases

Les 7 chantiers du §8 de ta conception sont **tous faits** (extraction du
calcul de classement, vérification de schéma, coût en lectures mesuré, drapeau
de consentement verrouillé côté règles, route + Wake Lock, listeners temps
réel avec recalcul groupé, mise en page grand écran avec rotation par
catégorie FFME). Le coût en lectures a été chiffré **empiriquement** plutôt
qu'estimé : 28 010 lectures pour une soirée à 3 remontages (56,0 % du
plafond de 50 000), confirmant ton estimation initiale à 30 lectures près et
validant le go sans redesign. Une brèche de consentement que ta conception
avait anticipée (inscription manuelle par l'admin, qui ne passe jamais par
l'écran de mention de diffusion) a reçu le correctif minimal que tu avais
proposé — un avertissement affiché à l'admin, pas un vrai consentement de
substitution. Il ne reste que l'**étape 8 matérielle** (répétition à froid
PC+HDMI+TV) et les points du §9, tous les deux explicitement hors périmètre
d'un agent.

---

## 1. V2.29 — `33df75d` : extraction du calcul de classement (§1)

`getParticipantScores()`/`getClassementByCategory()` existaient en double, à
l'identique, dans `AdminCompetitionStats.tsx` et
`Ouvreur/CompetitionBoulders/CompetitionStats.tsx` — un troisième écran (l'écran
live) en aurait fait un troisième exemplaire, avec le risque de trois vérités
possibles le jour où le barème change, potentiellement en pleine compétition.

Extrait dans `frontend/src/utils/competitionClassement.ts` (même modèle que
`classementScore.ts`), générique sur le type participant (`<P extends
ParticipantBase>`) pour que chaque appelant garde son type complet sans cast.
9 tests dédiés (score, tri, blocs introuvables, priorité `color`/`difficulty`,
regroupement âge/genre). Les deux écrans existants délèguent maintenant à
l'utilitaire, comportement inchangé.

**Ce module est celui que j'ai réutilisé et étendu aujourd'hui (V2.33) pour
les modes de comptage de compétition** — voir
`HANDOFF-scoring-modes-2026-08-15.md`. Cette extraction s'est révélée être
exactement le bon point d'appui que ta conception visait : un seul endroit à
faire évoluer pour un changement de barème, pas trois.

## 2. §2/§3 — `c21d77a` : coût en lectures chiffré (pas de numéro de version, vérification/mesure)

**§2 (schéma)** : vérifié que `competition_id` est bien présent sur
`competition_results` — les 4 écrans qui lisent la collection l'interrogent
déjà directement (`where('competition_id', '==', ...)`), sans découpage en
lots de 10 sur des identifiants de blocs. L'inquiétude de ta conception
initiale était obsolète, aucune migration nécessaire.

**§3 (lectures)** : jamais chiffré jusqu'ici, mesuré empiriquement via
`frontend/test/measure-live-screen-reads.mjs` (même protocole émulateur que
les scripts de quota précédents). Scénario délibérément pessimiste (upper
bound, pas une moyenne) : grille de résultats 90×35 déjà pleine au premier
montage **et** une soirée complète de deltas rejouée par-dessus.

| Poste | Lectures |
|---|---|
| Snapshot initial `competition_results` (90×35) | 3 150 |
| Snapshot initial `competition_participants` (90) | 90 |
| Deltas `competition_results` (90 × 82 écritures) | 7 200 |
| Deltas `competition_participants` (90 verrouillages) | 90 |
| **Sous-total, 1 montage** | **10 530** |
| + 2 remontages (repaient le snapshot initial : 3 240 × 2) | 6 480 |
| **Total écran live, 3 remontages** | **17 010** |

Rapproché des ~11 000 lectures mesurées séparément pour les 90 grimpeurs
(`HANDOFF-quota-ecritures-version-2026-08-15.md`) : **28 010 lectures/soirée,
56,0 % du plafond de 50 000**, sous ton critère de sortie de 30 000. Ton
estimation initiale (~10 500 pour 1 montage) confirmée à 30 lectures près
(10 530). **Go confirmé pour la suite du plan, aucun redesign nécessaire.**

Le vrai risque reste les remontages (chaque remontage repaie le snapshot
initial de 3 240 documents) — les parades sans développement que tu avais
listées (connexion filaire, veille désactivée, ne pas déployer le jour J)
restent donc **impératives**, documentées telles quelles dans la conception,
rien à ajouter côté code.

## 3. V2.30 — `7ffeb30` : drapeau `liveDisplayEnabled` (§7)

Interrupteur "Diffuser le classement en direct sur l'écran TV" sur les
dialogues de création/édition de compétition
(`AdminCompetitionManagement.tsx`), défaut `false`. Décisions tranchées le
15/08 conformément à ta conception : l'inscription du grimpeur vaut
consentement (mention affichée dans le dialogue d'inscription client,
`ClientCompetitions.tsx`, quand le drapeau est actif) ; tous les inscrits
apparaissent, sans croisement avec `classementOptIn` (autre usage).

**Verrouillage côté `firestore.rules`** (pas un flag `liveDisplayLocked`
séparé — dérivé de `status`, même choix que `courseSessionStatus.ts`) : une
fois la compétition déclenchée (`status != 'à venir'`), `liveDisplayEnabled`
n'est plus modifiable, y compris pour admin/ouvreur — à la différence du
verrouillage de `competition_results` qui les exempte. 7 tests dédiés
(`live-display-flag-lock.test.ts`), 65/65 verts avec le reste de
`test:rules`. **C'est ce même patron que j'ai réutilisé aujourd'hui pour
verrouiller `scoring_mode`/`custom_scoring`** (V2.33).

**Brèche de consentement que tu avais toi-même signalée dans la
conception** : une inscription faite par l'admin
(`AdminCompetitionRegistration.tsx`) ne passe jamais par l'écran client, donc
jamais par la mention de diffusion. Correctif minimal appliqué, exactement
celui que tu proposais : avertissement affiché à l'admin sur cet écran quand
`liveDisplayEnabled` est actif — ne remplace pas le consentement, reporte la
responsabilité au bon endroit.

## 4. V2.31 — `e9af13b` : coquille (route + Wake Lock, étape 5 du §8)

`AdminCompetitionLiveDisplay.tsx`, route protégée admin
`/admin/competitions/live-display`, **Navbar masquée sur cette route** (écran
conçu pour être lu à 5 mètres, pas pour naviguer). Screen Wake Lock API pour
empêcher la mise en veille (dégrade silencieusement si l'API est absente —
pas la seule parade, voir aussi la veille désactivée côté PC au §3).
Ouverture en fenêtre séparée depuis `AdminCompetitionManagement.tsx`
(`window.open`, mode HDMI **étendu** — jamais miroir, sinon les cotations
cachées de l'admin s'afficheraient sur la TV, conformément à ton §6).

Encore une coquille à ce stade, comme prévu par ton plan : sélecteur de
compétition (`status == 'en cours' && liveDisplayEnabled == true`, deux
égalités simples donc pas d'index composite requis), nom de la compétition
sélectionnée, repère de version discret en coin d'écran, message explicite
si aucune compétition n'est en diffusion (« aucune compétition en diffusion
pour le moment » plutôt qu'un écran vide).

## 5. V2.32 — `449ce1b` : listeners + mise en page (étapes 6 et 7 du §8)

**Étape 6 (listeners)** : deux `onSnapshot` montés une fois par compétition
sélectionnée (`competition_results`, `competition_participants`, filtrés sur
`competition_id` — pas d'index composite requis), **jamais de refetch**
conformément à ta règle absolue du §4. Les blocs de la compétition sont lus
une seule fois (`getDocs`) : leur couleur/cotation ne change pas pendant
l'épreuve, seulement au "Terminer la compétition". Recalcul du classement
groupé toutes les 1,5s (debounce sur les callbacks, pas un tri par snapshot)
via `competitionClassement.ts` — une vague de validations ne déclenche donc
qu'un seul recalcul, pas vingt. Toute la vue par compétition
(`LiveCompetitionView`) est remontée via `key={competition.id}` au
changement de compétition : son état repart naturellement de zéro, sans
effect de reset dédié.

**Étape 7 (mise en page)** : rotation par catégorie FFME toutes les 18s (Top
10 général fixe en première page, puis chaque catégorie d'âge non vide) —
évite l'attente moyenne de 40s qu'un grimpeur aurait subie à chercher son nom
sur 8 pages d'un classement complet de 90 lignes. Grande typographie, marge
anti-overscan, marqueur "provisoire" tant que la participation n'est pas
verrouillée (`submitted`), horodatage discret de dernière mise à jour, prénom
+ initiale du nom (mineurs FFME, décision déjà tranchée dans ta conception).

Aucun changement de `firestore.rules` nécessaire pour cette étape : l'admin a
déjà un accès en lecture complet à `boulders`/`competition_results`/
`competition_participants`.

## 6. Fichiers modifiés (5 commits)

- `33df75d` : `frontend/src/utils/competitionClassement.ts` (nouveau),
  `competitionClassement.test.ts` (nouveau), `AdminCompetitionStats.tsx`,
  `Ouvreur/CompetitionBoulders/CompetitionStats.tsx`.
- `c21d77a` : `frontend/test/measure-live-screen-reads.mjs` (nouveau),
  `CONCEPTION-ecran-live-competition.md`.
- `7ffeb30` : `firestore.rules`, `AdminCompetitionManagement.tsx`,
  `ClientCompetitions.tsx`, `AdminCompetitionRegistration.tsx`,
  `live-display-flag-lock.test.ts` (nouveau).
- `e9af13b` : `AdminCompetitionLiveDisplay.tsx` (nouveau), routage (Navbar
  masquée sur la route live), `AdminCompetitionManagement.tsx` (bouton
  "Ouvrir l'affichage TV").
- `449ce1b` : `AdminCompetitionLiveDisplay.tsx` (listeners + layout complets).

Build/lint/test vérifiés à chaque commit (62 tests unitaires en fin de
parcours, 65 tests de règles avec `live-display-flag-lock.test.ts`).

## 7. Ce qui reste ouvert

- **Étape 8 du §8 — répétition matérielle à froid** (PC + câble HDMI + TV,
  mode étendu, overscan, veille désactivée), à faire **une fois avant le
  jour J, pas le soir même**. Explicitement hors périmètre d'un agent
  (matériel physique) — reste entièrement à l'utilisateur.
- **§9, concurrence à 90 utilisateurs simultanés** : jamais testée, toutes
  les mesures portent sur un grimpeur seul rejoué en boucle. Une répétition
  à 10-15 personnes sur une vingtaine de blocs reste ce qui renseignerait le
  plus, et serait l'occasion de tester l'écran live en conditions réelles.
- **§9, plan de repli si un quota saute** : aucune dégradation gracieuse
  conçue (Firestore renvoie des erreurs, l'app s'arrête). Les résultats
  écrits restent en base et le classement reste calculable après coup — mais
  à décider à froid, pas à improviser le soir même.
- **§9, relever les compteurs à mi-parcours** le jour J (console Firebase,
  onglet Usage) — geste opérationnel, rien à préparer côté code.

Rien de nouveau n'a été ouvert par ces cinq commits au-delà de ce que ta
conception avait déjà listé au §8/§9 — tout ce qui était FAIT l'est resté,
rien n'a régressé depuis.
