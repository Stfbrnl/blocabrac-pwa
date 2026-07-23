import React, { useState } from 'react';
import { Alert, AlertTitle, Box, Button, List, ListItem } from '@mui/material';
import { NewReleases as NewReleasesIcon } from '@mui/icons-material';
import { changelog } from '../data/changelog';

const STORAGE_KEY = 'blocabrac_changelog_seen_version';

// Affiche la dernière entrée du changelog une seule fois par version, jusqu'à ce
// que le client clique sur "Compris" (ou l'ait déjà vue lors d'une session précédente).
const WhatsNewPanel: React.FC = () => {
  const latest = changelog[0];
  const [dismissed, setDismissed] = useState(
    () => !latest || localStorage.getItem(STORAGE_KEY) === latest.version
  );

  if (!latest || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, latest.version);
    setDismissed(true);
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Alert severity="success" icon={<NewReleasesIcon fontSize="inherit" />} onClose={handleDismiss}>
        <AlertTitle>Quoi de neuf : {latest.title}</AlertTitle>
        <List dense disablePadding sx={{ mb: 1 }}>
          {latest.items.map((item, i) => (
            <ListItem key={i} disablePadding sx={{ display: 'list-item', listStyleType: 'disc', ml: 3 }}>
              {item}
            </ListItem>
          ))}
        </List>
        <Button size="small" onClick={handleDismiss}>Compris</Button>
      </Alert>
    </Box>
  );
};

export default WhatsNewPanel;
