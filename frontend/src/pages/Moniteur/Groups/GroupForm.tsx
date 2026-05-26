import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography, Paper, Container, Button, Box,
  TextField, FormControl, InputLabel, Select, MenuItem,
  Checkbox, ListItemText, OutlinedInput, Chip
} from '@mui/material';
import { collection, query, getDocs, doc, addDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { useAuth } from '../../../context/AuthContext';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface MoniteurGroup {
  id: string;
  name: string;
  moniteur_id: string;
  client_ids: string[];
}

export default function GroupForm(): JSX.Element {
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId?: string }>();
  const { currentUser } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [formData, setFormData] = useState<{
    name: string;
    selectedClients: string[];
  }>({
    name: '',
    selectedClients: []
  });

  useEffect(() => {
    const fetchClients = async (): Promise<void> => {
      try {
        const q = query(collection(db, 'clients'));
        const snapshot = await getDocs(q);
        setClients(snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Client[]);
      } catch (error: unknown) {
        console.error('Erreur lors du chargement des clients :', error);
      }
    };
    fetchClients();
  }, []);

  useEffect(() => {
    if (!groupId) return;
    const fetchGroup = async (): Promise<void> => {
      try {
        const docSnap = await getDoc(doc(db, 'moniteur_groups', groupId));
        if (docSnap.exists()) {
          const data = docSnap.data() as MoniteurGroup;
          setFormData({
            name: data.name,
            selectedClients: data.client_ids || []
          });
        }
      } catch (error: unknown) {
        console.error('Erreur lors du chargement du groupe :', error);
      }
    };
    fetchGroup();
  }, [groupId]);

  const handleSubmit = async (): Promise<void> => {
    if (!formData.name) {
      alert('Veuillez donner un nom au groupe.');
      return;
    }
    if (formData.selectedClients.length === 0) {
      alert('Veuillez sélectionner au moins un client.');
      return;
    }

    try {
      const groupData = {
        name: formData.name,
        moniteur_id: currentUser?.uid,
        client_ids: formData.selectedClients,
        created_at: groupId ? new Date().toISOString() : new Date().toISOString()
      };

      if (groupId) {
        await updateDoc(doc(db, 'moniteur_groups', groupId), groupData);
      } else {
        await addDoc(collection(db, 'moniteur_groups'), groupData);
      }
      navigate('/moniteur/groups');
    } catch (error: unknown) {
      console.error('Erreur lors de la sauvegarde :', error);
      alert(`Une erreur est survenue : ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h5" gutterBottom>
          {groupId ? 'Modifier le groupe' : 'Créer un nouveau groupe'}
        </Typography>

        <Box component="form" sx={{ mt: 2 }}>
          <TextField
            label="Nom du groupe"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            fullWidth
            margin="normal"
            required
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>Sélectionner les clients</InputLabel>
            <Select
              multiple
              value={formData.selectedClients}
              onChange={(e) => setFormData({
                ...formData,
                selectedClients: e.target.value as string[]
              })}
              input={<OutlinedInput label="Sélectionner les clients" />}
              renderValue={(selected: string[]) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((id: string) => {
                    const client = clients.find(c => c.id === id);
                    return client ? (
                      <Chip
                        key={id}
                        label={`${client.first_name} ${client.last_name}`}
                      />
                    ) : null;
                  })}
                </Box>
              )}
            >
              {clients.map((client: Client) => (
                <MenuItem key={client.id} value={client.id}>
                  <Checkbox
                    checked={formData.selectedClients.indexOf(client.id) > -1}
                  />
                  <ListItemText primary={`${client.first_name} ${client.last_name}`} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSubmit}
            >
              {groupId ? 'Modifier' : 'Créer'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate('/moniteur/groups')}
            >
              Annuler
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}