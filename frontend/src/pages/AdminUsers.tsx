import React, { useState, useEffect, ChangeEvent } from 'react';
import {
  Typography,
  Container,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  IconButton,
  SelectChangeEvent
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// ✅ Type pour les rôles possibles
type UserRole = 'admin' | 'ouvreur' | 'moniteur' | 'client';

// ✅ Interface pour un utilisateur
interface User {
  id: string;
  email: string;
  role: UserRole;
  first_name?: string;
  last_name?: string;
}

const roles = [
  { value: 'admin' as UserRole, label: 'Administrateur' },
  { value: 'ouvreur' as UserRole, label: 'Ouvreur' },
  { value: 'moniteur' as UserRole, label: 'Moniteur' },
  { value: 'client' as UserRole, label: 'Client' },
];

// ✅ Type unifié pour gérer TextField, TextArea et Select
type FormEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>;

export default function AdminUsers() {
  const [user, loadingAuth] = useAuthState(auth);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
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

  useEffect(() => {
    if (!user) return;
    fetchUsers();
  }, [user]);

  const fetchUsers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const usersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as User[];
      setUsers(usersData);
    } catch (err: any) {
      setError(`Erreur lors du chargement des utilisateurs : ${err.message}`);
      console.error(err);
    }
  };

  const handleOpenDialog = (userToEdit: User | null = null) => {
    if (userToEdit) {
      setCurrentUser(userToEdit);
      setFormData({
        email: userToEdit.email || '',
        role: userToEdit.role,
        first_name: userToEdit.first_name || '',
        last_name: userToEdit.last_name || '',
      });
    } else {
      setCurrentUser(null);
      setFormData({
        email: '',
        role: 'client',
        first_name: '',
        last_name: '',
      });
    }
    setOpenDialog(true);
  };

  // ✅ Gestion unifiée des événements pour TextField, TextArea et Select
  const handleFormChange = (e: FormEvent) => {
    const name = e.target.name;
    const value = e.target.value;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
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
        await addDoc(collection(db, 'users'), {
          email: formData.email,
          role: formData.role,
          first_name: formData.first_name,
          last_name: formData.last_name,
          created_at: new Date().toISOString(),
        });
        setSuccess('Utilisateur ajouté avec succès !');
      }
      setOpenDialog(false);
      fetchUsers();
    } catch (err: any) {
      setError(`Erreur : ${err.message}`);
      console.error(err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        setSuccess('Utilisateur supprimé avec succès !');
        fetchUsers();
      } catch (err: any) {
        setError(`Erreur lors de la suppression : ${err.message}`);
        console.error(err);
      }
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
        <Typography variant="h4" sx={{ mb: 2 }}>
          Gestion des Utilisateurs
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={() => handleOpenDialog()}
          >
            Ajouter un Utilisateur
          </Button>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
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
                users.map((userItem) => (
                  <TableRow key={userItem.id}>
                    <TableCell>{userItem.id}</TableCell>
                    <TableCell>{userItem.email}</TableCell>
                    <TableCell>{roles.find(r => r.value === userItem.role)?.label || userItem.role}</TableCell>
                    <TableCell>{userItem.first_name || 'Non renseigné'}</TableCell>
                    <TableCell>{userItem.last_name || 'Non renseigné'}</TableCell>
                    <TableCell>
                      <IconButton
                        aria-label="Modifier"
                        onClick={() => handleOpenDialog(userItem)}
                        color="primary"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        aria-label="Supprimer"
                        onClick={() => handleDeleteUser(userItem.id)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
          <DialogTitle>
            {currentUser ? 'Modifier l\'utilisateur' : 'Ajouter un utilisateur'}
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
      </Box>
    </Container>
  );
}