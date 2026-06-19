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
  MenuItem,
  Snackbar,
  Alert,
  Autocomplete,
  IconButton,
  Tooltip,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';

interface Exercise {
  id?: string;
  name: string;
  description: string;
  difficulty: string;
  category: string;
  equipment?: string[];
  block?: string;
  createdBy: string;
  createdAt: Date;
  type: 'validation' | 'data';
  dataFields?: { label: string; type: 'number' | 'text' | 'time' }[];
}

interface Equipment {
  id?: string;
  name: string;
  description?: string;
  number?: number;
  type?: string;
}

const difficulties = ['Facile', 'Moyen', 'Difficile', 'Expert'];
const categories = ['Échauffement', 'Bloc', 'Plyométrie', 'Renforcement musculaire'];
const fieldTypes = ['number', 'text', 'time'];

const ExerciseForm: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const { exerciseId } = useParams<{ exerciseId?: string }>();
  const isEditMode = !!exerciseId;
  const navigate = useNavigate();

  const [exercise, setExercise] = useState<Exercise>({
    name: '',
    description: '',
    difficulty: 'Facile',
    category: 'Échauffement',
    type: 'data',
    createdBy: user?.uid || '',
    createdAt: new Date(),
  });

  const [equipmentOptions, setEquipmentOptions] = useState<Equipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [newEquipment, setNewEquipment] = useState<string>('');
  const [dataFields, setDataFields] = useState<{ label: string; type: 'number' | 'text' | 'time' }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchEquipment = async () => {
      try {
        const querySnapshot = await getDocs(query(collection(db, 'equipment')));
        const equipmentList: Equipment[] = [];
        querySnapshot.forEach((doc) => {
          equipmentList.push({ id: doc.id, ...doc.data() } as Equipment);
        });
        setEquipmentOptions(equipmentList);
        setIsLoading(false);
      } catch (err) {
        setError(`Erreur lors du chargement des équipements : ${err}`);
        setIsLoading(false);
      }
    };

    fetchEquipment();
  }, [user]);

  useEffect(() => {
    if (!user || !isEditMode || !exerciseId) return;

    const fetchExercise = async () => {
      try {
        const docRef = doc(db, 'exercises', exerciseId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setExercise({
            id: docSnap.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
          } as Exercise);
          setSelectedEquipment(data.equipment || []);
          setDataFields(data.dataFields || []);
        }
      } catch (err) {
        setError(`Erreur lors du chargement de l'exercice : ${err}`);
      }
    };

    fetchExercise();
  }, [user, isEditMode, exerciseId]);

  const handleAddEquipment = async () => {
    if (!newEquipment.trim()) return;

    const existingEquipment = equipmentOptions.find(eq => eq.name === newEquipment.trim());
    if (existingEquipment) {
      setSelectedEquipment([...selectedEquipment, newEquipment.trim()]);
      setNewEquipment('');
      return;
    }

    try {
      const newEquipmentDoc = {
        name: newEquipment.trim(),
        description: `Équipement ajouté via l'interface Moniteur`,
        number: equipmentOptions.length + 1,
        type: 'autre',
      };

      await addDoc(collection(db, 'equipment'), newEquipmentDoc);
      const updatedSnapshot = await getDocs(query(collection(db, 'equipment')));
      const updatedEquipmentList: Equipment[] = [];
      updatedSnapshot.forEach((doc) => {
        updatedEquipmentList.push({ id: doc.id, ...doc.data() } as Equipment);
      });
      setEquipmentOptions(updatedEquipmentList);
      setSelectedEquipment([...selectedEquipment, newEquipment.trim()]);
      setNewEquipment('');
    } catch (err) {
      setError(`Erreur lors de l'ajout de l'équipement : ${err}`);
    }
  };

  const handleAddDataField = () => {
    setDataFields([...dataFields, { label: '', type: 'number' }]);
  };

  const handleRemoveDataField = (index: number) => {
    const newFields = [...dataFields];
    newFields.splice(index, 1);
    setDataFields(newFields);
  };

  const handleUpdateDataField = (index: number, field: 'label' | 'type', value: string) => {
    const newFields = [...dataFields];
    newFields[index] = { ...newFields[index], [field]: value };
    setDataFields(newFields);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!exercise.name.trim()) {
      setError('Veuillez renseigner le nom de l\'exercice.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const exerciseData: any = {
        name: exercise.name.trim(),
        description: exercise.description,
        difficulty: exercise.difficulty,
        category: exercise.category,
        type: exercise.type,
        createdBy: user.uid,
        createdAt: isEditMode ? exercise.createdAt : new Date(),
      };

      if (selectedEquipment.length > 0) {
        exerciseData.equipment = selectedEquipment;
      }

      if (exercise.type === 'data' && dataFields.length > 0) {
        exerciseData.dataFields = dataFields;
      }

      if (isEditMode && exerciseId) {
        await updateDoc(doc(db, 'exercises', exerciseId), exerciseData);
        setSuccess('Exercice mis à jour avec succès !');
      } else {
        await addDoc(collection(db, 'exercises'), exerciseData);
        setSuccess('Exercice créé avec succès !');
      }

      setTimeout(() => navigate('/moniteur/exercises'), 1500);
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
          {isEditMode ? "Modifier l'exercice" : 'Nouvel exercice'}
        </Typography>

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <FormControl fullWidth margin="normal">
            <FormLabel>Type d'exercice *</FormLabel>
            <TextField
              select
              value={exercise.type}
              onChange={(e) => setExercise({ ...exercise, type: e.target.value as 'validation' | 'data' })}
              variant="outlined"
            >
              <MenuItem value="data">Données personnalisées (ex: nombre de tractions)</MenuItem>
              <MenuItem value="validation">Validation (réussi/échoué)</MenuItem>
            </TextField>
          </FormControl>

          <FormControl fullWidth margin="normal">
            <FormLabel>Nom *</FormLabel>
            <TextField
              name="name"
              value={exercise.name}
              onChange={(e) => setExercise({ ...exercise, name: e.target.value })}
              variant="outlined"
              placeholder="Ex: Traction à une main"
              error={!exercise.name.trim() && isSubmitting}
              helperText={!exercise.name.trim() && isSubmitting ? 'Ce champ est obligatoire' : ''}
            />
          </FormControl>

          <FormControl fullWidth margin="normal">
            <FormLabel>Description</FormLabel>
            <TextField
              name="description"
              value={exercise.description}
              onChange={(e) => setExercise({ ...exercise, description: e.target.value })}
              variant="outlined"
              multiline
              rows={4}
              placeholder="Description détaillée de l'exercice..."
            />
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth margin="normal">
              <FormLabel>Difficulté *</FormLabel>
              <TextField
                select
                value={exercise.difficulty}
                onChange={(e) => setExercise({ ...exercise, difficulty: e.target.value })}
                variant="outlined"
              >
                {difficulties.map((d) => (
                  <MenuItem key={d} value={d}>{d}</MenuItem>
                ))}
              </TextField>
            </FormControl>
            <FormControl fullWidth margin="normal">
              <FormLabel>Catégorie *</FormLabel>
              <TextField
                select
                value={exercise.category}
                onChange={(e) => setExercise({ ...exercise, category: e.target.value })}
                variant="outlined"
              >
                {categories.map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </TextField>
            </FormControl>
          </Box>

          <FormControl fullWidth margin="normal">
            <FormLabel>Équipements</FormLabel>
            {equipmentOptions.length === 0 ? (
              <Typography color="textSecondary" sx={{ mt: 1 }}>
                Aucun équipement disponible. Ajoutez-en un ci-dessous.
              </Typography>
            ) : (
              <>
                <Autocomplete
                  multiple
                  freeSolo
                  options={equipmentOptions.map(eq => eq.name)}
                  value={selectedEquipment}
                  onChange={(_event, newValue: string[]) => {
                    setSelectedEquipment(newValue);
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      variant="outlined"
                      placeholder="Ajoutez un ou plusieurs équipements"
                    />
                  )}
                  filterSelectedOptions
                  sx={{ width: '100%' }}
                />
                {newEquipment.trim() && !equipmentOptions.some(eq => eq.name === newEquipment.trim()) && (
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleAddEquipment}
                    sx={{ mt: 1 }}
                  >
                    Ajouter "{newEquipment}" aux équipements
                  </Button>
                )}
              </>
            )}
          </FormControl>

          {exercise.category === 'Bloc' && (
            <FormControl fullWidth margin="normal">
              <FormLabel>Description du bloc</FormLabel>
              <TextField
                value={exercise.block || ''}
                onChange={(e) => setExercise({ ...exercise, block: e.target.value })}
                variant="outlined"
                multiline
                rows={3}
                placeholder="Description spécifique pour les blocs..."
              />
            </FormControl>
          )}

          {exercise.type === 'data' && (
            <FormControl fullWidth margin="normal">
              <FormLabel>Champs de données personnalisées</FormLabel>
              {dataFields.length === 0 ? (
                <Typography color="textSecondary" sx={{ mt: 1 }}>
                  Aucun champ défini. Ajoutez-en un pour collecter des données spécifiques.
                </Typography>
              ) : (
                <Box sx={{ mt: 1 }}>
                  {dataFields.map((field, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                      <TextField
                        label="Nom du champ"
                        value={field.label}
                        onChange={(e) => handleUpdateDataField(index, 'label', e.target.value)}
                        variant="outlined"
                        fullWidth
                        placeholder="Ex: Nombre de tractions"
                      />
                      <TextField
                        select
                        label="Type"
                        value={field.type}
                        onChange={(e) => handleUpdateDataField(index, 'type', e.target.value as 'number' | 'text' | 'time')}
                        variant="outlined"
                        sx={{ minWidth: 120 }}
                      >
                        {fieldTypes.map((type) => (
                          <MenuItem key={type} value={type}>
                            {type === 'number' ? 'Nombre' : type === 'time' ? 'Temps' : 'Texte'}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Tooltip title="Supprimer ce champ">
                        <IconButton
                          color="error"
                          onClick={() => handleRemoveDataField(index)}
                          sx={{ height: '40px', width: '40px' }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                </Box>
              )}
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleAddDataField}
                sx={{ mt: 1 }}
              >
                Ajouter un champ
              </Button>
            </FormControl>
          )}

          <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
            <Button
              type="button"
              variant="outlined"
              onClick={() => navigate('/moniteur/exercises')}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? <CircularProgress size={24} /> : isEditMode ? 'Mettre à jour' : 'Créer'}
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
        <Alert onClose={handleCloseSnackbar} severity={error ? 'error' : 'success'} sx={{ width: '100%' }}>
          {error || success}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default ExerciseForm;