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
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

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
  }[];
}

interface Group {
  id: string;
  name: string;
  students: string[];
}

interface Course {
  id: string;
  title: string;
}

const StatsList: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'user' | 'group' | 'course'>('user');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<{ id: string; displayName: string; email?: string }[]>([]);
  const [openBadgeDialog, setOpenBadgeDialog] = useState(false);
  const [selectedResult, setSelectedResult] = useState<{
    userId: string;
    exerciseId: string;
    exerciseName: string;
  } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Charger les utilisateurs
        const usersQuery = query(collection(db, 'users'));
        const usersSnapshot = await getDocs(usersQuery);
        const usersList = usersSnapshot.docs.map((doc) => ({
          id: doc.id,
          displayName: doc.data().displayName || doc.data().email?.split('@')[0] || doc.id,
          email: doc.data().email || '',
        }));
        setUsers(usersList);

        // Charger les groupes
        const groupsQuery = query(collection(db, 'Groups'), where('moniteurId', '==', user.uid));
        const groupsSnapshot = await getDocs(groupsQuery);
        const groupsList = groupsSnapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name,
          students: doc.data().students || [],
        }));
        setGroups(groupsList);

        // Charger les séances
        const coursesQuery = query(collection(db, 'courses'), where('createdBy', '==', user.uid));
        const coursesSnapshot = await getDocs(coursesQuery);
        const coursesList = coursesSnapshot.docs.map((doc) => ({
          id: doc.id,
          title: doc.data().title,
        }));
        setCourses(coursesList);

        // Charger les résultats
        const resultsQuery = query(collection(db, 'client_course_results'));
        const resultsSnapshot = await getDocs(resultsQuery);
        const resultsData: UserResult[] = [];

        resultsSnapshot.forEach((doc) => {
          const data = doc.data();
          const userResult = resultsData.find((ur) => ur.id === data.userId);
          if (userResult) {
            userResult.results.push({
              exerciseId: data.exerciseId,
              exerciseName: data.exerciseName || 'Exercice inconnu',
              success: data.success || false,
              date: data.date?.toDate() || new Date(),
              badgeAwarded: data.badgeAwarded || false,
              courseId: data.courseId || '',
            });
          } else {
            resultsData.push({
              id: data.userId,
              displayName: usersList.find((u) => u.id === data.userId)?.displayName || 'Utilisateur inconnu',
              email: usersList.find((u) => u.id === data.userId)?.email || '',
              results: [
                {
                  exerciseId: data.exerciseId,
                  exerciseName: data.exerciseName || 'Exercice inconnu',
                  success: data.success || false,
                  date: data.date?.toDate() || new Date(),
                  badgeAwarded: data.badgeAwarded || false,
                  courseId: data.courseId || '',
                },
              ],
            });
          }
        });

        setUserResults(resultsData);
        setIsLoading(false);
      } catch (err) {
        setError(`Erreur lors du chargement des statistiques : ${err}`);
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleAwardBadge = (userId: string, exerciseId: string, exerciseName: string) => {
    setSelectedResult({ userId, exerciseId, exerciseName });
    setOpenBadgeDialog(true);
  };

  const confirmAwardBadge = async () => {
    if (!selectedResult || !user) return;

    if (!selectedResult.userId || !selectedResult.exerciseId) {
      setError('Données manquantes pour attribuer le badge.');
      setOpenBadgeDialog(false);
      return;
    }

    try {
      const badgeId = `${selectedResult.userId}_${selectedResult.exerciseId}`;
      await setDoc(doc(db, 'client_badges', badgeId), {
        userId: selectedResult.userId,
        exerciseId: selectedResult.exerciseId,
        exerciseName: selectedResult.exerciseName,
        awardedAt: serverTimestamp(),
        awardedBy: user.uid,
      });

      setSuccess('Badge attribué avec succès !');
      setOpenBadgeDialog(false);
    } catch (err) {
      setError(`Erreur lors de l'attribution du badge : ${err}`);
    }
  };

  const filteredResults = () => {
    if (filter === 'user' && selectedUser) {
      return userResults.filter((ur) => ur.id === selectedUser);
    } else if (filter === 'group' && selectedGroup) {
      const group = groups.find((g) => g.id === selectedGroup);
      if (!group) return [];
      return userResults.filter((ur) => group.students.includes(ur.id));
    } else if (filter === 'course' && selectedCourse) {
      return userResults.filter((ur) =>
        ur.results.some((r) => r.courseId === selectedCourse)
      );
    }
    return userResults;
  };

  const handleCloseSnackbar = () => {
    setError(null);
    setSuccess(null);
  };

  if (loadingAuth || isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Statistiques des exercices
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel>Trier par</InputLabel>
            <Select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as 'user' | 'group' | 'course');
                setSelectedUser('');
                setSelectedGroup('');
                setSelectedCourse('');
              }}
              label="Trier par"
            >
              <MenuItem value="user">Utilisateur</MenuItem>
              <MenuItem value="group">Groupe</MenuItem>
              <MenuItem value="course">Séance</MenuItem>
            </Select>
          </FormControl>

          {filter === 'user' && (
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Utilisateur</InputLabel>
              <Select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
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
          )}

          {filter === 'group' && (
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Groupe</InputLabel>
              <Select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
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
          )}

          {filter === 'course' && (
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Séance</InputLabel>
              <Select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                label="Séance"
              >
                <MenuItem value="">Toutes</MenuItem>
                {courses.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Utilisateur</TableCell>
                <TableCell>Exercice</TableCell>
                <TableCell>Réussite</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Badge</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredResults().length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
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
                        {result.success ? (
                          <Chip label="Réussi" color="success" />
                        ) : (
                          <Chip label="Échoué" color="error" />
                        )}
                      </TableCell>
                      <TableCell>{result.date.toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell>
                        {result.badgeAwarded ? (
                          <Chip label="Badge attribué" color="primary" />
                        ) : (
                          <Chip label="Aucun badge" color="default" />
                        )}
                      </TableCell>
                      <TableCell>
                        {!result.badgeAwarded && (
                          <Button
                            variant="outlined"
                            color="primary"
                            size="small"
                            onClick={() =>
                              handleAwardBadge(userResult.id, result.exerciseId, result.exerciseName)
                            }
                          >
                            Attribuer un badge
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog
          open={openBadgeDialog}
          onClose={() => setOpenBadgeDialog(false)}
        >
          <DialogTitle>Attribuer un badge</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir attribuer un badge pour l'exercice "{selectedResult?.exerciseName}" ?
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenBadgeDialog(false)}>Annuler</Button>
            <Button onClick={confirmAwardBadge} color="primary" variant="contained">
              Confirmer
            </Button>
          </DialogActions>
        </Dialog>

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