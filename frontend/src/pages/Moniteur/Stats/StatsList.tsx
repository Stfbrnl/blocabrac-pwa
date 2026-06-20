import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import {
  Container,
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
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  SelectChangeEvent,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

// Types pour les données
interface User {
  id: string;
  displayName: string;
  email?: string;
  role?: string;
}

interface Group {
  id: string;
  name: string;
  students: string[];
  moniteurId: string;
}

interface Course {
  id: string;
  title: string;
  groupId?: string;
}

interface Boulder {
  id: string;
  wall?: string;
  difficulty?: string;
  color?: string;
  difficulty_level?: string;
  difficulty_types?: string[];
}

interface Badge {
  id: string;
  name: string;
  feminineName?: string;
  description: string;
  criteria?: {
    color?: string;
    count?: number | string;
  };
  type: 'automatic' | 'manual';
  color?: string;
}

interface ClientBadge {
  id: string;
  userId: string;
  badgeId: string;
  awardedAt: Date;
  awardedBy: string;
  awardedByName?: string;
  exerciseId?: string;
  exerciseName?: string;
}

interface Diploma {
  id: string;
  userId: string;
  userName?: string;
  type: string;
  awardedAt: Date;
  awardedBy: string;
  awardedByName?: string;
}

interface UserResult {
  id: string;
  displayName: string;
  email?: string;
  results: {
    exerciseId: string;
    exerciseName: string;
    success: boolean;
    date: Date;
    badgeAwarded?: boolean;
    courseId?: string;
    boulderId?: string;
    boulderColor?: string;
  }[];
}

const StatsList: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [clientBadges, setClientBadges] = useState<ClientBadge[]>([]);
  const [diplomas, setDiplomas] = useState<Diploma[]>([]);

  // États pour les filtres
  const [filters, setFilters] = useState<{
    period: string;
    exercise?: string;
    exerciseType?: string;
    user?: string;
    group?: string;
    boulderColor?: string;
  }>({
    period: 'week',
    exercise: undefined,
    exerciseType: undefined,
    user: undefined,
    group: undefined,
    boulderColor: undefined,
  });

  // États pour les dialogues
  const [openManualBadgeDialog, setOpenManualBadgeDialog] = useState<boolean>(false);
  const [openDiplomaDialog, setOpenDiplomaDialog] = useState<boolean>(false);
  const [selectedResult, setSelectedResult] = useState<{
    userId: string;
    exerciseId: string;
    exerciseName: string;
    boulderColor?: string;
  } | null>(null);
  const [selectedBadgeId, setSelectedBadgeId] = useState<string>('');
  const [selectedClientForDiploma, setSelectedClientForDiploma] = useState<{ id: string; name: string } | null>(null);
  const [selectedDiplomaType, setSelectedDiplomaType] = useState<string>('');
  const [diplomaTypes] = useState<string[]>([
    'Grotte de bronze',
    'Grotte d\'argent',
    'Grotte d\'or',
    'Bloc de bronze',
    'Bloc d\'argent',
    'Bloc d\'or',
  ]);

  // Fonction pour convertir un Timestamp ou Date en string
  const formatDate = (date: Date | { seconds: number; nanoseconds: number } | any): string => {
    if (date instanceof Date) {
      return date.toLocaleDateString('fr-FR');
    } else if (date?.seconds) {
      return new Date(date.seconds * 1000).toLocaleDateString('fr-FR');
    } else {
      return 'N/A';
    }
  };

  // Récupérer les données
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Récupérer les utilisateurs
        const usersQuery = query(collection(db, 'users'));
        const usersSnapshot = await getDocs(usersQuery);
        const usersList: User[] = usersSnapshot.docs.map((userDoc) => ({
          id: userDoc.id,
          displayName: userDoc.data().displayName || userDoc.data().email?.split('@')[0] || userDoc.id,
          email: userDoc.data().email || '',
          role: userDoc.data().role || '',
        }));
        setUsers(usersList);

        // Récupérer les groupes du moniteur
        const groupsQuery = query(collection(db, 'Groups'), where('moniteurId', '==', user.uid));
        const groupsSnapshot = await getDocs(groupsQuery);
        const groupsList: Group[] = groupsSnapshot.docs.map((groupDoc) => ({
          id: groupDoc.id,
          name: groupDoc.data().name,
          students: groupDoc.data().students || [],
          moniteurId: groupDoc.data().moniteurId,
        }));
        setGroups(groupsList);

        // Récupérer les séances
        const coursesQuery = query(collection(db, 'courses'), where('createdBy', '==', user.uid));
        const coursesSnapshot = await getDocs(coursesQuery);
        const coursesList: Course[] = coursesSnapshot.docs.map((courseDoc) => ({
          id: courseDoc.id,
          title: courseDoc.data().title,
          groupId: courseDoc.data().groupId,
        }));
        setCourses(coursesList);

        // Récupérer les blocs
        const bouldersQuery = query(collection(db, 'boulders'));
        const bouldersSnapshot = await getDocs(bouldersQuery);
        const bouldersList: Boulder[] = bouldersSnapshot.docs.map((boulderDoc) => ({
          id: boulderDoc.id,
          wall: boulderDoc.data().wall,
          difficulty: boulderDoc.data().difficulty,
          color: boulderDoc.data().color,
          difficulty_level: boulderDoc.data().difficulty_level,
          difficulty_types: boulderDoc.data().difficulty_types,
        }));
        setBoulders(bouldersList);

        // Récupérer les badges
        const badgesQuery = query(collection(db, 'badges'));
        const badgesSnapshot = await getDocs(badgesQuery);
        const badgesList: Badge[] = badgesSnapshot.docs.map((badgeDoc) => {
          const badgeData = badgeDoc.data();
          return {
            id: badgeDoc.id,
            name: badgeData.name || 'Badge inconnu',
            feminineName: badgeData.feminineName,
            description: badgeData.description || '',
            criteria: badgeData.criteria,
            type: badgeData.type || 'manual',
            color: badgeData.color,
          };
        });
        setBadges(badgesList);

        // Récupérer les résultats des clients
        const resultsQuery = query(collection(db, 'client_course_results'));
        const resultsSnapshot = await getDocs(resultsQuery);
        const resultsData: UserResult[] = [];

        for (const resultDoc of resultsSnapshot.docs) {
          const data = resultDoc.data();
          // Conversion systématique du Timestamp en Date
          const resultDate = data.date instanceof Timestamp
            ? data.date.toDate()
            : data.date?.seconds
              ? new Date(data.date.seconds * 1000)
              : new Date();

          const userResult = resultsData.find((ur) => ur.id === data.userId);
          if (userResult) {
            userResult.results.push({
              exerciseId: data.exerciseId,
              exerciseName: data.exerciseName || 'Exercice inconnu',
              success: data.success || false,
              date: resultDate,
              badgeAwarded: data.badgeAwarded || false,
              courseId: data.courseId || '',
              boulderId: data.boulderId,
              boulderColor: data.boulderColor,
            });
          } else {
            const user = usersList.find((u) => u.id === data.userId);
            resultsData.push({
              id: data.userId,
              displayName: user?.displayName || 'Utilisateur inconnu',
              email: user?.email || '',
              results: [
                {
                  exerciseId: data.exerciseId,
                  exerciseName: data.exerciseName || 'Exercice inconnu',
                  success: data.success || false,
                  date: resultDate,
                  badgeAwarded: data.badgeAwarded || false,
                  courseId: data.courseId || '',
                  boulderId: data.boulderId,
                  boulderColor: data.boulderColor,
                },
              ],
            });
          }
        }
        setUserResults(resultsData);

        // Récupérer les badges des clients
        const clientBadgesQuery = query(collection(db, 'client_badges'));
        const clientBadgesSnapshot = await getDocs(clientBadgesQuery);
        const clientBadgesList: ClientBadge[] = clientBadgesSnapshot.docs.map((badgeLinkDoc) => {
          const data = badgeLinkDoc.data();
          // Conversion systématique du Timestamp en Date
          const awardedAt = data.awardedAt instanceof Timestamp
            ? data.awardedAt.toDate()
            : data.awardedAt?.seconds
              ? new Date(data.awardedAt.seconds * 1000)
              : new Date();

          return {
            id: badgeLinkDoc.id,
            userId: data.userId || '',
            badgeId: data.badgeId || '',
            awardedAt,
            awardedBy: data.awardedBy || '',
            awardedByName: data.awardedByName || '',
            exerciseId: data.exerciseId,
            exerciseName: data.exerciseName,
          };
        });
        setClientBadges(clientBadgesList);

        // Récupérer les diplômes
        const diplomasQuery = query(collection(db, 'diplomas'));
        const diplomasSnapshot = await getDocs(diplomasQuery);
        const diplomasList: Diploma[] = diplomasSnapshot.docs.map((diplomaDoc) => {
          const data = diplomaDoc.data();
          // Conversion systématique du Timestamp en Date
          const awardedAt = data.awardedAt instanceof Timestamp
            ? data.awardedAt.toDate()
            : data.awardedAt?.seconds
              ? new Date(data.awardedAt.seconds * 1000)
              : new Date();

          return {
            id: diplomaDoc.id,
            userId: data.userId || '',
            userName: data.userName,
            type: data.type || '',
            awardedAt,
            awardedBy: data.awardedBy || '',
            awardedByName: data.awardedByName || '',
          };
        });
        setDiplomas(diplomasList);

        setIsLoading(false);
      } catch (err: unknown) {
        setError(`Erreur lors du chargement des données : ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  // Filtrer les résultats
  const filteredResults = (): UserResult[] => {
    let filteredData = [...userResults];

    // Filtre par période
    if (filters.period !== 'all') {
      const now = new Date();
      let startDate: Date | null = null;
      let endDate: Date | null = null;

      switch (filters.period) {
        case 'day':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          break;
        case 'week':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay()) + 1);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
        case 'trimester':
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          endDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear() + 1, 0, 1);
          break;
      }

      if (startDate && endDate) {
        filteredData = filteredData.map((userResult) => ({
          ...userResult,
          results: userResult.results.filter((result) => {
            const resultDate = new Date(result.date);
            return resultDate >= startDate && resultDate <= endDate;
          }),
        }));
      }
    }

    // Filtre par exercice
    if (filters.exercise) {
      filteredData = filteredData.map((userResult) => ({
        ...userResult,
        results: userResult.results.filter((result) => result.exerciseId === filters.exercise),
      }));
    }

    // Filtre par type d'exercice
    if (filters.exerciseType) {
      filteredData = filteredData.map((userResult) => ({
        ...userResult,
        results: userResult.results.filter((result) =>
          result.exerciseName.toLowerCase().includes(filters.exerciseType?.toLowerCase() || '')
        ),
      }));
    }

    // Filtre par utilisateur
    if (filters.user) {
      filteredData = filteredData.filter((userResult) => userResult.id === filters.user);
    }

    // Filtre par groupe
    if (filters.group) {
      const group = groups.find((g) => g.id === filters.group);
      if (group) {
        filteredData = filteredData.filter((userResult) => group.students.includes(userResult.id));
      }
    }

    // Filtre par couleur de bloc
    if (filters.boulderColor) {
      filteredData = filteredData.map((userResult) => ({
        ...userResult,
        results: userResult.results.filter((result) => result.boulderColor === filters.boulderColor),
      }));
    }

    return filteredData.filter((userResult) => userResult.results.length > 0);
  };

  // Attribuer un badge à un utilisateur
  const awardBadgeToUser = async (userId: string, badgeId: string): Promise<void> => {
    if (!user) return;

    const newClientBadgeId = `${userId}_${badgeId}_${Date.now()}`;
    await setDoc(doc(db, 'client_badges', newClientBadgeId), {
      userId: userId,
      badgeId: badgeId,
      awardedAt: serverTimestamp(),
      awardedBy: user.uid,
      awardedByName: user.displayName || user.email?.split('@')[0] || user.uid,
    });

    // Mise à jour locale
    setClientBadges((prev) => [
      ...prev,
      {
        id: newClientBadgeId,
        userId,
        badgeId,
        awardedAt: new Date(),
        awardedBy: user.uid,
        awardedByName: user.displayName || user.email?.split('@')[0] || user.uid,
      },
    ]);
  };

  // Attribuer un badge manuellement
  const handleManualAwardBadge = (userId: string, userName: string): void => {
    setSelectedResult({
      userId,
      exerciseId: '',
      exerciseName: `Badge manuel pour ${userName}`,
      boulderColor: undefined,
    });
    setOpenManualBadgeDialog(true);
  };

  // Confirmer l'attribution manuelle d'un badge
  const confirmManualAwardBadge = async (): Promise<void> => {
    if (!selectedResult || !selectedBadgeId || !user) return;

    try {
      await awardBadgeToUser(selectedResult.userId, selectedBadgeId);
      setSuccess(`Badge attribué manuellement à ${selectedResult.exerciseName.split(' pour ')[1]} !`);
      setOpenManualBadgeDialog(false);
    } catch (err: unknown) {
      setError(`Erreur lors de l'attribution du badge : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Attribuer un diplôme
  const handleAwardDiploma = (userId: string, userName: string): void => {
    setSelectedClientForDiploma({ id: userId, name: userName });
    setOpenDiplomaDialog(true);
  };

  // Confirmer l'attribution d'un diplôme
  const confirmAwardDiploma = async (): Promise<void> => {
    if (!selectedClientForDiploma || !selectedDiplomaType || !user) return;

    try {
      const diplomaId = `diploma_${selectedClientForDiploma.id}_${selectedDiplomaType.replace(/\s+/g, '_')}_${Date.now()}`;
      await setDoc(doc(db, 'diplomas', diplomaId), {
        userId: selectedClientForDiploma.id,
        type: selectedDiplomaType,
        awardedAt: serverTimestamp(),
        awardedBy: user.uid,
        awardedByName: user.displayName || user.email?.split('@')[0] || user.uid,
      });

      setSuccess(`Diplôme "${selectedDiplomaType}" attribué à ${selectedClientForDiploma.name} !`);
      setOpenDiplomaDialog(false);
    } catch (err: unknown) {
      setError(`Erreur lors de l'attribution du diplôme : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Fermer les notifications
  const handleCloseSnackbar = (): void => {
    setError(null);
    setSuccess(null);
  };

  // Gestion des changements de filtres
  const handleFilterChange = (filterName: keyof typeof filters, value: string): void => {
    setFilters({ ...filters, [filterName]: value === '' ? undefined : value });
  };

  if (loadingAuth || isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Liste des exercices uniques
  const uniqueExercises: string[] = Array.from(
    new Set(userResults.flatMap((ur) => ur.results.map((r) => r.exerciseId)))
  ).filter((ex): ex is string => ex !== undefined);

  // Liste des types d'exercices uniques
  const uniqueExerciseTypes: string[] = Array.from(
    new Set(userResults.flatMap((ur) => ur.results.map((r) => r.exerciseName)))
  ).filter((type): type is string => type !== undefined);

  // Liste des couleurs de blocs uniques
  const uniqueBoulderColors: string[] = Array.from(
    new Set(boulders.map((b) => b.color).filter((color): color is string => color !== undefined))
  );

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Statistiques des exercices
        </Typography>

        {/* Filtres */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel>Période</InputLabel>
            <Select
              value={filters.period}
              onChange={(e: SelectChangeEvent<string>) => handleFilterChange('period', e.target.value)}
              label="Période"
            >
              <MenuItem value="day">Aujourd'hui</MenuItem>
              <MenuItem value="week">Cette semaine</MenuItem>
              <MenuItem value="month">Ce mois</MenuItem>
              <MenuItem value="trimester">Ce trimestre</MenuItem>
              <MenuItem value="year">Cette année</MenuItem>
              <MenuItem value="all">Toutes périodes</MenuItem>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Exercice</InputLabel>
            <Select
              value={filters.exercise || ''}
              onChange={(e: SelectChangeEvent<string>) => handleFilterChange('exercise', e.target.value)}
              label="Exercice"
            >
              <MenuItem value="">Tous</MenuItem>
              {uniqueExercises.map((exercise) => (
                <MenuItem key={exercise} value={exercise}>
                  {exercise}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Type d'exercice</InputLabel>
            <Select
              value={filters.exerciseType || ''}
              onChange={(e: SelectChangeEvent<string>) => handleFilterChange('exerciseType', e.target.value)}
              label="Type d'exercice"
            >
              <MenuItem value="">Tous</MenuItem>
              {uniqueExerciseTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Utilisateur</InputLabel>
            <Select
              value={filters.user || ''}
              onChange={(e: SelectChangeEvent<string>) => handleFilterChange('user', e.target.value)}
              label="Utilisateur"
            >
              <MenuItem value="">Tous</MenuItem>
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.displayName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Groupe</InputLabel>
            <Select
              value={filters.group || ''}
              onChange={(e: SelectChangeEvent<string>) => handleFilterChange('group', e.target.value)}
              label="Groupe"
            >
              <MenuItem value="">Tous</MenuItem>
              {groups.map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Couleur de bloc</InputLabel>
            <Select
              value={filters.boulderColor || ''}
              onChange={(e: SelectChangeEvent<string>) => handleFilterChange('boulderColor', e.target.value)}
              label="Couleur de bloc"
            >
              <MenuItem value="">Toutes</MenuItem>
              {uniqueBoulderColors.map((color) => (
                <MenuItem key={color} value={color}>
                  {color}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Tableau des résultats */}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Utilisateur</TableCell>
                <TableCell>Exercice</TableCell>
                <TableCell>Bloc</TableCell>
                <TableCell>Réussite</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Badge</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredResults().length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    Aucun résultat trouvé.
                  </TableCell>
                </TableRow>
              ) : (
                filteredResults().map((userResult) =>
                  userResult.results.map((result, index) => (
                    <TableRow key={`${userResult.id}-${result.exerciseId}-${index}`}>
                      <TableCell>{userResult.displayName}</TableCell>
                      <TableCell>{result.exerciseName}</TableCell>
                      <TableCell>
                        {result.boulderColor ? (
                          <Chip
                            label={result.boulderColor}
                            sx={{
                              backgroundColor: result.boulderColor,
                              color: ['noir', 'blanc'].includes(result.boulderColor) ? 'black' : 'white',
                            }}
                          />
                        ) : (
                          'N/A'
                        )}
                      </TableCell>
                      <TableCell>
                        {result.success ? (
                          <Chip label="Réussi" color="success" />
                        ) : (
                          <Chip label="Échoué" color="error" />
                        )}
                      </TableCell>
                      <TableCell>{formatDate(result.date)}</TableCell>
                      <TableCell>
                        {result.badgeAwarded ? (
                          <Chip label="Badge attribué" color="primary" />
                        ) : (
                          <Chip label="Aucun badge" color="default" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outlined"
                          color="secondary"
                          size="small"
                          onClick={() => handleManualAwardBadge(userResult.id, userResult.displayName)}
                        >
                          Attribuer un badge
                        </Button>
                        <Button
                          variant="outlined"
                          color="info"
                          size="small"
                          sx={{ ml: 1 }}
                          onClick={() => handleAwardDiploma(userResult.id, userResult.displayName)}
                        >
                          Attribuer un diplôme
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Dialogue pour attribuer un badge manuellement */}
        <Dialog open={openManualBadgeDialog} onClose={() => setOpenManualBadgeDialog(false)}>
          <DialogTitle>Attribuer un badge manuellement</DialogTitle>
          <DialogContent>
            <Typography>
              Attribuer un badge à {selectedResult?.exerciseName.split(' pour ')[1]} ?
            </Typography>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Badge</InputLabel>
              <Select
                value={selectedBadgeId || ''}
                onChange={(e: SelectChangeEvent<string>) => setSelectedBadgeId(e.target.value)}
                label="Badge"
              >
                {badges.map((badge) => (
                  <MenuItem key={badge.id} value={badge.id}>
                    {badge.name} ({badge.description})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenManualBadgeDialog(false)}>Annuler</Button>
            <Button onClick={confirmManualAwardBadge} color="primary">
              Confirmer
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialogue pour attribuer un diplôme */}
        <Dialog open={openDiplomaDialog} onClose={() => setOpenDiplomaDialog(false)}>
          <DialogTitle>Attribuer un diplôme</DialogTitle>
          <DialogContent>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Type de diplôme</InputLabel>
              <Select
                value={selectedDiplomaType}
                onChange={(e: SelectChangeEvent<string>) => setSelectedDiplomaType(e.target.value)}
                label="Type de diplôme"
              >
                {diplomaTypes.map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDiplomaDialog(false)}>Annuler</Button>
            <Button onClick={confirmAwardDiploma} color="primary">
              Attribuer
            </Button>
          </DialogActions>
        </Dialog>

        {/* Notifications */}
        <Snackbar
          open={!!error || !!success}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={handleCloseSnackbar} severity={error ? 'error' : 'success'} sx={{ width: '100%' }}>
            {error || success}
          </Alert>
        </Snackbar>
      </Paper>
    </Container>
  );
};

export default StatsList;