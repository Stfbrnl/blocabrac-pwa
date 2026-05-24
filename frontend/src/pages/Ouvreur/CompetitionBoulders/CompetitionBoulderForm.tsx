import React, { useState, useRef, useEffect, ChangeEvent, FormEvent, MouseEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  TextField, Button, MenuItem, Select, InputLabel, FormControl, Box,
  Typography, Container, Paper, IconButton, Stack
} from '@mui/material';
import { Delete as DeleteIcon, Check as CheckIcon } from '@mui/icons-material';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  addDoc, collection, doc, updateDoc, getDoc, query, where, getDocs
} from 'firebase/firestore';
import { db, storage } from '../../../services/firebaseConfig';

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
  wall: string;
  number: number;
  difficulty: string;
  difficulty_types: string[];
  instructions: string;
  image_url: string;
  competition_id: string;
  annotations?: BoulderAnnotations;
  is_active: boolean;
}

interface Competition {
  id: string;
  name: string;
  walls: string[];
}

const walls: string[] = [
  'Caverne des petits', 'Réta d\'initiation', 'Réta Adultes', 'Grande Face',
  'Dalle', 'Dévers 15°', 'Dévers 30°', 'Dévers 40°', 'Grotte Adultes', 'Güllich'
];

const difficultyTypes: string[] = ['technique', 'équilibre', 'force', 'engagement'];

export default function CompetitionBoulderForm(): JSX.Element {
  const { competitionId, boulderId } = useParams<{ competitionId: string; boulderId?: string }>();
  const navigate = useNavigate();
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [formData, setFormData] = useState<{
    number: string;
    wall: string;
    difficulty: string;
    difficulty_types: string[];
    instructions: string;
    imageFile: File | null;
    imageUrl: string;
    annotations: BoulderAnnotations;
  }>({
    number: '',
    wall: '',
    difficulty: '',
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // ✅ Charger la compétition
  useEffect(() => {
    if (!competitionId) return;
    const fetchCompetition = async (): Promise<void> => {
      const docSnap = await getDoc(doc(db, 'competitions', competitionId));
      if (docSnap.exists()) {
        setCompetition({ id: docSnap.id, ...docSnap.data() } as Competition);
      }
    };
    fetchCompetition();
  }, [competitionId]);

  // ✅ Charger un bloc existant pour édition
  useEffect(() => {
    if (!boulderId) return;
    const fetchBoulder = async (): Promise<void> => {
      const docSnap = await getDoc(doc(db, 'boulders', boulderId));
      if (docSnap.exists()) {
        const data = docSnap.data() as Boulder;
        setFormData({
          number: data.number.toString(),
          wall: data.wall,
          difficulty: data.difficulty || '',
          difficulty_types: data.difficulty_types || [],
          instructions: data.instructions || '',
          imageUrl: data.image_url || '',
          imageFile: null,
          annotations: data.annotations || { start_holds: [], end_holds: [] }
        });
      }
    };
    fetchBoulder();
  }, [boulderId]);

  // ✅ Dessiner les annotations sur le canvas
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

  // ✅ Gestion du clic sur le canvas
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

  // ✅ Gestion de l'upload d'image
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

  // ✅ Supprimer une annotation
  const handleDeleteAnnotation = (type: 'start_holds' | 'end_holds', index: number): void => {
    const newAnnotations = { ...formData.annotations };
    newAnnotations[type].splice(index, 1);
    setFormData({ ...formData, annotations: newAnnotations });
  };

  // ✅ Sauvegarder le bloc de compétition
  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!competitionId || !formData.number || !formData.wall || !formData.difficulty || !formData.imageFile) {
      alert('Veuillez remplir tous les champs obligatoires (numéro, mur, difficulté, image).');
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
            const storageRef = ref(storage, `boulders/competition/${Date.now()}_${formData.imageFile.name}`);
            await uploadBytes(storageRef, annotatedImageBlob);
            annotatedImageUrl = await getDownloadURL(storageRef);
          }
        }
      }

      const boulderData = {
        wall: formData.wall,
        number: parseInt(formData.number),
        difficulty: formData.difficulty,
        difficulty_types: formData.difficulty_types,
        instructions: formData.instructions,
        image_url: annotatedImageUrl,
        annotations: formData.annotations,
        type: 'competition',
        competition_id: competitionId,
        is_active: true,
        created_at: new Date().toISOString(),
        created_by: 'ouvreur_uid'
      };

      if (boulderId) {
        await updateDoc(doc(db, 'boulders', boulderId), boulderData);
      } else {
        await addDoc(collection(db, 'boulders'), boulderData);
      }

      navigate(`/ouvreur/competition-boulders`);

    } catch (error: unknown) {
      console.error('Erreur lors de la sauvegarde :', error);
      alert('Une erreur est survenue lors de la sauvegarde.');
    }
  };

  // Filtrer les murs disponibles pour cette compétition
  const availableWalls = competition ? competition.walls : walls;

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h5" gutterBottom>
          {boulderId ? `Modifier le bloc de compétition` : `Ajouter un bloc à la compétition`}
          {competition && ` - ${competition.name}`}
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
              <InputLabel>Mur</InputLabel>
              <Select
                value={formData.wall}
                onChange={(e: any): void => setFormData({ ...formData, wall: e.target.value as string })}
                label="Mur"
              >
                {availableWalls.map((w: string) => (
                  <MenuItem key={w} value={w}>{w}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="Difficulté (interne)"
              value={formData.difficulty}
              onChange={(e: ChangeEvent<HTMLInputElement>): void => setFormData({ ...formData, difficulty: e.target.value })}
              fullWidth
              placeholder="Ex: 6B, 7A"
              required
            />
            <FormControl fullWidth>
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
          </Box>

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
                  onClick={() => setCurrentMode('start')}
                  startIcon={<CheckIcon />}
                >
                  Départ (Jaune)
                </Button>
                <Button
                  variant={currentMode === 'end' ? 'contained' : 'outlined'}
                  onClick={() => setCurrentMode('end')}
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
                        onClick={() => handleDeleteAnnotation('start_holds', index)}
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
                        onClick={() => handleDeleteAnnotation('end_holds', index)}
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
              {boulderId ? 'Modifier le bloc' : 'Ajouter le bloc'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate(`/ouvreur/competition-boulders`)}
            >
              Annuler
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}