import React, { useState, useEffect, ChangeEvent } from 'react';
import {
  Typography, Container, Box, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Select, FormControl,
  InputLabel, Alert, IconButton, Chip, Stack, FormControlLabel,
  RadioGroup, Radio, Tooltip, SelectChangeEvent
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Key as KeyIcon,
  Email as EmailIcon
} from '@mui/icons-material';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, Query, DocumentData
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';

type UserRole = 'admin' | 'ouvreur' | 'moniteur' | 'client';

interface User {
  id: string;
  uid: string;
  email: string;
  role: UserRole;
  first_name?: string;
  last_name?: string;
}

type FormEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent;

const roles: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Administrateur' },
  { value: 'ouvreur', label: 'Ouvreur' },
  { value: 'moniteur', label: 'Moniteur' },
  { value: 'client', label: 'Client' },
];

function createUserFromDoc(doc: { id: string; data: () => any }): User {
  const data = doc.data();
  return {
    id: doc.id,
    uid: data.uid || doc.id,
    email: data.email || '',
    role: data.role || 'client',
    first_name: data.first_name,
    last_name: data.last_name,
  };
}

const AdminUsers: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [openResetDialog, setOpenResetDialog] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  const [resetEmail, setResetEmail] = useState<string>('');
  const [formData, setFormData] = useState<{
    email: string;
    role: UserRole;
    first_name: string;
    last_name: string;
  }>({
    email: '',
    role: 'client',
    first_name: '',
    last_name: '',
  });

  const fetchUsers = async () => {
    try {
      const usersCollection = collection(db, 'users');
      let q: Query<DocumentData> = usersCollection;
      if (filterRole !== 'all') {
        q = query(usersCollection, where('role', '==', filterRole));
      }
      const querySnapshot = await getDocs(q);
      const usersData: User[] = querySnapshot.docs.map(createUserFromDoc);
      setUsers(usersData);
    } catch (err: any) {
      setError(`Erreur : ${err.message}`);
      console.error(err);
    }
  };

  useEffect(() => {
    if (user) fetchUsers();
  }, [user, filterRole]);

  const handleOpenDialog = (userToEdit: User | null = null) => {
    setCurrentUser(userToEdit);
    setFormData({
      email: userToEdit?.email || '',
      role: userToEdit?.role || 'client',
      first_name: userToEdit?.first_name || '',
      last_name: userToEdit?.last_name || '',
    });
    setOpenDialog(true);
  };

  const handleOpenResetDialog = (user: User) => {
    setCurrentUser(user);
    setResetEmail(user.email);
    setOpenResetDialog(true);
  };

  const handleFormChange = (e: FormEvent) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (currentUser) {
        await updateDoc(doc(db, 'users', currentUser.id), {
          email: formData.email,
          role: formData.role,
          first_name: formData.first_name,
          last_name: formData.last_name,
        });
        setSuccess('Utilisateur modifié avec succès !');
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          formData.email,
          Math.random().toString(36).slice(-10)
        );
        await addDoc(collection(db, 'users'), {
          uid: userCredential.user.uid,
          email: formData.email,
          role: formData.role,
          first_name: formData.first_name,
          last_name: formData.last_name,
          created_at: new Date().toISOString(),
        });
        await sendPasswordResetEmail(auth, formData.email);
        setSuccess(`Utilisateur ${formData.role} créé ! Email envoyé à ${formData.email}.`);
      }
      setOpenDialog(false);
      fetchUsers();
    } catch (err: any) {
      setError(`Erreur : ${err.message}`);
      console.error(err);
    }
  };

  const handleResetPassword = async () => {
    if (!resetEmail) {
      setError('Email invalide.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setSuccess(`Email envoyé à ${resetEmail} !`);
      setOpenResetDialog(false);
    } catch (err: any) {
      setError(`Erreur : ${err.message}`);
      console.error(err);
    }
  };

  // ✅ Solution client-side : suppression du document Firestore uniquement
  const handleDeleteUser = (userToDelete: User) => {
    if (window.confirm(`Supprimer ${userToDelete.email} (${userToDelete.role}) de Firestore ?`)) {
      deleteDoc(doc(db, 'users', userToDelete.id))
        .then(() => {
          setSuccess(
            `Utilisateur ${userToDelete.role} supprimé de Firestore. ⚠️ Pour supprimer son compte Auth, utilisez la console Firebase ou une Cloud Function.`
          );
          fetchUsers();
        })
        .catch((err: any) => {
          setError(`Erreur : ${err.message}`);
          console.error(err);
        });
    }
  };

  if (loadingAuth) {
    return (
      <Container maxWidth="lg">
        <Typography sx={{ mt: 4, textAlign: 'center' }}>Chargement...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>Gestion des Utilisateurs</Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
          <FormControl>
            <RadioGroup
              row
              value={filterRole}
              onChange={(e, value) => setFilterRole(value as UserRole | 'all')}
            >
              <FormControlLabel value="all" control={<Radio />} label="Tous" />
              {roles.map((role) => (
                <FormControlLabel
                  key={role.value}
                  value={role.value}
                  control={<Radio />}
                  label={role.label}
                />
              ))}
            </RadioGroup>
          </FormControl>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Ajouter un Utilisateur
          </Button>
        </Stack>

        <Box sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog(null)}
          >
            Ajouter un Client
          </Button>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>UID</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Rôle</TableCell>
                <TableCell>Prénom</TableCell>
                <TableCell>Nom</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center' }}>
                    Aucun utilisateur trouvé.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user: User) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.uid}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Chip
                        label={roles.find((r) => r.value === user.role)?.label || user.role}
                        color={
                          user.role === 'admin' ? 'error' :
                          user.role === 'moniteur' ? 'primary' :
                          user.role === 'ouvreur' ? 'secondary' : 'default'
                        }
                      />
                    </TableCell>
                    <TableCell>{user.first_name || 'Non renseigné'}</TableCell>
                    <TableCell>{user.last_name || 'Non renseigné'}</TableCell>
                    <TableCell>
                      <Tooltip title="Modifier">
                        <IconButton
                          aria-label="Modifier"
                          onClick={() => handleOpenDialog(user)}
                          color="primary"
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Réinitialiser le mot de passe">
                        <IconButton
                          aria-label="Réinitialiser"
                          onClick={() => handleOpenResetDialog(user)}
                          color="warning"
                        >
                          <KeyIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Supprimer">
                        <IconButton
                          aria-label="Supprimer"
                          onClick={() => handleDeleteUser(user)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
          <DialogTitle>
            {currentUser ? `Modifier ${currentUser.email}` : 'Ajouter un utilisateur'}
          </DialogTitle>
          <DialogContent>
            <TextField
              label="Email"
              name="email"
              value={formData.email}
              onChange={handleFormChange}
              fullWidth
              margin="normal"
              required
              type="email"
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Rôle</InputLabel>
              <Select
                name="role"
                value={formData.role}
                onChange={handleFormChange}
                label="Rôle"
              >
                {roles.map((role) => (
                  <MenuItem key={role.value} value={role.value}>
                    {role.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Prénom"
              name="first_name"
              value={formData.first_name}
              onChange={handleFormChange}
              fullWidth
              margin="normal"
            />
            <TextField
              label="Nom"
              name="last_name"
              value={formData.last_name}
              onChange={handleFormChange}
              fullWidth
              margin="normal"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Annuler</Button>
            <Button onClick={handleSubmit} variant="contained" color="primary">
              {currentUser ? 'Modifier' : 'Ajouter'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={openResetDialog} onClose={() => setOpenResetDialog(false)}>
          <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 2 }}>
              Un email sera envoyé à <strong>{resetEmail}</strong>.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenResetDialog(false)}>Annuler</Button>
            <Button
              onClick={handleResetPassword}
              variant="contained"
              color="primary"
              startIcon={<EmailIcon />}
            >
              Envoyer l'email
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
};

export default AdminUsers;