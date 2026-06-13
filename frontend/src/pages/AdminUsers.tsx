import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Container, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Select,
  FormControl, InputLabel, Box, IconButton, Snackbar, Alert, Chip
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon } from '@mui/icons-material';
import { db, auth } from '../services/firebaseConfig';
import {
  collection, getDocs, doc, updateDoc, deleteDoc, setDoc
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, deleteUser } from 'firebase/auth';

// ✅ Tableau de correspondance code-couleur/cotations (comme dans Register.tsx)
const levelOptions = [
  { value: 'jaune', label: 'Jaune (3A-3C) - Débutant' },
  { value: 'vert', label: 'Vert (4A-4B+) - Débutant' },
  { value: 'bleu', label: 'Bleu (4C-5A+) - En formation de grimpeur' },
  { value: 'violet', label: 'Violet (5B-5C+) - En formation de grimpeur' },
  { value: 'rouge', label: 'Rouge (6A-6B) - Grimpeur confirmé' },
  { value: 'noire', label: 'Noire (6B+-6C+) - Grimpeur confirmé' },
  { value: 'blanc', label: 'Blanc (7A-7B) - Grimpeur expert' },
  { value: 'rose', label: 'Rose (7B+-8A) - Grimpeur mutant' }
];

// Couleurs des niveaux (pour les chips)
const levelColors: Record<string, string> = {
  jaune: '#FFFF00', vert: '#00FF00', bleu: '#0000FF', violet: '#800080',
  rouge: '#FF0000', noir: '#000000', blanc: '#FFFFFF', rose: '#FFC0CB'
};

type UserRole = 'admin' | 'ouvreur' | 'moniteur' | 'client';

interface User {
  uid: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: UserRole[];
  age?: number;
  gender?: string;
  level?: string;
  created_at?: string;
  inscritAuxCours?: boolean;
  inscritAuxCompetitions?: boolean;
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
    roles: [],
    age: undefined,
    gender: '',
    level: '',
    inscritAuxCours: false,
    inscritAuxCompetitions: false,
  });
  const [createForm, setCreateForm] = useState<Omit<User, 'uid' | 'created_at'> & { password: string }>({
    email: '',
    first_name: '',
    last_name: '',
    roles: [],
    age: undefined,
    gender: '',
    level: '',
    inscritAuxCours: false,
    inscritAuxCompetitions: true, // ✅ Par défaut à true
    password: '',
  });

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const querySnapshot = await getDocs(collection(db, 'users'));
        const usersData: User[] = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            uid: doc.id,
            email: data.email || '',
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            roles: data.roles || [],
            age: data.age,
            gender: data.gender,
            level: data.level,
            created_at: data.created_at,
            inscritAuxCours: data.inscritAuxCours ?? false,
            inscritAuxCompetitions: data.inscritAuxCompetitions ?? true, // ✅ Par défaut à true
          };
        });
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

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    try {
      // ✅ S'assurer que roles est un tableau
      const roles = Array.isArray(editForm.roles) ? editForm.roles : [];
      await updateDoc(doc(db, 'users', selectedUser.uid), {
        email: editForm.email,
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        roles: roles,
        age: editForm.age,
        gender: editForm.gender,
        level: editForm.level,
        inscritAuxCours: editForm.inscritAuxCours,
        inscritAuxCompetitions: editForm.inscritAuxCompetitions,
      });
      // ✅ Rafraîchir la liste
      const querySnapshot = await getDocs(collection(db, 'users'));
      const usersData: User[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          uid: doc.id,
          email: data.email || '',
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          roles: data.roles || [],
          age: data.age,
          gender: data.gender,
          level: data.level,
          created_at: data.created_at,
          inscritAuxCours: data.inscritAuxCours ?? false,
          inscritAuxCompetitions: data.inscritAuxCompetitions ?? true,
        };
      });
      setUsers(usersData);
      setOpenEditDialog(false);
      setSnackbarMessage("Utilisateur mis à jour avec succès !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la mise à jour de l'utilisateur : " + error);
      setOpenSnackbar(true);
    }
  };

  const handleCreateUser = async () => {
    if (!createForm.email || !createForm.first_name || !createForm.last_name ||
        createForm.roles.length === 0 || !createForm.password || !createForm.level) {
      setSnackbarMessage("Veuillez remplir tous les champs obligatoires (y compris le mot de passe et le niveau).");
      setOpenSnackbar(true);
      return;
    }

    try {
      // 1. Créer le compte Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        createForm.email,
        createForm.password
      );
      const newUser = userCredential.user;

      if (!newUser) {
        throw new Error("La création de l'utilisateur a échoué.");
      }

      // 2. Créer le document dans Firestore
      await setDoc(doc(db, 'users', newUser.uid), {
        uid: newUser.uid,
        email: newUser.email,
        first_name: createForm.first_name,
        last_name: createForm.last_name,
        roles: createForm.roles as UserRole[],
        age: createForm.age,
        gender: createForm.gender,
        level: createForm.level,
        inscritAuxCours: createForm.inscritAuxCours,
        inscritAuxCompetitions: createForm.inscritAuxCompetitions,
        created_at: new Date().toISOString()
      });

      // 3. Envoyer l'email de réinitialisation
      await sendPasswordResetEmail(auth, createForm.email);

      // 4. Rafraîchir la liste
      const querySnapshot = await getDocs(collection(db, 'users'));
      const usersData: User[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          uid: doc.id,
          email: data.email || '',
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          roles: data.roles || [],
          age: data.age,
          gender: data.gender,
          level: data.level,
          created_at: data.created_at,
          inscritAuxCours: data.inscritAuxCours ?? false,
          inscritAuxCompetitions: data.inscritAuxCompetitions ?? true,
        };
      });
      setUsers(usersData);

      setOpenCreateDialog(false);
      setSnackbarMessage("Utilisateur créé avec succès ! Un email de réinitialisation a été envoyé. NOTE: Vous êtes maintenant déconnecté. Veuillez vous reconnecter avec votre compte admin.");
      setOpenSnackbar(true);
    } catch (error: any) {
      console.error("Erreur :", error);
      let message = "Erreur lors de la création de l'utilisateur.";

      if (error.code === 'auth/email-already-in-use') {
        message = "Cet email est déjà utilisé.";
      } else if (error.code === 'auth/weak-password') {
        message = "Le mot de passe doit contenir au moins 6 caractères.";
      } else if (error.code === 'auth/invalid-email') {
        message = "L'email saisi est invalide.";
      } else if (error.message) {
        message = error.message;
      }

      // ✅ Supprimer l'utilisateur Auth si la création a échoué
      const currentUser = auth.currentUser;
      if (currentUser && currentUser.email !== auth.currentUser?.email) {
        try {
          await deleteUser(currentUser);
        } catch (deleteError) {
          console.error("Erreur lors de la suppression de l'utilisateur Auth :", deleteError);
        }
      }

      setSnackbarMessage(message);
      setOpenSnackbar(true);
    }
  };

  const handleOpenEditDialog = (user: User) => {
    setSelectedUser(user);
    setEditForm({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      roles: user.roles || [],
      age: user.age,
      gender: user.gender || '',
      level: user.level || '',
      inscritAuxCours: user.inscritAuxCours ?? false,
      inscritAuxCompetitions: user.inscritAuxCompetitions ?? true, // ✅ Par défaut à true
    });
    setOpenEditDialog(true);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible.")) {
      return;
    }
    try {
      // 1. Supprimer de Firestore
      await deleteDoc(doc(db, 'users', userId));

      // 2. Rafraîchir la liste
      const querySnapshot = await getDocs(collection(db, 'users'));
      const usersData: User[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          uid: doc.id,
          email: data.email || '',
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          roles: data.roles || [],
          age: data.age,
          gender: data.gender,
          level: data.level,
          created_at: data.created_at,
          inscritAuxCours: data.inscritAuxCours ?? false,
          inscritAuxCompetitions: data.inscritAuxCompetitions ?? true,
        };
      });
      setUsers(usersData);
      setSnackbarMessage("Utilisateur supprimé de la base de données avec succès !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la suppression de l'utilisateur : " + error);
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
            onClick={() => setOpenCreateDialog(true)}
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
                <TableCell>Rôles</TableCell>
                <TableCell>Niveau</TableCell>
                <TableCell>Âge</TableCell>
                <TableCell>Genre</TableCell>
                <TableCell>Cours</TableCell>
                <TableCell>Compétitions</TableCell>
                <TableCell>Actions</TableCell> {/* ✅ COLONNE POUR LES ICÔNES */}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.uid}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.first_name}</TableCell>
                  <TableCell>{user.last_name}</TableCell>
                  <TableCell>
                    {user.roles.map(role => (
                      <Chip key={role} label={role} sx={{ mr: 1, mb: 1 }} />
                    ))}
                  </TableCell>
                  <TableCell>
                    {user.level ? (
                      <Chip
                        label={levelOptions.find(opt => opt.value === user.level)?.label || user.level}
                        sx={{
                          backgroundColor: levelColors[user.level],
                          color: ['noir', 'blanc'].includes(user.level) ? 'black' : 'white'
                        }}
                      />
                    ) : 'N/A'}
                  </TableCell>
                  <TableCell>{user.age || 'N/A'}</TableCell>
                  <TableCell>{user.gender || 'N/A'}</TableCell>
                  <TableCell>
                    {user.inscritAuxCours ? <Chip label="Oui" color="success" /> : <Chip label="Non" color="error" />}
                  </TableCell>
                  <TableCell>
                    {user.inscritAuxCompetitions ? <Chip label="Oui" color="success" /> : <Chip label="Non" color="error" />}
                  </TableCell>
                  {/* ✅ ICÔNES D'ÉDITION ET SUPPRESSION */}
                  <TableCell>
                    <IconButton
                      color="primary"
                      onClick={() => handleOpenEditDialog(user)}
                      aria-label="Modifier"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      color="error"
                      onClick={() => handleDeleteUser(user.uid)}
                      aria-label="Supprimer"
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
                <InputLabel>Rôles (multiple possible)</InputLabel>
                <Select
                  multiple
                  value={editForm.roles || []}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditForm({
                      ...editForm,
                      roles: typeof value === 'string' ? [value as UserRole] : (value as UserRole[])
                    });
                  }}
                  label="Rôles"
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as UserRole[]).map(role => (
                        <Chip key={role} label={role} />
                      ))}
                    </Box>
                  )}
                >
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="ouvreur">Ouvreur</MenuItem>
                  <MenuItem value="moniteur">Moniteur</MenuItem>
                  <MenuItem value="client">Client</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth required>
                <InputLabel>Niveau en salle</InputLabel>
                <Select
                  value={editForm.level || ''}
                  onChange={(e) => setEditForm({...editForm, level: e.target.value})}
                  label="Niveau en salle"
                >
                  {levelOptions.map(option => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Âge"
                type="number"
                value={editForm.age || ''}
                onChange={(e) => setEditForm({...editForm, age: e.target.value ? parseInt(e.target.value) : undefined})}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
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
              <FormControl fullWidth>
                <InputLabel>Inscrit aux cours</InputLabel>
                <Select
                  value={editForm.inscritAuxCours ? 'true' : 'false'}
                  onChange={(e) => setEditForm({...editForm, inscritAuxCours: e.target.value === 'true'})}
                  label="Inscrit aux cours"
                >
                  <MenuItem value="true">Oui</MenuItem>
                  <MenuItem value="false">Non</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Inscrit aux compétitions</InputLabel>
                <Select
                  value={editForm.inscritAuxCompetitions ? 'true' : 'false'}
                  onChange={(e) => setEditForm({...editForm, inscritAuxCompetitions: e.target.value === 'true'})}
                  label="Inscrit aux compétitions"
                >
                  <MenuItem value="true">Oui</MenuItem>
                  <MenuItem value="false">Non</MenuItem>
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
                required
              />
              <TextField
                label="Mot de passe"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({...createForm, password: e.target.value})}
                fullWidth
                required
                helperText="Ce mot de passe sera envoyé à l'utilisateur par email."
              />
              <TextField
                label="Prénom"
                value={createForm.first_name}
                onChange={(e) => setCreateForm({...createForm, first_name: e.target.value})}
                fullWidth
                required
              />
              <TextField
                label="Nom"
                value={createForm.last_name}
                onChange={(e) => setCreateForm({...createForm, last_name: e.target.value})}
                fullWidth
                required
              />
              <FormControl fullWidth>
                <InputLabel>Rôles (multiple possible)</InputLabel>
                <Select
                  multiple
                  value={createForm.roles || []}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCreateForm({
                      ...createForm,
                      roles: typeof value === 'string' ? [value as UserRole] : (value as UserRole[])
                    });
                  }}
                  label="Rôles"
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as UserRole[]).map(role => (
                        <Chip key={role} label={role} />
                      ))}
                    </Box>
                  )}
                >
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="ouvreur">Ouvreur</MenuItem>
                  <MenuItem value="moniteur">Moniteur</MenuItem>
                  <MenuItem value="client">Client</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth required>
                <InputLabel>Niveau en salle</InputLabel>
                <Select
                  value={createForm.level || ''}
                  onChange={(e) => setCreateForm({...createForm, level: e.target.value})}
                  label="Niveau en salle"
                >
                  {levelOptions.map(option => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Âge"
                type="number"
                value={createForm.age || ''}
                onChange={(e) => setCreateForm({...createForm, age: e.target.value ? parseInt(e.target.value) : undefined})}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
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
              <FormControl fullWidth>
                <InputLabel>Inscrit aux cours</InputLabel>
                <Select
                  value={createForm.inscritAuxCours ? 'true' : 'false'}
                  onChange={(e) => setCreateForm({...createForm, inscritAuxCours: e.target.value === 'true'})}
                  label="Inscrit aux cours"
                >
                  <MenuItem value="true">Oui</MenuItem>
                  <MenuItem value="false">Non</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Inscrit aux compétitions</InputLabel>
                <Select
                  value={createForm.inscritAuxCompetitions ? 'true' : 'false'}
                  onChange={(e) => setCreateForm({...createForm, inscritAuxCompetitions: e.target.value === 'true'})}
                  label="Inscrit aux compétitions"
                >
                  <MenuItem value="true">Oui</MenuItem>
                  <MenuItem value="false">Non</MenuItem>
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