# L'écran blanc des PDF, et pourquoi mes deux vérifications l'avaient déclaré bon

> 28/10/2026. Document **séparé** du retour sur le barème à plancher
> (`docs/handoffs/2026-10-28-CC-bareme-plancher-livre.md`) : le défaut n'a rien à voir avec ce
> chantier-là, il était seulement en travers de sa livraison.
>
> Corrigé et déployé en **V2.76.2** (`deploy/v2.76.2` sur `b4100a8`).

---

## §1 — Le signalement

Je venais d'annoncer deux fois, dans deux messages, que l'affiche du barème était « en ligne,
relue, 200 ». Stéphane a répondu :

> *« Pour info, dans ta méthode pour accéder à un document en ligne, je n'obtiens qu'un écran
> blanc. Je dois forcément aller le chercher en local sur mon disque. »*

C'était exact. Et ce n'est pas lui qui s'y prenait mal : **le document était inaccessible pour
tout le monde**, et l'était depuis le premier déploiement.

---

## §2 — Le mécanisme

`vite-plugin-pwa` en `generateSW` enregistre une `NavigationRoute` avec
`createHandlerBoundToURL("index.html")`. C'est ce qui fait marcher les URL profondes d'une
application monopage : on tape `/client/screen`, le serveur ne connaît pas ce chemin, le service
worker rend l'app shell et le routeur prend le relais.

Sans refus explicite, **toute navigation** y passe. Y compris vers un PDF. Donc :

```
GET /docs/affiche-bareme-competition.pdf
  → le service worker répond index.html         (200, content-type: text/html)
  → l'application se charge
  → aucune route ne correspond à /docs/...
  → AppRoutes.tsx n'a AUCUNE route `*`
  → il ne reste rien à l'écran
```

**Le correctif**, dans le bloc `workbox` de `vite.config.ts` :

```ts
navigateFallbackDenylist: [/^\/docs\//],
```

Le service worker décline ces URL, qui repartent au réseau. Vérifié dans un navigateur piloté,
service worker **aux commandes** : `application/pdf` et `fromServiceWorker: false`, là où l'on
avait `text/html` et le titre « Blocabrac - Gestion de salle d'escalade ».

---

## §3 — 🔴 Pourquoi je ne l'avais pas vu : `curl` ne passe par AUCUN service worker

J'avais vérifié après chaque déploiement : code `200`, `content-type: application/pdf`, octets
**identiques** au fichier du dépôt (`cmp`). Tout cela était **vrai**, l'est toujours, et n'avait
**aucun rapport avec la question posée**.

`curl` parle au serveur. Le grimpeur, lui, parle à son service worker. J'ai mesuré une couche et
conclu sur une autre.

⚠️ **C'est très exactement la faute du 19/10 sur la sonde Monitoring**, avec un client HTTP à la
place d'une méthode d'API. Même forme, neuf jours plus tard :

> La tentation du transfert est maximale là où il est invalide — et la mesure de la voisine
> arrive avec tous les signes extérieurs d'une preuve : un code, un type, une comparaison
> d'octets.

**Forme utilisable, désormais dans `CLAUDE.md` :** *un fichier statique n'est « bien servi » que
si un VRAI NAVIGATEUR le reçoit.* La question à se poser avant de conclure n'est pas « mon
contrôle est-il passé ? » mais **« quelle couche mon instrument traverse-t-il, et est-ce celle où
vit le défaut ? »**

---

## §4 — ⚠️ Trois choses qui rendaient ce défaut particulièrement discret

**① Deux fichiers du même dossier avaient des sorts OPPOSÉS.**
`globPatterns` contient `html` mais pas `pdf`. Le `.html` était donc **précaché**, servi depuis
le précache, et ne passait **jamais** par le repli : il marchait parfaitement. Le `.pdf`, non
précaché, y tombait. Constater que « le document est accessible » sur l'un ne disait **rien** de
l'autre — et j'aurais pu ouvrir le `.html`, le voir juste, et m'en satisfaire.

**② Le guide de connexion était cassé depuis sa création.**
Même dossier, même défaut, jamais remarqué — et ma mémoire de projet le décrivait comme « servi
en ligne ». ⚠️ **Un document que personne n'a encore eu besoin d'ouvrir peut être cassé depuis
toujours**, et aucun test ne le dira, puisque rien dans le dépôt ne l'ouvre. C'est la même
famille que le badge de mission jamais créé en prod : *le livrable existe, le chemin qui y mène
n'a jamais été emprunté.*

**③ La vérification correcte demande deux précautions, faute de quoi elle passe au vert sans
rien traverser :**
- un profil de navigateur **neuf** — sinon c'est l'ancien service worker qui répond ;
- un **rechargement** après la première ouverture — sous `registerType: 'prompt'` le service
  worker **ne contrôle pas** la page au premier chargement. Mon premier essai attendait
  `navigator.serviceWorker.controller` et a expiré au bout de 30 s : sans ce rechargement, le
  test ne traversait aucun service worker et aurait donc innocenté le code.

⚠️ Et l'instrument a menti une fois de plus au passage : `page.goto()` sur un PDF **lève** en
Chromium headless (pas de visionneuse). Ce n'était pas une preuve du défaut, juste une limite de
l'outil — il a fallu écouter l'événement `response` plutôt que le résultat de la navigation.

---

## §5 — ⚠️ Ce que le correctif ne fait pas

**Il ne vaut que pour les appareils ayant ACTIVÉ ce service worker-ci.** C'est toujours la
version déployée qui gouverne sa propre succession : un appareil resté sur l'ancienne continue
d'avoir l'écran blanc jusqu'à sa mise à jour. Ne pas en conclure que le correctif ne marche pas —
c'est la mauvaise transition qu'on teste.

En attendant, sur un appareil non mis à jour, deux chemins marchent : la version `.html` du même
document (précachée, donc jamais cassée, et elle a un bouton « Imprimer »), et le fichier local.

---

## §6 — Les deux points ouverts que ce défaut a mis au jour

**Décision de Stéphane : les deux sont REPORTÉS, à faire plus tard.** Aucun n'est un préalable
au contest du 5 novembre.

**🟠 ① Il n'existe aucune route `*`.**
L'écran blanc n'est pas propre aux PDF : c'est ce que voit **n'importe qui sur n'importe quelle
URL inconnue**, une faute de frappe comprise. Le défaut d'aujourd'hui n'en était qu'une
manifestation. Une **page terminale** — du genre de `components/AccessDenied.tsx`, avec une
sortie qui ne soit pas elle-même une redirection — fermerait **toute la classe**, exactement
comme la terminalité a fermé celle de la boucle de redirection infinie. Même raisonnement, même
forme de correctif.

**🟠 ② Rien dans l'application ne renvoie vers ces documents.**
Ils n'existent que par leur URL, écrite dans le topo. Stéphane : *« Aucune fonction n'a jamais
été prévue pour cela. Ce serait d'ailleurs peut-être à envisager mais côté admin. »* Un bloc
« Documents de la salle » dans l'espace d'administration, listant le guide de connexion et
l'affiche du barème avec leur lien : une liste de deux entrées, aucun schéma, aucune règle
Firestore à toucher.

⚠️ **Et c'est ② qui aurait fait découvrir ① plus tôt** : un lien dans l'application est un chemin
que quelqu'un emprunte. Tant que l'accès se fait par une URL qu'on se transmet à la main, le
chemin n'est jamais parcouru, et un document peut rester cassé des mois — ce qui est précisément
arrivé au guide de connexion.

---

## §7 — Où c'est écrit

| | |
|---|---|
| Invariant (inconditionnel) | `CLAUDE.md`, section « Firestore persistent cache, the service worker, and the update banner » |
| Récit complet | `docs/architecture/cache-et-service-worker.md`, section « `public/docs/` et le repli de navigation » |
| Correctif | `frontend/vite.config.ts`, bloc `workbox` — commentaire qui dit **pourquoi**, pas seulement quoi |
