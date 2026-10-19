# Suivi — la fenêtre Blaze, 19 octobre → 6 novembre 2026

> Ouvert le 19/10/2026. Plan de ClaudeNav : `docs/handoffs/2026-10-19-CN-plan-fenetre-blaze.md`.

## ⚠️ À quoi sert ce fichier, et à quoi il ne sert pas

> **Les nombres se récupèrent après coup. Le contexte, non.**

Cloud Monitoring conserve ses séries — rétention **mesurée ≥ 30 jours** le 19/10, donc toute la
fenêtre est couverte. **Un seul passage de `scripts/sonde-metriques-firestore.cjs` le 6 novembre
rendra les dix-huit jours d'un coup.** Il n'y a donc aucun chiffre à relever au jour le jour, et
aucun collecteur planifié à écrire.

Ce qui ne se reconstitue pas le 6 novembre, c'est **ce qui s'est passé le 24 octobre**. Une ligne
par jour notable, écrite **le jour même**, et rien d'autre. Dix-huit nombres sans contexte ne
valent rien ; les mêmes avec cinq annotations répondent aux trois questions ci-dessous.

## Les trois questions auxquelles cette fenêtre doit répondre

1. **Que consomme une journée normale ?** La ligne de base. Quelques jours calmes suffisent.
2. **Que consomme réellement la soirée du contest ?** Le chiffre que rien n'a jamais produit.
3. ⚠️ **Le modèle tenait-il ?** C'est le vrai enjeu. On a une **unité mesurée** au navigateur
   (23 à 43 écritures par grimpeur, `frontend/test/measure-competition-writes-browser.mjs`) et un
   **multiplicateur supposé**. Le 5 novembre donne le produit réel ; le diviser par le nombre de
   participants rend l'unité réelle. **C'est la seule occasion de savoir si la mesure au
   navigateur disait vrai.** Noter les trois résultats séparément, en gardant la distinction
   « mesuré / supposé », comme le fait l'instrument.

## ⚠️ La mesure la plus décisive ne demande aucune requête : le crédit

Crédit d'essai : **264 € sur 264 € au 19/10, intact.** Les allocations gratuites s'appliquent
toujours sur Blaze ; **seul le dépassement tire sur le crédit.** Donc :

> **Si le crédit n'a pas bougé, c'est que les quotas gratuits n'ont jamais été dépassés** — ni
> pendant les dix-huit jours, ni pendant le contest. Binaire, sans modèle, sans interprétation.

⚠️ **L'affichage des coûts retarde de plusieurs heures, parfois plus de 24 h.** Le relevé du 6 au
matin peut ne pas refléter la soirée du 5 : à regarder de nouveau le 7 ou le 8. Raison de plus
pour que la redescente en Spark **ne dépende pas** de ce chiffre.

## 🔴 Retour en Spark : le 6 novembre, dans la séquence du jour

Décidé et daté. L'ordre de ce jour-là : déployer le correctif des niveaux → lever les verrous →
**relevé final de toute la série** → redescendre le forfait. Son dernier passage déclenche sa
propre extinction, il n'y a rien à retenir.

Le geste est **côté Stéphane** : console Firebase → ⚙ Utilisation et facturation → Modifier le
forfait → Spark. Et ce n'est pas un rappel mais une **garde** : `sonde-metriques-firestore.cjs`
annonce désormais l'état du forfait à chaque exécution, et après le 6 novembre il dit en rouge
qu'il s'agit d'un oubli. Les deux branches ont été vues parler.

## ⚠️ Ce que cette fenêtre ne doit pas devenir

- **pas de collecteur planifié** — l'historique est déjà collecté ;
- **pas d'écran, pas de document `usage_stats`, pas d'alerte de seuil** : tout cela supposait une
  API disponible en permanence. Elle ne l'est que dix-huit jours, et le chantier du tableau de
  bord reste **clos** ;
- **aucune dépendance de l'application à Blaze.** Rien dans `frontend/` ne doit se mettre à
  supposer qu'un quota est illimité : le 6 novembre, le plafond revient ;
- **aucun relâchement de la discipline d'écriture.** Le plafond ne mord pas pendant dix-huit
  jours ; il mordra de nouveau le 7. **Ce qui est mesuré pendant la fenêtre vaut pour un projet
  en Spark, pas pour un projet sans limite.**

> **La fenêtre sert à SAVOIR, pas à DÉPENSER.**

---

## Journal — une ligne par jour notable, écrite le jour même

| date | ce qui s'est passé |
|---|---|
| **2026-10-19** | Passage en Blaze (essai 90 j, crédit 264 €). **2 déploiements** : V2.75.0 puis V2.75.1. Plusieurs passes de `audit-prod-catalog.js` et deux de `mesure-taux-de-flash.js` — ce sont **elles** qui font les 5 914 lectures du jour, pas des grimpeurs. Rôle `roles/monitoring.viewer` accordé au compte de service. Sonde qualifiée (+936 prédit, +936 mesuré). Aucune écriture en production de ma part : les 6 écritures du jour viennent d'ailleurs. |

<!--
Lignes à écrire quand elles arrivent, sur ce modèle :
| 2026-10-2x | répétition générale à 80, sur l'émulateur ou en prod ? |
| 2026-10-2x | séance « écrans sur un vrai téléphone », en salle |
| 2026-10-29 | annonce aux grimpeurs publiée |
| 2026-11-05 | CONTEST — n participants, m blocs, heure de début et de fin |
| 2026-11-06 | relevé final des 18 jours, correctif des niveaux déployé, verrous levés, retour en Spark |
-->
