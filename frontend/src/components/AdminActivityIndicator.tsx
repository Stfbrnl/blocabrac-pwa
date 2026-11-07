import React, { useEffect, useState } from 'react';
import { Alert, AlertTitle, Box, Button, Typography } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { evaluerActiviteSalle, type SeanceVoyant, type VoyantSalle } from '../utils/salleEnActivite';

/**
 * Le voyant « la salle est-elle en train de s'en servir ? », sur le tableau de bord admin.
 *
 * ⚠️ Toute la décision vit dans `utils/salleEnActivite.ts` (pur, testé) : ce composant ne fait
 * que les deux lectures et l'affichage. Le libellé est **par la conséquence** (« ne pas
 * déployer les règles »), pas par l'état (« séances actives : 1 ») — voir ce module pour la
 * raison, et pour ce que ce voyant NE voit pas.
 *
 * ⚠️ **DEUX LECTURES BORNÉES, et volontairement pas d'`onSnapshot`.** Un abonnement temps réel
 * sur `client_boulder_results` resterait ouvert tout le temps que le tableau de bord est
 * affiché — et le poste d'admin reste ouvert des heures, c'est son usage. On lit donc au
 * montage, avec un bouton pour rafraîchir à la demande : c'est un voyant qu'on consulte avant
 * d'agir, pas une surveillance continue.
 *
 * ⚠️ **Et les séances sont filtrées PAR LA DATE DU JOUR, pas chargées en entier.** Une séance
 * active a nécessairement la date du jour : `getSessionStatus` archive automatiquement à
 * minuit du lendemain. La lecture est donc bornée au nombre de séances d'aujourd'hui (une
 * poignée) et ne grandit pas avec l'âge de la salle — contrairement à un `getDocs` sur toute
 * la collection, qui aurait marché aujourd'hui et coûté de plus en plus cher chaque saison.
 */
const AdminActivityIndicator: React.FC = () => {
  const [voyant, setVoyant] = useState<VoyantSalle | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [tour, setTour] = useState(0);

  useEffect(() => {
    let annule = false;

    const mesurer = async () => {
      setChargement(true);
      setErreur(null);
      try {
        // ① Les séances du jour. `date` est une chaîne "YYYY-MM-DD" (voir
        // utils/courseSessionStatus.ts), donc une égalité stricte suffit et n'exige
        // aucun index composite.
        const maintenant = new Date();
        const aujourdHui = [
          maintenant.getFullYear(),
          String(maintenant.getMonth() + 1).padStart(2, '0'),
          String(maintenant.getDate()).padStart(2, '0'),
        ].join('-');
        const seancesSnap = await getDocs(
          query(collection(db, 'courses'), where('date', '==', aujourdHui))
        );
        const seances: SeanceVoyant[] = seancesSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            date: data.date,
            activatedAt: data.activatedAt,
            archivedAt: data.archivedAt,
            name: data.name,
          };
        });

        // ② La dernière validation connue. `limit(1)` : une lecture, pas cinq — le voyant
        // n'affiche qu'une ancienneté, les quatre autres documents ne servaient à rien.
        const derniereSnap = await getDocs(
          query(collection(db, 'client_boulder_results'), orderBy('createdAt', 'desc'), limit(1))
        );
        let derniereMs: number | null = null;
        const premier = derniereSnap.docs[0]?.data();
        const brut = premier?.createdAt;
        if (brut?.toDate) derniereMs = brut.toDate().getTime();
        else if (brut?.seconds) derniereMs = brut.seconds * 1000;
        else if (typeof brut === 'string') derniereMs = new Date(brut).getTime();
        if (derniereMs !== null && !Number.isFinite(derniereMs)) derniereMs = null;

        if (!annule) setVoyant(evaluerActiviteSalle(seances, derniereMs, new Date()));
      } catch (e: unknown) {
        // ⚠️ Signalé, pas avalé : un voyant qui échoue en silence afficherait « calme »
        // alors qu'il n'a rien mesuré — et c'est sur cette foi qu'on déploierait les règles.
        if (!annule) setErreur(e instanceof Error ? e.message : String(e));
      } finally {
        if (!annule) setChargement(false);
      }
    };

    void mesurer();
    return () => { annule = true; };
  }, [tour]);

  if (chargement && !voyant) {
    return <Alert severity="info" sx={{ mt: 2 }}>Mesure de l’activité de la salle…</Alert>;
  }

  if (erreur) {
    return (
      <Alert severity="error" sx={{ mt: 2 }} action={
        <Button size="small" startIcon={<RefreshIcon />} onClick={() => setTour((t) => t + 1)}>
          Réessayer
        </Button>
      }>
        <AlertTitle>Activité de la salle : non mesurée</AlertTitle>
        La lecture a échoué ({erreur}). <strong>Ne pas en conclure que la salle est calme :</strong>{' '}
        ce voyant n’a rien mesuré.
      </Alert>
    );
  }

  if (!voyant) return null;

  const severite = voyant.niveau === 'seance'
    ? 'warning'
    : voyant.niveau === 'activite' ? 'info' : 'success';

  return (
    <Alert
      severity={severite}
      sx={{ mt: 2 }}
      action={
        <Button size="small" startIcon={<RefreshIcon />} onClick={() => setTour((t) => t + 1)}>
          Rafraîchir
        </Button>
      }
    >
      <AlertTitle>{voyant.titre}</AlertTitle>
      {voyant.consigne}
      {voyant.seancesActives.length > 0 && (
        <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
          {voyant.seancesActives.map((s) => (
            <li key={s.id}>
              <Typography variant="body2" component="span">
                {s.name || `Séance ${s.id}`}
              </Typography>
            </li>
          ))}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {voyant.portee}
      </Typography>
    </Alert>
  );
};

export default AdminActivityIndicator;
