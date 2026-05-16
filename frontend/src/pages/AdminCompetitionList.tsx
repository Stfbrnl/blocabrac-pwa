import React, { useState, useEffect, ChangeEvent } from 'react';
import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  IconButton,
  Alert,
  CircularProgress,
  Tooltip,
  TableSortLabel
} from '@mui/material';
import {
  Search as SearchIcon,
  PersonAdd as PersonAddIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { db, auth } from '../services/firebaseConfig';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth as firebaseAuth } from '../services/firebaseConfig';

// Types
type CompetitionStatus = 'en cours' | 'terminée' | 'à venir' | 'supprimée';

interface Competition {
  id: string;
  name: string;
  date: string;
  status: CompetitionStatus;
  max_participants: number;
  registered_count: number;
  boulders: string[];
  access_code?: string; // ✅ Optionnel
}

interface Participant {
  id: string;
  competition_id: string;
  user_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  age?: number;
  gender?: string;
  level?: string;
  registered_at: string;
  is_client: boolean;
}

type SortDirection = 'asc' | 'desc';

const AdminCompetitionList: React.FC = () => {
  const [user, loadingAuth] = useAuthState(firebaseAuth);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Participant;
    direction: SortDirection;
  } | null>({ key: 'last_name', direction: 'asc' });

  // Récupérer les compétitions
  const fetchCompetitions = async () => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, 'competitions'));
      const competitionsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Competition[];
      setCompetitions(competitionsData.filter(comp => comp.status !== 'supprimée'));
    } catch (err) {
      console.error('Erreur : ', err);
      setError('Erreur lors de la récupération des compétitions.');
    } finally {
      setLoading(false);
    }
  };

  // Récupérer les participants d'une compétition
  const fetchParticipants = async (competitionId: string) => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'competition_participants'),
        where('competition_id', '==', competitionId)
      );
      const querySnapshot = await getDocs(q);
      const participantsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Participant[];
      setParticipants(participantsData);
    } catch (err) {
      console.error('Erreur : ', err);
      setError('Erreur lors de la récupération des participants.');
    } finally {
      setLoading(false);
    }
  };

  // Ouvrir la boîte de dialogue des participants
  const handleOpenDialog = (competition: Competition) => {
    setSelectedCompetition(competition);
    fetchParticipants(competition.id);
    setOpenDialog(true);
  };

  // Copier le code d'accès dans le presse-papiers
  const copyAccessCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setSuccess('Code d\'accès copié dans le presse-papiers !');
    setTimeout(() => setSuccess(null), 3000);
  };

  // Tri des participants
  const sortedParticipants = React.useMemo(() => {
    if (!sortConfig) return participants;
    return [...participants].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      if (aValue === undefined || bValue === undefined) return 0;
      if (aValue === null || bValue === null) return 0;
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [participants, sortConfig]);

  // Demander le tri
  const requestSort = (key: keyof Participant) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Filtrer les compétitions
  const filteredCompetitions = competitions.filter(competition =>
    competition.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Exporter en CSV
  const exportToCSV = () => {
    if (participants.length === 0 || !selectedCompetition) return;
    const headers = ['Nom', 'Email', 'Âge', 'Genre', 'Niveau', 'Client?', 'Date d\'inscription'];
    const csvContent = [
      headers.join(';'),
      ...participants.map(p => [
        `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        p.email || '',
        p.age || '',
        p.gender || '',
        p.level || '',
        p.is_client ? 'Oui' : 'Non',
        new Date(p.registered_at).toLocaleString('fr-FR')
      ].join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inscrits_${(selectedCompetition?.name ?? 'competition').replace(/\s+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Gestion du changement pour le champ de recherche
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  useEffect(() => {
    if (user) {
      fetchCompetitions();
    }
  }, [user]);

  if (loadingAuth || loading) {
    return <CircularProgress />;
  }

  return (
    <Box sx={{ mt: 2, p: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Gestion des Inscriptions</Typography>
      </Box>

      <TextField
        fullWidth
        label="Rechercher une compétition"
        variant="outlined"
        value={searchTerm}
        onChange={handleSearchChange}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }
        }}
        sx={{ mb: 2 }}
      />

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nom</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell>Inscrits</TableCell>
              <TableCell>Code d'accès</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredCompetitions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center' }}>
                  Aucune compétition trouvée.
                </TableCell>
              </TableRow>
            ) : (
              filteredCompetitions.map((competition) => (
                <TableRow key={competition.id}>
                  <TableCell>{competition.name}</TableCell>
                  <TableCell>{competition.date}</TableCell>
                  <TableCell>
                    <Chip
                      label={competition.status}
                      color={
                        competition.status === 'terminée' ? 'success' :
                        competition.status === 'en cours' ? 'primary' :
                        'default'
                      }
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {competition.registered_count} / {competition.max_participants}
                  </TableCell>
                  <TableCell>
                    {competition.access_code && (
                      <>
                        <Chip
                          label={competition.access_code}
                          size="small"
                          onClick={() => competition.access_code && copyAccessCode(competition.access_code)}
                          sx={{ cursor: 'pointer' }}
                        />
                        <Tooltip title="Copier le code d'accès">
                          <IconButton
                            size="small"
                            onClick={() => competition.access_code && copyAccessCode(competition.access_code)}
                          >
                            <CopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<PersonAddIcon />}
                      onClick={() => handleOpenDialog(competition)}
                      disabled={competition.registered_count >= competition.max_participants}
                    >
                      Voir ({competition.registered_count})
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialogue des participants */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        {/* ✅ CORRECTION FINALE : Vérification explicite + gestion de access_code */}
        <DialogTitle>
          {selectedCompetition ? (
            <>
              Inscrits à {selectedCompetition.name} ({participants.length}/{selectedCompetition.max_participants})
              {selectedCompetition.access_code && (
                <>
                  <Chip
                    label={selectedCompetition.access_code}
                    sx={{ ml: 2 }}
                    onClick={() => selectedCompetition.access_code && copyAccessCode(selectedCompetition.access_code)}
                  />
                  <Tooltip title="Copier le code d'accès">
                    <IconButton
                      size="small"
                      // ✅ CORRECTION LIGNE 338 ET 343 : Vérification que access_code existe
                      onClick={() => selectedCompetition.access_code && copyAccessCode(selectedCompetition.access_code)}
                      sx={{ ml: 1 }}
                    >
                      <CopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </>
          ) : (
            'Inscrits à une compétition'
          )}
        </DialogTitle>
        <DialogContent>
          {participants.length === 0 ? (
            <Typography>Aucun inscrit pour cette compétition.</Typography>
          ) : (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={exportToCSV}
                >
                  Exporter en CSV
                </Button>
              </Box>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <TableSortLabel
                          active={sortConfig?.key === 'last_name'}
                          direction={sortConfig?.direction}
                          onClick={() => requestSort('last_name')}
                        >
                          Nom
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortConfig?.key === 'age'}
                          direction={sortConfig?.direction}
                          onClick={() => requestSort('age')}
                        >
                          Âge
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortConfig?.key === 'gender'}
                          direction={sortConfig?.direction}
                          onClick={() => requestSort('gender')}
                        >
                          Genre
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortConfig?.key === 'level'}
                          direction={sortConfig?.direction}
                          onClick={() => requestSort('level')}
                        >
                          Niveau
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>Client?</TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortConfig?.key === 'registered_at'}
                          direction={sortConfig?.direction}
                          onClick={() => requestSort('registered_at')}
                        >
                          Date d'inscription
                        </TableSortLabel>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedParticipants.map((participant) => (
                      <TableRow key={participant.id}>
                        <TableCell>{participant.first_name} {participant.last_name}</TableCell>
                        <TableCell>{participant.email}</TableCell>
                        <TableCell>{participant.age}</TableCell>
                        <TableCell>{participant.gender}</TableCell>
                        <TableCell>
                          <Chip
                            label={participant.level || 'Non renseigné'}
                            size="small"
                            color={
                              participant.level === 'jaune' ? 'warning' :
                              participant.level === 'vert' ? 'success' :
                              participant.level === 'bleu' ? 'primary' :
                              participant.level === 'violet' ? 'secondary' :
                              participant.level === 'rouge' ? 'error' :
                              participant.level === 'noir' ? 'default' :
                              participant.level === 'blanc' ? 'info' : 'default'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={participant.is_client ? 'Oui' : 'Non'}
                            size="small"
                            color={participant.is_client ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell>{new Date(participant.registered_at).toLocaleDateString('fr-FR')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminCompetitionList;