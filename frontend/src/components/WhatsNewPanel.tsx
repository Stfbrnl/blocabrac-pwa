import React, { useState } from 'react';
import { Alert, AlertTitle, Box, Button, List, ListItem, Typography } from '@mui/material';
import { NewReleases as NewReleasesIcon } from '@mui/icons-material';
import { changelog } from '../data/changelog';
import { changelogEntriesToShow } from '../utils/changelogDisplay';

const STORAGE_KEY = 'blocabrac_changelog_seen_version';

const readSeenVersion = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

// Affiche les entrées du changelog que ce client n'a pas encore vues (V2.71.2 : toutes celles
// plus récentes que la dernière version validée, 3 au plus — changelogDisplay.ts), jusqu'à ce
// qu'il clique sur « Compris ».
const WhatsNewPanel: React.FC = () => {
  const latest = changelog[0];
  const [entries, setEntries] = useState(() => changelogEntriesToShow(changelog, readSeenVersion()));

  if (!latest || entries.length === 0) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, latest.version);
    } catch {
      // stockage indisponible (navigation privée) : le panneau se refermera juste pour cette visite
    }
    setEntries([]);
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Alert severity="success" icon={<NewReleasesIcon fontSize="inherit" />} onClose={handleDismiss}>
        <AlertTitle>Quoi de neuf : {entries[0].title}</AlertTitle>
        {entries.map((entry, index) => (
          <Box key={entry.version}>
            {index > 0 && (
              <Typography variant="subtitle2" sx={{ mt: 1.5, fontWeight: 600 }}>
                Et aussi : {entry.title}
              </Typography>
            )}
            <List dense disablePadding sx={{ mb: 1 }}>
              {entry.items.map((item, i) => (
                <ListItem key={i} disablePadding sx={{ display: 'list-item', listStyleType: 'disc', ml: 3, width: 'auto' }}>
                  {item}
                </ListItem>
              ))}
            </List>
          </Box>
        ))}
        <Button size="small" onClick={handleDismiss}>Compris</Button>
      </Alert>
    </Box>
  );
};

export default WhatsNewPanel;
