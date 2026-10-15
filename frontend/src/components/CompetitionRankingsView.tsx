/**
 * L'affichage d'un palmarès de compétition — **un seul rendu**, qui reçoit un objet classement.
 *
 * §2.4 du plan du 5 novembre : le même affichage a deux origines possibles (calculé à la
 * lecture, ou lu dans le document gelé), et c'est précisément la situation qui fabrique une
 * divergence — ce projet en a payé quatre, dont une le 03/10/2026 où le message publié
 * numérotait 1, 2, 3 là où l'écran affichait déjà 1, 1, 3. D'où un composant unique, nourri
 * par la forme unique que compose `buildFrozenRankings` : les deux sources produisent le même
 * objet, seul le libellé diffère.
 *
 * ⚠️ ET CÔTÉ GRIMPEUR, IL N'Y A QU'UNE SOURCE POSSIBLE — le document gelé. Vérifié dans
 * `firestore.rules` le 15/10/2026 : un client ne peut lire ni `competition_results` ni
 * `competition_participants` d'un autre grimpeur. Un « classement provisoire » calculé par
 * l'application du grimpeur est donc **infaisable**, à moins d'ouvrir ces lectures à tout le
 * monde — c'est-à-dire d'exposer les résultats et les dates de naissance de tous, enfants
 * compris. Le gel n'est donc pas une commodité : c'est le seul moyen qu'un grimpeur voie un
 * jour un classement de compétition. Le provisoire reste du côté admin/ouvreur, où il existe
 * déjà (AdminCompetitionStats, Ouvreur/CompetitionStats, écran live).
 *
 * Ce composant n'ordonne rien et ne numérote rien : les rangs lui arrivent déjà faits. Ajouter
 * ici un tri ou un `index + 1` rouvrirait exactement la divergence que le composant unique
 * referme.
 */
import {
  Box, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import type { FrozenRankings, FrozenEntry, FrozenGroup } from '../utils/competitionRankings';

interface Props {
  rankings: FrozenRankings;
  /** « Palmarès officiel » côté grimpeur ; un autre libellé pour une source provisoire. */
  label?: string;
}

const Tableau = ({ entries }: { entries: FrozenEntry[] }) => (
  <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={{ width: 60 }}>Rang</TableCell>
          <TableCell>Grimpeur</TableCell>
          <TableCell align="right">Points</TableCell>
          <TableCell align="right">Blocs</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.user_id}>
            {/* Le rang vient du document, jamais de l'index : deux ex æquo partagent leur
                rang et le suivant saute les places occupées. */}
            <TableCell>{e.rank}</TableCell>
            <TableCell>{e.display_name}</TableCell>
            <TableCell align="right">{e.score}</TableCell>
            <TableCell align="right">{e.boulders}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);

const Section = ({ titre, entries }: { titre: string; entries: FrozenEntry[] }) => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
      {titre} — {entries.length} participant{entries.length > 1 ? 's' : ''}
    </Typography>
    {entries.length === 0
      ? <Typography variant="body2" color="text.secondary">Aucun participant.</Typography>
      : <Tableau entries={entries} />}
  </Box>
);

// §1.4 : aucun paquet non vide n'est masqué, même à un seul grimpeur — et c'est l'EFFECTIF
// affiché dans le titre qui le qualifie, sans qu'on ait à couronner personne. Masquer les
// petits groupes est précisément ce qui produirait la question à l'accueil (« pourquoi je ne
// suis dans aucun classement ? »).
const SectionGroupee = ({ titre, groupes }: { titre: string; groupes: FrozenGroup[] }) => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>{titre}</Typography>
    {groupes.length === 0
      ? <Typography variant="body2" color="text.secondary">Aucun groupe.</Typography>
      : groupes.map((g) => (
        <Box key={g.category} sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {g.category} — {g.entries.length} participant{g.entries.length > 1 ? 's' : ''}
          </Typography>
          <Tableau entries={g.entries} />
        </Box>
      ))}
  </Box>
);

export const CompetitionRankingsView = ({ rankings, label }: Props) => (
  <Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
      <Typography variant="h6">{rankings.competition_name}</Typography>
      <Typography variant="body2" color="text.secondary">
        {new Date(rankings.competition_date).toLocaleDateString()}
      </Typography>
      {label && <Chip label={label} color="success" size="small" />}
    </Box>

    <Section titre="Classement général (open)" entries={rankings.general_open} />
    <Section titre="Classement des grimpeurs de la salle (open)" entries={rankings.client_open} />
    <SectionGroupee titre="Par genre" groupes={rankings.client_gender} />
    <SectionGroupee titre="Par catégorie d'âge" groupes={rankings.client_age} />
    <SectionGroupee titre="Par niveau max" groupes={rankings.client_level_max} />
  </Box>
);

export default CompetitionRankingsView;
