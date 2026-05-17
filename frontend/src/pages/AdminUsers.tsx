import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Container, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Select, FormControl, InputLabel, Box, IconButton,
  Snackbar, Alert
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon } from '@mui/icons-material';
import { db, auth } from '../services/firebaseConfig';
import {
  collection, getDocs, doc, updateDoc, deleteDoc,
  addDoc
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';

// ✅ Interface alignée sur votre structure Firestore
interface User {
  uid: string; // ID du document Firestore
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'ouvreur' | 'moniteur' | 'client';
  age?: number;
  gender?: string;
  level?: string;
  created_at?: string;
}

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<Omit<User, 'uid' | 'created_at'>>({
    email: '',
    first_name: '',
    last_name: '',
    role: 'client',
    age: undefined,
    gender: undefined,
    level: undefined
  });
  const [createForm, setCreateForm] = useState<Omit<User, 'uid' | 'created_at'>>({
    email: '',
    first_name: '',
    last_name: '',
    role: 'client',
    age: undefined,
    gender: undefined,
    level: undefined
  });

  // ✅ Récupérer les utilisateurs depuis Firestore (collection 'users')
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const querySnapshot = await getDocs(collection(db, 'users'));
        const usersData: User[] = querySnapshot.docs.map(doc => ({
          uid: doc.id, // ✅ L'ID du document = uid
          ...doc.data()
        })) as User[];
        setUsers(usersData);
      } catch (error) {
        console.error("Erreur :", error);
        setSnackbarMessage("Erreur lors du chargement des utilisateurs.");
        setOpenSnackbar(true);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  // ✅ Ouvrir le dialogue de modification
  const handleOpenEditDialog = (user: User) => {
    setSelectedUser(user);
    setEditForm({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      age: user.age,
      gender: user.gender,
      level: user.level
    });
    setOpenEditDialog(true);
  };

  // ✅ Mettre à jour un utilisateur dans Firestore
  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    try {
      await updateDoc(doc(db, 'users', selectedUser.uid), {
        email: editForm.email,
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        role: editForm.role,
        age: editForm.age,
        gender: editForm.gender,
        level: editForm.level
      });
      // ✅ Rafraîchir la liste
      const querySnapshot = await getDocs(collection(db, 'users'));
      setUsers(querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));
      setOpenEditDialog(false);
      setSnackbarMessage("Utilisateur mis à jour avec succès !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la mise à jour de l'utilisateur.");
      setOpenSnackbar(true);
    }
  };

  // ✅ Ouvrir le dialogue de création
  const handleOpenCreateDialog = () => {
    setCreateForm({
      email: '',
      first_name: '',
      last_name: '',
      role: 'client',
      age: undefined,
      gender: undefined,
      level: undefined
    });
    setOpenCreateDialog(true);
  };

  // ✅ Créer un nouvel utilisateur (Firebase Auth + Firestore)
  const handleCreateUser = async () => {
    if (!createForm.email || !createForm.first_name || !createForm.last_name) {
      setSnackbarMessage("Veuillez remplir les champs obligatoires.");
      setOpenSnackbar(true);
      return;
    }

    try {
      // 1. Créer le compte Firebase Auth
      const tempPassword = Math.random().toString(36).slice(-12);
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        createForm.email,
        tempPassword
      );
      const user = userCredential.user;

      // 2. Ajouter l'utilisateur dans Firestore (collection 'users')
      await addDoc(collection(db, 'users'), {
        uid: user.uid, // ✅ Stocker l'UID Firebase comme champ
        email: createForm.email,
        first_name: createForm.first_name,
        last_name: createForm.last_name,
        role: createForm.role,
        age: createForm.age,
        gender: createForm.gender,
        level: createForm.level,
        created_at: new Date().toISOString()
      });

      // 3. Envoyer un email de réinitialisation
      await sendPasswordResetEmail(auth, createForm.email);

      // ✅ Rafraîchir la liste
      const querySnapshot = await getDocs(collection(db, 'users'));
      setUsers(querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));

      setOpenCreateDialog(false);
      setSnackbarMessage("Utilisateur créé avec succès ! Un email de réinitialisation a été envoyé.");
      setOpenSnackbar(true);
    } catch (error: any) {
      console.error("Erreur :", error);
      let message = "Erreur lors de la création de l'utilisateur.";
      if (error.code === 'auth/email-already-in-use') {
        message = "Cet email est déjà utilisé.";
      }
      setSnackbarMessage(message);
      setOpenSnackbar(true);
    }
  };

  // ✅ Supprimer un utilisateur (Firestore uniquement)
  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteDoc(doc(db, 'users', userId));
      // ✅ Rafraîchir la liste
      const querySnapshot = await getDocs(collection(db, 'users'));
      setUsers(querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));
      setSnackbarMessage("Utilisateur supprimé de la base de données !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la suppression de l'utilisateur.");
      setOpenSnackbar(true);
    }
  };

  if (loading) {
    return <Typography>Chargement des utilisateurs...</Typography>;
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4" gutterBottom>
            Gestion des Utilisateurs
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreateDialog}
          >
            Créer un utilisateur
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Prénom</TableCell>
                <TableCell>Nom</TableCell>
                <TableCell>Rôle</TableCell>
                <TableCell>Niveau</TableCell>
                <TableCell>Âge</TableCell>
                <TableCell>Genre</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.uid}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.first_name}</TableCell>
                  <TableCell>{user.last_name}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>{user.level || 'N/A'}</TableCell>
                  <TableCell>{user.age || 'N/A'}</TableCell>
                  <TableCell>{user.gender || 'N/A'}</TableCell>
                  <TableCell>
                    <IconButton
                      color="primary"
                      onClick={() => handleOpenEditDialog(user)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      color="error"
                      onClick={() => handleDeleteUser(user.uid)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Dialogue de modification */}
        <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)}>
          <DialogTitle>Modifier l'utilisateur</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Email"
                value={editForm.email}
                onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                fullWidth
              />
              <TextField
                label="Prénom"
                value={editForm.first_name}
                onChange={(e) => setEditForm({...editForm, first_name: e.target.value})}
                fullWidth
              />
              <TextField
                label="Nom"
                value={editForm.last_name}
                onChange={(e) => setEditForm({...editForm, last_name: e.target.value})}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>Rôle</InputLabel>
                <Select
                  value={editForm.role}
                  onChange={(e) => setEditForm({...editForm, role: e.target.value as 'admin' | 'ouvreur' | 'moniteur' | 'client'})}
                  label="Rôle"
                >
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="ouvreur">Ouvreur</MenuItem>
                  <MenuItem value="moniteur">Moniteur</MenuItem>
                  <MenuItem value="client">Client</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Niveau"
                value={editForm.level || ''}
                onChange={(e) => setEditForm({...editForm, level: e.target.value})}
                fullWidth
              />
              <TextField
                label="Âge"
                type="number"
                value={editForm.age || ''}
                onChange={(e) => setEditForm({...editForm, age: e.target.value ? parseInt(e.target.value) : undefined})}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>Genre</InputLabel>
                <Select
                  value={editForm.gender || ''}
                  onChange={(e) => setEditForm({...editForm, gender: e.target.value})}
                  label="Genre"
                >
                  <MenuItem value="homme">Homme</MenuItem>
                  <MenuItem value="femme">Femme</MenuItem>
                  <MenuItem value="autre">Autre</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenEditDialog(false)}>Annuler</Button>
            <Button onClick={handleUpdateUser} color="primary">
              Enregistrer
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialogue de création */}
        <Dialog open={openCreateDialog} onClose={() => setOpenCreateDialog(false)}>
          <DialogTitle>Créer un nouvel utilisateur</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Email"
                value={createForm.email}
                onChange={(e) => setCreateForm({...createForm, email: e.target.value})}
                fullWidth
              />
              <TextField
                label="Prénom"
                value={createForm.first_name}
                onChange={(e) => setCreateForm({...createForm, first_name: e.target.value})}
                fullWidth
              />
              <TextField
                label="Nom"
                value={createForm.last_name}
                onChange={(e) => setCreateForm({...createForm, last_name: e.target.value})}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>Rôle</InputLabel>
                <Select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({...createForm, role: e.target.value as 'admin' | 'ouvreur' | 'moniteur' | 'client'})}
                  label="Rôle"
                >
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="ouvreur">Ouvreur</MenuItem>
                  <MenuItem value="moniteur">Moniteur</MenuItem>
                  <MenuItem value="client">Client</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Niveau"
                value={createForm.level || ''}
                onChange={(e) => setCreateForm({...createForm, level: e.target.value})}
                fullWidth
              />
              <TextField
                label="Âge"
                type="number"
                value={createForm.age || ''}
                onChange={(e) => setCreateForm({...createForm, age: e.target.value ? parseInt(e.target.value) : undefined})}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>Genre</InputLabel>
                <Select
                  value={createForm.gender || ''}
                  onChange={(e) => setCreateForm({...createForm, gender: e.target.value})}
                  label="Genre"
                >
                  <MenuItem value="homme">Homme</MenuItem>
                  <MenuItem value="femme">Femme</MenuItem>
                  <MenuItem value="autre">Autre</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenCreateDialog(false)}>Annuler</Button>
            <Button onClick={handleCreateUser} color="primary">
              Créer
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar pour les notifications */}
        <Snackbar
          open={openSnackbar}
          autoHideDuration={6000}
          onClose={() => setOpenSnackbar(false)}
        >
          <Alert
            severity={snackbarMessage.includes("succès") ? "success" : "error"}
            onClose={() => setOpenSnackbar(false)}
          >
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </Paper>
    </Container>
  );
};

export default AdminUsers;