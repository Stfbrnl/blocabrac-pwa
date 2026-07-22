import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where,
} from 'firebase/firestore';
import {
  Container, Paper, Typography, Box, TextField, Button, List, ListItem,
  Chip, Divider, CircularProgress, Alert, IconButton, FormControl, InputLabel,
  Select, MenuItem, Tooltip,
} from '@mui/material';
import {
  Check as CheckIcon, Close as CloseIcon, PersonAdd as PersonAddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';

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
      const [profilesSnap, staffSnap, friendshipsSnap] = await Promise.all([
        getDocs(collection(db, 'classement_profiles')),
        getDocs(collection(db, 'staff_directory')),
        getDocs(query(collection(db, 'friendships'), where('uids', 'array-contains', user.uid))),
      ]);

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
    </Container>
  );
};

export default ClientFriends;
