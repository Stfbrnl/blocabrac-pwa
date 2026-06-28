import React, { useState, useRef, useEffect, ChangeEvent, FormEvent, MouseEvent, TouchEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  TextField, Button, MenuItem, Select, InputLabel, FormControl, Box,
  Typography, Container, Paper, IconButton, Stack, Dialog, DialogTitle,
  DialogContent, DialogActions, Chip, CircularProgress
} from '@mui/material';
import { Delete as DeleteIcon, Check as CheckIcon } from '@mui/icons-material';
import {
  addDoc, collection, doc, updateDoc, query, where, getDocs
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';

interface RelativeHold {
  x: number;
  y: number;
}

interface BoulderAnnotations {
  start_holds: RelativeHold[];
  end_holds: RelativeHold[];
}

type DifficultyLevel = 'Plus' | 'Égal' | 'Moins';

interface Boulder {
  id: string;
  number?: number;
  color?: string;
  difficulty_types?: string[];
  instructions?: string;
  image_base64?: string;
  annotations?: BoulderAnnotations;
  wall: string;
  type: string;
  is_active?: boolean;
  difficulty_level?: DifficultyLevel;
}

const walls: string[] = [
  'Caverne des petits', 'Réta d\'initiation', 'Réta Adultes', 'Grande Face',
  'Dalle', 'Dévers 15°', 'Dévers 30°', 'Dévers 40°', 'Grotte Adultes', 'Güllich'
];

const difficultyTypes: string[] = ['technique', 'équilibre', 'force', 'engagement'];
const difficultyLevels: DifficultyLevel[] = ['Plus', 'Égal', 'Moins'];

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
  { value: 'rose', label: 'Rose (7B+-8A)' },
  { value: 'mystere', label: 'Bloc Mystère' }
];

const resizeAndCompressImage = (file: File, maxWidth: number = 800, quality: number = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Impossible de créer le contexte 2D'));
        return;
      }

      const ratio = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = Math.round(img.height * ratio);

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Impossible de créer le blob'));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = reject;
  });
};

export default function DailyBoulderForm(): JSX.Element {
  const { wall } = useParams<{ wall: string }>();
  const navigate = useNavigate();
  const [user] = useAuthState(auth);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [editingBoulder, setEditingBoulder] = useState<Boulder | null>(null);
  const [formData, setFormData] = useState<{
    number: string;
    color: string;
    difficulty_types: string[];
    instructions: string;
    imageFile: File | null;
    imagePreview: string;
    annotations: BoulderAnnotations;
    difficulty_level: DifficultyLevel;
  }>({
    number: '',
    color: '',
    difficulty_types: [],
    instructions: '',
    imageFile: null,
    imagePreview: '',
    annotations: {
      start_holds: [],
      end_holds: []
    },
    difficulty_level: 'Égal'
  });
  const [currentMode, setCurrentMode] = useState<'start' | 'end'>('start');
  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false);
  const [boulderToDelete, setBoulderToDelete] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // ✅ Clé qui change après chaque création réussie pour forcer le remontage de l'input file
  const [fileInputKey, setFileInputKey] = useState<number>(0);

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

  const handleEdit = (boulder: Boulder): void => {
    setEditingBoulder(boulder);
    setFormData({
      number: boulder.number?.toString() || '',
      color: boulder.color || '',
      difficulty_types: boulder.difficulty_types || [],
      instructions: boulder.instructions || '',
      imageFile: null,
      imagePreview: boulder.image_base64 || '',
      annotations: {
        start_holds: boulder.annotations?.start_holds || [],
        end_holds: boulder.annotations?.end_holds || []
      },
      difficulty_level: boulder.difficulty_level || 'Égal'
    });
  };

  useEffect(() => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;
    const img: HTMLImageElement | null = imageRef.current;
    if (!canvas || !img || !formData.imagePreview) return;

    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) return;

    const drawImageAndAnnotations = (): void => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (img.complete) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }

      ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
      formData.annotations.start_holds.forEach((hold: RelativeHold): void => {
        ctx.beginPath();
        ctx.arc(hold.x * canvas.width, hold.y * canvas.height, 15, 0, 2 * Math.PI);
        ctx.fill();
      });

      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      formData.annotations.end_holds.forEach((hold: RelativeHold): void => {
        ctx.beginPath();
        ctx.arc(hold.x * canvas.width, hold.y * canvas.height, 15, 0, 2 * Math.PI);
        ctx.fill();
      });
    };

    if (img.complete && formData.imagePreview) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      drawImageAndAnnotations();
    } else if (formData.imagePreview) {
      img.onload = (): void => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        drawImageAndAnnotations();
      };
      img.src = formData.imagePreview;
    }
  }, [formData.imagePreview, formData.annotations]);

  const getRelativePosition = (
    clientX: number,
    clientY: number
  ): { x: number; y: number } | null => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;
    if (!canvas) return null;
    const rect: DOMRect = canvas.getBoundingClientRect();
    const x: number = (clientX - rect.left) / rect.width;
    const y: number = (clientY - rect.top) / rect.height;
    return { x, y };
  };

  const addHoldAtPosition = (x: number, y: number): void => {
    setFormData((prev) => ({
      ...prev,
      annotations: {
        ...prev.annotations,
        [currentMode === 'start' ? 'start_holds' : 'end_holds']:
          [...(currentMode === 'start' ? prev.annotations.start_holds : prev.annotations.end_holds), { x, y }]
      }
    }));
  };

  const handleCanvasClick = (e: MouseEvent<HTMLCanvasElement>): void => {
    const pos = getRelativePosition(e.clientX, e.clientY);
    if (pos) addHoldAtPosition(pos.x, pos.y);
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>): void => {
    const file: File | undefined = e.target.files?.[0];
    if (!file) return;

    resizeAndCompressImage(file, 800, 0.7)
      .then((resizedImageBase64: string) => {
        setFormData((prev) => ({
          ...prev,
          imageFile: file,
          imagePreview: resizedImageBase64,
          annotations: { start_holds: [], end_holds: [] }
        }));
      })
      .catch((error: unknown) => {
        console.error('Erreur lors du redimensionnement :', error);
        alert('Impossible de traiter l\'image. Veuillez essayer une autre image.');
      });
  };

  const handleDeleteAnnotation = (type: 'start_holds' | 'end_holds', index: number): void => {
    setFormData((prev) => {
      const newAnnotations = { ...prev.annotations };
      newAnnotations[type] = newAnnotations[type].filter((_, i) => i !== index);
      return { ...prev, annotations: newAnnotations };
    });
  };

  const resetForm = (): void => {
    setFormData({
      number: '',
      color: '',
      difficulty_types: [],
      instructions: '',
      imageFile: null,
      imagePreview: '',
      annotations: { start_holds: [], end_holds: [] },
      difficulty_level: 'Égal'
    });
    setEditingBoulder(null);
    // ✅ Force le remontage de l'<input type="file"> natif : c'est ce qui
    // corrige le bug "il faut tirer pour rafraîchir avant de créer un second bloc".
    // Sans cela, l'input file natif (non contrôlable par React) garde un état
    // interne désynchronisé après reset, en particulier sur mobile.
    setFileInputKey((k) => k + 1);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!wall) {
      alert('Erreur : mur non sélectionné.');
      return;
    }
    if (!user) {
      alert('Erreur : utilisateur non authentifié.');
      return;
    }
    if (!formData.number) {
      alert('Veuillez saisir un numéro de bloc.');
      return;
    }
    if (!formData.color) {
      alert('Veuillez sélectionner une cotation.');
      return;
    }
    if (!formData.imagePreview) {
      alert('Veuillez uploader une image.');
      return;
    }
    if (formData.annotations.start_holds.length < 2 || formData.annotations.end_holds.length < 2) {
      alert('Veuillez placer au moins 2 cercles jaunes (départ) et 2 cercles verts (fin).');
      return;
    }

    try {
      setIsUploading(true);

      let annotatedImageBase64: string = formData.imagePreview;
      if (formData.imageFile) {
        const canvas: HTMLCanvasElement | null = canvasRef.current;
        if (canvas) {
          const img = new Image();
          img.src = formData.imagePreview;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
                formData.annotations.start_holds.forEach((hold: RelativeHold): void => {
                  ctx.beginPath();
                  ctx.arc(hold.x * canvas.width, hold.y * canvas.height, 15, 0, 2 * Math.PI);
                  ctx.fill();
                });

                ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
                formData.annotations.end_holds.forEach((hold: RelativeHold): void => {
                  ctx.beginPath();
                  ctx.arc(hold.x * canvas.width, hold.y * canvas.height, 15, 0, 2 * Math.PI);
                  ctx.fill();
                });
                resolve();
              }
            };
          });

          annotatedImageBase64 = canvas.toDataURL('image/jpeg', 0.7);
        }
      }

      const base64Data = annotatedImageBase64.split(',')[1];
      if (base64Data && atob(base64Data).length > 900000) {
        alert('L\'image est trop grande (max ~1 Mo). Veuillez choisir une image plus petite ou la recadrer.');
        setIsUploading(false);
        return;
      }

      const boulderData = {
        wall: wall,
        number: parseInt(formData.number),
        color: formData.color,
        difficulty_types: formData.difficulty_types,
        instructions: formData.instructions,
        image_base64: annotatedImageBase64,
        annotations: formData.annotations,
        type: 'daily',
        competition_id: null,
        is_active: true,
        created_at: new Date().toISOString(),
        created_by: user.uid,
        difficulty_level: formData.difficulty_level
      };

      if (editingBoulder) {
        await updateDoc(doc(db, 'boulders', editingBoulder.id), boulderData);
      } else {
        await addDoc(collection(db, 'boulders'), boulderData);
      }

      resetForm();

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
      alert(`Une erreur est survenue : ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsUploading(false);
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
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
        <Typography variant="h5" gutterBottom>
          {editingBoulder ? `Modifier le bloc n°${editingBoulder.number || '?'}` : 'Créer un bloc quotidien'}
          {wall && ` - Mur: ${wall}`}
        </Typography>

        <Box component="form" onSubmit={handleSubmit}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Numéro du bloc"
              type="number"
              value={formData.number}
              onChange={(e: ChangeEvent<HTMLInputElement>): void => setFormData({ ...formData, number: e.target.value })}
              fullWidth
              required
              disabled={isUploading}
              sx={{ minWidth: 150 }}
            />
            <FormControl fullWidth disabled={isUploading} sx={{ minWidth: 200 }}>
              <InputLabel>Cotation</InputLabel>
              <Select
                value={formData.color}
                onChange={(e: any): void => setFormData({ ...formData, color: e.target.value as string })}
                label="Cotation"
                required
              >
                {colorRatings.map((c: ColorRating) => (
                  <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <FormControl fullWidth margin="normal" disabled={isUploading}>
            <InputLabel>Difficulté dans le niveau</InputLabel>
            <Select
              value={formData.difficulty_level}
              onChange={(e: any): void => setFormData({ ...formData, difficulty_level: e.target.value as DifficultyLevel })}
              label="Difficulté dans le niveau"
            >
              {difficultyLevels.map((level: DifficultyLevel) => (
                <MenuItem key={level} value={level}>
                  {formData.color ? `${formData.color} ${level}` : level}
                </MenuItem>
              ))}
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Exemple: "Rouge Plus" pour un bloc plus difficile que la moyenne du niveau Rouge.
            </Typography>
          </FormControl>

          <FormControl fullWidth margin="normal" disabled={isUploading}>
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
            disabled={isUploading}
          />

          {/* ✅ key forcée pour remonter l'input natif après chaque création */}
          <input
            key={fileInputKey}
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ marginBottom: '16px' }}
            disabled={isUploading}
          />

          {formData.imagePreview && (
            <Box sx={{ position: 'relative', mb: 2 }}>
              <img
                ref={imageRef}
                src={formData.imagePreview}
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
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                <Button
                  variant={currentMode === 'start' ? 'contained' : 'outlined'}
                  onClick={(): void => setCurrentMode('start')}
                  startIcon={<CheckIcon />}
                  disabled={isUploading}
                >
                  Départ (Jaune)
                </Button>
                <Button
                  variant={currentMode === 'end' ? 'contained' : 'outlined'}
                  onClick={(): void => setCurrentMode('end')}
                  startIcon={<CheckIcon />}
                  disabled={isUploading}
                >
                  Fin (Vert)
                </Button>
              </Stack>
              <Box sx={{ mt: 1 }}>
                <Typography variant="subtitle2">Annotations :</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                  {formData.annotations.start_holds.map((hold: RelativeHold, index: number) => (
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
                        disabled={isUploading}
                      >
                        <DeleteIcon fontSize="small" color="error" />
                      </IconButton>
                    </Box>
                  ))}
                  {formData.annotations.end_holds.map((hold: RelativeHold, index: number) => (
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
                        disabled={isUploading}
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

          <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isUploading}
              startIcon={isUploading ? <CircularProgress size={20} /> : null}
            >
              {isUploading ? 'Chargement...' : editingBoulder ? 'Modifier le bloc' : 'Créer le bloc'}
            </Button>
            {editingBoulder && (
              <Button
                variant="outlined"
                color="error"
                onClick={resetForm}
                disabled={isUploading}
              >
                Annuler
              </Button>
            )}
          </Box>
        </Box>

        <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
          Blocs existants pour {wall}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
          {boulders.map((boulder: Boulder) => (
            <Paper key={boulder.id} sx={{ p: 2 }}>
              <Typography variant="subtitle1">
                Bloc n°{boulder.number || '?'} - {boulder.color === 'mystere' ? 'Bloc Mystère' : boulder.color || 'Non spécifiée'}
                {boulder.difficulty_level && boulder.color !== 'mystere' && (
                  <Chip
                    label={`${boulder.color} ${boulder.difficulty_level}`}
                    size="small"
                    sx={{ ml: 1, backgroundColor: 'action.selected' }}
                  />
                )}
              </Typography>
              <Typography variant="body2">
                Types: {(boulder.difficulty_types || []).join(', ')}
              </Typography>
              {boulder.instructions && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {boulder.instructions}
                </Typography>
              )}
              {boulder.image_base64 && (
                <img
                  src={boulder.image_base64}
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
            <Button onClick={(): void => setOpenDeleteDialog(false)} disabled={isUploading}>Annuler</Button>
            <Button onClick={confirmDelete} color="error" disabled={isUploading}>
              Supprimer
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Container>
  );
}