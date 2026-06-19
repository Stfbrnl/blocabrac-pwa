import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, addDoc, DocumentData, orderBy
} from 'firebase/firestore';
import {
  Container, Typography, Box, Paper, CircularProgress, Alert,
  TextField, Button, List, ListItem, Avatar, Divider, FormControl, InputLabel, Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip
} from '@mui/material';
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

  const fetchData = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);

      // 1. Récupérer TOUS les messages du client (envoyés et reçus)
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

      // 2. Extraire les moniteurs uniques des messages REÇUS
      const moniteursMap = new Map<string, {id: string, displayName: string}>();
      receivedSnapshot.docs.forEach(doc => {
        const data = doc.data() as DocumentData;
        if (data.senderId && data.senderName) {
          moniteursMap.set(data.senderId, {
            id: data.senderId,
            displayName: data.senderName
          });
        }
      });

      // 3. Si aucun moniteur trouvé dans les messages reçus, chercher dans les messages envoyés
      if (moniteursMap.size === 0) {
        sentSnapshot.docs.forEach(doc => {
          const data = doc.data() as DocumentData;
          if (data.receiverId && data.receiverName) {
            moniteursMap.set(data.receiverId, {
              id: data.receiverId,
              displayName: data.receiverName
            });
          }
        });
      }

      // 4. Convertir en tableau
      const moniteursList = Array.from(moniteursMap.values());
      setMoniteurs(moniteursList);

      // 5. Définir le moniteur sélectionné par défaut
      if (moniteursList.length > 0) {
        setSelectedMoniteur(moniteursList[0].id);
      }

      // 6. Charger les messages
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

      // Recharger les données
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
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Messages avec mon moniteur
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Paper sx={{ height: '400px', overflow: 'auto', p: 2, mb: 2 }}>
          {messages.length === 0 ? (
            <Typography color="textSecondary">Aucun message échangé.</Typography>
          ) : (
            <List>
              {messages.map((message) => {
                const isSent = message.senderId === user.uid;
                return (
                  <ListItem key={message.id} sx={{ display: 'flex', flexDirection: isSent ? 'row-reverse' : 'row', gap: 1 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: isSent ? 'flex-end' : 'flex-start' }}>
                      <Avatar sx={{ width: 32, height: 32, mb: 1 }}>
                        {(isSent ? message.senderName : message.senderName).charAt(0)}
                      </Avatar>
                      <Typography variant="caption" color="textSecondary">
                        {isSent ? message.senderName : message.senderName} - {message.timestamp.toLocaleString('fr-FR')}
                      </Typography>
                    </Box>
                    <Paper sx={{
                      p: 2,
                      backgroundColor: isSent ? '#e3f2fd' : '#f5f5f5',
                      borderRadius: 2,
                      maxWidth: '70%',
                      position: 'relative'
                    }}>
                      <Typography>{message.content}</Typography>
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
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Destinataire</InputLabel>
              <Select
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
              sx={{ height: '56px' }}
            >
              <SendIcon />
            </Button>
          </Box>
        ) : (
          <Alert severity="info">
            Aucun moniteur trouvé. Envoyez un premier message pour démarrer la conversation.
          </Alert>
        )}
      </Paper>

      <Dialog
        open={openReplyDialog}
        onClose={() => setOpenReplyDialog(false)}
        fullWidth
        maxWidth="md"
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