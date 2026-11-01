# Le bouton « Voir les détails » est retiré — V2.76.3

> 01/11/2026. Déployé en **V2.76.3** (`deploy/v2.76.3` sur `3361577`).
>
> Chantier d'une ligne, signalé par Stéphane et tranché par ClaudeNav. Document court **exprès** :
> il n'y a pas eu d'enquête, le défaut était visible à la lecture.

---

## §1 — Le signalement et la décision

Stéphane, en préparant le contest de jeudi :

> *« Dans l'espace personnel Clients/Mes compétitions, la compétition de jeudi s'affiche bien
> avec deux boutons : S'inscrire et Voir les détails. Le deuxième ne fonctionne pas. »*

Sa décision, sur le conseil de ClaudeNav, telle qu'elle m'a été donnée :

> *« Supprimer le bouton « Voir les détails » de la carte de compétition dans
> ClientCompetitions.tsx, et rien d'autre — ni refactor, ni fenêtre de remplacement. Celui-ci
> entraîne des lectures inutiles et ne produit rien. On verra après le 5 pour le réparer et le
> rendre effectif. »*

Appliquée à la lettre.

---

## §2 — Le mécanisme, confirmé

Le bouton était exactement ceci :

```tsx
<Button variant="outlined" onClick={() => loadBoulders(competition)}>
  Voir les détails
</Button>
```

`loadBoulders` interroge `boulders` sur `competition_id`, range le résultat dans l'état React —
**et c'est tout**. Aucun `setOpen…Dialog(true)` ne suit. L'autre bouton de la carte, lui,
enchaîne bien `loadBoulders` + `loadResults` + `setOpenValidationDialog(true)` : c'est la
comparaison des deux `onClick` qui rend le défaut évident.

Donc le diagnostic de Stéphane était complet, les deux moitiés comprises : **la requête part,
rien ne s'affiche**. Un clic = une requête Firestore facturée pour un écran qui ne bouge pas,
sur l'écran que 80 participants vont ouvrir jeudi.

⚠️ **Ce que je n'ai PAS fait, et qui mérite d'être nommé** : je n'ai pas cherché s'il a *déjà*
existé une fenêtre de détails que quelqu'un aurait retirée en laissant le bouton. La décision
étant « supprimer, rien d'autre », l'archéologie ne changeait pas le geste — mais si vous
reprenez la réparation après le 5, c'est la première chose à regarder (`git log -S` sur
`openDetailDialog` ou équivalent).

---

## §3 — Ce qui a changé

| Fichier | Changement |
|---|---|
| `frontend/src/pages/Client/Competitions/ClientCompetitions.tsx` | Les 6 lignes du `<Button>` supprimées. Rien d'autre. |
| `frontend/package.json` | `2.76.2` → `2.76.3` |
| `frontend/src/data/changelog.ts` | Entrée `2.76.3` ajoutée en `[0]` |

Le `<Box sx={{ display: 'flex', gap: 1, mt: 2 }}>` est **laissé tel quel** avec son unique
bouton — c'était le genre de nettoyage que « rien d'autre » exclut, et il ne se voit pas à
l'écran. `loadBoulders` reste appelée par le bouton de validation, donc aucun code mort ni
avertissement de lint à la clé.

**Une entrée de changelog pour un bouton retiré**, oui : la disparition est visible et il vaut
mieux qu'un grimpeur lise pourquoi que de se demander si l'application a perdu une
fonctionnalité. Le texte dit qu'il ne faisait rien.

---

## §4 — Vérifications

- `npm run build` vert, `npm run lint` propre, **454 tests sur 34 fichiers** verts (le même
  compte qu'en V2.76 : aucune fonction pure n'est touchée, et c'est le résultat attendu).
- `2.76.3` **relu dans le `dist/` bâti après le bump** (`grep` dans `dist/assets/`), conformément
  au piège du `dist/` périmé.
- Garde de déploiement : refus d'abord (commit non poussé), `git push`, puis
  *« Déploiement autorisé : arbre propre, et le commit déployé est publié »*. Étiquette
  `deploy/v2.76.3` posée et publiée.

🔴 **Non vérifié, et c'est le seul risque réel de cette livraison : je n'ai pas ouvert l'écran.**
Ni navigateur, ni e2e, ni émulateur. La suppression est une soustraction de JSX sans condition
autour, donc le raisonnement est solide — mais le raisonnement n'est pas le DOM rendu, et ce
dépôt a une doctrine explicite là-dessus. **À confirmer d'un coup d'œil sur un vrai téléphone**,
avec le point 3 de la liste du 29 octobre, qui est de toute façon en retard : la carte de la
compétition de jeudi ne doit plus porter qu'un bouton.

---

## §5 — Points ouverts, repris du 28/10

Rien de cette séance ne s'y ajoute. La liste est inchangée, et notamment :

1. 🔴 **L'annonce aux grimpeurs** (5 points) — toujours à faire, échéance dépassée.
2. 🔴 **Imprimer l'affiche du barème**, que le changelog de V2.76 annonce déjà comme posée.
3. 🟠 **Vérifier les écrans sur un vrai téléphone** — maintenant avec ce bouton-là à regarder,
   et le sélecteur « Mode de comptage » de l'écran d'admin, qui n'a été vu dans aucun navigateur.
4. **Réparer « Voir les détails » après le 5**, si une fenêtre de détails est jugée utile — la
   décision de ce jour ne la ferme pas, elle la reporte.
5. **Rien sur la chaîne des niveaux avant le 6 novembre**, ni déployé ni commité.
