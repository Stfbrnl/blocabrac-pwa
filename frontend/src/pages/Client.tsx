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
  Rating,
  TextField,
  Alert
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

export default function Client() {
  const [user, loading] = useAuthState(auth);
  const [boulders, setBoulders] = useState<any[]>([]);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      const fetchBoulders = async () => {
        try {
          const { data, error: supabaseError } = await supabase
            .from('boulders')
            .select('*')
            .eq('is_competition', false);

          if (supabaseError) {
            throw supabaseError;
          }
          setBoulders(data || []);
        } catch (err: any) {
          setError(`Erreur lors du chargement des blocs : ${err.message}`);
          console.error(err);
        }
      };
      fetchBoulders();
    }
  }, [user, loading]);

  const handleRate = async (boulderId: number, newRating: number | null, newComment: string) => {
    if (!newRating || !user) return;

    try {
      const { error: supabaseError } = await supabase
        .from('reviews')
        .insert([
          {
            user_id: user.uid,
            boulder_id: boulderId,
            rating: newRating,
            comment: newComment,
            created_at: new Date().toISOString()
          },
        ]);

      if (supabaseError) throw supabaseError;

      setRatings({ ...ratings, [boulderId]: newRating });
      setComments({ ...comments, [boulderId]: newComment });
      setSuccess('Votre note a été enregistrée avec succès !');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(`Erreur lors de l'enregistrement : ${err.message}`);
      setTimeout(() => setError(null), 5000);
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
      <Typography variant="h4" sx={{ mt: 4, mb: 2, textAlign: 'center' }}>
        Espace Client - BLOCABRAC
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Typography variant="h6" sx={{ mb: 2 }}>
        Blocs disponibles
      </Typography>

      {boulders.length === 0 ? (
        <Typography sx={{ textAlign: 'center', mt: 4 }}>
          Aucun bloc disponible pour le moment.
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
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    {boulder.constraints || 'Aucune contrainte'}
                  </Typography>

                  <Typography variant="body2" sx={{ mt: 1, mb: 1 }}>
                    Note actuelle: {ratings[boulder.id] || 'Non noté'}
                  </Typography>

                  <Rating
                    name={`rating-${boulder.id}`}
                    value={ratings[boulder.id] || 0}
                    onChange={(e, newValue) => {
                      setRatings({ ...ratings, [boulder.id]: newValue || 0 });
                    }}
                  />

                  <TextField
                    label="Signalement ou commentaire"
                    value={comments[boulder.id] || ''}
                    onChange={(e) => {
                      setComments({ ...comments, [boulder.id]: e.target.value });
                    }}
                    multiline
                    rows={2}
                    fullWidth
                    sx={{ mt: 1 }}
                    placeholder="Ex: Prise cassée, problème de sécurité..."
                  />

                  <Button
                    variant="contained"
                    onClick={() => handleRate(boulder.id, ratings[boulder.id] || 0, comments[boulder.id] || '')}
                    sx={{ mt: 1, width: '100%' }}
                  >
                    Enregistrer ma note
                  </Button>
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>
      )}
    </Container>
  );
}