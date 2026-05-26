import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography, Paper, Container, Box, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, IconButton
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Edit as EditIcon } from '@mui/icons-material';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { useAuth } from '../../../context/AuthContext';

interface Exercise {
  id: string;
  name: string;
  description?: string;
  equipment_type?: string;
  equipment_number?: number;
  boulder_id?: string;
}

interface Course {
  id: string;
  name: string;
  moniteur_id: string;
  date: string;
  description?: string;
  group_id?: string;
  exercise_ids?: string[];
  max_participants?: number;
  difficulty?: string;
  is_active: boolean;
}

interface MoniteurGroup {
  id: string;
  name: string;
}

export default function CourseDetail(): JSX.Element {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const { currentUser } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [group, setGroup] = useState<MoniteurGroup | null>(null);

  useEffect(() => {
    if (!courseId || !currentUser?.uid) return;
    const fetchData = async (): Promise<void> => {
      try {
        const courseDoc = await getDoc(doc(db, 'courses', courseId));
        if (courseDoc.exists()) {
          setCourse({ id: courseDoc.id, ...courseDoc.data() } as Course);
          const courseData = courseDoc.data() as Course;

          if (courseData.exercise_ids && courseData.exercise_ids.length > 0) {
            const exercisesQuery = query(
              collection(db, 'exercises'),
              where('__name__', 'in', courseData.exercise_ids)
            );
            const exercisesSnapshot = await getDocs(exercisesQuery);
            setExercises(exercisesSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as Exercise[]);
          }

          if (courseData.group_id) {
            const groupDoc = await getDoc(doc(db, 'moniteur_groups', courseData.group_id));
            if (groupDoc.exists()) {
              setGroup({ id: groupDoc.id, ...groupDoc.data() } as MoniteurGroup);
            }
          }
        }
      } catch (error: unknown) {
        console.error('Erreur lors du chargement :', error);
      }
    };
    fetchData();
  }, [courseId, currentUser?.uid]);

  if (!course) {
    return (
      <Container maxWidth="md">
        <Typography>Chargement...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h5">Détails de la séance</Typography>
          <IconButton onClick={() => navigate('/moniteur/courses')}>
            <ArrowBackIcon />
          </IconButton>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6">{course.name}</Typography>
          <Typography>
            Date : {new Date(course.date).toLocaleString()}
          </Typography>
          {course.difficulty && (
            <Chip
              label={`Niveau : ${course.difficulty}`}
              color="primary"
              sx={{ mt: 1 }}
            />
          )}
          {group && (
            <Chip
              label={`Groupe : ${group.name}`}
              color="info"
              sx={{ mt: 1, ml: 1 }}
            />
          )}
          {course.max_participants && (
            <Typography sx={{ mt: 1 }}>
              Participants max : {course.max_participants}
            </Typography>
          )}
          {course.description && (
            <Typography sx={{ mt: 2 }}>{course.description}</Typography>
          )}
        </Box>

        <Typography variant="h6" sx={{ mb: 2 }}>
          Exercices ({exercises.length})
        </Typography>

        {exercises.length > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nom</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Équipement</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {exercises.map((exercise: Exercise) => (
                  <TableRow key={exercise.id}>
                    <TableCell>{exercise.name}</TableCell>
                    <TableCell>{exercise.description || '-'}</TableCell>
                    <TableCell>
                      {exercise.equipment_type ?
                        `${exercise.equipment_type} ${exercise.equipment_number || ''}`.trim() :
                        'Aucun'}
                      {exercise.boulder_id && (
                        <Chip
                          label={`Bloc lié : ${exercise.boulder_id}`}
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography>Aucun exercice lié à cette séance.</Typography>
        )}

        <Box sx={{ mt: 3 }}>
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => navigate(`/moniteur/courses/edit/${course.id}`)}
          >
            Modifier la séance
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}