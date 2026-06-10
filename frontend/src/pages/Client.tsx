import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc
} from 'firebase/firestore';
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

// ✅ Tableau de correspondance code-couleur/cotations internationales (identique à Ouvreur.tsx)
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

// ✅ Sections de mur (identique à Ouvreur.tsx)
const wallSections = [
  'Grotte Adultes', 'Güllich', 'Réta Adultes', 'Grande Face',
  'Dévers à 15°', 'Dévers à 30°', 'Dévers à 40°',
  'Caverne des petits', 'Réta d\'initiation'
];

export default function Client() {
  const [user, loading] = useAuthState(auth);
  const [boulders, setBoulders] = useState<any[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  // ✅ Chargement des blocs depuis Firestore (remplace Supabase)
  useEffect(() => {
    if (!loading && user) {
      const fetchBoulders = async () => {
        try {
          // ✅ Requête Firestore : blocs de type "daily" et actifs
          const q = query(
            collection(db, 'boulders'),
            where('type', '==', 'daily'),
            where('isActive', '==', true)
          );
          const querySnapshot = await getDocs(q);
          const bouldersData = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setBoulders(bouldersData);
        } catch (err: any) {
          setError(`Erreur lors du chargement des blocs : ${err.message}`);
          console.error(err);
        }
      };
      fetchBoulders();
    }
  }, [user, loading]);

  // ✅ Enregistrement des notes/commentaires dans Firestore (remplace Supabase)
  const handleRate = async (boulderId: string, newRating: number | null, newComment: string) => {
    if (!newRating || !user) return;

    try {
      await addDoc(collection(db, 'client_boulder_results'), {
        userId: user.uid,
        boulderId: boulderId,
        rating: newRating,
        comment: newComment,
        createdAt: new Date().toISOString()
      });

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

  // ✅ Redirection vers ClientScreen.tsx (nouvelle structure)
  useEffect(() => {
    navigate('/client/screen');
  }, [user, navigate]);

  return null;
}