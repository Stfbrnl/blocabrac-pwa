import React, { useState, useRef, useEffect, ChangeEvent, FormEvent, MouseEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  TextField, Button, MenuItem, Select, InputLabel, FormControl, Box,
  Typography, Container, Paper, IconButton, Stack, Dialog, DialogTitle,
  DialogContent, DialogActions, Chip
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Delete as DeleteIcon, Check as CheckIcon } from '@mui/icons-material';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  addDoc, collection, doc, updateDoc, query, where, getDocs
} from 'firebase/firestore';
import { db, storage } from '../../../services/firebaseConfig';

// ✅ Types explicites
interface Hold {
  x: number;
  y: number;
}

interface BoulderAnnotations {
  start_holds: Hold[];
  end_holds: Hold[];
}

interface Boulder {
  id: string;
  number?: number;
  color?: string;
  difficulty_types?: string[];
  instructions?: string;
  image_url?: string;
  annotations?: BoulderAnnotations;
  wall: string;
  type: string;
  is_active?: boolean;
}

const walls: string[] = [
  'Caverne des petits', 'Réta d\'initiation', 'Réta Adultes', 'Grande Face',
  'Dalle', 'Dévers 15°', 'Dévers 30°', 'Dévers 40°', 'Grotte Adultes', 'Güllich'
];

const difficultyTypes: string[] = ['technique', 'équilibre', 'force', 'engagement'];

interface ColorRating {
  value: string;
  label: string;
}

const colorRatings: ColorRating[] = [
  { value: 'jaune', label: 'Jaune (3A-3C)' },
  { value: 'vert', label: 'Vert (4A-4B+)' },
  { value: 'bleu', label: 'Bleu (4C-5A+)' },
  { value: 'violet', label: 'Violet (5B-5C+)' },
  { value: 'rouge', label: 'Rouge (6A-6B)' },
  { value: 'noire', label: 'Noire (6B+-6C+)' },
  { value: 'blanc', label: 'Blanc (7A-7B)' },
  { value: 'rose', label: 'Rose (7B+-8A)' }
];

// ✅ Type pour le state des annotations (toujours défini)
interface FormAnnotations {
  start_holds: Hold[];
  end_holds: Hold[];
}

export default function DailyBoulderForm(): JSX.Element {
  const { wall } = useParams<{ wall: string }>();
  const navigate = useNavigate();
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [editingBoulder, setEditingBoulder] = useState<Boulder | null>(null);
  const [formData, setFormData] = useState<{
    number: string;
    color: string;
    difficulty_types: string[];
    instructions: string;
    imageFile: File | null;
    imageUrl: string;
    annotations: FormAnnotations; // ✅ Toujours défini
  }>({
    number: '',
    color: '',
    difficulty_types: [],
    instructions: '',
    imageFile: null,
    imageUrl: '',
    annotations: {
      start_holds: [],
      end_holds: []
    }
  });
  const [currentMode, setCurrentMode] = useState<'start' | 'end'>('start');
  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false);
  const [boulderToDelete, setBoulderToDelete] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!wall) return;
    const fetchBoulders = async (): Promise<void> => {
      const q = query(
        collection(db, 'boulders'),
        where('wall', '==', wall),
        where('type', '==', 'daily'),
        where('is_active', '==', true)
      );
      const snapshot = await getDocs(q);
      setBoulders(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Boulder[]);
    };
    fetchBoulders();
  }, [wall]);

  // ✅ Correction : Conversion explicite des annotations optionnelles en annotations obligatoires
  const handleEdit = (boulder: Boulder): void => {
    setEditingBoulder(boulder);
    setFormData({
      number: boulder.number?.toString() || '',
      color: boulder.color || '',
      difficulty_types: boulder.difficulty_types || [],
      instructions: boulder.instructions || '',
      imageUrl: boulder.image_url || '',
      imageFile: null,
      annotations: {
        start_holds: boulder.annotations?.start_holds || [],
        end_holds: boulder.annotations?.end_holds || []
      } // ✅ Garantit que start_holds et end_holds sont toujours des tableaux
    });
  };

  useEffect(() => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;
    const img: HTMLImageElement | null = imageRef.current;
    if (!canvas || !img || !formData.imageUrl) return;

    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) return;

    img.onload = (): void => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      drawImageAndAnnotations();
    };
    img.src = formData.imageUrl;

    const drawImageAndAnnotations = (): void => {
      if (!img.complete) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
      formData.annotations.start_holds.forEach((hold: Hold): void => {
        ctx.beginPath();
        ctx.arc(hold.x, hold.y, 15, 0, 2 * Math.PI);
        ctx.fill();
      });

      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      formData.annotations.end_holds.forEach((hold: Hold): void => {
        ctx.beginPath();
        ctx.arc(hold.x, hold.y, 15, 0, 2 * Math.PI);
        ctx.fill();
      });
    };

    drawImageAndAnnotations();
  }, [formData.imageUrl, formData.annotations]);

  const handleCanvasClick = (e: MouseEvent<HTMLCanvasElement>): void => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;
    if (!canvas || !imageRef.current) return;

    const rect: DOMRect = canvas.getBoundingClientRect();
    const x: number = e.clientX - rect.left;
    const y: number = e.clientY - rect.top;

    setFormData({
      ...formData,
      annotations: {
        ...formData.annotations,
        [currentMode === 'start' ? 'start_holds' : 'end_holds']:
          [...(currentMode === 'start' ? formData.annotations.start_holds : formData.annotations.end_holds), { x, y }]
      }
    });
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>): void => {
    const file: File | undefined = e.target.files?.[0];
    if (!file) return;

    const reader: FileReader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>): void => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        setFormData({
          ...formData,
          imageFile: file,
          imageUrl: result,
          annotations: { start_holds: [], end_holds: [] }
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteAnnotation = (type: 'start_holds' | 'end_holds', index: number): void => {
    const newAnnotations = { ...formData.annotations };
    newAnnotations[type].splice(index, 1);
    setFormData({ ...formData, annotations: newAnnotations });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!wall || !formData.number || !formData.color || !formData.imageFile) {
      alert('Veuillez remplir tous les champs obligatoires (numéro, cotation, image).');
      return;
    }

    if (formData.annotations.start_holds.length < 2 || formData.annotations.end_holds.length < 2) {
      alert('Veuillez placer au moins 2 cercles jaunes (départ) et 2 cercles verts (fin).');
      return;
    }

    try {
      let annotatedImageUrl: string = formData.imageUrl;
      if (formData.imageFile) {
        const canvas: HTMLCanvasElement | null = canvasRef.current;
        if (canvas) {
          const annotatedImageBlob: Blob | null = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
          });

          if (annotatedImageBlob) {
            const storageRef = ref(storage, `boulders/annotated/${Date.now()}_${formData.imageFile.name}`);
            await uploadBytes(storageRef, annotatedImageBlob);
            annotatedImageUrl = await getDownloadURL(storageRef);
          }
        }
      }

      const boulderData = {
        wall: wall,
        number: parseInt(formData.number),
        color: formData.color,
        difficulty_types: formData.difficulty_types,
        instructions: formData.instructions,
        image_url: annotatedImageUrl,
        annotations: formData.annotations,
        type: 'daily',
        competition_id: null,
        is_active: true,
        created_at: new Date().toISOString(),
        created_by: 'ouvreur_uid'
      };

      if (editingBoulder) {
        await updateDoc(doc(db, 'boulders', editingBoulder.id), boulderData);
      } else {
        await addDoc(collection(db, 'boulders'), boulderData);
      }

      setFormData({
        number: '',
        color: '',
        difficulty_types: [],
        instructions: '',
        imageFile: null,
        imageUrl: '',
        annotations: { start_holds: [], end_holds: [] }
      });
      setEditingBoulder(null);

      const q = query(
        collection(db, 'boulders'),
        where('wall', '==', wall),
        where('type', '==', 'daily'),
        where('is_active', '==', true)
      );
      const snapshot = await getDocs(q);
      setBoulders(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Boulder[]);

    } catch (error: unknown) {
      console.error('Erreur lors de la sauvegarde :', error);
      alert('Une erreur est survenue lors de la sauvegarde.');
    }
  };

  const handleDelete = (boulderId: string): void => {
    setBoulderToDelete(boulderId);
    setOpenDeleteDialog(true);
  };

  const confirmDelete = async (): Promise<void> => {
    if (!boulderToDelete) return;
    try {
      await updateDoc(doc(db, 'boulders', boulderToDelete), { is_active: false });
      setBoulders(boulders.filter(b => b.id !== boulderToDelete));
      setOpenDeleteDialog(false);
      setBoulderToDelete(null);
    } catch (error: unknown) {
      console.error('Erreur lors de la suppression :', error);
      alert('Une erreur est survenue lors de la suppression.');
    }
  };

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h5" gutterBottom>
          {editingBoulder ? `Modifier le bloc n°${editingBoulder.number || '?'}` : 'Créer un bloc quotidien'}
          {wall && ` - Mur: ${wall}`}
        </Typography>

        <Box component="form" onSubmit={handleSubmit}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="Numéro du bloc"
              type="number"
              value={formData.number}
              onChange={(e: ChangeEvent<HTMLInputElement>): void => setFormData({ ...formData, number: e.target.value })}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Cotation</InputLabel>
              <Select
                value={formData.color}
                onChange={(e: any): void => setFormData({ ...formData, color: e.target.value as string })}
                label="Cotation"
              >
                {colorRatings.map((c: ColorRating) => (
                  <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <FormControl fullWidth margin="normal">
            <InputLabel>Types de difficulté (multiple)</InputLabel>
            <Select
              multiple
              value={formData.difficulty_types}
              onChange={(e: any): void => setFormData({
                ...formData,
                difficulty_types: e.target.value as string[]
              })}
              label="Types de difficulté"
            >
              {difficultyTypes.map((type: string) => (
                <MenuItem key={type} value={type}>{type}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Consignes"
            multiline
            rows={4}
            value={formData.instructions}
            onChange={(e: ChangeEvent<HTMLInputElement>): void => setFormData({ ...formData, instructions: e.target.value })}
            margin="normal"
            fullWidth
          />

          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ marginBottom: '16px' }}
          />

          {formData.imageUrl && (
            <Box sx={{ position: 'relative', mb: 2 }}>
              <img
                ref={imageRef}
                src={formData.imageUrl}
                alt="Bloc"
                style={{ maxWidth: '100%', display: 'block', border: '1px solid #ddd' }}
              />
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  cursor: 'crosshair'
                }}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button
                  variant={currentMode === 'start' ? 'contained' : 'outlined'}
                  onClick={(): void => setCurrentMode('start')}
                  startIcon={<CheckIcon />}
                >
                  Départ (Jaune)
                </Button>
                <Button
                  variant={currentMode === 'end' ? 'contained' : 'outlined'}
                  onClick={(): void => setCurrentMode('end')}
                  startIcon={<CheckIcon />}
                >
                  Fin (Vert)
                </Button>
              </Stack>
              <Box sx={{ mt: 1 }}>
                <Typography variant="subtitle2">Annotations :</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                  {formData.annotations.start_holds.map((hold: Hold, index: number) => (
                    <Box key={`start-${index}`} sx={{ position: 'relative', display: 'inline-flex' }}>
                      <Box
                        sx={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          backgroundColor: 'rgba(255, 255, 0, 0.5)',
                          border: '2px solid #FFD700'
                        }}
                      />
                      <IconButton
                        size="small"
                        onClick={(): void => handleDeleteAnnotation('start_holds', index)}
                        sx={{ position: 'absolute', top: -8, right: -8, backgroundColor: 'white' }}
                      >
                        <DeleteIcon fontSize="small" color="error" />
                      </IconButton>
                    </Box>
                  ))}
                  {formData.annotations.end_holds.map((hold: Hold, index: number) => (
                    <Box key={`end-${index}`} sx={{ position: 'relative', display: 'inline-flex' }}>
                      <Box
                        sx={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          backgroundColor: 'rgba(0, 255, 0, 0.5)',
                          border: '2px solid #008000'
                        }}
                      />
                      <IconButton
                        size="small"
                        onClick={(): void => handleDeleteAnnotation('end_holds', index)}
                        sx={{ position: 'absolute', top: -8, right: -8, backgroundColor: 'white' }}
                      >
                        <DeleteIcon fontSize="small" color="error" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
                {formData.annotations.start_holds.length < 2 && (
                  <Typography variant="caption" color="error">
                    Minimum 2 cercles jaunes (départ)
                  </Typography>
                )}
                {formData.annotations.end_holds.length < 2 && (
                  <Typography variant="caption" color="error">
                    Minimum 2 cercles verts (fin)
                  </Typography>
                )}
              </Box>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
            >
              {editingBoulder ? 'Modifier le bloc' : 'Créer le bloc'}
            </Button>
            {editingBoulder && (
              <Button
                variant="outlined"
                color="error"
                onClick={(): void => {
                  setEditingBoulder(null);
                  setFormData({
                    number: '',
                    color: '',
                    difficulty_types: [],
                    instructions: '',
                    imageFile: null,
                    imageUrl: '',
                    annotations: { start_holds: [], end_holds: [] }
                  });
                }}
              >
                Annuler
              </Button>
            )}
          </Box>
        </Box>

        <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
          Blocs existants pour {wall}
        </Typography>
        {/* ✅ Correction Grid : Utilisation de la syntaxe MUI v5+ avec sx */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 }}>
          {boulders.map((boulder: Boulder) => (
            <Paper key={boulder.id} sx={{ p: 2 }}>
              <Typography variant="subtitle1">
                Bloc n°{boulder.number || '?'} - {boulder.color || 'Non spécifiée'}
              </Typography>
              <Typography variant="body2">
                Types: {(boulder.difficulty_types || []).join(', ')}
              </Typography>
              {boulder.instructions && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {boulder.instructions}
                </Typography>
              )}
              {boulder.image_url && (
                <img
                  src={boulder.image_url}
                  alt={`Bloc ${boulder.number || '?'}`}
                  style={{ width: '100%', marginTop: '8px', border: '1px solid #ddd' }}
                />
              )}
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={(): void => handleEdit(boulder)}
                >
                  Modifier
                </Button>
                <Button
                  size="small"
                  color="error"
                  variant="outlined"
                  onClick={(): void => handleDelete(boulder.id)}
                >
                  Supprimer
                </Button>
              </Box>
            </Paper>
          ))}
        </Box>

        <Dialog
          open={openDeleteDialog}
          onClose={(): void => setOpenDeleteDialog(false)}
        >
          <DialogTitle>Supprimer le bloc</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir supprimer ce bloc ? Il sera marqué comme inactif mais ne sera plus visible.
          </DialogContent>
          <DialogActions>
            <Button onClick={(): void => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button onClick={confirmDelete} color="error">
              Supprimer
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Container>
  );
}