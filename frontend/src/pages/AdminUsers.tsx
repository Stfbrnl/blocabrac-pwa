import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Container, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Select,
  FormControl, InputLabel, Box, IconButton, Snackbar, Alert, Chip,
  TableSortLabel, Tooltip, useTheme, useMediaQuery, Checkbox, FormControlLabel,
  Card, CardContent, CardActions
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon, ArrowUpward as ArrowUpwardIcon, ArrowDownward as ArrowDownwardIcon, Lock as LockIcon, LockOpen as LockOpenIcon } from '@mui/icons-material';
import { db, auth } from '../services/firebaseConfig';
import {
  collection, getDocs, doc, updateDoc, deleteDoc, setDoc, query, orderBy, writeBatch
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, getAuth, signOut } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getSeasonAge } from '../utils/ageCategory';

// ✅ Tableau de correspondance code-couleur/cotations
const levelOptions = [
  { value: 'jaune', label: 'Jaune (3A-3C) - Débutant' },
  { value: 'vert', label: 'Vert (4A-4B+) - Débutant' },
  { value: 'bleu', label: 'Bleu (4C-5A+) - En formation de grimpeur' },
  { value: 'violet', label: 'Violet (5B-5C+) - En formation de grimpeur' },
  { value: 'rouge', label: 'Rouge (6A-6B) - Grimpeur confirmé' },
  { value: 'noir', label: 'Noire (6B+-6C+) - Grimpeur confirmé' },
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
  dateOfBirth?: string;
  gender?: string;
  level?: string;
  // ✅ Si true, le niveau ci-dessus est verrouillé par un admin : la synchronisation
  // automatique basée sur les badges (ClientStats.tsx) ne doit plus l'écraser.
  levelOverride?: boolean;
  createdAt?: string;
  inscritAuxCours?: boolean;
  inscritAuxCompetitions?: boolean;
}

type SortConfig = {
  key: keyof User;
  direction: 'asc' | 'desc'; // ✅ Corrigé : 'asc' | 'desc' pour MUI v9
};

const AdminUsers: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // ✅ En dessous de "md", le tableau à 9 colonnes devient impraticable
  // (défilement horizontal pour atteindre les actions) : on bascule sur des cartes.
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [openUnlockAllDialog, setOpenUnlockAllDialog] = useState(false);
  const [unlockingAll, setUnlockingAll] = useState(false);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<Omit<User, 'uid' | 'createdAt'>>({
    email: '',
    first_name: '',
    last_name: '',
    roles: [],
    age: undefined,
    dateOfBirth: '',
    gender: '',
    level: '',
    levelOverride: false,
    inscritAuxCours: false,
    inscritAuxCompetitions: false,
  });
  const [createForm, setCreateForm] = useState<Omit<User, 'uid' | 'createdAt'> & { password: string }>({
    email: '',
    first_name: '',
    last_name: '',
    roles: [],
    age: undefined,
    dateOfBirth: '',
    gender: '',
    level: '',
    levelOverride: false,
    inscritAuxCours: false,
    inscritAuxCompetitions: true,
    password: '',
  });
  // ✅ État pour le tri
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({
    key: 'email',
    direction: 'asc'
  });

  // ✅ Fonction pour trier les utilisateurs
  const sortUsers = (users: User[]): User[] => {
    if (!sortConfig) return users;

    return [...users].sort((a, b) => {
      // Gérer les champs potentiellement undefined
      const aValue = a[sortConfig.key] || '';
      const bValue = b[sortConfig.key] || '';

      // Pour les rôles (tableau), convertir en string
      if (sortConfig.key === 'roles') {
        const aRoles = (a.roles || []).join(', ');
        const bRoles = (b.roles || []).join(', ');
        return sortConfig.direction === 'asc'
          ? aRoles.localeCompare(bRoles)
          : bRoles.localeCompare(aRoles);
      }

      // Pour les chips (niveau, genre, etc.)
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      // Pour les nombres (âge)
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc'
          ? aValue - bValue
          : bValue - aValue;
      }

      return 0;
    });
  };

  // ✅ Fonction pour changer le tri
  const requestSort = (key: keyof User) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

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
            dateOfBirth: data.dateOfBirth,
            gender: data.gender,
            level: data.level,
          levelOverride: data.levelOverride || false,
            createdAt: data.createdAt ?? data.created_at,
            inscritAuxCours: data.inscritAuxCours ?? false,
            inscritAuxCompetitions: data.inscritAuxCompetitions ?? true,
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
      const roles = Array.isArray(editForm.roles) ? editForm.roles : [];
      // ✅ Garde "classement_profiles" (fiche publique lue par ClientClassement.tsx,
      // un client ne pouvant pas lister toute la collection "users") synchronisée
      // au même moment, sans écran de saisie séparé. Seulement pour les clients :
      // pas besoin de fiche publique pour un compte admin/ouvreur/moniteur.
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', selectedUser.uid), {
        email: editForm.email,
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        roles: roles,
        dateOfBirth: editForm.dateOfBirth,
        gender: editForm.gender,
        level: editForm.level,
        levelOverride: editForm.levelOverride ?? false,
        inscritAuxCours: editForm.inscritAuxCours,
        inscritAuxCompetitions: editForm.inscritAuxCompetitions,
      });
      if (roles.includes('client')) {
        batch.set(doc(db, 'classement_profiles', selectedUser.uid), {
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          gender: editForm.gender,
          dateOfBirth: editForm.dateOfBirth,
        }, { merge: true });
      }
      // ✅ Même logique que "classement_profiles" ci-dessus, pour l'annuaire des
      // moniteurs lu par ClientMessages.tsx (un client ne peut pas lister "users").
      if (roles.includes('moniteur')) {
        batch.set(doc(db, 'staff_directory', selectedUser.uid), {
          displayName: `${editForm.first_name} ${editForm.last_name}`.trim(),
        });
      } else {
        batch.delete(doc(db, 'staff_directory', selectedUser.uid));
      }
      await batch.commit();
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
            dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          level: data.level,
          levelOverride: data.levelOverride || false,
          createdAt: data.createdAt ?? data.created_at,
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

    // ✅ On utilise une instance Firebase secondaire temporaire pour créer le compte :
    // createUserWithEmailAndPassword connecte automatiquement l'utilisateur nouvellement
    // créé sur l'instance auth utilisée. En la créant sur une instance à part, la session
    // de l'admin sur l'app principale n'est jamais affectée.
    const secondaryApp = initializeApp(auth.app.options, `Secondary-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        createForm.email,
        createForm.password
      );
      const newUser = userCredential.user;

      if (!newUser) {
        throw new Error("La création de l'utilisateur a échoué.");
      }

      const createBatch = writeBatch(db);
      createBatch.set(doc(db, 'users', newUser.uid), {
        uid: newUser.uid,
        email: newUser.email,
        first_name: createForm.first_name,
        last_name: createForm.last_name,
        roles: createForm.roles as UserRole[],
        dateOfBirth: createForm.dateOfBirth,
        gender: createForm.gender,
        level: createForm.level,
        levelOverride: createForm.levelOverride ?? false,
        inscritAuxCours: createForm.inscritAuxCours,
        inscritAuxCompetitions: createForm.inscritAuxCompetitions,
        createdAt: new Date().toISOString()
      });
      if (createForm.roles.includes('client')) {
        createBatch.set(doc(db, 'classement_profiles', newUser.uid), {
          first_name: createForm.first_name,
          last_name: createForm.last_name,
          gender: createForm.gender,
          dateOfBirth: createForm.dateOfBirth,
          classementOptIn: false,
        });
      }
      // ✅ Même logique que "classement_profiles" ci-dessus, pour l'annuaire des
      // moniteurs lu par ClientMessages.tsx (un client ne peut pas lister "users").
      if (createForm.roles.includes('moniteur')) {
        createBatch.set(doc(db, 'staff_directory', newUser.uid), {
          displayName: `${createForm.first_name} ${createForm.last_name}`.trim(),
        });
      }
      await createBatch.commit();

      await sendPasswordResetEmail(secondaryAuth, createForm.email);

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
            dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          level: data.level,
          levelOverride: data.levelOverride || false,
          createdAt: data.createdAt ?? data.created_at,
          inscritAuxCours: data.inscritAuxCours ?? false,
          inscritAuxCompetitions: data.inscritAuxCompetitions ?? true,
        };
      });
      setUsers(usersData);

      setOpenCreateDialog(false);
      setSnackbarMessage("Utilisateur créé avec succès ! Un email de réinitialisation a été envoyé.");
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

      setSnackbarMessage(message);
      setOpenSnackbar(true);
    } finally {
      // On nettoie systématiquement l'instance secondaire, qu'il y ait eu succès ou erreur
      await signOut(secondaryAuth).catch(() => {});
      await deleteApp(secondaryApp).catch(() => {});
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
      dateOfBirth: user.dateOfBirth || '',
      gender: user.gender || '',
      level: user.level || '',
      levelOverride: user.levelOverride || false,
      inscritAuxCours: user.inscritAuxCours ?? false,
      inscritAuxCompetitions: user.inscritAuxCompetitions ?? true,
    });
    setOpenEditDialog(true);
  };

  const handleOpenDeleteDialog = (userId: string) => {
    setUserToDelete(userId);
    setOpenDeleteDialog(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteDoc(doc(db, 'users', userToDelete));
      await deleteDoc(doc(db, 'staff_directory', userToDelete));
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
            dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          level: data.level,
          levelOverride: data.levelOverride || false,
          createdAt: data.createdAt ?? data.created_at,
          inscritAuxCours: data.inscritAuxCours ?? false,
          inscritAuxCompetitions: data.inscritAuxCompetitions ?? true,
        };
      });
      setUsers(usersData);
      setSnackbarMessage("Utilisateur supprimé avec succès !");
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors de la suppression de l'utilisateur : " + error);
      setOpenSnackbar(true);
    } finally {
      setOpenDeleteDialog(false);
      setUserToDelete(null);
    }
  };

  const handleUnlockAllLevels = async () => {
    const lockedUsers = users.filter(u => u.levelOverride);
    if (lockedUsers.length === 0) {
      setOpenUnlockAllDialog(false);
      return;
    }
    setUnlockingAll(true);
    try {
      // Un batch Firestore accepte au maximum 500 opérations : on découpe par sécurité.
      for (let i = 0; i < lockedUsers.length; i += 450) {
        const chunk = lockedUsers.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach(u => batch.update(doc(db, 'users', u.uid), { levelOverride: false }));
        await batch.commit();
      }
      setUsers(prev => prev.map(u => (u.levelOverride ? { ...u, levelOverride: false } : u)));
      setSnackbarMessage(`${lockedUsers.length} niveau(x) déverrouillé(s) avec succès !`);
      setOpenSnackbar(true);
    } catch (error) {
      console.error("Erreur :", error);
      setSnackbarMessage("Erreur lors du déverrouillage en masse : " + error);
      setOpenSnackbar(true);
    } finally {
      setUnlockingAll(false);
      setOpenUnlockAllDialog(false);
    }
  };

  // ✅ Fonction pour obtenir l'icône de tri
  const getSortIcon = (key: keyof User) => {
    if (!sortConfig || sortConfig.key !== key) {
      return null;
    }
    return sortConfig.direction === 'asc' ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />;
  };

  if (loading) {
    return <Typography>Chargement des utilisateurs...</Typography>;
  }

  const lockedCount = users.filter(u => u.levelOverride).length;

  return (
    <Container maxWidth={false} sx={{ px: 2 }}> {/* ✅ Largeur maximale */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 2,
            mb: 2,
          }}
        >
          <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
            Gestion des Utilisateurs
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, width: { xs: '100%', sm: 'auto' } }}>
            <Button
              variant="outlined"
              startIcon={<LockOpenIcon />}
              onClick={() => setOpenUnlockAllDialog(true)}
              disabled={lockedCount === 0}
              sx={{ width: { xs: '100%', sm: 'auto' }, height: '48px' }}
            >
              Déverrouiller tous les niveaux{lockedCount > 0 ? ` (${lockedCount})` : ''}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpenCreateDialog(true)}
              sx={{ width: { xs: '100%', sm: 'auto' }, height: '48px' }}
            >
              Créer un utilisateur
            </Button>
          </Box>
        </Box>

        {isCompact ? (
          <Box>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <FormControl size="small" fullWidth>
                <InputLabel id="mobile-sort-label">Trier par</InputLabel>
                <Select
                  labelId="mobile-sort-label"
                  label="Trier par"
                  value={sortConfig?.key ?? 'email'}
                  onChange={(e) => requestSort(e.target.value as keyof User)}
                >
                  <MenuItem value="email">Email</MenuItem>
                  <MenuItem value="first_name">Prénom</MenuItem>
                  <MenuItem value="last_name">Nom</MenuItem>
                  <MenuItem value="roles">Rôles</MenuItem>
                  <MenuItem value="level">Niveau</MenuItem>
                  <MenuItem value="age">Âge</MenuItem>
                  <MenuItem value="gender">Genre</MenuItem>
                </Select>
              </FormControl>
              <Tooltip title={sortConfig?.direction === 'desc' ? 'Ordre décroissant' : 'Ordre croissant'}>
                <IconButton
                  onClick={() => sortConfig && setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                  aria-label="Inverser l'ordre de tri"
                >
                  {sortConfig?.direction === 'desc' ? <ArrowDownwardIcon /> : <ArrowUpwardIcon />}
                </IconButton>
              </Tooltip>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {sortUsers(users).map(user => (
                <Card key={user.uid} variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {user.first_name} {user.last_name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1, wordBreak: 'break-word' }}>
                      {user.email}
                    </Typography>

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                      {user.roles.map(role => (
                        <Chip key={role} label={role} size="small" />
                      ))}
                    </Box>

                    {user.level && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        <Chip
                          size="small"
                          label={levelOptions.find(opt => opt.value === user.level)?.label || user.level}
                          sx={{
                            backgroundColor: levelColors[user.level],
                            color: user.level === 'blanc' ? 'black' : 'white'
                          }}
                        />
                        {user.levelOverride && (
                          <Tooltip title="Niveau verrouillé manuellement : pas de mise à jour automatique par les badges">
                            <LockIcon fontSize="small" color="action" />
                          </Tooltip>
                        )}
                      </Box>
                    )}

                    <Typography variant="body2" sx={{ mb: 1 }}>
                      Âge : {getSeasonAge(user.dateOfBirth, user.age) ?? 'N/A'} · Genre : {user.gender || 'N/A'}
                    </Typography>

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Chip
                        size="small"
                        label={`Cours : ${user.inscritAuxCours ? 'Oui' : 'Non'}`}
                        color={user.inscritAuxCours ? 'success' : 'error'}
                      />
                      <Chip
                        size="small"
                        label={`Compétitions : ${user.inscritAuxCompetitions ? 'Oui' : 'Non'}`}
                        color={user.inscritAuxCompetitions ? 'success' : 'error'}
                      />
                    </Box>
                  </CardContent>
                  <CardActions sx={{ justifyContent: 'flex-end' }}>
                    <IconButton color="primary" onClick={() => handleOpenEditDialog(user)} aria-label="Modifier">
                      <EditIcon />
                    </IconButton>
                    <IconButton color="error" onClick={() => handleOpenDeleteDialog(user.uid)} aria-label="Supprimer">
                      <DeleteIcon />
                    </IconButton>
                  </CardActions>
                </Card>
              ))}
            </Box>
          </Box>
        ) : (
        <TableContainer sx={{ overflowX: 'auto' }}> {/* ✅ Défilement horizontal si nécessaire */}
          <Table sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig?.key === 'email'}
                    direction={sortConfig?.direction ?? 'asc'}
                    onClick={() => requestSort('email')}
                  >
                    Email {getSortIcon('email')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig?.key === 'first_name'}
                    direction={sortConfig?.direction ?? 'asc'}
                    onClick={() => requestSort('first_name')}
                  >
                    Prénom {getSortIcon('first_name')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig?.key === 'last_name'}
                    direction={sortConfig?.direction ?? 'asc'}
                    onClick={() => requestSort('last_name')}
                  >
                    Nom {getSortIcon('last_name')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig?.key === 'roles'}
                    direction={sortConfig?.direction ?? 'asc'}
                    onClick={() => requestSort('roles')}
                  >
                    Rôles {getSortIcon('roles')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig?.key === 'level'}
                    direction={sortConfig?.direction ?? 'asc'}
                    onClick={() => requestSort('level')}
                  >
                    Niveau {getSortIcon('level')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig?.key === 'age'}
                    direction={sortConfig?.direction ?? 'asc'}
                    onClick={() => requestSort('age')}
                  >
                    Âge {getSortIcon('age')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig?.key === 'gender'}
                    direction={sortConfig?.direction ?? 'asc'}
                    onClick={() => requestSort('gender')}
                  >
                    Genre {getSortIcon('gender')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig?.key === 'inscritAuxCours'}
                    direction={sortConfig?.direction ?? 'asc'}
                    onClick={() => requestSort('inscritAuxCours')}
                  >
                    Cours {getSortIcon('inscritAuxCours')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig?.key === 'inscritAuxCompetitions'}
                    direction={sortConfig?.direction ?? 'asc'}
                    onClick={() => requestSort('inscritAuxCompetitions')}
                  >
                    Compétitions {getSortIcon('inscritAuxCompetitions')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortUsers(users).map(user => (
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
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Chip
                          label={levelOptions.find(opt => opt.value === user.level)?.label || user.level}
                          sx={{
                            backgroundColor: levelColors[user.level],
                            color: user.level === 'blanc' ? 'black' : 'white'
                          }}
                        />
                        {user.levelOverride && (
                          <Tooltip title="Niveau verrouillé manuellement : pas de mise à jour automatique par les badges">
                            <LockIcon fontSize="small" color="action" />
                          </Tooltip>
                        )}
                      </Box>
                    ) : 'N/A'}
                  </TableCell>
                  <TableCell>{getSeasonAge(user.dateOfBirth, user.age) ?? 'N/A'}</TableCell>
                  <TableCell>{user.gender || 'N/A'}</TableCell>
                  <TableCell>
                    {user.inscritAuxCours ? <Chip label="Oui" color="success" /> : <Chip label="Non" color="error" />}
                  </TableCell>
                  <TableCell>
                    {user.inscritAuxCompetitions ? <Chip label="Oui" color="success" /> : <Chip label="Non" color="error" />}
                  </TableCell>
                  <TableCell>
                    <IconButton color="primary" onClick={() => handleOpenEditDialog(user)} aria-label="Modifier">
                      <EditIcon />
                    </IconButton>
                    <IconButton color="error" onClick={() => handleOpenDeleteDialog(user.uid)} aria-label="Supprimer">
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        )}

        {/* Dialogue de modification */}
        <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} fullWidth maxWidth="sm" fullScreen={isMobile}>
          <DialogTitle>Modifier l'utilisateur</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField label="Email" value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} fullWidth />
              <TextField label="Prénom" value={editForm.first_name} onChange={(e) => setEditForm({...editForm, first_name: e.target.value})} fullWidth />
              <TextField label="Nom" value={editForm.last_name} onChange={(e) => setEditForm({...editForm, last_name: e.target.value})} fullWidth />
              <FormControl fullWidth>
                <InputLabel id="roles-multiple-possible-select-label">Rôles (multiple possible)</InputLabel>
                <Select
                  labelId="roles-multiple-possible-select-label" id="roles-multiple-possible-select"
                  multiple
                  value={editForm.roles || []}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditForm({ ...editForm, roles: typeof value === 'string' ? [value as UserRole] : (value as UserRole[]) });
                  }}
                  label="Rôles"
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as UserRole[]).map(role => <Chip key={role} label={role} />)}
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
                <InputLabel id="niveau-en-salle-select-label">Niveau en salle</InputLabel>
                <Select
                  labelId="niveau-en-salle-select-label" id="niveau-en-salle-select" value={editForm.level || ''} onChange={(e) => setEditForm({...editForm, level: e.target.value})} label="Niveau en salle">
                  {levelOptions.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={editForm.levelOverride ?? false}
                    onChange={(e) => setEditForm({ ...editForm, levelOverride: e.target.checked })}
                  />
                }
                label="Verrouiller ce niveau (empêche la mise à jour automatique par les badges du client)"
              />
              <TextField label="Date de naissance" type="date" value={editForm.dateOfBirth || ''} onChange={(e) => setEditForm({...editForm, dateOfBirth: e.target.value || undefined})} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              <FormControl fullWidth>
                <InputLabel id="genre-select-label">Genre</InputLabel>
                <Select
                  labelId="genre-select-label" id="genre-select" value={editForm.gender || ''} onChange={(e) => setEditForm({...editForm, gender: e.target.value})} label="Genre">
                  <MenuItem value="Homme">Homme</MenuItem>
                  <MenuItem value="Femme">Femme</MenuItem>
                  <MenuItem value="Autre">Autre</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="inscrit-aux-cours-select-label">Inscrit aux cours</InputLabel>
                <Select
                  labelId="inscrit-aux-cours-select-label" id="inscrit-aux-cours-select" value={editForm.inscritAuxCours ? 'true' : 'false'} onChange={(e) => setEditForm({...editForm, inscritAuxCours: e.target.value === 'true'})} label="Inscrit aux cours">
                  <MenuItem value="true">Oui</MenuItem>
                  <MenuItem value="false">Non</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="inscrit-aux-competitions-select-label">Inscrit aux compétitions</InputLabel>
                <Select
                  labelId="inscrit-aux-competitions-select-label" id="inscrit-aux-competitions-select" value={editForm.inscritAuxCompetitions ? 'true' : 'false'} onChange={(e) => setEditForm({...editForm, inscritAuxCompetitions: e.target.value === 'true'})} label="Inscrit aux compétitions">
                  <MenuItem value="true">Oui</MenuItem>
                  <MenuItem value="false">Non</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenEditDialog(false)}>Annuler</Button>
            <Button onClick={handleUpdateUser} color="primary">Enregistrer</Button>
          </DialogActions>
        </Dialog>

        {/* Dialogue de création */}
        <Dialog open={openCreateDialog} onClose={() => setOpenCreateDialog(false)} fullWidth maxWidth="sm" fullScreen={isMobile}>
          <DialogTitle>Créer un nouvel utilisateur</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField label="Email" value={createForm.email} onChange={(e) => setCreateForm({...createForm, email: e.target.value})} fullWidth required />
              <TextField label="Mot de passe" type="password" value={createForm.password} onChange={(e) => setCreateForm({...createForm, password: e.target.value})} fullWidth required helperText="Ce mot de passe sera envoyé à l'utilisateur par email." />
              <TextField label="Prénom" value={createForm.first_name} onChange={(e) => setCreateForm({...createForm, first_name: e.target.value})} fullWidth required />
              <TextField label="Nom" value={createForm.last_name} onChange={(e) => setCreateForm({...createForm, last_name: e.target.value})} fullWidth required />
              <FormControl fullWidth>
                <InputLabel id="roles-multiple-possible-select-label-2">Rôles (multiple possible)</InputLabel>
                <Select
                  labelId="roles-multiple-possible-select-label-2" id="roles-multiple-possible-select-2"
                  multiple
                  value={createForm.roles || []}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCreateForm({ ...createForm, roles: typeof value === 'string' ? [value as UserRole] : (value as UserRole[]) });
                  }}
                  label="Rôles"
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as UserRole[]).map(role => <Chip key={role} label={role} />)}
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
                <InputLabel id="niveau-en-salle-select-label-2">Niveau en salle</InputLabel>
                <Select
                  labelId="niveau-en-salle-select-label-2" id="niveau-en-salle-select-2" value={createForm.level || ''} onChange={(e) => setCreateForm({...createForm, level: e.target.value})} label="Niveau en salle">
                  {levelOptions.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={createForm.levelOverride ?? false}
                    onChange={(e) => setCreateForm({ ...createForm, levelOverride: e.target.checked })}
                  />
                }
                label="Verrouiller ce niveau (empêche la mise à jour automatique par les badges du client)"
              />
              <TextField label="Date de naissance" type="date" value={createForm.dateOfBirth || ''} onChange={(e) => setCreateForm({...createForm, dateOfBirth: e.target.value || undefined})} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              <FormControl fullWidth>
                <InputLabel id="genre-select-label-2">Genre</InputLabel>
                <Select
                  labelId="genre-select-label-2" id="genre-select-2" value={createForm.gender || ''} onChange={(e) => setCreateForm({...createForm, gender: e.target.value})} label="Genre">
                  <MenuItem value="Homme">Homme</MenuItem>
                  <MenuItem value="Femme">Femme</MenuItem>
                  <MenuItem value="Autre">Autre</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="inscrit-aux-cours-select-label-2">Inscrit aux cours</InputLabel>
                <Select
                  labelId="inscrit-aux-cours-select-label-2" id="inscrit-aux-cours-select-2" value={createForm.inscritAuxCours ? 'true' : 'false'} onChange={(e) => setCreateForm({...createForm, inscritAuxCours: e.target.value === 'true'})} label="Inscrit aux cours">
                  <MenuItem value="true">Oui</MenuItem>
                  <MenuItem value="false">Non</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="inscrit-aux-competitions-select-label-2">Inscrit aux compétitions</InputLabel>
                <Select
                  labelId="inscrit-aux-competitions-select-label-2" id="inscrit-aux-competitions-select-2" value={createForm.inscritAuxCompetitions ? 'true' : 'false'} onChange={(e) => setCreateForm({...createForm, inscritAuxCompetitions: e.target.value === 'true'})} label="Inscrit aux compétitions">
                  <MenuItem value="true">Oui</MenuItem>
                  <MenuItem value="false">Non</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenCreateDialog(false)}>Annuler</Button>
            <Button onClick={handleCreateUser} color="primary">Créer</Button>
          </DialogActions>
        </Dialog>

        {/* Dialogue de confirmation de suppression */}
        <Dialog
          open={openDeleteDialog}
          onClose={() => setOpenDeleteDialog(false)}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>Supprimer l'utilisateur</DialogTitle>
          <DialogContent>
            Êtes-vous sûr de vouloir supprimer cet utilisateur ?
            <br />
            <strong>Cette action est irréversible.</strong>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDeleteDialog(false)}>Annuler</Button>
            <Button onClick={handleDeleteUser} color="error" variant="contained" autoFocus>
              Supprimer
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialogue de confirmation du déverrouillage en masse */}
        <Dialog
          open={openUnlockAllDialog}
          onClose={() => !unlockingAll && setOpenUnlockAllDialog(false)}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>Déverrouiller tous les niveaux</DialogTitle>
          <DialogContent>
            {lockedCount} compte(s) ont actuellement leur niveau verrouillé.
            <br />
            Êtes-vous sûr de vouloir tous les déverrouiller ? Leur niveau redeviendra mis à jour
            automatiquement d'après leurs badges à leur prochaine visite sur leurs statistiques.
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenUnlockAllDialog(false)} disabled={unlockingAll}>
              Annuler
            </Button>
            <Button
              onClick={handleUnlockAllLevels}
              color="primary"
              variant="contained"
              disabled={unlockingAll}
              autoFocus
            >
              {unlockingAll ? 'Déverrouillage...' : 'Déverrouiller'}
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar open={openSnackbar} autoHideDuration={6000} onClose={() => setOpenSnackbar(false)}>
          <Alert severity={snackbarMessage.includes("succès") ? "success" : "error"} onClose={() => setOpenSnackbar(false)}>
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </Paper>
    </Container>
  );
};

export default AdminUsers;
