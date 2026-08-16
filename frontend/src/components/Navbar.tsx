import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
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
  Menu,
  MenuItem,
  Collapse,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import Tooltip from '@mui/material/Tooltip';
import { Link, useLocation } from 'react-router-dom';
import { useThemeMode } from '../context/ThemeModeContext';
import { logoAssetUrl } from '../config/gymConfig';
import { formattedAppVersion, buildDetail } from '../config/appVersion';

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
  const [adminMenuAnchor, setAdminMenuAnchor] = useState<null | HTMLElement>(null);
  const [mobileAdminOpen, setMobileAdminOpen] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { mode, toggleMode } = useThemeMode();
  const location = useLocation();

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
      const clear = () => {
        setUserRoles([]);
        setLoadingRole(false);
      };
      clear();
    }
  }, [user]);

  // ✅ Chantier 3 (PLAN-spark-images-competition.md) : IndexedDB est rattaché à
  // l'origine du site, pas au compte connecté — sur un appareil partagé (poste admin,
  // téléphone prêté), les données du compte précédent doivent disparaître à la
  // déconnexion. Ordre strict imposé par l'API Firestore : signOut avant terminate
  // (sinon les requêtes en cours empêchent l'arrêt propre), terminate avant
  // clearIndexedDbPersistence (elle exige Firestore inactif), puis rechargement de la
  // page car l'instance Firestore est inutilisable après terminate().
  const handleLogout = async (): Promise<void> => {
    try {
      await auth.signOut();
      await terminate(db);
      await clearIndexedDbPersistence(db);
    } catch (error) {
      console.error('Erreur lors de la déconnexion :', error);
    } finally {
      window.location.reload();
    }
  };

  if (loadingAuth || loadingRole) {
    return null;
  }

  // ✅ Écran live TV (CONCEPTION-ecran-live-competition.md §4) : "rendue hors du
  // layout habituel, pas de Navbar" — cette route s'ouvre dans une fenêtre HDMI
  // étendue dédiée à la TV de la salle, la Navbar n'y a aucun sens et mangerait
  // de l'espace sur un écran conçu pour être lu à 5 mètres. Préfixe plutôt
  // qu'égalité stricte depuis que la compétition est en paramètre d'URL
  // (CONCEPTION-selecteur-marge-compteur-incremental.md §1) : le chemin exact varie
  // désormais selon la compétition affichée.
  if (location.pathname.startsWith('/admin/competitions/live-display/')) {
    return null;
  }

  // ✅ Sous-menu Admin, affiché sous un seul bouton (Menu desktop / accordéon mobile)
  // plutôt qu'en boutons séparés, pour ne pas monopoliser la navbar.
  const adminLinks: NavLink[] = [
    { label: 'TABLEAU DE BORD', to: '/admin' },
    { label: 'GÉRER LES UTILISATEURS', to: '/admin/users' },
    { label: 'CRÉER/GÉRER LES COMPÉTITIONS', to: '/admin/competitions/create' },
    { label: 'GÉRER LES INSCRIPTIONS', to: '/admin/competitions/list' },
    { label: 'STATISTIQUES', to: '/admin/competitions/stats' },
    { label: 'INFORMATIONS CLIENTS', to: '/admin/announcements' },
  ];

  // ✅ Construit la liste de liens (hors admin) à partir des rôles, une seule fois,
  // réutilisée à la fois pour l'affichage desktop (boutons) et mobile (Drawer).
  const getNavLinks = (): NavLink[] => {
    if (!user) {
      return [
        { label: 'CONNEXION', to: '/login' },
        { label: 'INSCRIPTION', to: '/register' },
      ];
    }

    const links: NavLink[] = [];

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
  const isAdmin = user && userRoles.includes('admin');

  const handleDrawerToggle = () => setDrawerOpen((prev) => !prev);
  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setMobileAdminOpen(false);
  };
  const handleAdminMenuOpen = (event: React.MouseEvent<HTMLElement>) =>
    setAdminMenuAnchor(event.currentTarget);
  const handleAdminMenuClose = () => setAdminMenuAnchor(null);

  return (
    <AppBar position="static">
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
          <Box
            component="img"
            src={logoAssetUrl}
            alt=""
            sx={{ height: 32, width: 32, objectFit: 'contain' }}
          />
          <Typography variant="h6" component="div">
            BLOCABRAC
          </Typography>
          {/* ✅ Repère de version : déplacé ici depuis "Mon espace personnel" pour ne
              plus alourdir le défilement mobile de cet écran — reste visible en
              permanence, sur toutes les pages, plutôt que sur un seul écran. Info-bulle
              avec le hash de commit + date de build (voir src/config/appVersion.ts). */}
          <Tooltip title={buildDetail}>
            <Typography
              variant="caption"
              sx={{ opacity: 0.75, cursor: 'help', whiteSpace: 'nowrap' }}
            >
              {formattedAppVersion}
            </Typography>
          </Tooltip>
        </Box>

        {/* ✅ Bascule thème clair/sombre : toujours visible, avant le reste de la nav */}
        <IconButton
          color="inherit"
          aria-label={mode === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
          onClick={toggleMode}
        >
          {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
        </IconButton>

        {/* ✅ Desktop / tablette large : boutons horizontaux comme avant */}
        {!isMobile && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isAdmin && (
              <>
                <Button
                  color="inherit"
                  size="small"
                  onClick={handleAdminMenuOpen}
                >
                  ADMIN
                </Button>
                <Menu
                  anchorEl={adminMenuAnchor}
                  open={Boolean(adminMenuAnchor)}
                  onClose={handleAdminMenuClose}
                >
                  {adminLinks.map((link) => (
                    <MenuItem
                      key={link.to}
                      component={Link}
                      to={link.to}
                      onClick={handleAdminMenuClose}
                    >
                      {link.label}
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}
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
              <Button color="inherit" size="small" onClick={() => handleLogout()}>
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
            {/* ✅ Fond de contraste : le logo est un visuel blanc/transparent, invisible
                sur le fond clair par défaut du Drawer (contrairement à l'AppBar, bleue) */}
            <Box
              component="img"
              src={logoAssetUrl}
              alt=""
              sx={{ height: 28, width: 28, objectFit: 'contain' }}
            />
            <Typography variant="h6" color="inherit">
              BLOCABRAC
            </Typography>
            <Tooltip title={buildDetail}>
              <Typography variant="caption" color="inherit" sx={{ opacity: 0.75, cursor: 'help' }}>
                {formattedAppVersion}
              </Typography>
            </Tooltip>
          </Box>
          <Divider />
          <List>
            {isAdmin && (
              <>
                <ListItem disablePadding>
                  <ListItemButton onClick={() => setMobileAdminOpen((prev) => !prev)}>
                    <ListItemText primary="ADMIN" />
                    {mobileAdminOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </ListItemButton>
                </ListItem>
                <Collapse in={mobileAdminOpen} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {adminLinks.map((link) => (
                      <ListItem key={link.to} disablePadding>
                        <ListItemButton
                          component={Link}
                          to={link.to}
                          onClick={handleDrawerClose}
                          sx={{ pl: 4 }}
                        >
                          <ListItemText primary={link.label} />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </>
            )}
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
                    handleLogout();
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