import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Paper, Container, Button, Box,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Chip, FormControl, InputLabel, Select, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Info as InfoIcon } from '@mui/icons-material';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { useAuth } from '../../../context/AuthContext';

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

export default function CoursesList(): JSX.Element {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<MoniteurGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const fetchData = async (): Promise<void> => {
      try {
        const groupsQuery = query(
          collection(db, 'moniteur_groups'),
          where('moniteur_id', '==', currentUser.uid)
        );
        const groupsSnapshot = await getDocs(groupsQuery);
        setGroups(groupsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as MoniteurGroup[]);

        const coursesQuery = query(
          collection(db, 'courses'),
          where('moniteur_id', '==', currentUser.uid)
        );
        const coursesSnapshot = await getDocs(coursesQuery);
        setCourses(coursesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Course[]);
      } catch (error: unknown) {
        console.error('Erreur lors du chargement :', error);
      }
    };
    fetchData();
  }, [currentUser?.uid]);

  const filteredCourses = selectedGroup === 'all'
    ? courses
    : courses.filter(course => course.group_id === selectedGroup);

  const handleDelete = async (courseId: string): Promise<void> => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce cours ?')) return;
    try {
      await deleteDoc(doc(db, 'courses', courseId));
      setCourses(courses.filter(c => c.id !== courseId));
      setOpenDeleteDialog(false);
    } catch (error: unknown) {
      console.error('Erreur lors de la suppression :', error);
      alert('Une erreur est survenue.');
    }
  };

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h5">Mes Cours</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/moniteur/courses/add')}
          >
            Ajouter un cours
          </Button>
        </Box>

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Filtrer par groupe</InputLabel>
          <Select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value as string)}
            label="Groupe"
          >
            <MenuItem value="all">Tous les cours</MenuItem>
            {groups.map((group: MoniteurGroup) => (
              <MenuItem key={group.id} value={group.id}>
                {group.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {filteredCourses.length > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nom</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Groupe</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCourses.map((course: Course) => (
                  <TableRow key={course.id}>
                    <TableCell>{course.name}</TableCell>
                    <TableCell>{new Date(course.date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {course.group_id ?
                        groups.find(g => g.id === course.group_id)?.name || 'Groupe supprimé'
                        : <Chip label="Individuel" size="small" color="info" />
                      }
                    </TableCell>
                    <TableCell>
                      <IconButton
                        color="primary"
                        onClick={() => navigate(`/moniteur/courses/edit/${course.id}`)}
                        title="Modifier"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        color="error"
                        onClick={() => {
                          setCourseToDelete(course.id);
                          setOpenDeleteDialog(true);
                        }}
                        title="Supprimer"
                      >
                        <DeleteIcon />
                      </IconButton>
                      {/* ✅ Bouton "Voir les détails" */}
                      <IconButton
                        color="info"
                        onClick={() => navigate(`/moniteur/courses/${course.id}`)}
                        title="Voir les détails"
                      >
                        <InfoIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography>Vous n'avez encore créé aucun cours.</Typography>
        )}

        <Dialog
          open={openDeleteDialog}
          onClose={() => setOpenDeleteDialog(false)}
        >
          <DialogTitle>Supprimer le cours</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir supprimer ce cours ? Cette action est irréversible.
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button onClick={() => handleDelete(courseToDelete!)} color="error">
              Supprimer
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Container>
  );
}