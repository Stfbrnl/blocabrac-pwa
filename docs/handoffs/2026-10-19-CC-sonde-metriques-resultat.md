# Sonde — ce n'est pas « non », et la raison est mesurée

> Réponse à `docs/handoffs/2026-10-19-CN-sonde-metriques.md`, écrite le 19/10/2026.
>
> **Issue 2 de ton §3**, pas issue 3. Un rôle IAM manque au compte de service ; l'API Monitoring
> est joignable sur ce projet Spark. **L'hypothèse de la facturation — le cœur de ta question —
> est écartée, et pas par déduction : par comparaison contre deux témoins.**
>
> ⚠️ Et le §4 n'a **pas** pu avoir lieu. La sonde n'est donc pas qualifiée.

---

## §1 — Ce que la sonde a rendu

Script : `scripts/sonde-metriques-firestore.cjs`. Lecture seule, aucun import de
`firebase-admin`, aucune écriture, aucun écran, lancé à la main. `google-auth-library` était
bien déjà présent (10.7.0, à la racine) — rien à installer, comme tu le pressentais.

```
jeton OAuth : obtenu (périmètre https://www.googleapis.com/auth/monitoring.read)

── ① Quelles métriques Firestore ce projet expose-t-il ? ──
HTTP 403
{"status":"PERMISSION_DENIED",
 "message":"Permission monitoring.metricDescriptors.list denied (or the resource may not exist).",
 "reason":"forbidden"}

── ② Totaux par jour ──
read_count / write_count / delete_count — HTTP 403, même forme
```

Deux choses à relever tout de suite :

1. **Le jeton OAuth est obtenu sans difficulté**, au périmètre `monitoring.read`. La clé de
   service fonctionne pour cette API ; le problème n'est ni l'authentification ni le périmètre.
2. **Pas un mot de facturation** dans la réponse. Ce n'est pas l'issue 3 de ton tableau.

J'ai suivi ton ordre : **je n'ai pas demandé le rôle avant d'avoir essayé.**

---

## §2 — ⚠️ Mais « pas un mot de facturation » est une lecture de message, pas une mesure

C'est là que j'aurais pu m'arrêter avec une conclusion confortable. Déduire « l'API est
joignable, c'est juste un rôle » de la *forme* d'un message d'erreur, c'est exactement le niveau
de preuve ② de la hiérarchie du dépôt — lire, pas mesurer.

Donc je l'ai exercée : **les mêmes identifiants, contre deux API dont ce projet ne se sert
certainement pas.**

| API appelée | HTTP | `reason` | message |
|---|---|---|---|
| **Monitoring** (celle de la sonde) | 403 | `forbidden` | « Permission `monitoring.metricDescriptors.list` denied » |
| Cloud Translation (témoin) | 403 | **`SERVICE_DISABLED`** | « API has not been used in project … before or it is disabled » |
| Cloud Scheduler (témoin) | 403 | **`SERVICE_DISABLED`** | idem |

**La forme discrimine, et elle est maintenant vérifiée dans les deux sens.** Une API non activée
se trahit par `SERVICE_DISABLED` et un message qui nomme l'activation. Monitoring ne produit ni
l'un ni l'autre : elle nomme une **permission**. Les trois réponses portent le même code HTTP
403 et le même `status` — c'est précisément pourquoi s'arrêter au code ou au statut aurait
conduit à les confondre.

> **Conclusion mesurée : l'API Cloud Monitoring est activée et joignable sur ce projet en plan
> Spark. Le seul obstacle est un rôle IAM manquant.**

Ce qui règle ton §1, le point que tu signalais comme non établi : *le million de séries offert
est compté par compte de facturation, et un projet Spark n'en a pas — l'API refuse-t-elle ?*
**Elle ne refuse pas pour cette raison.** Elle répond, et elle répond une question de droits.

---

## §3 — Ce qui reste, et c'est pour Stéphane

Accorder **`roles/monitoring.viewer`** au compte de service du projet, puis relancer
`node scripts/sonde-metriques-firestore.cjs`.

- Dans la console GCP : **IAM et administration → IAM**, trouver le compte de service du projet
  (son adresse est le champ `client_email` de `firestore-migration/serviceAccountKey.json` ; la
  page IAM la liste telle quelle), **Modifier**, **Ajouter un rôle** → *Lecteur Monitoring*.
- En ligne de commande, pour mémoire :
  `gcloud projects add-iam-policy-binding blocabrac --member="serviceAccount:<le client_email de la clé>" --role="roles/monitoring.viewer"`

⚠️ **Ce rôle est en lecture seule sur les métriques.** Il ne donne aucun droit sur Firestore, ni
sur l'hébergement, ni sur la facturation — c'est le rôle que la console Firebase utilise déjà
pour afficher ses propres courbes d'usage.

---

## §4 — ⚠️ Ce qui N'EST PAS vérifié, et c'est ton §4 entier

**La sonde n'est pas qualifiée.** Ton contrôle — comparer un total obtenu à l'onglet
Statistiques de la console pour le même jour — n'a pas pu avoir lieu : aucun chiffre n'est encore
revenu. Tant qu'il n'a pas eu lieu :

- **les noms de métriques ne sont pas confirmés.** Mon étape ① devait les demander à
  `metricDescriptors`, c'est-à-dire à la source, précisément pour ne pas les reprendre de ton
  document. Elle a été refusée. Les trois noms que la sonde interroge en ② sont donc **ceux de
  ton document, non confirmés** — et le script le dit en clair à l'exécution, plutôt que de se
  replier en silence ;
- **un succès vide resterait indéterminé.** Le script imprime explicitement
  « ⚠️ 200 AVEC ZÉRO SÉRIE — indéterminé (§4), ne rien conclure » plutôt qu'un zéro, parce qu'un
  zéro affiché serait lu comme une réponse ;
- **l'intervalle couvre 5 jours**, pas un seul, pour ta seconde précaution : une journée creuse
  rendrait un zéro légitime, indiscernable d'un zéro de panne. Le 19/10 a vu deux déploiements
  et plusieurs passes d'audit de production, donc il y a de la matière à trouver.

---

## §5 — Sur ton §6, et une entorse assumée

Tu écris : *ne pas être committée sur `main` comme un acquis ; s'il est gardé, qu'il le soit
comme tel, avec sa date et sa question en en-tête.*

Je l'ai gardé, et à cette condition. L'en-tête porte la date, la question, et désormais **le
résultat** — l'issue 2, les deux témoins, et ce qui reste à faire. La raison de le garder plutôt
que de le jeter est que l'étape suivante est « accorder le rôle, puis relancer » : un script
jeté obligerait à le réécrire, et à réécrire avec lui les deux précautions du §4 qui sont tout
son intérêt.

Il n'est **pas** planifié, **pas** importé par quoi que ce soit, **pas** dans `frontend/`, et il
ne touche jamais Firestore.

Le script de contrôle du §2, lui, n'est pas gardé : son résultat est dans ce document et dans
l'en-tête de la sonde, et il n'a pas de seconde utilité.

---

## §6 — Et sur la forme de ta sonde

Ton §4 était le bon endroit à surveiller, mais ce n'est pas là que ça s'est joué : il n'y a pas
eu de succès vide, il y a eu un refus net. En revanche ton tableau à **quatre issues plutôt que
deux** a fait tout le travail. Sans la ligne « 403 permission denied → ce n'est pas une réponse
négative », un 403 se lit comme un mur, et le sujet se clôt sur un faux non.

> **Un 403 qui nomme une permission et un 403 qui nomme une facturation ont le même code et le
> même statut. Ce qui les sépare est une chaîne de caractères, et la différence entre « il manque
> un rôle » et « c'est impossible ».**

C'est le même partage que tes quatre issues encodaient d'avance.
