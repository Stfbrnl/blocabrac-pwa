import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Box, Typography, Container, Paper, Badge } from '@mui/material';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';

export default function OuvreurScreen(): JSX.Element {
  const navigate = useNavigate();
  const [urgentReportsCount, setUrgentReportsCount] = useState<number>(0);

  useEffect(() => {
    const q = query(
      collection(db, 'boulder_reports'),
      where('report_type', '==', 'défaillance_prisede'),
      where('status', '==', 'pending')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUrgentReportsCount(snapshot.size);
    });
    return () => unsubscribe();
  }, []);

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4">
            Espace Ouvreur
          </Typography>
          {urgentReportsCount > 0 && (
            <Badge
              color="error"
              badgeContent={urgentReportsCount}
              sx={{ '& .MuiBadge-badge': { fontSize: '0.8rem' } }}
            >
              <Typography variant="body2" color="error">
                Signalements urgents
              </Typography>
            </Badge>
          )}
        </Box>

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 2,
          '@media (max-width: 900px)': { gridTemplateColumns: '1fr' }
        }}>
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={() => navigate('/ouvreur/daily-boulders')}
            sx={{ p: 3 }}
          >
            Blocs Quotidiens
          </Button>
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={() => navigate('/ouvreur/competition-boulders')}
            sx={{ p: 3 }}
          >
            Blocs de Compétition
          </Button>
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={() => navigate('/ouvreur/reports-and-stats')}
            sx={{ p: 3 }}
          >
            Signalements et Statistiques
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}