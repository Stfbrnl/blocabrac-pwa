import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, addDoc, DocumentData, orderBy
} from 'firebase/firestore';
import {
  Container, Typography, Box, Paper, CircularProgress, Alert,
  TextField, Button, List, ListItem, Avatar, Divider, FormControl, InputLabel, Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Send as SendIcon, Reply as ReplyIcon } from '@mui/icons-material';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  content: string;
  timestamp: Date;
  title?: string;
}

const ClientMessages: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [moniteurs, setMoniteurs] = useState<{id: string, displayName: string}[]>([]);
  const [selectedMoniteur, setSelectedMoniteur] = useState<string>('');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [openReplyDialog, setOpenReplyDialog] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const navigate = useNavigate();

  // ✅ Détection mobile pour adapter la zone d'envoi et le Dialog
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const fetchData = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);

      const sentMessagesQuery = query(
        collection(db, 'messages'),
        where('senderId', '==', user.uid)
      );
      const receivedMessagesQuery = query(
        collection(db, 'messages'),
        where('receiverId', '==', user.uid)
      );

      const [sentSnapshot, receivedSnapshot] = await Promise.all([
        getDocs(sentMessagesQuery),
        getDocs(receivedMessagesQuery)
      ]);

      const moniteursMap = new Map<string, {id: string, displayName: string}>();

      // ✅ Source unique : le vrai annuaire des moniteurs actuels (users), pas
      // l'historique des messages. Un compte qui n'est plus moniteur disparaît donc
      // automatiquement de la liste, même s'il reste visible dans l'historique des
      // conversations passées (ça, c'est normal : les anciens messages ne changent pas).
      // Deux requêtes pour couvrir les deux formats de rôle existants (roles[] et role).
      const [moniteursByRoleSnapshot, moniteursByRolesArraySnapshot] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('role', '==', 'moniteur'))),
        getDocs(query(collection(db, 'users'), where('roles', 'array-contains', 'moniteur'))),
      ]);
      [...moniteursByRoleSnapshot.docs, ...moniteursByRolesArraySnapshot.docs].forEach((docSnap) => {
        const data = docSnap.data() as DocumentData;
        const displayName =
          `${data.first_name || ''} ${data.last_name || ''}`.trim() ||
          data.email?.split('@')[0] ||
          docSnap.id;
        moniteursMap.set(docSnap.id, { id: docSnap.id, displayName });
      });

      const moniteursList = Array.from(moniteursMap.values());
      setMoniteurs(moniteursList);

      if (moniteursList.length > 0) {
        setSelectedMoniteur(moniteursList[0].id);
      }

      const allMessages: Message[] = [
        ...sentSnapshot.docs.map(doc => {
          const data = doc.data() as DocumentData;
          return {
            id: doc.id,
            senderId: data.senderId,
            senderName: data.senderName || user.displayName || user.email || user.uid,
            receiverId: data.receiverId,
            receiverName: data.receiverName || 'Moniteur',
            content: data.content,
            timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
            title: data.title
          };
        }),
        ...receivedSnapshot.docs.map(doc => {
          const data = doc.data() as DocumentData;
          return {
            id: doc.id,
            senderId: data.senderId,
            senderName: data.senderName || 'Moniteur',
            receiverId: data.receiverId,
            receiverName: user.displayName || user.email || user.uid,
            content: data.content,
            timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
            title: data.title
          };
        })
      ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      setMessages(allMessages);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
      console.error("Erreur Firestore:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleSendMessage = async () => {
    if (!user || !selectedMoniteur || !newMessage.trim()) return;

    try {
      const moniteur = moniteurs.find(m => m.id === selectedMoniteur);
      await addDoc(collection(db, 'messages'), {
        senderId: user.uid,
        senderName: user.displayName || user.email || user.uid,
        receiverId: selectedMoniteur,
        receiverName: moniteur?.displayName || 'Moniteur',
        content: newMessage.trim(),
        timestamp: new Date(),
        title: `Message de ${user.displayName || user.email || user.uid}`
      });
      setNewMessage('');
      setSuccess('Message envoyé avec succès !');

      await fetchData();
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  const handleReply = (message: Message) => {
    setSelectedMessage(message);
    setOpenReplyDialog(true);
  };

  const handleSendReply = async () => {
    if (!user || !selectedMessage || !replyContent.trim()) return;

    try {
      await addDoc(collection(db, 'messages'), {
        senderId: user.uid,
        senderName: user.displayName || user.email || user.uid,
        receiverId: selectedMessage.senderId,
        receiverName: selectedMessage.senderName,
        content: replyContent.trim(),
        timestamp: new Date(),
        title: `Réponse à: ${selectedMessage.title || 'Message sans titre'}`
      });
      setSuccess('Réponse envoyée avec succès !');
      setOpenReplyDialog(false);
      setReplyContent('');
      setSelectedMessage(null);
      await fetchData();
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  const handleCloseSnackbar = () => {
    setError(null);
    setSuccess(null);
  };

  if (loadingAuth || loading) {
    return (
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container maxWidth="md">
        <Alert severity="error">Vous devez être connecté pour accéder aux messages.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Messages avec mon moniteur
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Paper sx={{ height: '400px', overflow: 'auto', p: { xs: 1, sm: 2 }, mb: 2 }}>
          {messages.length === 0 ? (
            <Typography color="textSecondary">Aucun message échangé.</Typography>
          ) : (
            <List>
              {messages.map((message) => {
                const isSent = message.senderId === user.uid;
                return (
                  <ListItem key={message.id} sx={{ display: 'flex', flexDirection: isSent ? 'row-reverse' : 'row', gap: 1, alignItems: 'flex-start' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: isSent ? 'flex-end' : 'flex-start', flexShrink: 0 }}>
                      <Avatar sx={{ width: 32, height: 32, mb: 1 }}>
                        {(isSent ? message.senderName : message.senderName).charAt(0)}
                      </Avatar>
                      <Typography variant="caption" color="textSecondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                        {isSent ? message.senderName : message.senderName} - {message.timestamp.toLocaleString('fr-FR')}
                      </Typography>
                    </Box>
                    <Paper sx={{
                      p: { xs: 1, sm: 2 },
                      backgroundColor: isSent ? '#e3f2fd' : '#f5f5f5',
                      borderRadius: 2,
                      // ✅ Bulle plus large sur mobile pour rester lisible
                      maxWidth: { xs: '82%', sm: '70%' },
                      position: 'relative'
                    }}>
                      {/* ✅ Date/auteur visibles inline sur mobile (cachés au-dessus à partir de sm) */}
                      <Typography variant="caption" color="textSecondary" sx={{ display: { xs: 'block', sm: 'none' }, mb: 0.5 }}>
                        {message.timestamp.toLocaleString('fr-FR')}
                      </Typography>
                      <Typography sx={{ pr: !isSent ? 4 : 0 }}>{message.content}</Typography>
                      {!isSent && (
                        <Tooltip title="Répondre">
                          <IconButton
                            size="small"
                            sx={{ position: 'absolute', bottom: 4, right: 4 }}
                            onClick={() => handleReply(message)}
                          >
                            <ReplyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Paper>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Paper>

        <Divider sx={{ my: 2 }} />

        {moniteurs.length > 0 ? (
          // ✅ Empilé verticalement sur mobile, en ligne à partir de "sm"
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
            <FormControl fullWidth sx={{ minWidth: { sm: 160 } }}>
              <InputLabel id="destinataire-select-label" htmlFor="destinataire-select">Destinataire</InputLabel>
              <Select
                labelId="destinataire-select-label" id="destinataire-select"
                value={selectedMoniteur}
                onChange={(e) => setSelectedMoniteur(e.target.value as string)}
                label="Destinataire"
              >
                {moniteurs.map((moniteur) => (
                  <MenuItem key={moniteur.id} value={moniteur.id}>
                    {moniteur.displayName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label="Nouveau message"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              variant="outlined"
              multiline
              rows={2}
              placeholder="Saisissez votre message..."
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleSendMessage}
              disabled={!newMessage.trim()}
              // ✅ Bouton pleine largeur sur mobile, hauteur fixe à partir de "sm"
              fullWidth={isMobile}
              sx={{ height: { xs: 'auto', sm: '56px' }, py: { xs: 1.5, sm: 0 } }}
            >
              <SendIcon />
            </Button>
          </Box>
        ) : (
          <Alert severity="info">
            Aucun moniteur disponible pour le moment. Contactez la salle si le problème persiste.
          </Alert>
        )}
      </Paper>

      <Dialog
        open={openReplyDialog}
        onClose={() => setOpenReplyDialog(false)}
        fullWidth
        maxWidth="md"
        fullScreen={isMobile}
      >
        <DialogTitle>Répondre au message</DialogTitle>
        <DialogContent>
          {selectedMessage && (
            <>
              <Typography sx={{ mb: 2 }}>
                <strong>De:</strong> {selectedMessage.senderName}
              </Typography>
              <Typography sx={{ mb: 2 }}>
                <strong>Message:</strong> {selectedMessage.content}
              </Typography>
              <TextField
                label="Votre réponse"
                multiline
                rows={4}
                fullWidth
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Saisissez votre réponse..."
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenReplyDialog(false)}>Annuler</Button>
          <Button
            onClick={handleSendReply}
            color="primary"
            variant="contained"
            disabled={!replyContent.trim()}
          >
            Envoyer
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ClientMessages;