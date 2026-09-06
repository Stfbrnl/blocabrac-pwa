import React, { useEffect, useState } from 'react';
import {
  Typography, Paper, Container, Button, TextField, Box,
  Snackbar, Alert, Chip, CircularProgress
} from '@mui/material';
import { EmojiEvents as EmojiEventsIcon } from '@mui/icons-material';
import { db } from '../services/firebaseConfig';
import { doc, getDoc, setDoc, deleteField, collection, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { recomputeSeasonBaseline, type SeasonBaselineResult } from '../utils/classementScore';

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
  const [restarting, setRestarting] = useState(false);
  const [restartProgress, setRestartProgress] = useState('');

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

  // ✅ Redémarrage du classement de saison (V2.56, Modèle A — HANDOFF/RETOUR-redemarrage-saison,
  // 06/09). Recalcule le CRÉDIT DE DÉPART de chaque grimpeur = ses validations existantes des
  // blocs encore posés (rien à revalider, essais d'origine réutilisés), puis la saison
  // s'accumule et ne redescend JAMAIS quand un mur change.
  // Ordre imposé (retour ClaudeNav §2) : profils D'ABORD (base* + season.*), fenêtre EN
  // DERNIER — sinon une passe de réconciliation sur un profil non encore traité calculerait
  // un attendu amputé du crédit et l'écrirait. Idempotent : les chemins pointés REMPLACENT,
  // un second clic recalcule la même chose.
  const handleRestart = async () => {
    if (!config.debut || !config.fin) {
      setSnackbarMessage('Renseignez les deux dates de la nouvelle saison avant de redémarrer.');
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
    if (!window.confirm(
      'Redémarrer le classement de saison ?\n\n'
      + 'Le score de saison de TOUS les grimpeurs va être recalculé : il repart de leurs '
      + 'validations actuelles des blocs encore posés (rien à revalider), puis s\'accumule à '
      + `partir du ${config.debut}. Les points ne redescendront plus quand un mur change.\n\n`
      + 'Action irréversible.'
    )) return;

    setRestarting(true);
    setRestartProgress('Chargement de l\'inventaire des blocs…');
    try {
      // ⚠️ Modèle A / retour ClaudeNav §1 : TOUS les blocs quotidiens (actifs ET désactivés) —
      // un bloc validé puis retiré garde ses points, sa couleur reste lisible (aucun chemin
      // n'efface un document `boulders`, une rotation fait `is_active:false`).
      const bouldersSnap = await getDocs(query(collection(db, 'boulders'), where('type', '==', 'daily')));
      const colorById = new Map<string, string | null>();
      bouldersSnap.forEach((b) => {
        const d = b.data();
        colorById.set(b.id, d.color || d.difficulty || null);
      });

      const profilesSnap = await getDocs(collection(db, 'classement_profiles'));
      const total = profilesSnap.size;
      let done = 0;
      setRestartProgress(`Recalcul des profils : 0/${total}`);

      for (const profileDoc of profilesSnap.docs) {
        const uid = profileDoc.id;
        const resultsSnap = await getDocs(query(
          collection(db, 'client_boulder_results'),
          where('userId', '==', uid),
          where('success', '==', true),
        ));
        const results: SeasonBaselineResult[] = resultsSnap.docs.map((r) => ({
          boulderId: r.data().boulderId,
          attempts: r.data().attempts || 1,
        }));
        const { score, colorCounts } = recomputeSeasonBaseline(results, colorById);
        // Chemins pointés → remplacent la valeur à ce chemin (pas de fusion de map, donc
        // pas de clé orpheline). `profileDoc.ref` provient d'un snapshot de requête → le
        // document existe, `updateDoc` est sûr (retour ClaudeNav Q6).
        await updateDoc(profileDoc.ref, {
          'season.baseScore': score,
          'season.baseColorCounts': colorCounts,
          'season.score': score,
          'season.colorCounts': colorCounts,
        });
        done += 1;
        setRestartProgress(`Recalcul des profils : ${done}/${total}`);
      }

      setRestartProgress('Enregistrement de la nouvelle fenêtre…');
      await setDoc(doc(db, 'app_config', 'classement_saison'), {
        debut: config.debut,
        fin: config.fin,
        cloturee: false,
        cloturee_at: deleteField(),
      }, { merge: true });
      setConfig((prev) => ({ ...prev, cloturee: false }));

      setSnackbarMessage(`Saison redémarrée : ${total} profil(s) recalculé(s), nouvelle fenêtre à partir du ${config.debut}.`);
      setSnackbarSeverity('success');
      setOpenSnackbar(true);
    } catch (error) {
      console.error('Erreur lors du redémarrage de la saison :', error);
      setSnackbarMessage('Erreur lors du redémarrage — certains profils ont pu être recalculés, la fenêtre n\'a pas été modifiée. Relancez pour terminer.');
      setSnackbarSeverity('error');
      setOpenSnackbar(true);
    } finally {
      setRestarting(false);
      setRestartProgress('');
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
          disabled={saving || restarting}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>

        <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Redémarrer la saison</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Remet le classement de saison à plat en gardant le crédit acquis : chaque grimpeur
            repart de ses validations actuelles des blocs encore posés (rien à revalider), puis
            la saison s'accumule à partir de la date de début ci-dessus et ne redescend plus
            quand un mur change. Utile pendant le déploiement, tant que peu de grimpeurs sont
            équipés. Renseignez d'abord les dates voulues, puis cliquez ici (pas besoin
            d'« Enregistrer » avant).
          </Typography>
          <Button
            variant="outlined"
            color="warning"
            onClick={handleRestart}
            disabled={restarting || saving}
          >
            {restarting ? 'Redémarrage en cours…' : 'Redémarrer la saison maintenant'}
          </Button>
          {restarting && restartProgress && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {restartProgress}
            </Typography>
          )}
        </Box>

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
