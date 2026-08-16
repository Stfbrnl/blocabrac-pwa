import React, { useEffect, useState } from 'react';
import {
  Container, Paper, Typography, Box, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TableSortLabel, Chip, Card,
  CardContent, CircularProgress, useTheme, useMediaQuery, FormControl,
  InputLabel, Select, MenuItem, IconButton, Tooltip, ToggleButtonGroup, ToggleButton
} from '@mui/material';
import { ArrowUpward as ArrowUpwardIcon, ArrowDownward as ArrowDownwardIcon } from '@mui/icons-material';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { getSeasonAge, getFfmeCategory, FFME_AGE_BANDS } from '../../../utils/ageCategory';
import { levelOrder } from '../../../utils/competitionEligibility';
import { summaryFromColorCounts, type ColorCounts } from '../../../utils/classementScore';

const levelColors: Record<string, string> = {
  jaune: '#FFFF00', vert: '#00FF00', bleu: '#0000FF', violet: '#800080',
  rouge: '#FF0000', noir: '#000000', blanc: '#FFFFFF', rose: '#FFC0CB'
};

// ✅ Répare les genres enregistrés en minuscules par un bug de ClientProfile.tsx
// avant correction (ex: "homme" au lieu de "Homme"), sans dépendre d'une migration.
const normalizeGender = (gender?: string): string => {
  if (!gender) return 'Inconnu';
  const trimmed = gender.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

interface ClassementRow {
  uid: string;
  name: string;
  gender: string;
  ageCategory: string;
  ageCategoryRank: number;
  bestColor: string | null;
  bestColorRank: number;
  score: number;
  bouldersValidated: number;
  // ✅ Classement de saison (CONCEPTION-classement-saisonnier.md) : mêmes métriques,
  // dérivées de `season.colorCounts`/`season.score` — voir "mode" plus bas pour la
  // bascule d'affichage. Pas de lecture Firestore supplémentaire : ces champs vivent
  // déjà sur le même document `classement_profiles` chargé pour le classement général.
  seasonScore: number;
  seasonBouldersValidated: number;
  seasonBestColor: string | null;
  seasonBestColorRank: number;
}

interface RankedUser {
  uid: string;
  first_name?: string;
  last_name?: string;
  gender?: string;
  dateOfBirth?: string;
  classementOptIn?: boolean;
  // ✅ Résumé déjà calculé par chaque client sur sa propre fiche (voir
  // src/utils/classementScore.ts et ClientDaily.tsx) : jamais recalculé ici à partir
  // des données d'un autre utilisateur, qu'un client n'a pas le droit de lire.
  score?: number;
  bouldersValidated?: number;
  bestColorRank?: number;
  // ✅ Absent sur les profils créés avant ce chantier, ou si aucune validation n'a
  // encore eu lieu dans la saison en cours — repli à 0/vide géré au mapping.
  season?: { score?: number; colorCounts?: ColorCounts };
}

type ClassementMode = 'general' | 'saison';

type SortKey = 'name' | 'gender' | 'ageCategory' | 'bestColor' | 'score' | 'bouldersValidated';

const sortLabels: Record<SortKey, string> = {
  name: 'Nom',
  gender: 'Genre',
  ageCategory: 'Catégorie d\'âge',
  bestColor: 'Meilleure couleur',
  score: 'Score',
  bouldersValidated: 'Blocs validés',
};

const ClientClassement: React.FC = () => {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const [rows, setRows] = useState<ClassementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  // ✅ Classement de saison : bascule d'affichage seulement, aucune nouvelle lecture
  // Firestore (voir CONCEPTION-classement-saisonnier.md, "Écran de classement de saison").
  const [mode, setMode] = useState<ClassementMode>('general');

  useEffect(() => {
    const fetchClassement = async () => {
      try {
        setLoading(true);

        // ✅ Un client ne peut pas lister toute la collection "users" — ni les résultats
        // de blocs (client_boulder_results) des AUTRES clients (règles Firestore : ces
        // deux collections ne sont lisibles en liste que pour soi-même ou le staff).
        // On lit donc "classement_profiles", une fiche publique allégée (prénom/nom/
        // genre/date de naissance/opt-in + score déjà résumé), tenue à jour par chaque
        // client sur SA PROPRE fiche à chaque validation (ClientDaily.tsx) — jamais
        // recalculée ici à partir des données d'un autre utilisateur.
        const profilesSnapshot = await getDocs(
          query(collection(db, 'classement_profiles'), where('classementOptIn', '==', true))
        );

        const optInUsers: RankedUser[] = profilesSnapshot.docs
          .map((profileDoc) => ({ uid: profileDoc.id, ...profileDoc.data() } as RankedUser));

        const rowsData: ClassementRow[] = optInUsers.map((user) => {
          const bestColorRank = user.bestColorRank ?? -1;
          const bestColor = bestColorRank >= 0 ? levelOrder[bestColorRank] : null;

          // ✅ season.bouldersValidated/bestColorRank ne sont pas stockés (seuls
          // colorCounts/score le sont, comme pour le compteur all-time) — dérivés ici
          // avec la même fonction pure que ClientDaily.tsx, pas de nouveau calcul serveur.
          const { bouldersValidated: seasonBouldersValidated, bestColorRank: seasonBestColorRank } =
            summaryFromColorCounts(user.season?.colorCounts || {});
          const seasonBestColor = seasonBestColorRank >= 0 ? levelOrder[seasonBestColorRank] : null;

          const seasonAge = getSeasonAge(user.dateOfBirth);
          const ageCategory = getFfmeCategory(seasonAge);
          const ageCategoryRank = FFME_AGE_BANDS.findIndex((band) => band.label === ageCategory);

          return {
            uid: user.uid,
            name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Grimpeur',
            gender: normalizeGender(user.gender),
            ageCategory,
            ageCategoryRank: ageCategoryRank === -1 ? FFME_AGE_BANDS.length : ageCategoryRank,
            bestColor,
            bestColorRank,
            score: user.score ?? 0,
            bouldersValidated: user.bouldersValidated ?? 0,
            seasonScore: user.season?.score ?? 0,
            seasonBouldersValidated,
            seasonBestColor,
            seasonBestColorRank,
          };
        });

        setRows(rowsData);
      } catch (error) {
        console.error('Erreur lors du chargement du classement :', error);
      } finally {
        setLoading(false);
      }
    };

    fetchClassement();
  }, []);

  const requestSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'score' || key === 'bouldersValidated' ? 'desc' : 'asc');
    }
  };

  // ✅ Classement de saison : plutôt que dupliquer le tri/rendu, on substitue les
  // métriques actives (score/bouldersValidated/bestColor/bestColorRank) selon le mode
  // AVANT le tri existant, qui reste inchangé pour les deux vues.
  const displayRows: ClassementRow[] = mode === 'saison'
    ? rows.map((row) => ({
        ...row,
        score: row.seasonScore,
        bouldersValidated: row.seasonBouldersValidated,
        bestColor: row.seasonBestColor,
        bestColorRank: row.seasonBestColorRank,
      }))
    : rows;

  const sortedRows = [...displayRows].sort((a, b) => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'name':
        return a.name.localeCompare(b.name) * direction;
      case 'gender':
        return a.gender.localeCompare(b.gender) * direction;
      case 'ageCategory':
        return (a.ageCategoryRank - b.ageCategoryRank) * direction;
      case 'bestColor':
        return (a.bestColorRank - b.bestColorRank) * direction;
      case 'bouldersValidated':
        return (a.bouldersValidated - b.bouldersValidated) * direction;
      case 'score':
      default:
        return (a.score - b.score) * direction;
    }
  });

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
        <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
          Classement des grimpeurs
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Basé sur les blocs quotidiens validés (hors compétition). Seuls les grimpeurs ayant choisi
          d'apparaître ici sont listés — modifiable depuis "Modifier mes informations".
        </Typography>

        <ToggleButtonGroup
          value={mode}
          exclusive
          size="small"
          onChange={(_, next) => next && setMode(next)}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="general">Classement général</ToggleButton>
          <ToggleButton value="saison">Classement de saison</ToggleButton>
        </ToggleButtonGroup>
        {mode === 'saison' && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Blocs validés depuis le début de la saison en cours seulement — ce classement
            détermine les qualifiés pour la Finale de fin de saison.
          </Typography>
        )}

        {rows.length === 0 ? (
          <Typography sx={{ mt: 2 }}>Aucun grimpeur n'apparaît pour l'instant dans le classement.</Typography>
        ) : isCompact ? (
          <Box>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <FormControl size="small" fullWidth>
                <InputLabel id="classement-sort-label">Trier par</InputLabel>
                <Select
                  labelId="classement-sort-label"
                  label="Trier par"
                  value={sortKey}
                  onChange={(e) => requestSort(e.target.value as SortKey)}
                >
                  {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                    <MenuItem key={key} value={key}>{sortLabels[key]}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title={sortDirection === 'desc' ? 'Ordre décroissant' : 'Ordre croissant'}>
                <IconButton
                  onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  aria-label="Inverser l'ordre de tri"
                >
                  {sortDirection === 'desc' ? <ArrowDownwardIcon /> : <ArrowUpwardIcon />}
                </IconButton>
              </Tooltip>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {sortedRows.map((row, index) => (
                <Card key={row.uid} variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {index + 1}. {row.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {row.gender} · {row.ageCategory}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                      {row.bestColor && (
                        <Chip
                          size="small"
                          label={row.bestColor}
                          sx={{
                            backgroundColor: levelColors[row.bestColor],
                            color: row.bestColor === 'blanc' ? 'black' : 'white',
                          }}
                        />
                      )}
                      <Chip size="small" label={`${row.score} pts`} color="primary" />
                      <Chip size="small" label={`${row.bouldersValidated} blocs`} variant="outlined" />
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                    <TableCell key={key}>
                      <TableSortLabel
                        active={sortKey === key}
                        direction={sortKey === key ? sortDirection : 'asc'}
                        onClick={() => requestSort(key)}
                      >
                        {sortLabels[key]}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedRows.map((row, index) => (
                  <TableRow key={row.uid}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.gender}</TableCell>
                    <TableCell>{row.ageCategory}</TableCell>
                    <TableCell>
                      {row.bestColor ? (
                        <Chip
                          size="small"
                          label={row.bestColor}
                          sx={{
                            backgroundColor: levelColors[row.bestColor],
                            color: row.bestColor === 'blanc' ? 'black' : 'white',
                          }}
                        />
                      ) : 'N/A'}
                    </TableCell>
                    <TableCell>{row.score}</TableCell>
                    <TableCell>{row.bouldersValidated}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Container>
  );
};

export default ClientClassement;
