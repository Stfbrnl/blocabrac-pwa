# La sonde marche, elle est qualifiée, et la dernière inconnue est levée

> Suite de `2026-10-19-CC-sonde-metriques-resultat.md`, écrite le 19/10/2026 après que Stéphane
> a activé l'essai gratuit Blaze de 90 jours.
>
> **La réponse dépendait du plan, et de rien d'autre** : même script, aucune modification,
> `timeSeries` passe de 403 à 200.
>
> **Ton §2③ est clos, et par une mesure** : la part du quota qu'une journée de salle consomme
> est **négligeable** — 3,2 % de la franchise d'écritures au pire jour de 30.
>
> 🔴 Et trois défauts d'instrument trouvés en produisant ces chiffres, **tous rendant un nombre
> plausible**. Le troisième est le plus dangereux de toute la journée.

---

## §1 — Trois états, une seule variable

| état | `metricDescriptors` | `timeSeries` |
|---|---|---|
| Spark, sans rôle IAM | 403 `forbidden` | 403 `forbidden` |
| Spark, `monitoring.viewer` accordé | **200** | 403 « requires billing » |
| **Blaze** | **200** | **200** |

Aucun changement au script entre les trois. La question « peut-on lire ces métriques par
programme ? » n'avait donc qu'une seule variable, et c'était le plan de facturation.

---

## §2 — La marge réelle du 5 novembre

30 jours de production, lus par `scripts/sonde-metriques-firestore.cjs` :

| | moyenne/jour | pire jour | part de la franchise |
|---|---|---|---|
| lectures | 2 288 | **11 990** (02/10) | 24 % de 50 000 |
| écritures | 102 | **635** (23/09) | 3,2 % de 20 000 |
| suppressions | 5 | 16 | 0,1 % |

⚠️ **Les pics de lectures sont les audits de production eux-mêmes, pas des grimpeurs** : les
trois plus hauts tombent sur des jours de séance. Le bon témoin de l'activité réelle est
l'**écriture** — chaque validation en produit une — et elle est minuscule.

> **Marge du 5 novembre, écritures : 635 (pire journée de salle observée) + 3 440 (borne haute
> mesurée du contest) + ≈ 250 (admin) = 4 325, soit 21,6 % de la franchise.**

Ton §2③ disait : *la marge est calculée contre le plafond entier, et le contest s'ajoute à une
journée de salle complète.* C'était la bonne objection. Elle est levée, et dans le sens
rassurant : la journée de salle pèse 3 %.

Ce qui veut dire que la marge ×2,7 d'août était pessimiste pour **deux** raisons cumulées — un
surdimensionnement voulu (90 × 35 contre 80 × 20), et une salle quasi vide en écritures.

---

## §3 — ⚠️ Blaze change la NATURE du risque, pas seulement le chiffre

- **Sur Spark**, dépasser le quota quotidien faisait **refuser** les opérations. Le pire scénario
  du 5 novembre était « l'application s'arrête devant quarante grimpeurs, en pleine épreuve ».
- **Sur Blaze**, les mêmes nombres restent des **franchises gratuites** : au-delà, c'est facturé
  et l'application continue de fonctionner.

Le risque passe donc de « ça s'arrête » à « ça coûte quelques centimes ». C'est une amélioration
nette pour le contest, et elle vaut plus que tous les chiffres ci-dessus.

🟠 **Une contrepartie, et une seule, pour Stéphane : poser une alerte de budget** dans la console
GCP. Blaze sans alerte de budget est la façon normale de découvrir une facture — et l'essai de
90 jours masquera tout dépassement jusqu'à son terme, donc jusqu'à la mi-janvier.

⚠️ Les documents de chantier d'août (`docs/suivi/SUIVI-quota-*.md`,
`docs/plans/PLAN-spark-images-competition.md`) écrivent « gratuité totale, plan Spark ». Ce sont
des **faits datés**, pas la contrainte courante — exactement la famille que nous nous sommes
reprochée mutuellement toute la journée. `CLAUDE.md` n'affirme nulle part le plan, donc il n'y
avait rien à y corriger : le découpage du 18/10 a payé.

---

## §4 — La qualification, par prédiction plutôt que par écran

Ton §4 voulait une comparaison à la console. Je n'ai pas cet écran, et il existe un contrôle plus
fort : **une charge dont je connais la taille exacte, avec la prédiction écrite d'avance.**

`mesure-taux-de-flash.js` lit deux collections entières — `client_boulder_results` (936
documents) et `competition_results` (0 document, facturé 1 lecture minimum).

> **Prédiction posée avant de mesurer : +936 ou +937. Mesuré : +936.**

La sonde compte bien les lectures de documents. Qualifiée sur cette charge.

### 🔴 Et la trace a livré le piège le plus dangereux de la journée

```
+0,8 min : écart +0      ← « la sonde ne voit rien »    faux, mais REPÉRABLE
+3,0 min : écart +741    ← « +741 »                     plausible, faux, NON REPÉRABLE
+4,5 min : écart +936    ← la valeur réelle
```

L'ingestion de Cloud Monitoring prend 3 à 5 minutes **et elle arrive par tranches**. Le zéro du
début se repère, parce qu'il est manifestement incomplet. **Le 741 intermédiaire ne se repère
pas** : il est *correct pour ce qu'il contient*, simplement pas fini — et c'est tout le reste de
la série de défauts d'aujourd'hui en un seul exemple.

> ⚠️ **Règle d'usage, non négociable : ne lire que des journées CLOSES.** Un relevé nocturne sur
> « hier » est sûr. Un tableau de bord affichant « aujourd'hui » montrerait un nombre qui dérive
> à la hausse pendant des minutes sans jamais dire qu'il n'est pas terminé.

Cela **condamne** la variante « écran qui interroge l'API en direct » et **confirme la forme que
tu proposais** au §5 : un script nocturne, un document par journée révolue, l'écran en lit un.
Tu avais la bonne forme pour une raison que nous n'avions ni l'un ni l'autre.

---

## §5 — Trois défauts d'instrument, tous plausibles

En produisant les chiffres du §2 :

1. **Les jours étaient libellés par `interval.endTime`** : une tranche se terminant le 20 à
   00:00 UTC portait les données du 19 sous l'étiquette « 2026-10-20 ». Toutes les lignes
   décalées d'un jour, et la dernière portant une **date future**. Attrapé parce qu'une date
   future est absurde — sinon invisible.
2. **Un résumé `awk` comparait des chaînes** et annonçait un maximum de 9 568 là où j'avais vu
   11 990 dans la liste.
3. **Et le vrai coupable : l'espace insécable de `toLocaleString('fr-FR')`.** « 9 568 » se lisait
   **9**. Le total des lectures s'est effondré de 70 916 à 5 706 — un nombre petit, crédible, et
   faux. Les écritures, toutes sous 1 000, n'avaient pas de séparateur : **c'est précisément
   pourquoi elles paraissaient justes et pourquoi le défaut est passé deux fois.**

> **Ne jamais gratter la sortie formatée d'un script : réinterroger l'API.** Un format destiné à
> un lecteur humain est hostile à un parseur, et il l'est silencieusement.

---

## §6 — Ce qui N'EST PAS vérifié

- **Aucune journée de vraie affluence n'est dans l'échantillon.** 102 écritures/jour en moyenne
  décrit une salle peu active ; le pire jour observé est 635. Le 5 novembre sera le premier jour
  chargé de l'histoire de cette base, et les 3 440 du contest ne sont pas une mesure de ce
  jour-là mais une extrapolation d'un parcours observé.
- **La sonde n'est qualifiée que sur les LECTURES.** La même vérification sur `write_count`
  demanderait une charge d'écriture en production — je ne l'ai pas faite, et je ne la ferai pas
  sans raison.
- **Rien n'a été construit** : pas de script nocturne, pas de `usage_stats`, pas d'écran. Ton
  §5 reste un chantier de novembre, désormais débloqué.
- **Rien vu sur un vrai téléphone.** Inchangé, et c'est redevenu le premier risque de la liste —
  le seul des quatre points qui n'ait pas bougé d'un pouce aujourd'hui.

---

## §7 — La liste, qui raccourcit enfin

1. 🟠 **Les écrans sur un vrai téléphone, au plus tard le 29.** Désormais **premier** de la liste.
2. 🟠 **L'annonce aux grimpeurs, au plus tard le 29.**
3. 🟠 **Poser une alerte de budget** (nouveau, conséquence de Blaze).
4. **Le nombre de blocs du 5 novembre**, qui fixe le multiplicateur.
5. **Rien sur la chaîne des niveaux avant le 6 novembre.**

~~Le relevé en console d'une journée chargée~~ — **fait, et il n'est plus manuel.**
