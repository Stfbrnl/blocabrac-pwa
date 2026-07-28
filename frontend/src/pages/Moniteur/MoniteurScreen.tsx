import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from 'firebase/firestore';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Snackbar,
  Alert,
  Divider,
  Chip,
  Badge
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Mail as MailIcon } from '@mui/icons-material';

interface Message {
  id: string;
  title: string;
  content: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  createdAt: Date;
  isRead: boolean;
}

const MoniteurScreen: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const navigate = useNavigate();

  // Charger les messages reçus (où le moniteur est le destinataire)
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'messages'),
        where('receiverId', '==', user.uid),
        orderBy('createdAt', 'desc')
      ),
      (querySnapshot) => {
        const messagesData: Message[] = [];
        let unread = 0;
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const message: Message = {
            id: doc.id,
            title: data.title || 'Message sans titre',
            content: data.content || '',
            senderId: data.senderId || '',
            senderName: data.senderName || data.senderId,
            receiverId: data.receiverId || '',
            createdAt: data.createdAt?.toDate() || new Date(),
            isRead: data.isRead || false,
          };
          messagesData.push(message);
          if (!message.isRead) unread++;
        });
        setMessages(messagesData);
        setUnreadCount(unread);
        setIsLoading(false);
      },
      (err) => {
        setError(`Erreur lors du chargement des messages : ${err}`);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleCloseSnackbar = () => {
    setError(null);
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
        <Typography variant="h4" gutterBottom>
          Espace Moniteur
        </Typography>

        <Divider sx={{ my: 3 }} />

        {/* Section Messages */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <MailIcon color="primary" sx={{ fontSize: 32 }} />
              <Typography variant="h5">Messages</Typography>
              {unreadCount > 0 && (
                <Badge color="error" badgeContent={unreadCount}>
                  <MailIcon color="action" />
                </Badge>
              )}
            </Box>
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/moniteur/messages')}
              startIcon={<MailIcon />}
            >
              Voir tous les messages
            </Button>
          </Box>

          {messages.length === 0 ? (
            <Typography variant="body1" color="text.secondary">
              Aucun message reçu.
            </Typography>
          ) : (
            <Box sx={{ maxHeight: '400px', overflow: 'auto' }}>
              {messages.slice(0, 3).map((message) => (
                <Card key={message.id} sx={{ mb: 2 }}>
                  <CardHeader
                    title={message.title}
                    subheader={`De: ${message.senderName} - ${message.createdAt.toLocaleString('fr-FR')}`}
                    action={
                      !message.isRead && (
                        <Chip label="Nouveau" color="error" size="small" />
                      )
                    }
                  />
                  <CardContent>
                    <Typography variant="body2">{message.content}</Typography>
                  </CardContent>
                </Card>
              ))}
              {messages.length > 3 && (
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={() => navigate('/moniteur/messages')}
                  sx={{ mt: 2 }}
                >
                  Voir tous les messages ({messages.length})
                </Button>
              )}
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Boutons de navigation */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6" gutterBottom>Accès rapide :</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => navigate('/moniteur/groups')}
              sx={{ flex: 1, minWidth: 200 }}
            >
              Gérer les groupes
            </Button>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => navigate('/moniteur/courses')}
              sx={{ flex: 1, minWidth: 200 }}
            >
              Gérer les séances
            </Button>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => navigate('/moniteur/exercises')}
              sx={{ flex: 1, minWidth: 200 }}
            >
              Gérer les exercices
            </Button>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => navigate('/moniteur/stats')}
              sx={{ flex: 1, minWidth: 200 }}
            >
              Statistiques
            </Button>
          </Box>
        </Box>

        <Snackbar
          open={!!error}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={handleCloseSnackbar} severity="error" sx={{ width: '100%' }}>
            {error}
          </Alert>
        </Snackbar>
      </Paper>
    </Container>
  );
};

export default MoniteurScreen;
