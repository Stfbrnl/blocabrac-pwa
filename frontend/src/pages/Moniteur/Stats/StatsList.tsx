import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import {
  Container,
  Typography,
  Box,
  Paper,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Divider,
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface GroupStats {
  groupId: string;
  groupName: string;
  courseCount: number;
  participantCount: number;
}

interface CourseStats {
  courseId: string;
  title: string;
  participantCount: number;
  date: Date;
}

const StatsList: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [groupStats, setGroupStats] = useState<GroupStats[]>([]);
  const [courseStats, setCourseStats] = useState<CourseStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      try {
        // 1. Récupérer les groupes du moniteur
        const groupsQuery = query(
          collection(db, 'groups'),
          where('moniteurId', '==', user.uid)
        );
        const groupsSnapshot = await getDocs(groupsQuery);
        const groups = groupsSnapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name,
          students: doc.data().students || [],
        }));

        // 2. Calculer les stats par groupe
        const groupStatsPromises = groups.map(async (group) => {
          const coursesQuery = query(
            collection(db, 'courses'),
            where('groupId', '==', group.id)
          );
          const coursesSnapshot = await getDocs(coursesQuery);
          const courseCount = coursesSnapshot.size;

          let participantCount = 0;
          coursesSnapshot.forEach((courseDoc) => {
            participantCount += (courseDoc.data().Participants || []).length;
          });

          return {
            groupId: group.id,
            groupName: group.name,
            courseCount,
            participantCount,
          };
        });

        const resolvedGroupStats = await Promise.all(groupStatsPromises);
        setGroupStats(resolvedGroupStats);

        // 3. Récupérer les stats par séance
        const coursesQuery = query(
          collection(db, 'courses'),
          where('createdBy', '==', user.uid)
        );
        const coursesSnapshot = await getDocs(coursesQuery);
        const resolvedCourseStats = coursesSnapshot.docs.map((doc) => ({
          courseId: doc.id,
          title: doc.data().title,
          participantCount: (doc.data().Participants || []).length,
          date: doc.data().date?.toDate() || new Date(),
        }));
        setCourseStats(resolvedCourseStats);
      } catch (err) {
        setError(`Erreur lors du chargement des statistiques : ${err}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [user]);

  if (loadingAuth || isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Préparer les données pour le graphique
  const chartData = groupStats.map((stat) => ({
    name: stat.groupName,
    Séances: stat.courseCount,
    Participants: stat.participantCount,
  }));

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Statistiques
        </Typography>

        {error && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'error.main', color: 'white', borderRadius: 1 }}>
            {error}
          </Box>
        )}

        {/* Graphique : Séances et participants par groupe */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Séances et participants par groupe
          </Typography>
          <Box sx={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <ChartTooltip />
                <Legend />
                <Bar dataKey="Séances" fill="#3f51b5" name="Séances" />
                <Bar dataKey="Participants" fill="#4caf50" name="Participants" />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Tableau : Détails par groupe */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Détails par groupe
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Groupe</TableCell>
                  <TableCell>Séances</TableCell>
                  <TableCell>Participants</TableCell>
                  <TableCell>Moyenne</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groupStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      Aucun groupe trouvé.
                    </TableCell>
                  </TableRow>
                ) : (
                  groupStats.map((stat) => (
                    <TableRow key={stat.groupId}>
                      <TableCell>{stat.groupName}</TableCell>
                      <TableCell>{stat.courseCount}</TableCell>
                      <TableCell>{stat.participantCount}</TableCell>
                      <TableCell>
                        <Chip
                          label="Intermédiaire"
                          color="primary"
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Tableau : Séances les plus populaires */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Séances les plus populaires
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Titre</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Participants</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {courseStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      Aucune séance trouvée.
                    </TableCell>
                  </TableRow>
                ) : (
                  [...courseStats]
                    .sort((a, b) => b.participantCount - a.participantCount)
                    .slice(0, 5)
                    .map((stat) => (
                      <TableRow key={stat.courseId}>
                        <TableCell>{stat.title}</TableCell>
                        <TableCell>{stat.date.toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell>{stat.participantCount}</TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Paper>
    </Container>
  );
};

export default StatsList;