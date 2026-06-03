import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import {
  Container,
  Typography,
  Box,
  Paper,
  TextField,
  Button,
  CircularProgress,
  Autocomplete,
  Chip,
  FormControl,
  FormLabel,
  Snackbar,
  Alert,
  AutocompleteRenderInputParams,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';

interface Group {
  id?: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: Date;
  students: string[];
  moniteurId: string;
}

interface User {
  uid: string;
  displayName: string;
  email: string;
}

const GroupForm: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const { mode, groupId } = useParams<{ mode: string; groupId?: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group>({
    name: '',
    description: '',
    createdBy: user?.uid || '',
    createdAt: new Date(),
    students: [],
    moniteurId: user?.uid || '',
  });
  const [allClients, setAllClients] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchClients = async () => {
      try {
        const usersQuery = query(
          collection(db, 'users'),
          where('role', '==', 'client')
        );
        const querySnapshot = await getDocs(usersQuery);
        const clients: User[] = [];
        querySnapshot.forEach((doc) => {
          clients.push({
            uid: doc.id,
            displayName: doc.data().displayName || doc.data().email || doc.id,
            email: doc.data().email || '',
          });
        });
        setAllClients(clients);
      } catch (err) {
        setError(`Erreur lors du chargement des clients : ${err}`);
      }
    };

    const fetchGroup = async () => {
      if (mode !== 'edit' || !groupId) {
        setIsLoading(false);
        return;
      }

      try {
        const docRef = doc(db, 'groups', groupId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setGroup({
            id: docSnap.id,
            ...docSnap.data(),
            createdAt: docSnap.data().createdAt?.toDate() || new Date(),
          } as Group);
        }
      } catch (err) {
        setError(`Erreur lors du chargement du groupe : ${err}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClients();
    fetchGroup();
  }, [user, mode, groupId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const groupData = {
        name: group.name,
        description: group.description,
        createdBy: user.uid,
        createdAt: group.createdAt || new Date(),
        students: group.students,
        moniteurId: user.uid,
      };

      if (mode === 'edit' && groupId) {
        await updateDoc(doc(db, 'groups', groupId), groupData);
        setSuccess('Groupe mis à jour avec succès !');
      } else {
        await addDoc(collection(db, 'groups'), groupData);
        setSuccess('Groupe créé avec succès !');
      }

      setTimeout(() => {
        navigate('/moniteur/groups');
      }, 1500);
    } catch (err) {
      setError(`Erreur lors de l'enregistrement : ${err}`);
    } finally {
      setIsSubmitting(false);
    }
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
    <Container maxWidth="md">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          {mode === 'edit' ? 'Modifier le groupe' : 'Nouveau groupe'}
        </Typography>

        <form onSubmit={handleSubmit}>
          <FormControl fullWidth margin="normal">
            <FormLabel>Nom du groupe *</FormLabel>
            <TextField
              name="name"
              value={group.name}
              onChange={(e) => setGroup({ ...group, name: e.target.value })}
              required
              variant="outlined"
              placeholder="Ex: Groupe Débutants Lundi 18h"
            />
          </FormControl>

          <FormControl fullWidth margin="normal">
            <FormLabel>Description</FormLabel>
            <TextField
              name="description"
              value={group.description}
              onChange={(e) => setGroup({ ...group, description: e.target.value })}
              variant="outlined"
              multiline
              rows={4}
              placeholder="Description du groupe..."
            />
          </FormControl>

          <FormControl fullWidth margin="normal">
            <FormLabel>Élèves *</FormLabel>
            <Autocomplete
              multiple
              options={allClients}
              getOptionLabel={(option: User) => `${option.displayName} (${option.email})`}
              value={allClients.filter((client) => group.students.includes(client.uid))}
              onChange={(_, newValue: User[]) => {
                setGroup({
                  ...group,
                  students: newValue.map((client) => client.uid),
                });
              }}
              renderInput={(params: AutocompleteRenderInputParams) => (
                <TextField
                  {...params}
                  variant="outlined"
                  placeholder="Sélectionnez les élèves"
                  required
                />
              )}
              filterSelectedOptions
            />
          </FormControl>

          <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
            <Button
              type="button"
              variant="outlined"
              onClick={() => navigate('/moniteur/groups')}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isSubmitting || !group.name || group.students.length === 0}
            >
              {isSubmitting ? <CircularProgress size={24} /> : mode === 'edit' ? 'Mettre à jour' : 'Créer'}
            </Button>
          </Box>
        </form>
      </Paper>

      <Snackbar
        open={!!error || !!success}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={error ? 'error' : 'success'}
          sx={{ width: '100%' }}
        >
          {error || success}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default GroupForm;