import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import {
  Button,
  AppBar,
  Typography,
  Box,
  Toolbar,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import { Link } from 'react-router-dom';

type UserRole = 'admin' | 'ouvreur' | 'moniteur' | 'client';

interface NavLink {
  label: string;
  to: string;
}

const Navbar: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loadingRole, setLoadingRole] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    if (user) {
      const fetchUserRoles = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            // ✅ Fusionne les deux formats possibles plutôt qu'un simple "||" :
            // un "roles" vide ([]), bien que présent, ne doit pas masquer un "role"
            // hérité encore valide sur le même document.
            const rolesArray: string[] = Array.isArray(userData.roles) ? userData.roles : [];
            const legacyRole: string[] = userData.role ? [userData.role] : [];
            setUserRoles(Array.from(new Set([...rolesArray, ...legacyRole])) as UserRole[]);
          }
        } catch (error) {
          console.error("Erreur :", error);
        } finally {
          setLoadingRole(false);
        }
      };
      fetchUserRoles();
    } else {
      setUserRoles([]);
      setLoadingRole(false);
    }
  }, [user]);

  if (loadingAuth || loadingRole) {
    return null;
  }

  // ✅ Construit la liste de liens à partir des rôles, une seule fois,
  // réutilisée à la fois pour l'affichage desktop (boutons) et mobile (Drawer).
  const getNavLinks = (): NavLink[] => {
    if (!user) {
      return [
        { label: 'CONNEXION', to: '/login' },
        { label: 'INSCRIPTION', to: '/register' },
      ];
    }

    const links: NavLink[] = [];

    if (userRoles.includes('admin')) {
      links.push(
        { label: 'ADMIN', to: '/admin' },
        { label: 'GÉRER LES UTILISATEURS', to: '/admin/users' },
        { label: 'CRÉER/GÉRER LES COMPÉTITIONS', to: '/admin/competitions/create' },
        { label: 'GÉRER LES INSCRIPTIONS', to: '/admin/competitions/list' },
        { label: 'STATISTIQUES', to: '/admin/competitions/stats' },
        { label: 'INFORMATIONS CLIENTS', to: '/admin/announcements' },
      );
    }
    if (userRoles.includes('ouvreur')) {
      links.push({ label: 'OUVREUR', to: '/ouvreur' });
    }
    if (userRoles.includes('moniteur')) {
      links.push({ label: 'MONITEUR', to: '/moniteur' });
    }
    if (userRoles.includes('client')) {
      links.push({ label: 'MON ESPACE', to: '/client' });
    }

    return links;
  };

  const navLinks = getNavLinks();

  const handleDrawerToggle = () => setDrawerOpen((prev) => !prev);
  const handleDrawerClose = () => setDrawerOpen(false);

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          BLOCABRAC
        </Typography>

        {/* ✅ Desktop / tablette large : boutons horizontaux comme avant */}
        {!isMobile && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {navLinks.map((link) => (
              <Button
                key={link.to}
                color="inherit"
                component={Link}
                to={link.to}
                size="small"
              >
                {link.label}
              </Button>
            ))}
            {user && (
              <Button color="inherit" size="small" onClick={() => auth.signOut()}>
                DÉCONNEXION
              </Button>
            )}
          </Box>
        )}

        {/* ✅ Mobile : icône burger qui ouvre le Drawer */}
        {isMobile && (
          <IconButton
            color="inherit"
            aria-label="ouvrir le menu"
            edge="end"
            onClick={handleDrawerToggle}
          >
            <MenuIcon />
          </IconButton>
        )}
      </Toolbar>

      {/* ✅ Drawer latéral mobile : reprend tous les liens, fermeture au clic */}
      <Drawer anchor="right" open={drawerOpen} onClose={handleDrawerClose}>
        <Box sx={{ width: 260 }} role="presentation">
          <Typography variant="h6" sx={{ p: 2 }}>
            BLOCABRAC
          </Typography>
          <Divider />
          <List>
            {navLinks.map((link) => (
              <ListItem key={link.to} disablePadding>
                <ListItemButton
                  component={Link}
                  to={link.to}
                  onClick={handleDrawerClose}
                >
                  <ListItemText primary={link.label} />
                </ListItemButton>
              </ListItem>
            ))}
            {user && (
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => {
                    auth.signOut();
                    handleDrawerClose();
                  }}
                >
                  <ListItemText primary="DÉCONNEXION" />
                </ListItemButton>
              </ListItem>
            )}
          </List>
        </Box>
      </Drawer>
    </AppBar>
  );
};

export default Navbar;