import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  collection, query, where, getDocs, addDoc, orderBy, doc, getDoc, DocumentData
} from 'firebase/firestore';
import {
  Container, Typography, Box, Paper, CircularProgress, Alert,
  TextField, Button, List, ListItem, ListItemText, Divider, Avatar
} from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  content: string;
  timestamp: Date;
}

const ClientMessages: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [moniteurId, setMoniteurId] = useState<string | null>(null);
  const [moniteurName, setMoniteurName] = useState<string>('Moniteur');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const moniteurIdParam = searchParams.get('moniteurId');
    if (moniteurIdParam) {
      setMoniteurId(moniteurIdParam);
    }
  }, [location.search]);

  useEffect(() => {
    if (!moniteurId || !user) return;
    const fetchMoniteurName = async () => {
      try {
        const moniteurDoc = await getDoc(doc(db, 'users', moniteurId));
        if (moniteurDoc.exists()) {
          const moniteurData = moniteurDoc.data() as DocumentData;
          setMoniteurName(moniteurData.displayName || moniteurData.email || 'Moniteur');
        }
      } catch (err) {
        console.error("Erreur lors du chargement du nom du moniteur:", err);
      }
    };
    fetchMoniteurName();
  }, [moniteurId, user]);

  useEffect(() => {
    if (!user || !moniteurId || loadingAuth) return;

    const fetchMessages = async () => {
      try {
        setLoading(true);
        const messagesQuery = query(
          collection(db, 'messages'),
          where('senderId', 'in', [user.uid, moniteurId]),
          where('receiverId', 'in', [user.uid, moniteurId]),
          orderBy('timestamp', 'asc')
        );
        const messagesSnapshot = await getDocs(messagesQuery);
        const messagesData: Message[] = [];
        for (const messageDoc of messagesSnapshot.docs) {
          const message = messageDoc.data() as DocumentData;
          const senderDoc = await getDoc(doc(db, 'users', message.senderId));
          let senderName = message.senderId;
          if (senderDoc.exists()) {
            const senderData = senderDoc.data() as DocumentData;
            senderName = senderData.displayName || senderData.email || message.senderId;
          }
          messagesData.push({
            id: messageDoc.id,
            senderId: message.senderId,
            senderName: senderName,
            receiverId: message.receiverId,
            content: message.content,
            timestamp: message.timestamp?.toDate ? message.timestamp.toDate() : new Date(message.timestamp)
          });
        }
        setMessages(messagesData);
      } catch (err: any) {
        setError(`Erreur: ${err.message}`);
        console.error("Erreur Firestore:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [user, moniteurId, loadingAuth]);

  const handleSendMessage = async () => {
    if (!user || !moniteurId || !newMessage.trim()) return;

    try {
      await addDoc(collection(db, 'messages'), {
        senderId: user.uid,
        senderName: user.displayName || user.email || user.uid,
        receiverId: moniteurId,
        content: newMessage.trim(),
        timestamp: new Date()
      });
      setNewMessage('');
      const messagesQuery = query(
        collection(db, 'messages'),
        where('senderId', 'in', [user.uid, moniteurId]),
        where('receiverId', 'in', [user.uid, moniteurId]),
        orderBy('timestamp', 'asc')
      );
      const messagesSnapshot = await getDocs(messagesQuery);
      const messagesData: Message[] = [];
      for (const messageDoc of messagesSnapshot.docs) {
        const message = messageDoc.data() as DocumentData;
        messagesData.push({
          id: messageDoc.id,
          senderId: message.senderId,
          senderName: message.senderName || (message.senderId === user.uid ? (user.displayName || user.email || user.uid) : moniteurName),
          receiverId: message.receiverId,
          content: message.content,
          timestamp: message.timestamp?.toDate ? message.timestamp.toDate() : new Date(message.timestamp)
        });
      }
      setMessages(messagesData);
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
    }
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

  if (!user || !moniteurId) {
    return (
      <Container maxWidth="md">
        <Alert severity="error">Moniteur non spécifié.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Messages avec {moniteurName}
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Paper sx={{ height: '400px', overflow: 'auto', p: 2, mb: 2 }}>
          {messages.length === 0 ? (
            <Typography color="textSecondary">Aucun message échangé.</Typography>
          ) : (
            <List>
              {messages.map((message) => (
                <ListItem key={message.id} sx={{ display: 'flex', flexDirection: message.senderId === user.uid ? 'row-reverse' : 'row', gap: 1 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: message.senderId === user.uid ? 'flex-end' : 'flex-start' }}>
                    <Avatar sx={{ width: 32, height: 32, mb: 1 }}>
                      {message.senderName.charAt(0)}
                    </Avatar>
                    <Typography variant="caption" color="textSecondary">
                      {message.senderName} - {message.timestamp.toLocaleString('fr-FR')}
                    </Typography>
                  </Box>
                  <Paper sx={{
                    p: 2,
                    backgroundColor: message.senderId === user.uid ? '#e3f2fd' : '#f5f5f5',
                    borderRadius: 2,
                    maxWidth: '70%'
                  }}>
                    <Typography>{message.content}</Typography>
                  </Paper>
                </ListItem>
              ))}
            </List>
          )}
        </Paper>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', gap: 2 }}>
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
      </Paper>
    </Container>
  );
};

export default ClientMessages;