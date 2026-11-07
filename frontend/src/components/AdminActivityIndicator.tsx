import React, { useEffect, useState } from 'react';
import { Alert, AlertTitle, Box, Button, Typography } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
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
 * 🔴 **LA PREMIÈRE VERSION FILTRAIT PAR `where('date','==','YYYY-MM-DD')`, ET NE POUVAIT RIEN
 * TROUVER** : en production `courses.date` est un **Timestamp**, pas une chaîne (mesuré le
 * 07/11/2026 sur les 3 documents de prod, tous Timestamp). Le voyant affichait donc « aucune
 * activité détectée » quoi qu'il arrive — **une erreur dans le sens rassurant**, c'est-à-dire
 * la pire, puisque c'est sur sa foi qu'on déploie les règles.
 *
 * ⚠️ **On lit donc la collection entière et on filtre côté client**, et c'est un arbitrage
 * assumé contre l'argument de coût du commentaire d'origine. Une requête par intervalle de
 * Timestamps serait bornée, mais elle **exclurait silencieusement** toute séance stockée sous
 * une autre forme (Firestore ordonne par type : une chaîne et un Timestamp ne se comparent
 * pas). Devant un instrument dont l'erreur est rassurante, **la robustesse de forme passe
 * avant la borne de coût**. La collection compte 3 documents en production ; le jour où elle
 * en comptera quelques centaines, le voyant lira toujours juste, et c'est à ce moment-là qu'on
 * décidera d'une borne — avec une forme de champ, elle, enfin unifiée.
 *
 * ⚠️ Et le nombre de séances examinées est **affiché** : c'est le dénominateur du voyant. Le
 * premier annonçait « mesuré sur les séances du jour » alors qu'il n'en voyait aucune — une
 * portée qui décrivait l'intention et non la mesure.
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
        // ① Les séances, SANS filtre de date — voir l'en-tête pour pourquoi le filtre a été
        // retiré. La date brute est transmise telle quelle : c'est `normaliserDateSeance`
        // (pur, testé sur les deux formes réellement présentes en prod) qui la ramène au
        // format que `getSessionStatus` consomme.
        const seancesSnap = await getDocs(collection(db, 'courses'));
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
