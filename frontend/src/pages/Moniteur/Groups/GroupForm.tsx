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
  inscritAuxCours?: boolean; // ✅ Champ ajouté pour le filtre
}

const GroupForm: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const { groupId } = useParams<{ groupId?: string }>();
  const isEditMode = !!groupId;
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
  const [selectedClients, setSelectedClients] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Charger tous les clients (filtrés : inscritAuxCours === true)
  useEffect(() => {
    if (!user) return;

    const fetchClients = async () => {
      try {
        const usersQuery = query(collection(db, 'users'));
        const querySnapshot = await getDocs(usersQuery);
        const clients: User[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // ✅ Filtrer : seuls les clients avec inscritAuxCours === true
          // Le champ "rôle client" existe sous deux formes selon les documents
          // (tableau `roles` ou champ `role` simple) : on vérifie les deux pour éviter
          // d'exclure des clients par erreur si l'un des deux schémas est utilisé.
          const isClient = data.roles?.includes('client') || data.role === 'client';
          if (data.inscritAuxCours === true && isClient) {
            clients.push({
              uid: doc.id,
              displayName: `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.email?.split('@')[0] || doc.id,
              email: data.email || '',
            });
          }
        });
        setAllClients(clients);
      } catch (err) {
        setError(`Erreur lors du chargement des clients : ${err}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClients();
  }, [user]);

  // Charger le groupe existant si on est en mode édition
  useEffect(() => {
    if (!user || !isEditMode || !groupId || allClients.length === 0) return;

    const fetchGroup = async () => {
      try {
        const docRef = doc(db, 'Groups', groupId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const studentIds: string[] = data.students || [];

          setGroup({
            id: docSnap.id,
            name: data.name || '',
            description: data.description || '',
            createdBy: data.createdBy,
            createdAt: data.createdAt?.toDate() || new Date(),
            students: studentIds,
            moniteurId: data.moniteurId,
          });

          const preSelected = allClients.filter((c) => studentIds.includes(c.uid));
          setSelectedClients(preSelected);
        }
      } catch (err) {
        setError(`Erreur lors du chargement du groupe : ${err}`);
      }
    };

    fetchGroup();
  }, [user, isEditMode, groupId, allClients]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (selectedClients.length === 0) {
      setError('Veuillez sélectionner au moins un client.');
      return;
    }

    if (!group.name.trim()) {
      setError('Veuillez renseigner le nom du groupe.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const groupData = {
        name: group.name.trim(),
        description: group.description.trim(),
        createdBy: user.uid,
        createdAt: isEditMode ? group.createdAt : new Date(),
        students: selectedClients.map((c) => c.uid),
        moniteurId: user.uid,
      };

      if (isEditMode && groupId) {
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
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: { xs: 2, sm: 3 } }}>
        <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
          {isEditMode ? 'Modifier le groupe' : 'Nouveau groupe'}
        </Typography>

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <FormControl fullWidth margin="normal">
            <FormLabel>Nom du groupe *</FormLabel>
            <TextField
              name="name"
              value={group.name}
              onChange={(e) => setGroup({ ...group, name: e.target.value })}
              variant="outlined"
              placeholder="Ex: Groupe Débutants Lundi 18h"
              error={!group.name.trim() && isSubmitting}
              helperText={!group.name.trim() && isSubmitting ? 'Ce champ est obligatoire' : ''}
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
            {allClients.length === 0 ? (
              <Typography color="error" sx={{ mt: 1 }}>
                Aucun client inscrit aux cours disponible. Impossible de créer un groupe.
              </Typography>
            ) : (
              <Autocomplete
                multiple
                options={allClients}
                value={selectedClients}
                getOptionLabel={(option) => `${option.displayName} (${option.email})`}
                onChange={(_event, newValue: User[]) => {
                  setSelectedClients(newValue);
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    variant="outlined"
                    placeholder={selectedClients.length === 0 ? 'Sélectionnez les clients' : ''}
                    error={selectedClients.length === 0 && isSubmitting}
                    helperText={
                      selectedClients.length === 0 && isSubmitting
                        ? 'Veuillez sélectionner au moins un client'
                        : ''
                    }
                  />
                )}
                filterSelectedOptions
                isOptionEqualToValue={(option, value) => option.uid === value.uid}
                noOptionsText="Aucun client inscrit aux cours trouvé"
                sx={{ width: '100%' }}
              />
            )}
          </FormControl>

          <Box
            sx={{
              mt: 4,
              display: 'flex',
              flexDirection: { xs: 'column-reverse', sm: 'row' },
              gap: 2,
            }}
          >
            <Button
              type="button"
              variant="outlined"
              onClick={() => navigate('/moniteur/groups')}
              disabled={isSubmitting}
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isSubmitting || allClients.length === 0} // ✅ Désactiver si aucun client disponible
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              {isSubmitting
                ? <CircularProgress size={24} />
                : isEditMode ? 'Mettre à jour' : 'Créer'}
            </Button>
          </Box>
        </Box>
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