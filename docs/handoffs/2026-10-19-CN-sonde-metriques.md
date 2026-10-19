# ClaudeNav — sonde : les métriques Firestore sont-elles lisibles par programme sur Spark ?

> Rédigé le 19/10/2026, à la demande de Stéphane.
>
> ⚠️ **Ceci n'est pas un chantier et ne demande aucune intégration.** C'est une **sonde** :
> répondre à une question par oui ou par non, en lecture seule, sans rien écrire dans Firestore,
> sans écran, sans déploiement. À faire quand ça t'arrange — ou pas du tout.
>
> **La seule question :** un script authentifié par la clé de service peut-il obtenir de
> Cloud Monitoring les nombres exacts de lectures et d'écritures Firestore par jour, sur un
> projet en plan **Spark** ?
>
> ⚠️ **Et le §4 est le vrai piège de cette sonde** : la réponse la plus probable en cas d'erreur
> n'est pas un refus, c'est **un succès avec zéro donnée** — qui ressemble à une réponse
> négative sans en être une.

---

## §0 — Pourquoi maintenant, et pourquoi c'est sans risque

Tout le reste est gelé jusqu'au 6 novembre. Cette sonde ne l'est pas, parce qu'elle ne touche à
rien : aucune écriture, aucune lecture Firestore, aucun déploiement, aucun fichier de
l'application modifié. Elle interroge une API de métriques **à côté** de la base.

C'est donc l'une des rares choses utiles qui puissent se faire pendant la fenêtre de gel, si tu
as du temps disponible. Et si tu n'en as pas, elle attend novembre sans rien coûter.

---

## §1 — Ce qui est établi, et ce qui ne l'est pas

**Établi** (documentation Firebase et tarification Google Cloud, lues aujourd'hui) :

- Cloud Monitoring expose bien **Document Reads**, **Document Writes** et **Document Deletes**
  pour Firestore ;
- les tableaux de bord d'usage de la console Firebase exigent la permission
  `monitoring.timeSeries.list` — **la console appelle donc l'API dont il est question ici** ;
- les métriques système Google Cloud sont **gratuites à l'ingestion** ;
- les appels de lecture sont facturés 0,50 $ par million de séries temporelles retournées,
  **le premier million étant offert**. Une interrogation quotidienne de trois métriques en
  retourne une poignée : quelques milliers par an. Le coût n'est pas un sujet.

**Non établi, et c'est tout l'objet de la sonde** : le million offert est compté **par compte de
facturation**, et un projet Spark n'en a pas. La documentation ne dit nulle part ce qui se passe
alors — l'API répond-elle normalement, ou refuse-t-elle en réclamant l'activation de la
facturation ? Je n'ai pas trouvé la réponse écrite et je ne la devine pas.

---

## §2 — La sonde

Un script jetable, hors de `frontend/`, qui ne fait que lire.

**Authentification** : jeton OAuth obtenu depuis la clé de service, avec le périmètre
`https://www.googleapis.com/auth/monitoring.read`. ⚠️ À vérifier : `google-auth-library` est
probablement déjà présent comme dépendance de `firebase-admin` — si c'est le cas, rien à
installer.

**Appel** :

```
GET https://monitoring.googleapis.com/v3/projects/{projectId}/timeSeries
    ?filter=metric.type="firestore.googleapis.com/document/write_count"
    &interval.startTime=<hier 00:00 UTC, RFC3339>
    &interval.endTime=<aujourd'hui 00:00 UTC, RFC3339>
    &aggregation.alignmentPeriod=86400s
    &aggregation.perSeriesAligner=ALIGN_SUM
```

L'agrégation par tranche de 86 400 s avec `ALIGN_SUM` est ce qui donne **un total par jour**
plutôt qu'une série de points — c'est-à-dire exactement la grandeur cherchée.

⚠️ **Les noms exacts des métriques et le `resource.type` associé sont à confirmer** dans la
liste officielle des métriques Firestore plutôt que repris de ce document : je les cite de
mémoire, et c'est précisément le genre de détail où une erreur produit le faux négatif du §4.

Répéter pour `document/read_count` et `document/delete_count`.

---

## §3 — Comment lire le résultat : quatre issues, pas deux

| ce que renvoie l'appel | ce que ça veut dire | suite |
|---|---|---|
| **200 avec des séries** | ✅ c'est faisable sur Spark | §5 |
| **403 « permission denied »** | il manque un rôle au compte de service, rien de plus | Stéphane accorde `roles/monitoring.viewer` dans la console GCP, puis on relance. **Ce n'est pas une réponse négative** |
| **403 / 400 mentionnant la facturation ou une API non activée** | ❌ bloqué sur Spark | la relève manuelle en console reste la source, et le sujet est clos |
| **200 avec zéro série** | ⚠️ **indéterminé** — voir §4 | ne rien conclure |

L'ordre compte : **ne demande pas le rôle à Stéphane avant d'avoir essayé.** La clé de service
porte peut-être déjà les droits nécessaires, et une démarche en console qui se révèle inutile est
du temps perdu pour lui.

---

## §4 — ⚠️ Le piège : un succès vide n'est pas une réponse

C'est le seul endroit où cette sonde peut mentir, et elle ment dans le sens rassurant de
l'abandon : un filtre erroné, un nom de métrique approximatif ou un intervalle mal formé
renvoient **200 avec un tableau vide**. On conclurait « Spark n'expose pas ces données » alors
que la requête était fausse.

C'est la famille que vous documentez depuis deux semaines, appliquée à une sonde : *ce jeu de
données peut-il exprimer la réponse ?*

**Le contrôle, et il est à portée de main :**

> **Comparer le nombre obtenu à ce qu'affiche l'onglet Statistiques de la console pour la même
> journée.** S'ils concordent, le dispositif est qualifié et le chiffre est exploitable. S'ils
> divergent, c'est la requête qu'il faut corriger, pas la conclusion qu'il faut tirer.

C'est votre propre règle — *un instrument fait maison se vérifie à la main sur un cas* — et ici
le cas de référence est gratuit : il est déjà à l'écran.

Second contrôle, complémentaire : **choisir une journée où il s'est manifestement passé quelque
chose** (un jour de déploiement, une journée de salle chargée). Interroger une journée creuse
rendrait un zéro légitime, indiscernable d'un zéro de panne.

---

## §5 — Si ça marche : ce que ça ouvre, et ce que ça n'ouvre pas

**N'implémente rien.** La sonde répond à une question ; la décision de construire quelque chose
appartient à Stéphane, et le chantier est de novembre au plus tôt.

Ce que la réponse rendrait possible, pour mémoire et en deux lignes :

- un **script planifié** (GitHub Actions, comme les vôtres) interroge l'API chaque nuit et écrit
  **un seul document** `usage_stats/{AAAA-MM-JJ}` ;
- l'écran admin en lit **un**. Une écriture par jour, une lecture par consultation.

Et deux bénéfices que la console ne donne pas : **des valeurs exactes** plutôt qu'une courbe à
échelle relative, et **un historique** que Google ne laisse pas commodément remonter. Plus, le
jour venu, une alerte de seuil dans le script nocturne — « écritures au-dessus de 60 % du
plafond » — qui prévient le lendemain matin au lieu qu'on le découvre en cassant.

---

## §6 — Ce que la sonde ne doit pas faire

- **rien écrire dans Firestore**, pas même un document d'essai ;
- **ne pas créer d'écran**, ni toucher à `frontend/` ;
- **ne pas être planifiée** — elle se lance à la main, une fois ;
- **ne pas être commitée sur `main` comme un acquis** : c'est un script d'essai. S'il est gardé,
  qu'il le soit comme tel, avec sa date et sa question en en-tête.

Et le résultat, quel qu'il soit, vaut d'être écrit : **un « non, bloqué sur Spark » documenté
évite que la question se repose dans six mois.**
