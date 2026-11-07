# Retour à ClaudeNav — le couplage clôture admin ↔ ouvreur (V2.82, 07/11/2026, soirée)

> **V2.82 est en production, déployée et VÉRIFIÉE SERVIE** (`verify-deploy-servi.cjs` :
> version servie, service worker actif, les six documents de `/docs/` ouverts par navigation).
> Étiquette `deploy/v2.82` sur `bcc84094`. **646 tests unitaires verts** (630 en V2.81.1),
> **174 tests de règles verts**, lint propre. Audit de production : **0 erreur, 0
> avertissement**, `competition_active : 0 bloc(s) porteurs`.
>
> Récit complet et durable : [`docs/architecture/competitions.md`](../architecture/competitions.md)
> §« La clôture des blocs couplée au statut ».

---

# ① Ce qui était demandé, et ce qui est livré

Demande de Stéphane, le 07/11 : *« Il peut être intéressant d'activer automatiquement ce clic
côté Ouvreur par le passage de la compétition en mode terminée côté admin, si c'est possible. »*

**C'était possible, côté client uniquement** (ce projet n'a aucune Cloud Function), et c'est
livré en deux commits distincts :

1. **`72543e7`** — l'extraction de la clôture dans un module partagé. Aucun changement de
   comportement, sauf le refus décrit au §③.
2. **`d353b40`** — V2.82, le couplage lui-même dans `AdminCompetitionManagement.tsx`.

Plus **`bcc8409`** : les trois documents régénérés en V2.82, et un correctif de générateur
trouvé en chemin (§⑤).

---

# ② Les deux décisions de forme, soumises puis tranchées

Je les ai posées avant d'écrire une ligne, parce qu'elles changeaient le travail.

## ⓐ Une fenêtre de confirmation APRÈS l'enregistrement, pas une case à cocher

```
Compétition mise à jour.
┌──────────────────────────────────────────┐
│ Faire quitter l'épreuve à ses blocs ?    │
│  92 bloc(s) sont encore rattachés à      │
│  « Contest cours » :                     │
│   • 0 créé(s) pour l'épreuve             │
│   • 92 bloc(s) quotidien(s) réutilisé(s) │
│   • dont 3 désactivé(s)                  │
│  ⚠️ Irréversible pour les blocs créés    │
│    pour l'épreuve.                       │
│      [ Plus tard ]  [ Basculer (92) ]    │
└──────────────────────────────────────────┘
```

Trois raisons, dont une a tranché :

- la migration est **irréversible** (la cotation cachée devient publique, rien ne la recache)
  alors que le statut, lui, se remet comme il était. *Une publication immuable mérite une
  confirmation, pas un avertissement.*
- le statut est **déjà écrit** quand la fenêtre s'ouvre : « Plus tard » ne perd **rien**. Le
  bouton de l'ouvreur reste, l'audit continue de voir le cas. C'est ce qui permet d'**offrir**
  le geste sans le **forcer**.
- 🔴 **et la raison décisive : une case à cocher n'aurait pu annoncer AUCUN nombre.** L'écran
  d'administration ne charge aucun bloc. La fenêtre **relit la base** et annonce ce qu'elle a
  mesuré. Faire décider à l'aveugle d'une opération irréversible n'est pas une confirmation.

## ⓑ La condition porte sur l'ÉTAT, pas sur la transition

On ne vérifie **pas** que le statut vient de changer. Une compétition passée en « terminée » la
semaine dernière sans que les blocs aient suivi est **exactement le cas du 06/11** : le proposer
au prochain enregistrement la répare, alors qu'un test de transition l'aurait laissée fautive
**pour toujours**.

Périmètre : **`terminée` ET `annulée`** — les deux sortent du vol, et l'audit traite déjà les
deux comme des erreurs. Coût : 2 lectures hors du vol, **zéro** en vol.

---

# ③ Le refus des cotations hors échelle, né d'une question de Stéphane

Pendant le chantier : *« Il existe les blocs mystères mais est-ce considéré comme une
difficulté ? »* — **non**, et c'est important ici.

`gymConfig.ts` tient `mysteryGrade` **hors de `colorGrades`** : ce n'est pas une cotation mais
l'**absence annoncée** de cotation publique. Or `basePoints[couleur] || 0` rend **0** : un bloc
**public** coté `mystere` ne rapporte **rien à personne, en silence**.

Mesuré en production avant de décider :

| mesure | résultat |
|---|---|
| blocs `color: "mystere"` | **1** — `is_active: false`, `type: 'daily'`, **0 validation** |
| blocs `type: 'competition'` | 7, **tous** à `difficulty` canonique |
| seaux hors échelle dans 82 `classement_profiles` | **aucun** |

**Le cas est dormant.** Le garde a été posé quand même, pour une raison qui n'existait pas la
veille : le geste est maintenant **à un clic d'un écran qui ne charge aucun bloc**. Et il
**refuse** plutôt que de normaliser — la bonne couleur d'un bloc est une décision d'ouvreur.
Né vert sur terrain propre, donc **exercé dans les deux sens**.

---

# ④ Deux fois mon instrument s'est trompé, et dans des sens opposés

Ce point est pour toi, parce qu'il est plus général que le chantier.

**ⓐ Une liste recopiée à la main.** Mon premier script de mesure énumérait les huit couleurs
canoniques **en dur** et avait oublié `violet` : il a déclaré **38 blocs de production
fautifs**. Je l'ai **supprimé** plutôt que corrigé, et son remplaçant **lit** `colorGrades`
avec un arrêt dur s'il n'en trouve pas huit.

**ⓑ Un instrument qui contredisait le filet du dépôt.** Pour dimensionner l'ajout au topo, j'ai
écrit un script « mesurer les marges ». Il annonçait 2 débordements là où le filet du dépôt
déclarait les 14 sections conformes, **sur le même fichier** — pas de média `print`, source
brute au lieu d'estampillée, et surtout :

> 🔴 **il prétendait rendre une grandeur qui n'existe pas.** `.page` déclare une hauteur fixe,
> donc les 14 sections mesurent **toutes 1123 px pour 1123 disponibles**. **La marge n'est pas
> observable ; seul le débordement l'est.** Dimensionner un ajout est donc nécessairement
> itératif, et un instrument qui annonce « il reste N px » mesure autre chose.

Supprimé plutôt que commité.

**Et une troisième, plus petite mais de la même famille : deux de mes prédictions de mutation
étaient fausses.** Sur les 8 mutations du module pur, j'avais prédit que la partition rougirait
quand on supprime le refus (faux : rien n'est perdu, tout part dans `aMigrer`) et que le
compteur `desactives` rougirait quand on saute les blocs désactivés (faux : il se calcule sur
l'**entrée**, pas sur la boucle). C'est **l'intérêt** d'écrire la prédiction d'avance — sans
elle j'aurais conclu « le filet attrape » sans savoir quoi.

---

# ⑤ Trouvé en chemin : un filet qui laissait un PDF fautif derrière lui

En essayant d'ajouter la mention au topo, le filet des pieds de page a bien crié — **mais après
que `page.pdf()` et l'estampille aient été écrites**. Le dépôt s'est retrouvé avec un PDF au
**pied de page manquant**, estampillé de la nouvelle version, issu d'une source qui n'existait
plus. J'ai dû restaurer les deux fichiers depuis git.

🔴 **Le filet passe désormais en tête des deux générateurs.** Rien n'imposait l'ordre inverse :
il mesure la **source**, pas le PDF. La raison écrite pour le placer en fin — « la pagination ne
change qu'à une régénération, donc c'est ici qu'elle se vérifie » — portait sur le **moment**,
jamais sur le **rang**.

> ⚠️ **Un garde qui échoue ne doit rien laisser derrière lui.** Vérifié dans les deux sens.

---

# ⑥ 🟠 UN POINT À SURVEILLER, PRÉEXISTANT ET NON CORRIGÉ

**`boulders/update` est au plafond du moteur de règles Firestore.** En mesurant le droit de
l'admin sur l'émulateur, le refus d'un client ou d'un moniteur arrive avec :

```
PERMISSION_DENIED: Unable to evaluate the expression as the maximum of 1000
expressions to evaluate has been reached. for 'update' @ L552
```

Le refus est **correct** et les écritures légitimes (premières ascensions, votes de méthode)
passent — c'est testé. Mais **la marge est nulle** : `isAppendOnly4` déroule ses comparaisons,
et trois `diff().affectedKeys()` s'y empilent. ⚠️ **Toute clause ajoutée à cette règle doit être
mesurée sur l'émulateur avant d'être déployée** ; et le jour où `FIRST_ASCENT_LIST_MAX` passerait
de 5 à 6, `CLAUDE.md` demande d'ajouter un index déroulé — c'est exactement ce qui ferait
basculer. À traiter avec le chantier « droits d'accès, rôle ouvreur trop large ».

---

# ⑦ Ce qui n'a pas pu entrer dans le topo

**Le topo est plein**, aux 14 sections. Mon ajout initial coûtait une ligne sur deux pages
(−18 px et −9 px). Le point de vigilance a été **compressé** jusqu'à tenir, et il dit maintenant
ce que l'oubli **coûte** (premières ascensions et carnet de méthodes refusés sans message)
plutôt que seulement que le geste est définitif. **La phrase sur l'écran admin a été retirée** —
elle est dans le changelog.

⚠️ Jamais en supprimant un groupe existant : c'est l'erreur du 19/10, où un rééquilibrage avait
fait disparaître un groupe entier et où le document était ressorti **vert et parfait**.

**Donc, si tu veux la mention dans le topo papier : il faut une 4ᵉ page de points de
vigilance.** C'est une décision éditoriale sur un document imprimé, pas une correction — je ne
l'ai pas prise.

---

# ⑧ Ce qui reste ouvert

- 🔜 **La seconde piste née le 06/11, toujours ouverte** : le **classement par niveau max ne
  figure dans aucun texte publié**. `utils/competitionAnnouncement.ts` ne compose que
  *général / par âge / par genre*, et `AdminCompetitionStats.tsx` ne l'affiche pas. Il n'existe
  que dans le palmarès gelé — donc les grimpeurs y ont accès **sur l'écran du palmarès, pas dans
  le bandeau**, or c'est le bandeau qu'on lit. **À décider**, ce n'est pas un défaut.
- 🟠 **L'e2e du débounce** reste souhaitable sans être urgent (mesure du 07/11 : la soirée du
  06/11 n'a rien perdu — 11 participants sur 11, 264 `competition_results`).
- 🔴 **La Roulette quand aucun bloc ouvert ne correspond au niveau du grimpeur** : jamais
  vérifié.
- **Défaut latent connu** : `points_value` est effacé à la clôture alors que rien ne stocke les
  points → une compétition `blocs_valides` terminée se recalcule avec des valeurs disparues.
  ⚠️ Ce chantier **ne l'a pas aggravé** (le comportement est inchangé, simplement déplacé dans
  le module), mais il est maintenant déclenchable depuis deux écrans.
- ⏭️ **Geste non technique** : imprimer `affiche-bareme-competition.pdf` et `topo-blocabrac.pdf`,
  régénérés et estampillés **V2.82**.
