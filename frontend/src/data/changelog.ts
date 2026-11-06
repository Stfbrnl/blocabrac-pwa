export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

// Dernières nouveautés à afficher aux clients ("Quoi de neuf ?" sur Mon espace
// personnel). Depuis V2.71.2, le panneau montre TOUTES les entrées plus récentes que
// la dernière version vue par ce client (3 au plus, voir utils/changelogDisplay.ts) :
// une entrée ne décrit donc que SA version, sans recopier la précédente. Mettre à jour
// à chaque nouvelle fonctionnalité visible côté client — l'historique complet vit dans
// les commits git.
export const changelog: ChangelogEntry[] = [
  // ⚠️ Les deux phrases de cette entrée viennent du §A.5 du plan, et sa consigne compte autant
  // que le texte : **ne pas s'appuyer sur « vous l'avez déjà approuvé »**. À 93,7 % de flash au
  // contest, presque personne n'a vu la courbe — à 1 essai les deux barèmes rendent exactement
  // la même valeur. Ce qui a été plébiscité est le PRINCIPE (plus jamais zéro), pas la courbe.
  // Les validations qui ne sont pas des flashs verront, elles, des nombres plus petits.
  //
  // ⚠️ Et la phrase qui désamorce la seule vraie inquiétude possible : le total cumulé bouge,
  // donc il faut dire tout de suite qu'il ne commande RIEN (ni badge, ni niveau, ni
  // qualification). Sans ça un grimpeur qui voit son total baisser croit avoir perdu autre
  // chose avec lui.
  {
    version: '2.80',
    date: '2026-11-06',
    title: 'Un seul barème de points, et l’écran de compétition réorganisé',
    items: [
      'Le barème des blocs du jour devient le même que celui des compétitions : un bloc réussi rapporte toujours au moins un quart de sa valeur, quel que soit le nombre d’essais. Plus aucun bloc arraché ne finit à zéro.',
      'En contrepartie, les points baissent un peu plus vite sur les premiers essais. Votre total cumulé peut donc bouger légèrement — c’est un compteur de vitrine, il ne change rien à vos badges, ni à votre niveau, ni à vos classements de compétition.',
      'La table complète des points est affichée à l’accueil de la salle. Un flash ne change jamais de valeur : au premier essai, l’ancien et le nouveau barème rapportent exactement la même chose.',
      'NOUVEAU — En compétition, l’écran de validation range les blocs par MUR, dans l’ordre où vous les croisez dans la salle, et non plus dans une seule longue liste. Chaque mur se replie, et son en-tête indique combien de ses blocs vous avez déjà réussis : au contest du 5 novembre, c’était 92 blocs d’affilée à faire défiler.',
      'Les numéros sont ceux écrits sur les prises, mur par mur — c’est pour ça que l’ancienne liste les mélangeait : tous les n°1 des sept murs se retrouvaient ensemble. Regroupés par mur, ils redeviennent utilisables tels quels. Une couleur plus dure rapporte aussi toujours plus qu’une plus tendre à nombre d’essais égal, ce qui n’était pas toujours vrai avant.',
      'Deux réglages en haut de l’écran : « Masquer les blocs déjà réussis », pour ne plus faire défiler ce qui est fait, et « Trier par couleur » quand tous les blocs de l’épreuve ont une couleur publique. Un bloc ne disparaît jamais au moment où vous le validez : il reste affiché jusqu’à ce que vous rouvriez son mur.',
      'Et quand un bloc du jour est réutilisé pour une compétition, sa couleur est maintenant affichée sur sa fiche — vous la lisez déjà sur le mur, la cacher dans l’application ne cachait rien. Les blocs créés pour l’épreuve restent « Mystère » jusqu’à la clôture.',
    ],
  },
  // ⚠️ EXCEPTION ASSUMÉE À LA RÈGLE CI-DESSUS, et la raison, pour qu'on ne la « corrige » pas :
  // cette entrée-ci RAPPELLE délibérément des consignes déjà annoncées en 2.73, 2.74 et 2.76.
  //
  // Ce n'est PAS le vieux contournement que 2.71.2 a supprimé (recopier les nouveautés de la
  // version précédente parce qu'une seule entrée s'affichait). La raison est différente et
  // tient à `changelogEntriesToShow` : un appareil qui n'a jamais validé « Compris » ne voit
  // QUE `changelog[0]`, et un grimpeur qui a validé à la 2.76.3 ne voit QUE la 2.77. **Seule
  // l'entrée [0] est garantie d'être lue**, et les consignes d'une compétition datée doivent
  // l'être AVANT l'épreuve, pas être retrouvables par celui qui pense à dérouler.
  //
  // Ce sont des consignes opérationnelles pour un événement daté, pas la description d'une
  // fonctionnalité : chaque rappel est préfixé « Rappel — » pour que celui qui les a déjà lues
  // le voie tout de suite. **Après le contest du 5 novembre, ces rappels n'ont plus lieu
  // d'être** : la prochaine entrée ne les reprend pas, et ne recopie rien d'ici.
  {
    version: '2.77',
    date: '2026-11-03',
    title: 'Contest du 5 novembre : des blocs qui comptent double, et les consignes',
    items: [
      'NOUVEAU — En compétition, l’organisateur peut désormais décider que certains blocs comptent double. Un bloc concerné porte la mention « Ce bloc compte ×2 » dans l’écran de validation, et ses points y sont affichés déjà doublés, avec le détail du calcul. Pour le contest du 5 novembre, ce sont les blocs du mur neuf — annoncés sur place.',
      'Un bloc doublé compte double partout dans la compétition, y compris pour séparer deux grimpeurs à égalité de points. En revanche il garde sa couleur : le classement par niveau max n’en est pas modifié.',
      'Et le double vaut POUR LA COMPÉTITION SEULEMENT. Les mêmes blocs validés en dehors du contest, dans « Blocs du jour », rapportent leur valeur normale, celle de leur couleur. Aucun de vos scores passés n’a été recalculé.',
      'Rappel — Inscrivez-vous dès maintenant, dans l’onglet Compétitions. L’inscription reste possible le soir même, mais s’inscrire à l’avance nous évite la file d’attente au comptoir au moment du coup d’envoi.',
      'Rappel — Enregistrez vos échecs, pas seulement vos réussites. Quand tout le reste est à égalité (mêmes points, mêmes blocs réussis, mêmes essais sur chacun), c’est le nombre total d’essais qui tranche, échecs compris. Rien n’est vérifié : ce départage repose sur votre honnêteté, et ne pas déclarer ses échecs avantagerait mécaniquement.',
      'Rappel — Vérifiez votre niveau dans votre profil avant jeudi. Il est figé au coup d’envoi et sert au classement par niveau max, qui vous range avec les grimpeurs de votre niveau. Si vous réussissez pendant l’épreuve un bloc d’une couleur plus dure que votre niveau, c’est cette couleur qui vous classe.',
      'Rappel — En compétition, un bloc réussi rapporte toujours des points, quel que soit le nombre d’essais : au minimum un quart de sa valeur. La table complète est affichée à l’accueil de la salle.',
      'Rappel — Si un bandeau « Une nouvelle version est disponible » apparaît d’ici jeudi, acceptez-la. Sans la mise à jour, votre téléphone continue de faire tourner l’ancienne version : vous ne verriez pas les blocs qui comptent double, et les points affichés sur votre écran ne seraient pas ceux du classement.',
    ],
  },
  {
    version: '2.76.3',
    date: '2026-11-01',
    title: 'Un bouton qui ne faisait rien a été retiré',
    items: [
      'Dans « Mes compétitions », la fiche d\'une compétition portait un bouton « Voir les détails » qui n\'ouvrait aucun écran. Il est retiré : seul reste le bouton « S\'inscrire », qui devient « Valider mes blocs » une fois votre inscription prise.',
    ],
  },
  {
    version: '2.76',
    date: '2026-10-28',
    title: 'En compétition, un bloc réussi rapporte toujours des points',
    items: [
      'Nouveau barème pour les compétitions, à partir du contest du 5 novembre : un bloc réussi rapporte toujours des points, quel que soit le nombre d\'essais — au minimum un quart de sa valeur. Les points baissent vite sur les premiers essais, puis de moins en moins. Un noir arraché en cinquante essais ne rapporte donc plus 0 point, mais 150.',
      'La table complète est affichée à l\'accueil de la salle : pour chaque couleur, ce que rapporte un bloc selon le nombre d\'essais. Plus aucune couleur ne « s\'éteint » avant les autres — une couleur plus dure rapporte toujours plus, quel que soit le nombre d\'essais.',
      'Ce barème ne concerne QUE les compétitions. Le classement des grimpeurs et vos points de tous les jours ne changent pas, et aucun de vos scores passés n\'a été recalculé.',
    ],
  },
  {
    version: '2.74.2',
    date: '2026-10-18',
    title: 'Mini-compétitions des cours : les points ne bougent plus',
    items: [
      'Dans une mini-compétition de cours, les points d\'un bloc que vous avez réussi sont désormais figés à votre validation. Si l\'ouvreur recote ce bloc plus tard, votre score ne change plus — et il correspond enfin à celui que votre moniteur voit dans son classement, qui lui était déjà figé.',
      'Dans « Mes statistiques », onglet Cours, les blocs de mini-compétition affichaient une ligne sans intitulé : le nom de la mini-compétition y apparaît maintenant.',
    ],
  },
  {
    version: '2.74',
    date: '2026-10-15',
    title: 'En compétition, un palmarès officiel et un classement par niveau',
    items: [
      'La prochaine compétition mélange deux sortes de blocs : des blocs déjà en place, dont vous connaissez la couleur — elle est sur le mur — et ceux d\'un mur neuf, dont la cotation n\'est pas annoncée. Le départage s\'appuie sur la difficulté des blocs réussis : sur les premiers, vous savez ce que vaut ce que vous tentez ; sur le mur neuf, vous grimpez à l\'aveugle. L\'application, elle, n\'affiche la couleur d\'aucun bloc pendant l\'épreuve : seulement son numéro et son mur.',
      'À la fin d\'une compétition, un palmarès officiel est publié dans l\'onglet Compétitions. Il est définitif : si un bloc est recoté plus tard, le palmarès ne bouge pas — le podium du jour reste celui du jour. Il contient cinq classements : le général, tous participants confondus, puis quatre réservés aux grimpeurs de la salle — open, par genre, par catégorie d\'âge, et par niveau max.',
      'Le classement par niveau max vous range avec les grimpeurs de votre niveau. Et si vous réussissez pendant l\'épreuve un bloc d\'une couleur plus dure que votre niveau, c\'est cette couleur qui vous classe : réussir plus dur vous fait monter de paquet, et vous vous mesurez alors à ce niveau-là. Sur les blocs déjà en place, vous décidez donc en connaissance de cause — réussir un noir que vous voyez noir vous fera monter dans le paquet des noirs. Sur le mur neuf, vous le découvrirez à la publication.',
      'Nouveau départage, quand tout le reste est à égalité (mêmes points, mêmes blocs réussis, mêmes essais sur chacun) : c\'est le nombre total d\'essais qui tranche, échecs compris. Il repose donc sur votre honnêteté — ne pas déclarer ses échecs avantagerait mécaniquement, et rien n\'est vérifié. On vous demande de les enregistrer. Et tant que personne n\'a réussi de bloc, tout le monde partage la première place : on ne classe pas des grimpeurs sur leurs seuls échecs.',
      'Sur le palmarès comme sur l\'écran diffusé dans la salle, seuls votre prénom et l\'initiale de votre nom apparaissent. Avant la publication du palmarès, aucun classement de compétition n\'est visible depuis votre espace : les résultats des autres grimpeurs ne sont pas lisibles, et c\'est voulu.',
    ],
  },
  {
    version: '2.73',
    date: '2026-10-15',
    title: 'Les inscriptions aux compétitions sont ouvertes à tous',
    items: [
      'L\'accès aux compétitions était désactivé par défaut sur la plupart des comptes : en voulant vous inscrire, vous receviez « Vous n\'êtes pas autorisé à participer aux compétitions ». C\'est corrigé — tout grimpeur peut désormais s\'inscrire lui-même, et les nouveaux comptes le peuvent dès leur création.',
      'Le Contest Haloween du 5 novembre est ouvert aux inscriptions dans l\'onglet Compétitions.',
    ],
  },
  {
    version: '2.72.1',
    date: '2026-10-03',
    title: 'Le bouton d\'inscription dit à nouveau la vérité',
    items: [
      'Sur une compétition où quelqu\'un d\'autre s\'était déjà inscrit, votre bouton affichait « Valider mes blocs » alors que vous n\'étiez pas inscrit — de quoi croire les inscriptions fermées. Il affiche désormais « S\'inscrire » tant que vous ne l\'êtes pas.',
    ],
  },
  {
    version: '2.72',
    date: '2026-10-03',
    title: 'En compétition, les points égaux sont départagés',
    items: [
      'En cas d\'égalité de points, le classement regarde d\'abord le bloc le plus dur que vous avez réussi, puis votre nombre d\'essais sur ce bloc, puis le deuxième bloc le plus dur, et ainsi de suite. Celui qui a un bloc de plus passe devant à égalité par ailleurs.',
      'Si tout est identique, les grimpeurs sont déclarés ex æquo et partagent leur place : le classement affiche alors deux fois la même position, comme dans une compétition officielle.',
      'Ce départage s\'appuie sur la cotation des blocs, cachée pendant l\'épreuve : il ne se joue pas, il se constate à la fin.',
      'Vous pouvez désormais vous inscrire à une compétition à venir, et plus seulement à une compétition déjà commencée.',
      'Sur l\'écran de classement diffusé dans la salle, votre nom et votre catégorie d\'âge s\'affichent correctement quand vous vous êtes inscrit vous-même.',
    ],
  },
  {
    version: '2.71.4',
    date: '2026-10-02',
    title: 'Votre score ne peut plus rester en arrière',
    items: [
      'Un bloc validé pouvait, dans certains cas, être bien enregistré sans que votre score, vos murs ni vos missions ne bougent — la réconciliation mensuelle rattrapait les points, un mois plus tard.',
      'Les défis entre potes sont désormais enregistrés séparément : un défi supprimé par son créateur ne peut plus empêcher votre score de se mettre à jour.',
      'Et si un enregistrement échoue vraiment, l\'application vous le dit maintenant au lieu de rester muette.',
      'Le bloc n°4 de la Grande Face a été recoté en violet : les points de celles et ceux qui l\'avaient déjà validé ont été ajustés en conséquence.',
    ],
  },
  {
    version: '2.71.3',
    date: '2026-10-02',
    title: 'L\'image de progression partageable corrigée',
    items: [
      'Sur l\'image générée par « Partager ma progression », le libellé de votre niveau n\'apparaissait pas une fois publiée sur un réseau social (il s\'affichait pourtant bien à l\'écran).',
      'Le logo de la salle y était aussi étiré en largeur : il garde maintenant ses proportions.',
    ],
  },
  {
    version: '2.71',
    date: '2026-09-26',
    title: 'La saison démarre le 1er novembre',
    items: [
      'Le classement de saison ouvrira le 1er novembre et se terminera le 31 mai : tout le monde part de zéro, seuls les blocs réussis pour la première fois pendant la saison compteront.',
      'Le classement général, lui, compte dès maintenant et ne s\'arrête jamais : grimper en octobre n\'est pas perdu.',
      'Un « Échoué » cliqué par erreur ? « Effacer cet échec » sur la fiche du bloc. Et le badge du grimpeur régulier compte désormais vos semaines complètes.',
    ],
  },
  {
    version: '2.70',
    date: '2026-09-25',
    title: 'Une carte de missions tamponnée',
    items: [
      'La grille des missions de la semaine devient une carte à 8 cases : chaque mission réussie est tamponnée à la marque de la salle.',
      'Les missions liées à votre niveau affichent la couleur concernée, les murs ont leur pictogramme (dévers, rétablissement, dalle) et la mission « 4 murs » se remplit segment par segment.',
    ],
  },
  {
    version: '2.69',
    date: '2026-09-25',
    title: 'Votre première réussite fait foi',
    items: [
      'Un bloc déjà réussi affiche désormais « Déjà validé le … en N essais » : refaire un bloc ne modifie plus votre résultat ni le classement. C\'est votre première réussite qui mesure votre niveau.',
      'Le nombre d\'essais se choisit avant de valider « Réussi » : plus de valeur par défaut à 1 essai.',
      'Une erreur de saisie ? « Corriger ma saisie » sur la fiche du bloc, sans limite de temps.',
      'Missions de la semaine : « J\'ai testé ce bloc » et « Je l\'ai refait » font avancer vos missions sans rien enregistrer. Les cases cochées ne disparaissent plus.',
    ],
  },
  {
    version: '2.68',
    date: '2026-09-24',
    title: 'Missions hebdomadaires',
    items: [
      'Une nouvelle grille de 8 missions à réaliser chaque semaine, calée sur votre niveau : un bloc à votre niveau max, 4 murs différents, un flash, un bloc plus difficile, un bloc en dévers, en rétablissement, en dalle, un défi Roulette relevé.',
      'La grille se réinitialise chaque lundi. La compléter offre un badge — pas de points au classement.',
      'Visible sur "Mon Blocabrac quotidien", sous les boutons de la Roulette.',
    ],
  },
  {
    version: '2.67',
    date: '2026-09-24',
    title: 'Carnet de méthodes',
    items: [
      'Sur la fiche d\'un bloc, vous pouvez désormais indiquer la ou les méthodes utilisées pour le réussir (crochet de talon, réglette, dynamique...), jusqu\'à 3 par bloc.',
      'Une fois qu\'assez de grimpeurs ont voté, la fiche affiche les méthodes les plus utilisées — de quoi se préparer avant de grimper.',
      'Votre choix reste modifiable tant que vous revenez sur votre validation.',
    ],
  },
  {
    version: '2.66',
    date: '2026-09-24',
    title: 'Anecdote d\'ouvreur',
    items: [
      'La fiche d\'un bloc quotidien peut désormais porter un mot libre de l\'ouvreur : intention de mouvement, nom donné au bloc, avertissement.',
      'N\'apparaît que si l\'ouvreur l\'a renseigné.',
      'Jamais affiché pendant une compétition tant que la cotation reste cachée, comme « Ouvert par ».',
    ],
  },
  {
    version: '2.65',
    date: '2026-09-17',
    title: 'Ouvert par',
    items: [
      'La fiche d\'un bloc quotidien peut désormais indiquer qui l\'a réellement ouvert sur le mur, en plus de qui l\'a saisi dans l\'application.',
      'N\'apparaît que si l\'ouvreur l\'a renseigné — un bloc ancien ou sans attribution ne montre simplement rien.',
      'Jamais affiché pendant une compétition tant que la cotation reste cachée : seulement une fois l\'épreuve terminée.',
    ],
  },
  {
    version: '2.61',
    date: '2026-09-12',
    title: 'Premiers ascensionnistes',
    items: [
      'Les blocs noir, blanc et rose affichent désormais les cinq premiers grimpeurs à les avoir validés, dans l\'ordre, avec la date de leur première validation.',
      'Vous n\'y apparaissez pas par défaut — activez « Apparaître dans les premiers ascensionnistes des blocs difficiles » dans « Modifier mes informations » pour y figurer.',
      'Ça ne s\'applique qu\'à vos prochaines validations, pas à celles déjà enregistrées.',
    ],
  },
  {
    version: '2.58',
    date: '2026-09-09',
    title: 'Nouvelle icône',
    items: [
      'L\'application a une nouvelle icône, reprise du logo de la salle sur le vert Blocabrac.',
      'Si vous l\'avez déjà installée sur votre écran d\'accueil, réinstallez-la pour voir la nouvelle icône.',
    ],
  },
  {
    version: '2.57',
    date: '2026-09-06',
    title: 'Mise à jour de l\'application en un clic',
    items: [
      'Quand une nouvelle version est déployée, un bandeau « Une nouvelle version est disponible » apparaît désormais en bas de l\'écran.',
      'Un clic sur « Mettre à jour » recharge l\'application avec la dernière version — fini de vider le cache ou de fermer tous les onglets.',
      'L\'application vérifie aussi les mises à jour toute seule quand vous la rouvrez après un moment.',
    ],
  },
  {
    version: '2.56',
    date: '2026-09-06',
    title: 'Classement de saison : redémarrage à venir',
    items: [
      'Le classement de saison va être redémarré à la mi-septembre, pour rendre la course à la Finale équitable pendant le déploiement de l\'appli — tant que peu de grimpeurs y sont encore inscrits.',
      'Il repartira de vos validations des blocs encore en place : rien à revalider, votre nombre d\'essais d\'origine sera conservé. Votre classement général (à vie) et vos badges ne sont pas concernés.',
      'À partir du redémarrage, votre score de saison ne redescendra plus quand un mur change : les points acquis resteront acquis.',
      'Déjà en place : les points des blocs retirés ne sont plus déduits de votre score général — certains scores augmentent en conséquence.',
    ],
  },
  {
    version: '2.55',
    date: '2026-09-06',
    title: 'Bloc Roulette : traversées et défis "un cran au-dessus"',
    items: [
      'Nouveau défi "pieds libres" : un bloc un cran au-dessus de votre niveau, en vous autorisant les prises des autres blocs du mur comme pieds.',
      'La traversée de murs s\'adapte à votre niveau : d\'un seul mur (niveau bleu) à quatre murs consécutifs sans prises jaunes ni vertes (niveau rose).',
      'La "Roulette de la mort" devient jouable : un bloc un cran au-dessus, à sortir en s\'autorisant une ou deux prises supplémentaires de son choix sur le mur.',
      'De nouveaux défis de style inspirés d\'exercices de club : pieds "touché-collé", grimpe sans prise de pied, à deux doigts, techniques imposées (cancan, lolotte, crochet de talon, contrepointe, drapeau), respiration, 3 blocs liés annoncés à voix haute.',
      'Des défis de technique avancée à partir du niveau blanc : mouvement Yaniro (figure 4) et départ en chauve-souris, avec leur explication affichée sur la carte.',
      'Chaque défi rappelle que vous pouvez prendre un bloc existant du bon niveau ou en composer un avec les prises de plusieurs blocs d\'un même mur.',
      'Nouveau bouton « J\'ai relevé le défi » sur la carte Roulette : votre nombre de défis relevés s\'affiche sous les boutons et dans « Mes stats », avec la liste de vos 10 derniers (vous pouvez préciser le bloc utilisé, c\'est facultatif). Cela ne touche ni votre classement ni vos statistiques de blocs.',
    ],
  },
  {
    version: '2.54',
    date: '2026-09-02',
    title: 'Badges "couleur" : mise en veille quand le mur change',
    items: [
      'Un badge "couleur" se met désormais en veille (grisé) quand, après une rotation des murs, il ne reste plus aucun bloc de cette couleur en salle que vous ayez validé.',
      'Il se rallume tout seul dès que vous revalidez un bloc de cette couleur. Votre niveau en salle suit la même logique.',
      'Certains badges liés à des murs démontés de longue date peuvent donc passer en veille : c\'est voulu, pas un bug.',
    ],
  },
  {
    version: '2.53',
    date: '2026-09-01',
    title: 'Badges automatiques, défis et repérage des blocs',
    items: [
      'Les badges "couleur" (réussir un bloc rouge, violet, noir…) s\'obtiennent maintenant automatiquement dès que le critère est rempli, en ouvrant "Mes statistiques".',
      'Dans le menu des blocs d\'un mur, chaque bloc affiche sa couleur à côté de son numéro.',
      'Défi "premier à un seuil" : la cible peut être "mon niveau max" ou "mon niveau max −1" — chacun compte alors les blocs de sa propre couleur, pour un défi équitable entre grimpeurs de niveaux différents.',
      'Le créateur d\'un défi peut le supprimer à tout moment.',
    ],
  },
  {
    version: '2.52',
    date: '2026-09-01',
    title: 'Objectifs de la semaine cumulables',
    items: [
      'L\'objectif de la semaine se compose maintenant de plusieurs objectifs cumulés : un nombre de blocs d\'une couleur donnée (ex. 2 rouges et 3 noirs), un bloc précis (ex. le bloc n°6 de la Dalle), ou un nombre de blocs tous niveaux confondus.',
      'La progression de chaque objectif s\'affiche séparément sur "Mon espace personnel".',
    ],
  },
  {
    version: '2.46',
    date: '2026-08-19',
    title: 'Défis entre potes',
    items: [
      'Lancez un défi à 2-6 potes de grimpe depuis "Potes de grimpe" : premier à atteindre un seuil, le plus de progrès sur une période, meilleur score sur un même bloc, ou défi déclaratif (traversée, bloc inventé…).',
      'La progression se calcule automatiquement à partir de vos validations sur "Mon Blocabrac quotidien" — rien à faire de plus, sauf pour un défi déclaratif, à valider soi-même d\'un bouton "C\'est fait".',
    ],
  },
  {
    version: '2.44',
    date: '2026-08-18',
    title: 'Bloc Roulette',
    items: [
      'Un tirage de défi ludique sur "Mon Blocabrac quotidien" : un bloc précis, une contrainte de style, un chronométrage, une exploration des murs délaissés…',
      'Le niveau proposé s\'ajuste au vôtre, avec une variante "Roulette de la mort" pour les envies de défi plus corsées.',
    ],
  },
  {
    version: '2.13',
    date: '2026-07-23',
    title: 'Thème sombre, objectifs et partage de progression',
    items: [
      "Un bouton en haut de l'écran pour basculer entre thème clair et sombre.",
      'Une série de jours consécutifs et un objectif hebdomadaire sur "Mon espace personnel".',
      'Une carte de progression à télécharger ou partager.',
      'Un filtre par niveau sur "Mon Blocabrac quotidien", pour chercher un niveau sur tous les murs.',
    ],
  },
  {
    version: '2.12',
    date: '2026-07-23',
    title: "Guides d'aide",
    items: [
      "Une fiche imprimable pour la connexion, l'inscription et l'installation de l'application.",
      'Une page d\'aide dans l\'appli (icône "?") expliquant chaque fonction de "Mon espace personnel".',
    ],
  },
];
