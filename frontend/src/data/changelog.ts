export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

// Dernières nouveautés à afficher aux clients ("Quoi de neuf ?" sur Mon espace
// personnel). Seule la plus récente (changelog[0]) est montrée. Mettre à jour
// à chaque nouvelle fonctionnalité visible côté client — pas besoin de garder
// tout l'historique ici, l'historique complet vit dans les commits git.
export const changelog: ChangelogEntry[] = [
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
