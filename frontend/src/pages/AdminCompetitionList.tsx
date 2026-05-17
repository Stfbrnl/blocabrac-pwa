import React, { useState, useEffect } from 'react';
import { Typography, Paper, Container, Box, Button } from '@mui/material';
import { db } from '../services/firebaseConfig';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { Link } from 'react-router-dom';

type CompetitionStatus = 'à venir' | 'en cours' | 'terminée' | 'annulée';

interface Competition {
  id: string;
  name: string;
  date: string;
  status: CompetitionStatus;
  access_code: string;
  max_participants: number;
  registered_count: number;
}

const AdminCompetitionList: React.FC = () => {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompetitions = async () => {
      try {
        setLoading(true);
        const querySnapshot = await getDocs(collection(db, 'competitions'));
        const competitionsData: Competition[] = querySnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          date: doc.data().date || '',
          status: doc.data().status || 'à venir',
          access_code: doc.data().access_code || '',
          max_participants: doc.data().max_participants || 50,
          registered_count: doc.data().registered_count || 0
        }));
        setCompetitions(competitionsData);
      } catch (error) {
        console.error("Erreur :", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCompetitions();
  }, []);

  const handleDeleteCompetition = async (competitionId: string) => {
    try {
      await deleteDoc(doc(db, 'competitions', competitionId));
      setCompetitions(competitions.filter(comp => comp.id !== competitionId));
    } catch (error) {
      console.error("Erreur :", error);
    }
  };

  if (loading) {
    return <Typography>Chargement des compétitions...</Typography>;
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Liste des Compétitions
        </Typography>
        {competitions.length === 0 ? (
          <Typography>Aucune compétition trouvée.</Typography>
        ) : (
          <Box sx={{ mt: 2 }}>
            {competitions.map(comp => (
              <Box
                key={comp.id}
                sx={{
                  p: 2,
                  mb: 2,
                  border: '1px solid #eee',
                  borderRadius: 1,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <Box>
                  <Typography variant="h6">{comp.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Date: {new Date(comp.date).toLocaleDateString()} | Statut: {comp.status} |
                    Code: {comp.access_code} | Participants: {comp.registered_count} / {comp.max_participants}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    component={Link}
                    to={`/admin/competitions/register?competitionId=${comp.id}`}
                  >
                    Gérer les inscriptions
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    component={Link}
                    to={`/admin/competitions/stats?competitionId=${comp.id}`}
                  >
                    Voir les statistiques
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={() => handleDeleteCompetition(comp.id)}
                  >
                    Supprimer
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </Container>
  );
};

export default AdminCompetitionList;