import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';

interface HelpSection {
  title: string;
  intro: string;
  points: string[];
}

const sections: HelpSection[] = [
  {
    title: 'Mon Blocabrac quotidien',
    intro: "Les blocs disponibles aujourd'hui sur chaque mur de la salle.",
    points: [
      'Choisissez un mur pour voir la liste des blocs qui y sont ouverts.',
      "Ouvrez un bloc pour voir sa photo, son niveau et les conseils éventuels de l'ouvreur.",
      'Indiquez si vous l\'avez réussi ou échoué, et le nombre d\'essais.',
      'Pour un bloc marqué « Mystère », proposez votre propre cotation avant de valider.',
      'Chaque validation alimente automatiquement vos statistiques et le classement des grimpeurs.',
    ],
  },
  {
    title: 'Mes compétitions',
    intro: 'Les compétitions ouvertes et vos inscriptions en cours.',
    points: [
      "Parcourez les compétitions en cours et inscrivez-vous en un clic (si votre niveau ou accès le permet).",
      'Une fois inscrit, le bouton devient « Valider mes blocs » : tous les blocs de compétition sont traités comme des blocs « Mystère », à coter vous-même comme au quotidien.',
    ],
  },
  {
    title: 'Mes statistiques',
    intro: "L'historique de vos résultats, blocs, cours et badges.",
    points: [
      'Filtrez vos blocs validés par période et consultez leur répartition par couleur.',
      'Retrouvez le détail de vos blocs et, si vous suivez des cours, de vos séances.',
      'Consultez vos badges obtenus au fil du temps.',
      "Votre niveau actuel (visible sur « Mon espace personnel ») est mis à jour automatiquement à partir de vos résultats — vous n'avez rien à saisir vous-même.",
    ],
  },
  {
    title: 'Classement des grimpeurs',
    intro: "Le classement des grimpeurs qui ont choisi d'y apparaître.",
    points: [
      'Basé sur les blocs quotidiens validés, hors compétition.',
      "Seuls les grimpeurs ayant activé l'option apparaissent — vous n'y êtes pas inclus par défaut.",
      'Pour apparaître (ou non) dans ce classement, rendez-vous dans « Modifier mes informations » et cochez la case « Apparaître dans le classement des grimpeurs ».',
    ],
  },
  {
    title: 'Mes cours',
    intro: "Vos séances de cours, si vous êtes inscrit(e) aux cours de la salle. N'apparaît que si c'est votre cas.",
    points: [
      'Retrouvez vos séances à venir, la ou les séances du jour, et vos séances archivées.',
      'Ouvrez une séance pour en voir le détail.',
      'Échangez des messages directement avec votre moniteur depuis cette section.',
    ],
  },
  {
    title: 'Potes de grimpe',
    intro: "Une fonctionnalité entièrement optionnelle : rien n'est partagé tant que vous ne l'activez pas.",
    points: [
      'Ajoutez des grimpeurs en tant que « potes de grimpe » (demande à accepter par l\'autre personne).',
      'Activez « Je suis en train de grimper » pour que vos potes de grimpe voient que vous êtes à la salle en ce moment (visible quelques heures, puis désactivé automatiquement).',
      'Renseignez votre prochaine session (jour + créneau horaire) pour que vos potes puissent s\'organiser avec vous.',
    ],
  },
  {
    title: 'Modifier mes informations',
    intro: 'Vos informations personnelles et vos préférences.',
    points: [
      'Mettez à jour prénom, nom, email, date de naissance, genre et niveau en salle.',
      'Activez ou désactivez votre apparition dans le classement des grimpeurs.',
    ],
  },
];

const ClientHelp: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3, mb: 4 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/client/screen')}
          sx={{ mb: 2 }}
        >
          Retour à Mon espace personnel
        </Button>

        <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
          Comment ça marche ?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Le détail des fonctions disponibles depuis « Mon espace personnel ». Cliquez sur une section pour la déplier.
        </Typography>

        <Box>
          {sections.map((section) => (
            <Accordion key={section.title} disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6" sx={{ fontSize: '1rem' }}>{section.title}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {section.intro}
                </Typography>
                <List dense disablePadding>
                  {section.points.map((point, i) => (
                    <ListItem key={i} disablePadding sx={{ display: 'list-item', listStyleType: 'disc', ml: 3, pb: 0.5 }}>
                      <ListItemText primary={point} slotProps={{ primary: { variant: 'body2' } }} />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </Paper>
    </Container>
  );
};

export default ClientHelp;
