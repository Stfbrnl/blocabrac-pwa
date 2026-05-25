import React, { useState } from 'react';
import { Box, Paper, Tabs, Tab, Container, Typography } from '@mui/material';
import ReportsList from './ReportsList';
import BoulderStats from './BoulderStats';

export default function ReportsAndStats(): JSX.Element {
  const [activeTab, setActiveTab] = useState<number>(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number): void => {
    setActiveTab(newValue);
  };

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h5" gutterBottom>
          Signalements et Statistiques
        </Typography>
        <Box sx={{ width: '100%' }}>
          <Tabs value={activeTab} onChange={handleTabChange} centered>
            <Tab label="Signalements" />
            <Tab label="Statistiques" />
          </Tabs>
        </Box>
        {activeTab === 0 && <ReportsList />}
        {activeTab === 1 && <BoulderStats />}
      </Paper>
    </Container>
  );
}