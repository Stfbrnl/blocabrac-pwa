import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import {
  Button,
  Typography,
  Container,
  Box,
  Card,
  CardContent,
  CardMedia,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../services/firebaseConfig';

const levelColors: Record<string, string> = {
  jaune: '#FFFF00',
  vert: '#00FF00',
  bleu: '#0000FF',
  violet: '#800080',
  rouge: '#FF0000',
  noir: '#000000',
  blanc: '#FFFFFF',
  rose: '#FFC0CB',
};

const wallSections = [
  'Grotte Adultes', 'Güllich', 'Réta Adultes', 'Grande Face',
  'Dévers à 15°', 'Dévers à 30°', 'Dévers à 40°',
  'Caverne des petits', 'Réta d\'initiation'
];

export default function Ouvreur() {
  const [user, loading] = useAuthState(auth);
  const [boulders, setBoulders] = useState<any[]>([]);
  const [selectedWall, setSelectedWall] = useState<string>(wallSections[0]);
  const [difficulty, setDifficulty] = useState<string>('bleu');
  const [constraints, setConstraints] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      fetchBoulders();
    }
  }, [user, loading]);

  const fetchBoulders = async () => {
    try {
      const { data, error: supabaseError } = await supabase
        .from('boulders')
        .select('*')
        .order('id', { ascending: false });

      if (supabaseError) throw supabaseError;
      setBoulders(data || []);
    } catch (err: any) {
      setError(`Erreur lors du chargement des blocs : ${err.message}`);
      console.error(err);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const handleAddBoulder = async () => {
    if (!imageFile) {
      setError('Veuillez sélectionner une image.');
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      // Upload de l'image
      const fileName = `boulder-${Date.now()}-${imageFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('boulders')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      // Récupérer l'URL de l'image
      const { data: urlData } = supabase.storage
        .from('boulders')
        .getPublicUrl(fileName);

      // Ajouter le bloc dans la base de données
      const wallSectionId = wallSections.indexOf(selectedWall) + 1;
      const { error: dbError } = await supabase
        .from('boulders')
        .insert([
          {
            wall_section_id: wallSectionId,
            difficulty_level: difficulty,
            constraints: constraints,
            image_url: urlData.publicUrl,
            created_by: user?.uid,
            is_competition: false
          }
        ]);

      if (dbError) throw dbError;

      setSuccess('Bloc ajouté avec succès !');
      setOpenDialog(false);
      setConstraints('');
      setImageFile(null);
      fetchBoulders();
    } catch (err: any) {
      setError(`Erreur lors de l'ajout du bloc : ${err.message}`);
      console.error(err);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Typography sx={{ mt: 4, textAlign: 'center' }}>Chargement...</Typography>
      </Container>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ mt: 4 }}>
          Espace Ouvreur - BLOCABRAC
        </Typography>
        <Button
          variant="contained"
          onClick={() => setOpenDialog(true)}
          sx={{ mt: 4 }}
        >
          Ajouter un Bloc
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Typography variant="h6" sx={{ mb: 2 }}>
        Liste des blocs
      </Typography>

      {boulders.length === 0 ? (
        <Typography sx={{ textAlign: 'center', mt: 4 }}>
          Aucun bloc disponible. Ajoutez-en un !
        </Typography>
      ) : (
        <Box sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          justifyContent: 'center'
        }}>
          {boulders.map((boulder) => (
            <Box key={boulder.id} sx={{ width: { xs: '100%', sm: '45%', md: '30%' } }}>
              <Card>
                <CardMedia
                  component="img"
                  height="200"
                  image={boulder.image_url || '/src/assets/logo-blocabrac.png'}
                  alt={`Bloc ${boulder.id}`}
                />
                <CardContent>
                  <Typography variant="h6">
                    Bloc {boulder.id} - {wallSections[boulder.wall_section_id - 1] || 'Section inconnue'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography variant="body2">Niveau: </Typography>
                    <Box
                      sx={{
                        backgroundColor: levelColors[boulder.difficulty_level] || '#CCCCCC',
                        color: ['noir', 'blanc'].includes(boulder.difficulty_level) ? 'black' : 'white',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        marginLeft: '8px',
                        display: 'inline-block',
                      }}
                    >
                      {boulder.difficulty_level}
                    </Box>
                  </Box>
                  <Typography variant="body2">
                    {boulder.constraints || 'Aucune contrainte'}
                  </Typography>
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>
      )}

      {/* Dialog pour ajouter un bloc */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
        <DialogTitle>Ajouter un nouveau bloc</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Section du mur</InputLabel>
            <Select
              value={selectedWall}
              onChange={(e) => setSelectedWall(e.target.value)}
              label="Section du mur"
            >
              {wallSections.map((section) => (
                <MenuItem key={section} value={section}>{section}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Niveau de difficulté</InputLabel>
            <Select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              label="Niveau de difficulté"
            >
              {Object.keys(levelColors).map((level) => (
                <MenuItem key={level} value={level}>{level}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Contraintes"
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            fullWidth
            margin="normal"
            multiline
            rows={2}
            placeholder="Ex: Prises seulement en gauche, pas de pieds à droite..."
          />

          <Button
            variant="outlined"
            component="label"
            fullWidth
            sx={{ mt: 2 }}
          >
            Sélectionner une image
            <input
              type="file"
              hidden
              onChange={handleImageUpload}
              accept="image/*"
            />
          </Button>
          {imageFile && (
            <Typography sx={{ mt: 1 }}>{imageFile.name}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Annuler</Button>
          <Button onClick={handleAddBoulder} variant="contained" color="primary">
            Ajouter
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}