# Sonde — non, bloqué sur Spark. Et ma conclusion d'il y a une heure était fausse

> Réponse à `docs/handoffs/2026-10-19-CN-sonde-metriques.md`, écrite le 19/10/2026,
> **réécrite le même jour après que Stéphane a accordé le rôle.**
>
> **Issue 3 de ton §3 : `timeSeries` exige la facturation. Le sujet est clos.**
>
> 🔴 **Et ce document a d'abord dit l'inverse.** La version précédente concluait que
> « l'hypothèse de la facturation est écartée ». C'était faux, le contrôle qui me le faisait
> croire était pourtant bon, et c'est la partie de cette sonde qui valait le plus — §3 ci-dessous.

---

## §1 — La réponse, en deux appels

Après que Stéphane a accordé `roles/monitoring.viewer` au compte de service :

| appel | résultat |
|---|---|
| **`metricDescriptors`** | **200** — la liste complète |
| **`timeSeries`** | **403 PERMISSION_DENIED** — *« This API method requires billing to be enabled »* |

**Ton §1 est maintenant établi, au point exact que tu signalais comme non établi** : le million
de séries offert est compté par compte de facturation, un projet Spark n'en a pas, et
`timeSeries.list` **refuse d'emblée** au lieu de répondre normalement. Tu avais nommé la
bonne inconnue et elle se résout par le non.

**Le rôle n'a pas été accordé pour rien** : sans lui, le 403 restait ambigu et nous n'aurions eu
ni la réponse ni les deux acquis ci-dessous. L'ordre que tu imposais — essayer d'abord, demander
ensuite — était le bon, et la minute de Stéphane a converti une ambiguïté en réponse définitive.

### Deux acquis conservés au passage

1. **Les trois noms de métriques de ton document sont confirmés à la source**, pas repris de
   mémoire : `document/read_count`, `document/write_count`, `document/delete_count` existent
   exactement sous ces noms. Il existe aussi des variantes `*_ops_count` et
   `billable_managed_delete_write_units`, et un `ttl_deletion_count`. Si la question revient un
   jour sur un projet facturé, la requête est juste.
2. **Le rôle `monitoring.viewer` suffit largement** pour tout le reste de l'API :
   `metricDescriptors`, `monitoredResourceDescriptors` et `alertPolicies` répondent tous 200.

---

## §2 — Et c'est bien la méthode, pas ma requête

Avant de conclure sur `timeSeries`, il fallait écarter l'autre explication : que ce soit la
**forme** de ma requête — agrégation, intervalle, filtre — qui déclenche quelque chose. Sinon
j'aurais conclu sur la méthode ce qui ne valait que pour mes paramètres, ce qui est exactement
le piège de ton §4 pris par l'autre bout.

```
200  ok                              metricDescriptors (témoin)
403  → FACTURATION                   timeSeries — nu, sans aucune agrégation
403  → FACTURATION                   timeSeries — avec l'agrégation de la sonde
403  → FACTURATION                   timeSeries — view=HEADERS (ne renvoie aucun point)
200  ok                              monitoredResourceDescriptors
200  ok                              alertPolicies
```

Trois formes de `timeSeries`, y compris la plus nue et celle qui ne demande **aucun point**, et
le même refus. Trois autres méthodes de lecture, le même jeton, 200. **La facturation est exigée
par `timeSeries.list` seule.**

---

## §3 — 🔴 Pourquoi je m'étais trompé, et c'est le vrai apport de cette sonde

Avant le rôle, j'avais écrit : *l'API Monitoring est joignable sur Spark, le seul obstacle est un
rôle IAM, l'hypothèse de la facturation est écartée.*

Les deux premières affirmations étaient justes. **La troisième était fausse**, et elle décidait
du sujet.

Ce qui rend l'erreur intéressante, c'est que **le contrôle était bon.** J'avais refusé de
conclure sur la forme d'un message et je l'avais exercée : les mêmes identifiants contre deux
API dont ce projet ne se sert pas (Cloud Translation, Cloud Scheduler) rendaient
`reason: SERVICE_DISABLED` et « API has not been used in project… », là où Monitoring nommait une
permission. Le discriminant existait, il était vérifié dans les deux sens, et il était juste.

**Mais il répondait à une autre question que la mienne.** Il répondait *« cette API est-elle
activée ? »*. Ma question était *« cette méthode est-elle permise ? »*. Et les trois appels du
contrôle portaient sur `metricDescriptors` ou sur d'autres API — jamais sur `timeSeries`, la
seule méthode qui comptait, et la seule qui était alors **hors d'atteinte**.

> ⚠️ **Quand la chose qui compte est inatteignable, une mesure sur sa voisine renseigne sur la
> voisine.** La tentation du transfert est maximale exactement là où il est invalide : c'est
> parce que je ne pouvais pas atteindre `timeSeries` que j'ai mesuré `metricDescriptors`, et
> c'est pour la même raison que son verdict ne s'y transportait pas.

Corollaire, qui est la forme utilisable : **un contrôle validé sur une méthode d'une API ne se
transfère pas à une autre méthode de la même API.** Le même code HTTP 403 et le même `status`
`PERMISSION_DENIED` recouvrent ici « il manque un rôle » et « il faut un compte de facturation ».
Ton tableau à quatre issues distinguait déjà ces deux lignes ; mon erreur a été de les trancher
sur un appel qui n'était ni l'un ni l'autre.

Et une remarque sur ta propre formule du §4 : tu attendais le mensonge du côté du **succès
vide**. Il est venu du côté opposé — un refus franc, correctement lu, mais sur la mauvaise
porte. Le danger n'était pas le silence de l'instrument, c'était ma généralisation.

---

## §4 — Ce qui reste la source, et ce que je n'ai pas construit

**L'onglet Statistiques de la console Firebase, relevé à la main.** La console affiche bien ces
chiffres sur Spark — donc la donnée **existe** et le front-end de Google l'atteint par un chemin
qui n'est pas l'API publique. Je ne spécule pas plus loin : ce qui est mesuré, c'est que l'API
publique la refuse.

Ton §5 tombe avec ça : pas de script nocturne, pas de document `usage_stats/{AAAA-MM-JJ}`, pas
d'écran, pas d'alerte de seuil. **Rien n'a été construit**, conformément à ton « n'implémente
rien » — et il n'y a plus rien à décider en novembre sur ce sujet.

Ton contrôle du §4 est **sans objet** : aucun total ne reviendra, donc il n'y a rien à comparer à
la console. La sonde n'est pas « non qualifiée », elle est **close**.

---

## §5 — Ce qui N'EST PAS vérifié

- **Je n'ai pas essayé d'atteindre la donnée par un chemin non public.** Ce que la console
  Firebase utilise pour tracer ses courbes n'est pas documenté, et s'appuyer dessus serait une
  dépendance non contractuelle — hors de question pour un projet dont tout le reste tient sur
  des contrats écrits.
- **Je n'ai pas testé si la facturation « activée mais à zéro »** (un compte de facturation
  rattaché sans dépense, qui garderait Firestore dans les quotas gratuits) débloquerait
  `timeSeries`. C'est plausible au vu du message, mais ça touche la facturation du projet : une
  décision de Stéphane, pas une sonde.
- **Le rôle accordé reste en place.** Il est en lecture seule sur les métriques et sans effet sur
  Firestore, l'hébergement ou la facturation ; il n'y a rien à défaire, et il rend
  `metricDescriptors` utilisable si la question revient.

---

## §6 — Sur la forme de ta sonde

Tes **quatre issues plutôt que deux** ont porté tout le travail, y compris dans l'erreur : c'est
parce que la ligne « 403 permission denied → ce n'est pas une réponse négative » existait que le
premier 403 n'a pas clos le sujet sur un faux non — et c'est parce que la ligne
« 403 mentionnant la facturation → bloqué » existait aussi que le second a été lu correctement du
premier coup. Les deux lignes étaient nécessaires, et une sonde à deux issues aurait répondu
faux dans les deux sens, successivement.

Et ta dernière phrase se vérifie : **un « non, bloqué sur Spark » documenté évite que la question
se repose dans six mois.** Elle est documentée dans l'en-tête du script, avec les deux appels,
les trois formes de `timeSeries` et la correction.
