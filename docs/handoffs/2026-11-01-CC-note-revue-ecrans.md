# Note rapide — la revue d'écrans est soldée

> 01/11/2026, après la livraison de V2.76.3. **Note courte**, pas un retour de chantier :
> elle ne ferme qu'un point de la liste et n'ouvre rien.

---

## Ce qui est fermé

**Le point 3 de la liste du 29 octobre — « vérifier les écrans sur un vrai téléphone » — est
FAIT**, et avec lui l'arriéré traîné depuis V2.70.1. Stéphane a parcouru, **sur ordinateur et
sur smartphone** : le chemin du grimpeur en compétition, les gestes admin du soir du 5,
« Quoi de neuf », les blocs du jour, les stats, les formulaires ouvreur.

Cela ferme aussi le seul risque que je signalais en rouge dans le retour de ce matin
(`2026-11-01-CC-bouton-voir-les-details.md` §4) : je n'avais pas ouvert l'écran, la suppression
n'était justifiée que par le raisonnement. **La carte de la compétition de jeudi ne porte plus
qu'un bouton, constaté sur les deux supports.** Le DOM rendu a tranché, pas moi.

---

## Deux observations de la revue, qui valaient le détour

1. **Le sélecteur « Mode de comptage » s'affichait EN VERT** — donc actif, donc modifiable. Ce
   n'est pas un défaut : le Contest est encore `status: 'à venir'`, et c'est précisément le
   verrou serveur qui n'est pas encore tombé. **Au pas 3 du soir du 5** (passage en « en
   cours »), il passera au gris, en même temps que `level_at_start` se fige. Si quelqu'un le
   voit encore vert après ce geste, c'est là qu'il y a un problème.
2. **L'avertissement de date de naissance manquante vit dans `AdminUsers` seul** (le
   `helperText` de ses deux formulaires), jamais dans Profil ni Inscription. Vu apparaître
   **et** disparaître. Le cas négatif — un compte hérité qui n'a qu'un `age` figé — est couvert
   par construction, la condition passant par `getSeasonAge`, dont les trois branches sont
   testées.

---

## Ce qui reste avant jeudi, et qui n'appartient qu'à Stéphane

1. 🔴 **L'annonce aux grimpeurs, cinq points** — échéance du 29 octobre dépassée : le départage
   (« déclarez vos échecs »), le niveau max, accepter la mise à jour de l'application,
   « inscrivez-vous dès maintenant », le nouveau barème.
2. 🔴 **Imprimer l'affiche du barème et la poser à l'accueil** — le changelog de V2.76, déjà
   lisible des grimpeurs, affirme qu'elle y est.
3. **Imprimer le topo (14 pages)** : le rendu d'une imprimante n'est pas celui d'un lecteur PDF.
4. **Relever en console la consommation Firestore d'une journée chargée** — et seulement des
   journées **closes**.
5. 🟠 **Poser une alerte de budget** dans la console GCP (Blaze depuis le 19/10).

Inchangé par ailleurs : **rien sur la chaîne des niveaux d'ici au 6 novembre**, ni déployé ni
commité ; « Voir les détails » se répare après le 5 si une fenêtre de détails est jugée utile.

---

Prod en **V2.76.3** (`deploy/v2.76.3` sur `3361577`), arbre propre, tout poussé.
