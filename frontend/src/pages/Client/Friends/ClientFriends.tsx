import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where,
} from 'firebase/firestore';
import {
  Container, Paper, Typography, Box, TextField, Button, List, ListItem,
  Chip, Divider, CircularProgress, Alert, IconButton, FormControl, InputLabel,
  Select, MenuItem, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  RadioGroup, Radio, FormControlLabel, Checkbox, FormLabel, ListItemText,
} from '@mui/material';
import {
  Check as CheckIcon, Close as CloseIcon, PersonAdd as PersonAddIcon,
  Delete as DeleteIcon, EmojiEvents as TrophyIcon, Add as AddIcon,
} from '@mui/icons-material';
import { levelOrder } from '../../../utils/competitionEligibility';
import {
  resolveSeuilWinner, resolveFenetreWinner, resolveBlocDesigneWinner, resolveDeclaratifCompletion,
  SEUIL_TARGET_MAX, SEUIL_TARGET_MAX_MINUS_1,
  type ChallengeStructure, type ChallengeProgress,
} from '../../../utils/challenges';

// Libellé lisible d'une cible de défi "seuil" : une couleur brute, ou un jeton de niveau relatif.
const describeSeuilTarget = (target: string | undefined): string => {
  if (target === SEUIL_TARGET_MAX) return 'de ton niveau max';
  if (target === SEUIL_TARGET_MAX_MINUS_1) return 'de ton niveau max −1';
  return target || '';
};

const CLIMBING_STATUS_STALE_HOURS = 3;
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// ✅ Même règle des deux côtés (voir firestore.rules) : les deux uids triés puis
// concaténés, pour qu'une seule relation existe entre deux personnes.
const friendPairId = (uidA: string, uidB: string) => (uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`);

interface DirectoryEntry {
  uid: string;
  name: string;
}

interface Friendship {
  id: string;
  uids: string[];
  status: 'pending' | 'accepted';
  requestedBy: string;
  createdAt: string;
}

interface ClimbingStatus {
  active: boolean;
  since: string;
}

interface NextSession {
  day: string;
  timeSlot: string;
  updatedAt: string;
}

interface StatusDisplay {
  label: string;
  color: 'success' | 'default';
}

// ✅ Défis entre potes (CONCEPTION-roulette-et-defis.md, Partie 2). `boulder_label` n'est
// pas dans le modèle du document de conception : ajouté pour figer un libellé lisible
// ("rouge n°12 - Gullich") au moment de la création, évitant une relecture de `boulders`
// juste pour l'affichage (le bloc peut être désactivé/renuméroté entre-temps).
interface ChallengeDoc {
  id: string;
  created_by: string;
  structure: ChallengeStructure;
  catalog_id: string | null;
  title: string;
  participants: string[];
  progress: ChallengeProgress;
  status: 'en_cours' | 'termine';
  winner_uid: string | null;
  created_at: string;
  ends_at?: string;
  target_count?: number;
  target_color?: string;
  metric?: 'points' | 'blocs';
  boulder_id?: string;
  boulder_label?: string;
  description?: string;
}

interface ActiveBoulderOption {
  id: string;
  label: string;
}

const STRUCTURE_LABELS: Record<ChallengeStructure, string> = {
  seuil: 'Premier à atteindre un seuil',
  fenetre: 'Le plus de progrès sur une période',
  bloc_designe: 'Meilleur score sur un même bloc',
  declaratif: 'Défi déclaratif',
};

// ✅ Calcule la péremption (Date.now()) une seule fois par rafraîchissement, jamais
// pendant le rendu (règle "purity" de react-hooks : un composant ne doit pas appeler
// de fonction impure comme Date.now() directement dans son corps de rendu).
const buildStatusDisplay = (status?: ClimbingStatus): StatusDisplay | null => {
  if (!status?.active) return null;
  const hoursSince = (Date.now() - new Date(status.since).getTime()) / (1000 * 60 * 60);
  if (hoursSince > CLIMBING_STATUS_STALE_HOURS) {
    return { label: `En salle il y a ${Math.round(hoursSince)}h (peut-être terminé)`, color: 'default' };
  }
  return { label: 'En salle en ce moment', color: 'success' };
};

// ✅ Accessible via "Mon espace personnel" (donc protégée par role="client" dans
// AppRoutes.tsx), mais utilisable par le staff aussi : firestore.rules garantit que
// tout compte porte le rôle "client" en plus de ses éventuels rôles admin/moniteur/
// ouvreur (voir AdminUsers.tsx), donc "Mon espace" reste atteignable par tout le monde.
const ClientFriends: React.FC = () => {
  const [user] = useAuthState(auth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [myStatus, setMyStatus] = useState<ClimbingStatus | null>(null);
  const [myNextSession, setMyNextSession] = useState<NextSession | null>(null);
  const [sessionDay, setSessionDay] = useState('');
  const [sessionSlot, setSessionSlot] = useState('');

  const [friendStatusDisplays, setFriendStatusDisplays] = useState<Record<string, StatusDisplay>>({});
  const [friendSessions, setFriendSessions] = useState<Record<string, NextSession>>({});

  // ✅ Défis entre potes
  const [challenges, setChallenges] = useState<ChallengeDoc[]>([]);
  const [challengeDialogOpen, setChallengeDialogOpen] = useState(false);
  const [newStructure, setNewStructure] = useState<ChallengeStructure>('seuil');
  const [newTitle, setNewTitle] = useState('');
  const [newParticipants, setNewParticipants] = useState<string[]>([]);
  const [newTargetColor, setNewTargetColor] = useState('rouge');
  const [newTargetCount, setNewTargetCount] = useState('5');
  const [newMetric, setNewMetric] = useState<'points' | 'blocs'>('blocs');
  const [newEndsAt, setNewEndsAt] = useState('');
  const [newBoulderId, setNewBoulderId] = useState('');
  const [activeBoulders, setActiveBoulders] = useState<ActiveBoulderOption[]>([]);
  const [newDescription, setNewDescription] = useState('');
  const [challengeError, setChallengeError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user?.uid) return;
    try {
      setLoading(true);
      setError(null);

      // ✅ Annuaire fusionné : "classement_profiles" (clients) + "staff_directory"
      // (moniteur/ouvreur/admin) sont les deux seules fiches publiques qu'un
      // utilisateur peut lister d'après les règles Firestore (même besoin que
      // ClientClassement.tsx/ClientMessages.tsx), la collection "users" complète
      // n'étant jamais listable par un non-admin.
      const [profilesSnap, staffSnap, friendshipsSnap, challengesSnap] = await Promise.all([
        getDocs(collection(db, 'classement_profiles')),
        getDocs(collection(db, 'staff_directory')),
        getDocs(query(collection(db, 'friendships'), where('uids', 'array-contains', user.uid))),
        getDocs(query(collection(db, 'challenges'), where('participants', 'array-contains', user.uid))),
      ]);

      setChallenges(challengesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ChallengeDoc)));

      const dir: DirectoryEntry[] = [
        ...profilesSnap.docs
          .filter((d) => d.id !== user.uid)
          .map((d) => {
            const data = d.data();
            return { uid: d.id, name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Grimpeur' };
          }),
        ...staffSnap.docs
          .filter((d) => d.id !== user.uid)
          .map((d) => ({ uid: d.id, name: d.data().displayName || 'Grimpeur' })),
      ];
      setDirectory(dir);

      const friendshipsData: Friendship[] = friendshipsSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          uids: data.uids,
          status: data.status,
          requestedBy: data.requestedBy,
          createdAt: data.createdAt,
        };
      });
      setFriendships(friendshipsData);

      const acceptedFriendUids = friendshipsData
        .filter((f) => f.status === 'accepted')
        .map((f) => f.uids.find((uid) => uid !== user.uid) as string);

      const [statusDocs, sessionDocs, myStatusDoc, myNextSessionDoc] = await Promise.all([
        Promise.all(acceptedFriendUids.map((uid) => getDoc(doc(db, 'climbing_status', uid)))),
        Promise.all(acceptedFriendUids.map((uid) => getDoc(doc(db, 'next_sessions', uid)))),
        getDoc(doc(db, 'climbing_status', user.uid)),
        getDoc(doc(db, 'next_sessions', user.uid)),
      ]);

      const statusDisplayMap: Record<string, StatusDisplay> = {};
      statusDocs.forEach((snap, idx) => {
        const display = buildStatusDisplay(snap.exists() ? (snap.data() as ClimbingStatus) : undefined);
        if (display) statusDisplayMap[acceptedFriendUids[idx]] = display;
      });
      setFriendStatusDisplays(statusDisplayMap);

      const sessionMap: Record<string, NextSession> = {};
      sessionDocs.forEach((snap, idx) => {
        if (snap.exists()) sessionMap[acceptedFriendUids[idx]] = snap.data() as NextSession;
      });
      setFriendSessions(sessionMap);

      setMyStatus(myStatusDoc.exists() ? (myStatusDoc.data() as ClimbingStatus) : null);
      const nextSessionData = myNextSessionDoc.exists() ? (myNextSessionDoc.data() as NextSession) : null;
      setMyNextSession(nextSessionData);
      setSessionDay(nextSessionData?.day || '');
      setSessionSlot(nextSessionData?.timeSlot || '');
    } catch (err) {
      console.error('Erreur lors du chargement de "Potes de grimpe" :', err);
      setError('Impossible de charger tes potes de grimpe.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void (async () => {
      await fetchAll();
    })();
  }, [fetchAll]);

  const directoryNameByUid = useMemo(() => {
    const map = new Map<string, string>();
    directory.forEach((entry) => map.set(entry.uid, entry.name));
    return map;
  }, [directory]);

  const relatedUids = useMemo(() => new Set(friendships.flatMap((f) => f.uids)), [friendships]);

  const searchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return directory
      .filter((entry) => !relatedUids.has(entry.uid))
      .filter((entry) => entry.name.toLowerCase().includes(term))
      .slice(0, 20);
  }, [directory, searchTerm, relatedUids]);

  const acceptedFriendships = useMemo(() => friendships.filter((f) => f.status === 'accepted'), [friendships]);
  const incomingRequests = useMemo(
    () => friendships.filter((f) => f.status === 'pending' && f.requestedBy !== user?.uid),
    [friendships, user],
  );
  const outgoingRequests = useMemo(
    () => friendships.filter((f) => f.status === 'pending' && f.requestedBy === user?.uid),
    [friendships, user],
  );

  const otherUidOf = useCallback((f: Friendship) => f.uids.find((uid) => uid !== user?.uid) as string, [user]);

  const sendFriendRequest = async (otherUid: string) => {
    if (!user?.uid) return;
    try {
      await setDoc(doc(db, 'friendships', friendPairId(user.uid, otherUid)), {
        uids: [user.uid, otherUid],
        status: 'pending',
        requestedBy: user.uid,
        createdAt: new Date().toISOString(),
      });
      setSearchTerm('');
      await fetchAll();
    } catch (err) {
      console.error('Erreur lors de l\'envoi de la demande d\'ami :', err);
      setError('Impossible d\'envoyer la demande.');
    }
  };

  const acceptRequest = async (pairId: string) => {
    try {
      await updateDoc(doc(db, 'friendships', pairId), { status: 'accepted' });
      await fetchAll();
    } catch (err) {
      console.error('Erreur lors de l\'acceptation de la demande :', err);
      setError('Impossible d\'accepter la demande.');
    }
  };

  const removeFriendship = async (pairId: string) => {
    try {
      await deleteDoc(doc(db, 'friendships', pairId));
      await fetchAll();
    } catch (err) {
      console.error('Erreur lors de la suppression de la relation :', err);
      setError('Impossible de supprimer cette relation.');
    }
  };

  const toggleClimbingStatus = async () => {
    if (!user?.uid) return;
    try {
      const newStatus: ClimbingStatus = { active: !(myStatus?.active ?? false), since: new Date().toISOString() };
      await setDoc(doc(db, 'climbing_status', user.uid), newStatus);
      setMyStatus(newStatus);
    } catch (err) {
      console.error('Erreur lors de la mise à jour du statut de grimpe :', err);
      setError('Impossible de mettre à jour ton statut.');
    }
  };

  const saveNextSession = async () => {
    if (!user?.uid || !sessionDay || !sessionSlot.trim()) return;
    try {
      const session: NextSession = { day: sessionDay, timeSlot: sessionSlot.trim(), updatedAt: new Date().toISOString() };
      await setDoc(doc(db, 'next_sessions', user.uid), session);
      setMyNextSession(session);
    } catch (err) {
      console.error('Erreur lors de l\'enregistrement de la prochaine session :', err);
      setError('Impossible d\'enregistrer ta prochaine session.');
    }
  };

  const clearNextSession = async () => {
    if (!user?.uid) return;
    try {
      await deleteDoc(doc(db, 'next_sessions', user.uid));
      setMyNextSession(null);
      setSessionDay('');
      setSessionSlot('');
    } catch (err) {
      console.error('Erreur lors de la suppression de la prochaine session :', err);
      setError('Impossible de supprimer ta prochaine session.');
    }
  };

  const acceptedFriendUidsList = useMemo(
    () => acceptedFriendships.map((f) => otherUidOf(f)),
    [acceptedFriendships, otherUidOf],
  );

  // ✅ Charge les blocs actifs du jour une seule fois, à l'ouverture du dialogue de
  // création (pas au montage de la page) : c'est le seul cas où "Défis" a besoin de la
  // collection `boulders`, pour la structure "bloc désigné".
  const openChallengeDialog = async () => {
    setChallengeError(null);
    setNewStructure('seuil');
    setNewTitle('');
    setNewParticipants([]);
    setNewTargetColor('rouge');
    setNewTargetCount('5');
    setNewMetric('blocs');
    setNewEndsAt('');
    setNewBoulderId('');
    setNewDescription('');
    setChallengeDialogOpen(true);
    if (activeBoulders.length === 0) {
      try {
        const snap = await getDocs(query(collection(db, 'boulders'), where('type', '==', 'daily'), where('is_active', '==', true)));
        setActiveBoulders(snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, label: `${data.color || '?'} n°${data.number || d.id} - ${data.wall || ''}`.trim() };
        }));
      } catch (err) {
        console.error('Erreur lors du chargement des blocs actifs :', err);
      }
    }
  };

  const createChallenge = async () => {
    if (!user?.uid) return;
    const participants = Array.from(new Set([user.uid, ...newParticipants]));
    if (participants.length < 2) { setChallengeError('Choisis au moins un pote.'); return; }
    if (participants.length > 6) { setChallengeError('6 participants maximum.'); return; }
    if (!newTitle.trim()) { setChallengeError('Donne un titre au défi.'); return; }
    if (newStructure === 'fenetre' && !newEndsAt) { setChallengeError('Choisis une date de fin.'); return; }
    if (newStructure === 'bloc_designe' && !newBoulderId) { setChallengeError('Choisis un bloc.'); return; }
    if (newStructure === 'declaratif' && !newDescription.trim()) { setChallengeError('Décris le défi.'); return; }

    const now = new Date().toISOString();
    const progress: ChallengeProgress = {};
    participants.forEach((uid) => { progress[uid] = { value: 0, updated_at: now }; });

    const payload: Record<string, unknown> = {
      created_by: user.uid,
      structure: newStructure,
      catalog_id: null,
      title: newTitle.trim(),
      participants,
      progress,
      status: 'en_cours',
      winner_uid: null,
      created_at: now,
    };
    if (newStructure === 'seuil') {
      payload.target_count = Math.max(1, parseInt(newTargetCount, 10) || 1);
      payload.target_color = newTargetColor;
    } else if (newStructure === 'fenetre') {
      payload.metric = newMetric;
      payload.ends_at = new Date(`${newEndsAt}T23:59:59`).toISOString();
    } else if (newStructure === 'bloc_designe') {
      payload.boulder_id = newBoulderId;
      payload.boulder_label = activeBoulders.find((b) => b.id === newBoulderId)?.label || '';
    } else {
      payload.description = newDescription.trim();
    }

    try {
      await setDoc(doc(collection(db, 'challenges')), payload);
      setChallengeDialogOpen(false);
      await fetchAll();
    } catch (err) {
      console.error('Erreur lors de la création du défi :', err);
      setChallengeError('Impossible de créer ce défi.');
    }
  };

  // ✅ Structure "declaratif" (§2.1) : un bouton "fait" par participant, aucun chemin de
  // vérification. C'est la seule structure où l'utilisateur écrit sa progression depuis
  // cet écran — les trois autres sont mises à jour depuis ClientDaily.tsx à la validation.
  const markDeclaratifDone = async (challenge: ChallengeDoc) => {
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, 'challenges', challenge.id), {
        [`progress.${user.uid}`]: { value: 1, updated_at: new Date().toISOString() },
      });
      await fetchAll();
    } catch (err) {
      console.error('Erreur lors de la validation du défi déclaratif :', err);
      setError('Impossible de valider ce défi.');
    }
  };

  const closeChallenge = async (challengeId: string, winnerUid: string | null) => {
    try {
      await updateDoc(doc(db, 'challenges', challengeId), { status: 'termine', winner_uid: winnerUid });
      await fetchAll();
    } catch (err) {
      console.error('Erreur lors de la clôture du défi :', err);
      setError('Impossible de clôturer ce défi.');
    }
  };

  // ✅ Clôture automatique d'une fenêtre échue (§2.5) : "sans backend, elle ne peut être
  // déclenchée que par une ouverture d'écran" — pas de bouton, le premier participant qui
  // ouvre cet écran après l'échéance fige le vainqueur. Ne s'exécute qu'une fois par jeu de
  // défis chargé (dépendance sur la liste elle-même, pas de polling).
  useEffect(() => {
    challenges
      .filter((c) => c.structure === 'fenetre' && c.status === 'en_cours' && c.ends_at && c.ends_at < new Date().toISOString())
      .forEach((c) => {
        const result = resolveFenetreWinner(c.progress);
        void closeChallenge(c.id, result.winnerUids[0] || null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenges]);

  if (loading) {
    return (
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Typography variant="h4" gutterBottom sx={{ mt: 3, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
        Potes de grimpe
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Fonctionnalité entièrement optionnelle : rien n'est partagé tant que tu n'ajoutes pas d'amis,
        n'actives pas ton statut, ou ne renseignes pas ta prochaine session.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Mon statut</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button
            variant={myStatus?.active ? 'outlined' : 'contained'}
            color={myStatus?.active ? 'error' : 'success'}
            onClick={toggleClimbingStatus}
          >
            {myStatus?.active ? 'Je ne grimpe plus' : 'Je suis en train de grimper'}
          </Button>
          {myStatus?.active && (
            <Typography variant="body2" color="text.secondary">
              Actif depuis {new Date(myStatus.since).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })},
              visible par tes amis pendant {CLIMBING_STATUS_STALE_HOURS}h.
            </Typography>
          )}
        </Box>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Ma prochaine session</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="next-session-day-label">Jour</InputLabel>
            <Select
              labelId="next-session-day-label"
              label="Jour"
              value={sessionDay}
              onChange={(e) => setSessionDay(e.target.value)}
            >
              {DAYS.map((day) => (
                <MenuItem key={day} value={day}>{day}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Créneau horaire"
            placeholder="ex : 18h-20h"
            value={sessionSlot}
            onChange={(e) => setSessionSlot(e.target.value)}
          />
          <Button variant="contained" onClick={saveNextSession} disabled={!sessionDay || !sessionSlot.trim()}>
            Enregistrer
          </Button>
          {myNextSession && (
            <Button variant="text" color="error" onClick={clearNextSession}>
              Effacer
            </Button>
          )}
        </Box>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Ajouter des potes de grimpe</Typography>
        <TextField
          fullWidth
          size="small"
          label="Rechercher par nom"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ mb: 1 }}
        />
        {searchResults.length > 0 && (
          <List dense>
            {searchResults.map((entry) => (
              <ListItem
                key={entry.uid}
                secondaryAction={
                  <Button size="small" startIcon={<PersonAddIcon />} onClick={() => sendFriendRequest(entry.uid)}>
                    Ajouter
                  </Button>
                }
              >
                <Typography>{entry.name}</Typography>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {incomingRequests.length > 0 && (
        <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Demandes reçues</Typography>
          <List dense>
            {incomingRequests.map((f) => (
              <ListItem
                key={f.id}
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Accepter">
                      <IconButton color="success" aria-label="Accepter" onClick={() => acceptRequest(f.id)}>
                        <CheckIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Refuser">
                      <IconButton color="error" aria-label="Refuser" onClick={() => removeFriendship(f.id)}>
                        <CloseIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                }
              >
                <Typography>{directoryNameByUid.get(otherUidOf(f)) || 'Grimpeur'}</Typography>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {outgoingRequests.length > 0 && (
        <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Demandes envoyées</Typography>
          <List dense>
            {outgoingRequests.map((f) => (
              <ListItem
                key={f.id}
                secondaryAction={
                  <Button size="small" color="error" onClick={() => removeFriendship(f.id)}>
                    Annuler
                  </Button>
                }
              >
                <Box>
                  <Typography>{directoryNameByUid.get(otherUidOf(f)) || 'Grimpeur'}</Typography>
                  <Typography variant="body2" color="text.secondary">En attente de confirmation</Typography>
                </Box>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" gutterBottom>Mes potes de grimpe</Typography>
        {acceptedFriendships.length === 0 ? (
          <Typography color="text.secondary">Aucun ami pour l'instant.</Typography>
        ) : (
          <List>
            {acceptedFriendships.map((f, index) => {
              const otherUid = otherUidOf(f);
              const status = friendStatusDisplays[otherUid];
              const session = friendSessions[otherUid];
              return (
                <React.Fragment key={f.id}>
                  {index > 0 && <Divider component="li" />}
                  <ListItem
                    secondaryAction={
                      <Tooltip title="Retirer cet ami">
                        <IconButton edge="end" aria-label="Retirer cet ami" onClick={() => removeFriendship(f.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    }
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography>{directoryNameByUid.get(otherUid) || 'Grimpeur'}</Typography>
                        {status && <Chip size="small" label={status.label} color={status.color} />}
                      </Box>
                      {session && (
                        <Typography variant="body2" color="text.secondary">
                          Prochaine session : {session.day} · {session.timeSlot}
                        </Typography>
                      )}
                    </Box>
                  </ListItem>
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          <Typography variant="h6">Défis entre potes</Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            disabled={acceptedFriendUidsList.length === 0}
            onClick={openChallengeDialog}
          >
            Lancer un défi
          </Button>
        </Box>
        {acceptedFriendUidsList.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Ajoute au moins un pote pour pouvoir lancer un défi.
          </Typography>
        )}
        {challenges.length === 0 ? (
          acceptedFriendUidsList.length > 0 && <Typography color="text.secondary">Aucun défi pour l'instant.</Typography>
        ) : (
          <List>
            {challenges
              .slice()
              .sort((a, b) => (a.status === b.status ? b.created_at.localeCompare(a.created_at) : a.status === 'en_cours' ? -1 : 1))
              .map((challenge, index) => {
                const nameFor = (uid: string) => (uid === user?.uid ? 'Toi' : (directoryNameByUid.get(uid) || 'Grimpeur'));
                const sortedProgress = challenge.participants
                  .map((uid) => ({ uid, entry: challenge.progress[uid] || { value: 0, updated_at: challenge.created_at } }))
                  .sort((a, b) => b.entry.value - a.entry.value);

                let computedWinnerUids: string[] = [];
                let reached = false;
                if (challenge.structure === 'seuil') {
                  const r = resolveSeuilWinner(challenge.progress, challenge.target_count || 0);
                  computedWinnerUids = r.winnerUids; reached = r.reached;
                } else if (challenge.structure === 'bloc_designe') {
                  const r = resolveBlocDesigneWinner(challenge.progress);
                  computedWinnerUids = r.winnerUids; reached = r.reached;
                } else if (challenge.structure === 'fenetre') {
                  const r = resolveFenetreWinner(challenge.progress);
                  computedWinnerUids = r.winnerUids; reached = r.reached;
                }
                const doneUids = challenge.structure === 'declaratif' ? resolveDeclaratifCompletion(challenge.progress) : [];

                return (
                  <React.Fragment key={challenge.id}>
                    {index > 0 && <Divider component="li" />}
                    <ListItem alignItems="flex-start" sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 600 }}>{challenge.title}</Typography>
                        <Chip size="small" label={STRUCTURE_LABELS[challenge.structure]} />
                        <Chip
                          size="small"
                          label={challenge.status === 'termine' ? 'Terminé' : 'En cours'}
                          color={challenge.status === 'termine' ? 'default' : 'success'}
                        />
                      </Box>
                      {challenge.structure === 'seuil' && (
                        <Typography variant="body2" color="text.secondary">
                          Premier à {challenge.target_count} blocs {describeSeuilTarget(challenge.target_color)}
                        </Typography>
                      )}
                      {challenge.structure === 'fenetre' && (
                        <Typography variant="body2" color="text.secondary">
                          {challenge.metric === 'points' ? 'Le plus de points' : 'Le plus de blocs'} avant le{' '}
                          {challenge.ends_at ? new Date(challenge.ends_at).toLocaleDateString('fr-FR') : '?'}
                        </Typography>
                      )}
                      {challenge.structure === 'bloc_designe' && (
                        <Typography variant="body2" color="text.secondary">Sur : {challenge.boulder_label}</Typography>
                      )}
                      {challenge.structure === 'declaratif' && (
                        <Typography variant="body2" color="text.secondary">{challenge.description}</Typography>
                      )}

                      {challenge.structure === 'declaratif' ? (
                        <List dense disablePadding sx={{ mt: 1 }}>
                          {challenge.participants.map((uid) => (
                            <ListItem key={uid} disableGutters>
                              <ListItemText primary={nameFor(uid)} />
                              {doneUids.includes(uid) ? (
                                <Chip size="small" color="success" icon={<CheckIcon />} label="Fait" />
                              ) : uid === user?.uid && challenge.status === 'en_cours' ? (
                                <Button size="small" onClick={() => markDeclaratifDone(challenge)}>C'est fait</Button>
                              ) : (
                                <Chip size="small" label="Pas encore" />
                              )}
                            </ListItem>
                          ))}
                        </List>
                      ) : (
                        <List dense disablePadding sx={{ mt: 1 }}>
                          {sortedProgress.map(({ uid, entry }) => (
                            <ListItem key={uid} disableGutters>
                              <ListItemText
                                primary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    {computedWinnerUids.includes(uid) && reached && <TrophyIcon fontSize="small" color="warning" />}
                                    {nameFor(uid)}
                                  </Box>
                                }
                              />
                              <Typography>{entry.value}</Typography>
                            </ListItem>
                          ))}
                        </List>
                      )}

                      {challenge.status === 'termine' && (
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          {challenge.structure === 'declaratif'
                            ? (doneUids.length > 0 ? `Réussi par : ${doneUids.map(nameFor).join(', ')}` : 'Personne n\'a validé.')
                            : (challenge.winner_uid ? `Vainqueur : ${nameFor(challenge.winner_uid)}` : 'Pas de vainqueur.')}
                        </Typography>
                      )}

                      {challenge.status === 'en_cours' && challenge.structure !== 'fenetre' && (
                        <Box sx={{ mt: 1 }}>
                          {challenge.structure === 'declaratif' ? (
                            <Button size="small" variant="outlined" onClick={() => closeChallenge(challenge.id, null)}>
                              Terminer le défi
                            </Button>
                          ) : reached && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<TrophyIcon />}
                              onClick={() => closeChallenge(challenge.id, computedWinnerUids[0])}
                            >
                              Clôturer{computedWinnerUids.length === 1 ? ` (victoire de ${nameFor(computedWinnerUids[0])})` : ' (égalité)'}
                            </Button>
                          )}
                        </Box>
                      )}
                    </ListItem>
                  </React.Fragment>
                );
              })}
          </List>
        )}
      </Paper>

      <Dialog open={challengeDialogOpen} onClose={() => setChallengeDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Lancer un défi</DialogTitle>
        <DialogContent>
          {challengeError && <Alert severity="error" sx={{ mb: 2 }}>{challengeError}</Alert>}
          <TextField
            fullWidth
            label="Titre du défi"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            sx={{ mb: 2, mt: 1 }}
          />
          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Type de défi</FormLabel>
            <RadioGroup value={newStructure} onChange={(e) => setNewStructure(e.target.value as ChallengeStructure)}>
              <FormControlLabel value="seuil" control={<Radio />} label="Premier à atteindre un seuil (ex : 5 rouges)" />
              <FormControlLabel value="fenetre" control={<Radio />} label="Le plus de progrès sur une période" />
              <FormControlLabel value="bloc_designe" control={<Radio />} label="Meilleur score sur un même bloc" />
              <FormControlLabel value="declaratif" control={<Radio />} label="Défi déclaratif (traversée, bloc inventé...)" />
            </RadioGroup>
          </FormControl>

          {newStructure === 'seuil' && (
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <TextField
                type="number"
                label="Nombre de blocs"
                value={newTargetCount}
                onChange={(e) => setNewTargetCount(e.target.value)}
                onBlur={() => setNewTargetCount((v) => String(Math.max(1, parseInt(v, 10) || 1)))}
                slotProps={{ htmlInput: { min: 1 } }}
                sx={{ width: 160 }}
              />
              <FormControl sx={{ minWidth: 180 }}>
                <InputLabel id="target-color-label">Couleur / niveau</InputLabel>
                <Select labelId="target-color-label" label="Couleur / niveau" value={newTargetColor} onChange={(e) => setNewTargetColor(e.target.value)}>
                  <MenuItem value={SEUIL_TARGET_MAX}>Mon niveau max</MenuItem>
                  <MenuItem value={SEUIL_TARGET_MAX_MINUS_1}>Mon niveau max −1</MenuItem>
                  {levelOrder.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
          )}

          {newStructure === 'fenetre' && (
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <FormControl sx={{ minWidth: 160 }}>
                <InputLabel id="metric-label">Compter en</InputLabel>
                <Select labelId="metric-label" label="Compter en" value={newMetric} onChange={(e) => setNewMetric(e.target.value as 'points' | 'blocs')}>
                  <MenuItem value="blocs">Nombre de blocs</MenuItem>
                  <MenuItem value="points">Points</MenuItem>
                </Select>
              </FormControl>
              <TextField
                type="date"
                label="Jusqu'au"
                value={newEndsAt}
                onChange={(e) => setNewEndsAt(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
          )}

          {newStructure === 'bloc_designe' && (
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="boulder-label">Bloc</InputLabel>
              <Select labelId="boulder-label" label="Bloc" value={newBoulderId} onChange={(e) => setNewBoulderId(e.target.value)}>
                {activeBoulders.map((b) => <MenuItem key={b.id} value={b.id}>{b.label}</MenuItem>)}
              </Select>
            </FormControl>
          )}

          {newStructure === 'declaratif' && (
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Description du défi"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              sx={{ mb: 2 }}
            />
          )}

          <FormControl sx={{ mb: 1 }}>
            <FormLabel>Participants (2 à 6 au total, toi inclus)</FormLabel>
            {acceptedFriendUidsList.map((uid) => (
              <FormControlLabel
                key={uid}
                control={
                  <Checkbox
                    checked={newParticipants.includes(uid)}
                    onChange={(e) => setNewParticipants((prev) => (
                      e.target.checked ? [...prev, uid] : prev.filter((id) => id !== uid)
                    ))}
                    disabled={!newParticipants.includes(uid) && newParticipants.length >= 5}
                  />
                }
                label={directoryNameByUid.get(uid) || 'Grimpeur'}
              />
            ))}
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChallengeDialogOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={createChallenge}>Lancer</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ClientFriends;
