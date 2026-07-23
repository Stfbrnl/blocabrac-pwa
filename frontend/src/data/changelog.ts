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
