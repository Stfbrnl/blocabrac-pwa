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
