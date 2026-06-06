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
  FormControl,
  FormLabel,
  Snackbar,
  Alert,
  Autocomplete,
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
  const [selectedClientUids, setSelectedClientUids] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Charger les clients
  useEffect(() => {
    if (!user) return;

    const fetchClients = async () => {
      try {
        const usersQuery = query(collection(db, 'users'));
        const querySnapshot = await getDocs(usersQuery);
        const clients: User[] = [];
        querySnapshot.forEach((doc) => {
          clients.push({
            uid: doc.id,
            displayName: doc.data().displayName || doc.data().email?.split('@')[0] || doc.id,
            email: doc.data().email || '',
          });
        });
        setAllClients(clients);
        setIsLoading(false);
      } catch (err) {
        setError(`Erreur lors du chargement des clients : ${err}`);
        setIsLoading(false);
      }
    };

    fetchClients();
  }, [user]);

  // Charger le groupe existant (si mode edit)
  useEffect(() => {
    if (!user || mode !== 'edit' || !groupId || allClients.length === 0) return;

    const fetchGroup = async () => {
      try {
        const docRef = doc(db, 'Groups', groupId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setGroup({
            id: docSnap.id,
            name: data.name || '',
            description: data.description || '',
            createdBy: data.createdBy,
            createdAt: data.createdAt?.toDate() || new Date(),
            students: data.students || [],
            moniteurId: data.moniteurId,
          });
          setSelectedClientUids(data.students || []);
        }
      } catch (err) {
        setError(`Erreur lors du chargement du groupe : ${err}`);
      }
    };

    fetchGroup();
  }, [user, mode, groupId, allClients.length]);

  // Gérer la sélection des clients
  const handleClientChange = (newValue: User[]) => {
    setSelectedClientUids(newValue.map(client => client.uid));
  };

  // Soumission du formulaire
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (selectedClientUids.length === 0) {
      setError('Veuillez sélectionner au moins un client.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const groupData = {
        name: group.name,
        description: group.description,
        createdBy: user.uid,
        createdAt: new Date(),
        students: selectedClientUids,
        moniteurId: user.uid,
      };

      if (mode === 'edit' && groupId) {
        await updateDoc(doc(db, 'Groups', groupId), groupData);
        setSuccess('Groupe mis à jour avec succès !');
      } else {
        await addDoc(collection(db, 'Groups'), groupData);
        setSuccess('Groupe créé avec succès !');
      }

      setTimeout(() => navigate('/moniteur/groups'), 1500);
    } catch (err) {
      setError(`Erreur lors de l'enregistrement : ${err}`);
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
            <FormLabel>Clients *</FormLabel>
            <Autocomplete
              multiple
              options={allClients}
              getOptionLabel={(option: User) => `${option.displayName} (${option.email})`}
              value={allClients.filter((client: User) => selectedClientUids.includes(client.uid))}
              onChange={(_: React.SyntheticEvent, newValue: User[]) => handleClientChange(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  variant="outlined"
                  placeholder="Sélectionnez les clients"
                  required
                  error={selectedClientUids.length === 0}
                  helperText={selectedClientUids.length === 0 ? 'Veuillez sélectionner au moins un client' : ''}
                />
              )}
              filterSelectedOptions
              isOptionEqualToValue={(option: User, value: User) => option.uid === value.uid}
              sx={{ width: '100%' }}
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
              disabled={isSubmitting || !group.name || selectedClientUids.length === 0}
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
        <Alert onClose={handleCloseSnackbar} severity={error ? 'error' : 'success'} sx={{ width: '100%' }}>
          {error || success}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default GroupForm;