import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  DocumentData
} from 'firebase/firestore';
import {
  Container,
  Typography,
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Chip,
  Tooltip,
  TextField,
  Alert,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  OutlinedInput,
  Collapse
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Mail as MailIcon,
  Check as CheckIcon,
  Reply as ReplyIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface Message {
  id: string;
  title: string;
  content: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  createdAt: Date;
  isRead: boolean;
  expanded?: boolean;
}

interface Client {
  id: string;
  displayName: string;
  email: string;
}

interface Group {
  id: string;
  name: string;
  moniteurId: string;
  students: string[];
}

const MessagesList: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [openReplyDialog, setOpenReplyDialog] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [openNewMessageDialog, setOpenNewMessageDialog] = useState(false);
  const [newMessageTitle, setNewMessageTitle] = useState('');
  const [newMessageContent, setNewMessageContent] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientType, setRecipientType] = useState<'client' | 'group'>('client');
  const navigate = useNavigate();

  // Charger les clients et les groupes
  useEffect(() => {
    if (!user?.uid) return;
    const fetchData = async () => {
      try {
        // Charger les clients
        const clientsQuery = query(
          collection(db, 'users'),
          where('role', '==', 'client')
        );
        const clientsSnapshot = await getDocs(clientsQuery);
        const clientsList = clientsSnapshot.docs.map(doc => ({
          id: doc.id,
          displayName: doc.data().displayName || doc.data().email || doc.id,
          email: doc.data().email || ''
        }));
        setClients(clientsList);

        // Charger les groupes du moniteur
        const groupsQuery = query(
          collection(db, 'Groups'),
          where('moniteurId', '==', user.uid)
        );
        const groupsSnapshot = await getDocs(groupsQuery);
        const groupsList = groupsSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          moniteurId: doc.data().moniteurId || '',
          students: doc.data().students || []
        }));
        setGroups(groupsList);
      } catch (err) {
        console.error("Erreur lors du chargement des données:", err);
      }
    };
    fetchData();
  }, [user]);

  // Fonction de chargement des messages (accessible dans tout le composant)
  const loadMessages = async () => {
    if (!user?.uid) return;

    try {
      setIsLoading(true);

      // Messages envoyés par le moniteur
      const sentMessagesSnapshot = await getDocs(
        query(collection(db, 'messages'), where('senderId', '==', user.uid))
      );
      const sentMessages: Message[] = sentMessagesSnapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        const client = clients.find(c => c.id === data.receiverId);
        const group = groups.find(g => g.id === data.receiverId);
        return {
          id: doc.id,
          title: data.title || 'Message sans titre',
          content: data.content || '',
          senderId: data.senderId || '',
          senderName: data.senderName || user.displayName || user.email || user.uid,
          receiverId: data.receiverId || '',
          receiverName: client?.displayName || group?.name || data.receiverName || 'Inconnu',
          createdAt: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
          isRead: data.isRead || false,
          expanded: false
        };
      });

      // Messages reçus par le moniteur
      const receivedMessagesSnapshot = await getDocs(
        query(collection(db, 'messages'), where('receiverId', '==', user.uid))
      );
      const receivedMessages: Message[] = receivedMessagesSnapshot.docs.map(doc => {
        const data = doc.data() as DocumentData;
        const client = clients.find(c => c.id === data.senderId);
        return {
          id: doc.id,
          title: data.title || 'Message sans titre',
          content: data.content || '',
          senderId: data.senderId || '',
          senderName: client?.displayName || data.senderName || data.senderId || 'Inconnu',
          receiverId: data.receiverId || '',
          receiverName: user.displayName || user.email || user.uid,
          createdAt: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
          isRead: data.isRead || false,
          expanded: false
        };
      });

      // Fusionner et trier localement
      const allMessages = [...sentMessages, ...receivedMessages]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      setMessages(allMessages);
      setIsLoading(false);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
      console.error("Erreur Firestore:", err);
      setIsLoading(false);
    }
  };

  // Charger les messages (sans orderBy pour éviter les index)
  useEffect(() => {
    if (!user?.uid) return;
    loadMessages();
  }, [user, clients, groups]);

  const handleToggleExpand = (messageId: string) => {
    setMessages(prevMessages =>
      prevMessages.map(message =>
        message.id === messageId
          ? { ...message, expanded: !message.expanded }
          : message
      )
    );
  };

  const handleDelete = async (messageId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'messages', messageId));
      setSuccess('Message supprimé avec succès !');
      setOpenDeleteDialog(false);
      setMessageToDelete(null);
      await loadMessages();
    } catch (error) {
      setError(`Erreur lors de la suppression du message : ${error}`);
      setOpenDeleteDialog(false);
    }
  };

  const handleMarkAsRead = async (messageId: string) => {
    if (!user) return;
    try {
      const messageRef = doc(db, 'messages', messageId);
      // Vérifier que le message appartient bien au moniteur
      const messageDoc = await getDocs(query(collection(db, 'messages'), where('__name__', '==', messageId)));
      if (!messageDoc.empty) {
        const messageData = messageDoc.docs[0].data();
        if (messageData.receiverId === user.uid) {
          await updateDoc(messageRef, { isRead: true });
          setSuccess('Message marqué comme lu !');
          await loadMessages();
        } else {
          setError('Vous ne pouvez pas marquer ce message comme lu.');
        }
      }
    } catch (error) {
      setError(`Erreur lors de la mise à jour : ${error}`);
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
        title: `Réponse à: ${selectedMessage.title}`,
        content: replyContent.trim(),
        senderId: user.uid,
        senderName: user.displayName || user.email || user.uid,
        receiverId: selectedMessage.senderId,
        receiverName: selectedMessage.senderName,
        timestamp: new Date(),
        isRead: false
      });
      setSuccess('Réponse envoyée avec succès !');
      setOpenReplyDialog(false);
      setReplyContent('');
      setSelectedMessage(null);
      await loadMessages();
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  const handleSendNewMessage = async () => {
    if (!user || recipients.length === 0 || !newMessageTitle.trim() || !newMessageContent.trim()) return;

    try {
      for (const recipientId of recipients) {
        const recipient = clients.find(c => c.id === recipientId);
        const group = groups.find(g => g.id === recipientId);
        const receiverName = recipient ? recipient.displayName : group?.name || 'Destinataire';

        await addDoc(collection(db, 'messages'), {
          title: newMessageTitle.trim(),
          content: newMessageContent.trim(),
          senderId: user.uid,
          senderName: user.displayName || user.email || user.uid,
          receiverId: recipientId,
          receiverName: receiverName,
          timestamp: new Date(),
          isRead: false
        });
      }

      setSuccess(`${recipients.length > 1 ? 'Messages envoyés' : 'Message envoyé'} avec succès !`);
      setOpenNewMessageDialog(false);
      setNewMessageTitle('');
      setNewMessageContent('');
      setRecipients([]);
      await loadMessages();
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
  };

  const handleCloseSnackbar = () => {
    setError(null);
    setSuccess(null);
  };

  if (loadingAuth || isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <MailIcon color="primary" sx={{ fontSize: 40 }} />
            <Typography variant="h4">Messagerie</Typography>
          </Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setOpenNewMessageDialog(true)}
          >
            Nouveau message
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell></TableCell>
                <TableCell>Titre</TableCell>
                <TableCell>Expéditeur/Destinataire</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {messages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    Aucun message trouvé.
                  </TableCell>
                </TableRow>
              ) : (
                messages.map((message) => {
                  const isReceived = message.receiverId === user?.uid;
                  const displayName = isReceived ? message.senderName : message.receiverName;

                  return (
                    <React.Fragment key={message.id}>
                      <TableRow hover>
                        <TableCell>
                          <IconButton
                            size="small"
                            onClick={() => handleToggleExpand(message.id)}
                          >
                            {message.expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </TableCell>
                        <TableCell>{message.title}</TableCell>
                        <TableCell>
                          {isReceived ? `De: ${displayName}` : `À: ${displayName}`}
                        </TableCell>
                        <TableCell>{message.createdAt.toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell>
                          <Chip
                            label={isReceived ? 'Reçu' : 'Envoyé'}
                            color={isReceived ? 'success' : 'primary'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={message.isRead ? 'Lu' : 'Non lu'}
                            color={message.isRead ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {!message.isRead && isReceived && (
                            <Tooltip title="Marquer comme lu">
                              <IconButton
                                color="primary"
                                onClick={() => handleMarkAsRead(message.id)}
                              >
                                <CheckIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          {isReceived && (
                            <Tooltip title="Répondre">
                              <IconButton
                                color="info"
                                onClick={() => handleReply(message)}
                              >
                                <ReplyIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Supprimer le message">
                            <IconButton
                              color="error"
                              onClick={() => {
                                setMessageToDelete(message.id);
                                setOpenDeleteDialog(true);
                              }}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                      {message.expanded && (
                        <TableRow>
                          <TableCell colSpan={7} sx={{ p: 0 }}>
                            <Box sx={{ p: 2, backgroundColor: '#f5f5f5' }}>
                              <Typography><strong>Contenu:</strong> {message.content}</Typography>
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Dialogues (inchangés) */}
      <Dialog open={openDeleteDialog} onClose={() => setOpenDeleteDialog(false)}>
        <DialogTitle>Supprimer le message</DialogTitle>
        <DialogContent>
          Êtes-vous sûr de vouloir supprimer ce message ?
          <br />
          <strong>Cette action est irréversible.</strong>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
          <Button onClick={() => messageToDelete && handleDelete(messageToDelete)} color="error" variant="contained" autoFocus>
            Supprimer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openReplyDialog} onClose={() => setOpenReplyDialog(false)} fullWidth maxWidth="md">
        <DialogTitle>Répondre au message</DialogTitle>
        <DialogContent>
          {selectedMessage && (
            <>
              <Typography sx={{ mb: 2 }}><strong>De:</strong> {selectedMessage.senderName}</Typography>
              <Typography sx={{ mb: 2 }}><strong>Message:</strong> {selectedMessage.content}</Typography>
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
          <Button onClick={handleSendReply} color="primary" variant="contained" disabled={!replyContent.trim()}>
            Envoyer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openNewMessageDialog} onClose={() => setOpenNewMessageDialog(false)} fullWidth maxWidth="md">
        <DialogTitle>Nouveau message</DialogTitle>
        <DialogContent>
          <TextField label="Titre" value={newMessageTitle} onChange={(e) => setNewMessageTitle(e.target.value)} fullWidth margin="normal" required />
          <TextField label="Contenu" value={newMessageContent} onChange={(e) => setNewMessageContent(e.target.value)} fullWidth margin="normal" multiline rows={4} required />
          <FormControl fullWidth margin="normal">
            <InputLabel>Type de destinataire</InputLabel>
            <Select value={recipientType} onChange={(e) => { setRecipientType(e.target.value as 'client' | 'group'); setRecipients([]); }} label="Type de destinataire">
              <MenuItem value="client">Client individuel</MenuItem>
              <MenuItem value="group">Groupe</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth margin="normal">
            <InputLabel>{recipientType === 'client' ? 'Destinataires' : 'Groupes'}</InputLabel>
            <Select
              multiple
              value={recipients}
              onChange={(e) => setRecipients(e.target.value as string[])}
              input={<OutlinedInput label={recipientType === 'client' ? 'Destinataires' : 'Groupes'} />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => {
                    const client = clients.find(c => c.id === value);
                    const group = groups.find(g => g.id === value);
                    return <Chip key={value} label={client?.displayName || group?.name || value} />;
                  })}
                </Box>
              )}
            >
              {recipientType === 'client' ? (
                clients.map((client) => (
                  <MenuItem key={client.id} value={client.id}>
                    <Checkbox checked={recipients.indexOf(client.id) > -1} />
                    <ListItemText primary={client.displayName} />
                  </MenuItem>
                ))
              ) : (
                groups.map((group) => (
                  <MenuItem key={group.id} value={group.id}>
                    <Checkbox checked={recipients.indexOf(group.id) > -1} />
                    <ListItemText primary={group.name} />
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNewMessageDialog(false)}>Annuler</Button>
          <Button onClick={handleSendNewMessage} color="primary" variant="contained" disabled={!newMessageTitle.trim() || !newMessageContent.trim() || recipients.length === 0}>
            Envoyer
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!error || !!success} autoHideDuration={6000} onClose={handleCloseSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={handleCloseSnackbar} severity={error ? 'error' : 'success'} sx={{ width: '100%' }}>
          {error || success}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default MessagesList;