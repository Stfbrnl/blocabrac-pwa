import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, FormControl, InputLabel, Select, MenuItem, CircularProgress } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { formattedAppVersion } from '../config/appVersion';

// ✅ Étape 5 de CONCEPTION-ecran-live-competition.md §8 : coquille vide — route,
// layout nu, Wake Lock, sélection de la compétition à diffuser. Les listeners
// temps réel (competition_results / competition_participants) et la mise en page
// du classement viennent aux étapes 6 et 7, pas ici.

interface Competition {
  id: string;
  name: string;
}

// ✅ Aucune interaction prévue sur cet écran (§5 : "il se regarde, il ne s'utilise
// pas") : le composant Wake Lock est isolé dans ce hook plutôt que dispersé dans le
// JSX, pour que le reste du composant reste un simple affichage.
function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    // ✅ L'API n'existe pas sur tous les navigateurs/plateformes — dégrade
    // silencieusement (l'écran peut alors se mettre en veille) plutôt que de
    // planter l'affichage : ce n'est pas le seul filet, voir aussi les parades
    // matérielles du §3 (veille désactivée sur le PC).
    if (!('wakeLock' in navigator)) return;

    let cancelled = false;
    const requestLock = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
      } catch (err) {
        console.error('Wake Lock indisponible :', err);
      }
    };

    requestLock();

    // ✅ Le Wake Lock est automatiquement relâché quand l'onglet perd le focus
    // (changement d'onglet, minimisation) : sans ce ré-abonnement, revenir sur
    // la fenêtre TV après un aller-retour ailleurs laisserait l'écran repartir
    // en veille sans avertissement.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);
}

const AdminCompetitionLiveDisplay: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [eligibleCompetitions, setEligibleCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedCompetitionId = searchParams.get('competitionId') || '';

  useWakeLock();

  useEffect(() => {
    const fetchEligibleCompetitions = async () => {
      try {
        setLoading(true);
        // ✅ Deux égalités simples : pas d'index composite nécessaire (voir
        // CONCEPTION-ecran-live-competition.md §7, "Implications sur l'écran live").
        const q = query(
          collection(db, 'competitions'),
          where('status', '==', 'en cours'),
          where('liveDisplayEnabled', '==', true)
        );
        const snapshot = await getDocs(q);
        setEligibleCompetitions(snapshot.docs.map(d => ({ id: d.id, name: d.data().name || '' })));
      } catch (err) {
        console.error('Erreur lors du chargement des compétitions diffusées :', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEligibleCompetitions();
  }, []);

  const handleSelectCompetition = useCallback((competitionId: string) => {
    setSearchParams(competitionId ? { competitionId } : {});
  }, [setSearchParams]);

  const selectedCompetition = eligibleCompetitions.find(c => c.id === selectedCompetitionId) || null;

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bgcolor: '#0a0a0a',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // ✅ Marge de sécurité contre l'overscan des TV (§5) : jamais de contenu
        // collé au bord, même sur cet écran de sélection.
        p: '4vh 4vw',
        textAlign: 'center',
      }}
    >
      {loading ? (
        <CircularProgress sx={{ color: '#fff' }} />
      ) : eligibleCompetitions.length === 0 ? (
        // ✅ Message explicite plutôt qu'un écran vide (§7) : l'admin doit
        // comprendre pourquoi rien ne s'affiche sans ouvrir la console.
        <Typography variant="h4" sx={{ opacity: 0.8 }}>
          Aucune compétition en diffusion pour le moment.
        </Typography>
      ) : selectedCompetition ? (
        <Typography variant="h1" sx={{ fontSize: { xs: '3rem', sm: '5rem' }, fontWeight: 700 }}>
          {selectedCompetition.name}
        </Typography>
      ) : (
        <FormControl sx={{ minWidth: 320 }}>
          <InputLabel id="live-display-competition-select-label" sx={{ color: '#fff' }}>
            Compétition à diffuser
          </InputLabel>
          <Select
            labelId="live-display-competition-select-label"
            id="live-display-competition-select"
            value=""
            label="Compétition à diffuser"
            onChange={(e) => handleSelectCompetition(e.target.value)}
            sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: '#fff' } }}
          >
            {eligibleCompetitions.map(comp => (
              <MenuItem key={comp.id} value={comp.id}>{comp.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* ✅ Repère de version, discret (§5) : seul moyen de repérer un écran
          figé sur une version périmée servie par le service worker. */}
      <Typography
        variant="caption"
        sx={{ position: 'fixed', bottom: '2vh', right: '2vw', opacity: 0.35 }}
      >
        {formattedAppVersion}
      </Typography>
    </Box>
  );
};

export default AdminCompetitionLiveDisplay;
