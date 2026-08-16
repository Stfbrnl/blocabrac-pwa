import React, { useEffect, useState } from 'react';
import {
  Typography, Paper, Container, Button, TextField, Box,
  Snackbar, Alert, Chip, CircularProgress
} from '@mui/material';
import { EmojiEvents as EmojiEventsIcon } from '@mui/icons-material';
import { db } from '../services/firebaseConfig';
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';

// ✅ CONCEPTION-classement-saisonnier.md — décision point 1 : la fenêtre de la saison
// n'est plus codée en dur (1er septembre → 31 mai) mais réglée ici par l'admin, pour
// pouvoir démarrer la première saison le jour du lancement réel de l'appli plutôt
// qu'une date arbitraire. Un seul document de config, nouveau pattern dans ce projet
// (voir le doc de conception, "Fenêtre de saison").
interface SeasonConfig {
  debut: string; // ISO "YYYY-MM-DD"
  fin: string;   // ISO "YYYY-MM-DD"
  cloturee: boolean;
}

const AdminSeasonConfig: React.FC = () => {
  const [config, setConfig] = useState<SeasonConfig>({ debut: '', fin: '', cloturee: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'app_config', 'classement_saison'));
        if (snap.exists()) {
          const data = snap.data();
          setConfig({
            debut: data.debut || '',
            fin: data.fin || '',
            cloturee: data.cloturee ?? false,
          });
        }
      } catch (error) {
        console.error('Erreur lors du chargement de la fenêtre de saison :', error);
        setSnackbarMessage('Erreur lors du chargement.');
        setSnackbarSeverity('error');
        setOpenSnackbar(true);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!config.debut || !config.fin) {
      setSnackbarMessage('Les deux dates sont obligatoires.');
      setSnackbarSeverity('error');
      setOpenSnackbar(true);
      return;
    }
    if (config.debut > config.fin) {
      setSnackbarMessage('La date de début doit précéder la date de fin.');
      setSnackbarSeverity('error');
      setOpenSnackbar(true);
      return;
    }
    setSaving(true);
    try {
      // ✅ Reconfigurer la fenêtre est le geste qui lève `cloturee` (décision §2 de la
      // relecture) — un seul geste admin, pas une étape à part. Si l'admin modifie la
      // fenêtre alors qu'aucune saison n'a jamais été clôturée, cloturee passe de false
      // à false : sans effet, cohérent.
      await setDoc(doc(db, 'app_config', 'classement_saison'), {
        debut: config.debut,
        fin: config.fin,
        cloturee: false,
        cloturee_at: deleteField(), // ✅ n'a de sens que tant que cloturee est vrai — nettoyé à la reconfiguration
      }, { merge: true });
      setConfig((prev) => ({ ...prev, cloturee: false }));
      setSnackbarMessage('Fenêtre de saison enregistrée avec succès !');
      setSnackbarSeverity('success');
      setOpenSnackbar(true);
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement de la fenêtre de saison :', error);
      setSnackbarMessage('Erreur lors de l\'enregistrement.');
      setSnackbarSeverity('error');
      setOpenSnackbar(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="sm">
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <EmojiEventsIcon color="primary" sx={{ fontSize: { xs: 32, sm: 40 } }} />
          <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
            Classement de saison
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Les blocs validés dans cette fenêtre comptent pour le classement de saison, qui
          détermine le top 10 garçons / top 10 filles qualifiés pour la Finale de fin de
          saison. Hors fenêtre (été compris), les validations comptent toujours pour la
          progression personnelle du grimpeur, jamais pour ce classement.
        </Typography>

        {config.cloturee && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            La saison précédente est clôturée (top 10/10 archivé, compteurs remis à zéro).
            Enregistrer une nouvelle fenêtre ci-dessous rouvre le suivi pour la saison
            suivante.
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
          <TextField
            label="Début de la saison"
            type="date"
            value={config.debut}
            onChange={(e) => setConfig({ ...config, debut: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
          <TextField
            label="Fin de la saison"
            type="date"
            value={config.fin}
            onChange={(e) => setConfig({ ...config, fin: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
            helperText="Habituellement le 31 mai — ajustable si besoin."
          />
          {config.debut && config.fin && !config.cloturee && (
            <Chip
              size="small"
              color="success"
              label="Saison en cours"
              sx={{ alignSelf: 'flex-start' }}
            />
          )}
        </Box>

        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>

        <Snackbar
          open={openSnackbar}
          autoHideDuration={6000}
          onClose={() => setOpenSnackbar(false)}
        >
          <Alert severity={snackbarSeverity} onClose={() => setOpenSnackbar(false)}>
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </Paper>
    </Container>
  );
};

export default AdminSeasonConfig;
