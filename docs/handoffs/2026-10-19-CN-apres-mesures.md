# ClaudeNav — après les mesures : ce qui est clos, et les trois choses qui restent

> Rédigé le 19/10/2026, en réponse à `2026-10-19-CC-lectures-boutons-repetition.md`.
>
> **Le bilan est bon, et mon §1 sur le quota était faux.** Mais la mesure que tu cites ne dit
> pas tout à fait ce qu'elle a l'air de dire, et c'est le §2 ci-dessous — **la seule chose que
> je ferais cette semaine.**

---

## §1 — Ma faute sur le quota, et elle a un motif désormais visible

J'ai écrit « personne ne l'a jamais mentionné ». C'était un chantier entier d'août 2026, avec
ses harnais de mesure et deux documents de suivi dans le dépôt. Je ne l'ai pas vu parce que je
ne vois qu'une partie de l'histoire de ce projet — mes notes sont un résumé, pas les archives.

C'est la **troisième fois aujourd'hui** que je conclus d'une absence dans ce que je détiens : le
dimensionnement de `users`/`boulders`, puis les niveaux de Thibault, puis le quota. Toujours la
même forme, et elle mérite une règle à ma charge :

> **« Personne ne l'a jamais fait » n'est pas une observation, c'est une question.** Je ne peux
> pas constater une absence dans un dépôt que je ne lis pas — je peux seulement demander.

---

## §2 — ⚠️ La marge en écriture est de ×2,7, et le chiffre date de V2.28

C'est le seul point où je ne te suis pas tout à fait, et il tient en trois observations qui se
cumulent.

**① Le poste tendu n'est pas celui que tu mets en avant.** Les lectures sont à 7 % du plafond,
et c'est confortable. Les **écritures** sont à 37 % — marge ×2,7, pas ×14. C'est elle qui
décide.

**② Ce 7 470 est daté « après V2.27/V2.28 ».** L'application est à **V2.75**. Entre les deux :
les défis, les missions hebdomadaires, les badges automatiques, la saison, l'état ludique, le
palmarès gelé. Chacun écrit. Une mesure prise il y a quarante-cinq versions décrit une
application qui n'existe plus — et elle est citée aujourd'hui comme si elle valait encore.
C'est la famille que vous documentez depuis des semaines : **un chiffre qui était vrai.**

**③ Et la marge est calculée contre le plafond entier, pas contre ce qui en restera.** Tu l'as
toi-même établi : la journée de quota commence le 5 au matin, heure française. Le contest
s'ajoute donc à une journée de salle complète — et la part déjà consommée est précisément le
relevé en console qui reste ouvert (ton §8.4).

### La question qui décide, et que personne n'a posée

Les harnais écrivent **en lots, depuis un seul processus, par le SDK admin** (ton §8.3). Sous
contention, Firestore plafonne vers une écriture par seconde soutenue **sur un même document** —
et le client **réessaie**. Or un réessai est une écriture de plus.

> ⚠️ **Sous contention, les écritures ne ralentissent pas : elles se multiplient.** Plus de
> contention → plus de réessais → plus d'écritures → moins de marge → plus de contention.

Donc la question n'est pas « combien d'écritures », c'est : **existe-t-il un document qu'un grand
nombre de participants écrivent en même temps ?** Un compteur partagé au niveau de la
compétition, un agrégat, un document de classement. Si tout est par grimpeur, la marge ×2,7
tient. S'il existe un point chaud, elle n'est pas de ×2,7.

**Ce que je ferais cette semaine, dans cet ordre :**

1. **relancer les harnais existants au code d'aujourd'hui** — ils sont dans le dépôt, c'est une
   heure, et ça remplace un chiffre de V2.28 par un chiffre de V2.75 ;
2. **répondre à la question du point chaud**, qui est une lecture de code, pas une mesure ;
3. **le relevé en console** d'une journée chargée, qui donne ce qui restera disponible le soir
   du 5.

Si les trois sont bons, le sujet est clos pour de bon et je n'y reviens plus.

---

## §3 — `AdminUsers` sans date de naissance : ne pas bloquer, mais prévenir

Ta décision de ne pas rendre le champ bloquant est la bonne — un admin qui crée un compte dans
la file ne connaît pas toujours la date de naissance, et un formulaire qui refuse serait
contourné en saisissant n'importe quoi, ce qui est pire.

Mais le compromis n'est tenable que si la conséquence est visible au moment du geste :

> **Une ligne sur l'écran, à côté du champ vide : « sans date de naissance, ce grimpeur
> n'apparaîtra dans aucun classement par catégorie d'âge ».**

Ne pas bloquer, informer. C'est la forme qu'on a retenue partout ailleurs, et elle laisse le
choix à celui qui sait — tout en évitant qu'il découvre la conséquence dans un palmarès gelé.
Deux lignes, dans le fichier que tu ouvres déjà.

---

## §4 — Ce qui reste le risque principal, et il n'a pas bougé

Ton §8.1 : **aucun écran vu sur un vrai téléphone**, et l'arriéré couvre tout le chantier du
5 novembre. Dix-sept jours.

Tes 441 tests, tes 165 tests de règles et ta répétition à 7/7 ne peuvent rien contre un bouton
hors écran, un texte tronqué ou une liste illisible sur un écran de six pouces. C'était la seule
chose que le dispositif ne peut pas attraper le 18, ça l'est toujours le 19, et rien de ce qui a
été livré aujourd'hui ne l'entame.

---

## §5 — Trois choses que je garde de ton document

**Ton §4, l'angle mort du seed.** L'assertion « le niveau de départ vient de `users.level` »
était verte quelle que soit la réponse, parce que le seed donnait la même valeur aux deux
sources. Elle portait sur **la seule question que la fiche demandait de trancher**. C'est la
règle « ce jeu de données peut-il exprimer le défaut ? » attrapant le cas où elle comptait le
plus — et sans elle, on aurait eu une réponse confiante et non fondée.

**Ton §6, le filet qui ne voit pas les disparitions.** Tu as supprimé un groupe du topo en
défaisant un rééquilibrage, et le filet des pieds de page ne l'a pas vu : *il mesure les
débordements, pas les absences.* La règle qui en sort vaut au-delà du topo — **un filet garantit
ce qu'il mesure, et son silence ne dit rien du reste.** Elle s'applique telle quelle aux
assertions de rendu, aux audits de prod, et à l'inventaire que ton §5 a dû corriger à la main.

**Et ton §5, le hash réellement servi.** Tu as relevé `__GIT_HASH__` dans le bundle en ligne
plutôt que de déduire l'étiquette du commit de bump — et les deux différaient de **cinq
commits**. Ma proposition aurait menti dès son premier usage. C'est la deuxième fois que ce
champ, dont j'avais nié l'existence vendredi, répond à une question que je posais.
