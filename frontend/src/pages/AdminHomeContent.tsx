import React, { useState, useEffect } from 'react';
import { Typography, Container, Box, TextField, Button, Alert, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function AdminHomeContent() {
  const [user, loadingAuth] = useAuthState(auth);
  const [content, setContent] = useState({
    title: "",
    description: "",
    additionalInfo: ""
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  // ✅ Vérification du rôle via Firestore (au lieu de Supabase)
  useEffect(() => {
    if (!loadingAuth && user) {
      const checkAdmin = async () => {
        try {
          const userDoc = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userDoc);

          if (!userSnap.exists() || userSnap.data()?.role !== 'admin') {
            navigate('/');
          }
        } catch (err) {
          console.error("Erreur lors de la vérification du rôle :", err);
          navigate('/');
        }
      };
      checkAdmin();
    }
  }, [user, loadingAuth, navigate]);

  // Charger le contenu depuis Firestore
  useEffect(() => {
    if (!user) return;

    const fetchContent = async () => {
      try {
        setLoading(true);
        const docRef = doc(db, 'homeContent', 'main');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setContent(docSnap.data() as typeof content);
        } else {
          // Contenu par défaut si le document n'existe pas
          setContent({
            title: "Bienvenue sur BLOCABRAC",
            description: "Connectez-vous pour accéder à votre espace personnel.",
            additionalInfo: "Notre salle d'escalade est ouverte tous les jours de la semaine de 12h à 22h et le week-end de 10h à 20h. Coordonnées : 43 rue Saint-Just, 42000 Saint-Étienne. Tél : 04 77 21 55 03"
          });
        }
      } catch (err: any) {
        setError(`Erreur lors du chargement : ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [user]);

  const handleSave = async () => {
    try {
      setLoading(true);
      const docRef = doc(db, 'homeContent', 'main');
      await setDoc(docRef, content);
      setSuccess("Contenu enregistré avec succès !");
      setError(null);
    } catch (err: any) {
      setError(`Erreur lors de l'enregistrement : ${err.message}`);
      setSuccess(null);
    } finally {
      setLoading(false);
    }
  };

  if (loadingAuth) {
    return <CircularProgress sx={{ margin: '20px auto', display: 'block' }} />;
  }

  if (!user) {
    return null;
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ mt: 4 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>
          Modifier le contenu de la page d'accueil
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {loading ? (
          <CircularProgress sx={{ margin: '20px auto', display: 'block' }} />
        ) : (
          <>
            <TextField
              label="Titre"
              value={content.title}
              onChange={(e) => setContent({ ...content, title: e.target.value })}
              fullWidth
              margin="normal"
            />

            <TextField
              label="Description"
              value={content.description}
              onChange={(e) => setContent({ ...content, description: e.target.value })}
              fullWidth
              margin="normal"
              multiline
              rows={2}
            />

            <TextField
              label="Informations supplémentaires (horaires, coordonnées, etc.)"
              value={content.additionalInfo}
              onChange={(e) => setContent({ ...content, additionalInfo: e.target.value })}
              fullWidth
              margin="normal"
              multiline
              rows={4}
            />

            <Button
              variant="contained"
              onClick={handleSave}
              sx={{ mt: 2 }}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : "Enregistrer les modifications"}
            </Button>
          </>
        )}
      </Box>
    </Container>
  );
}