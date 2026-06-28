import React, { useState } from 'react';
import { Box, Paper, Tabs, Tab, Container, Typography } from '@mui/material';
import ReportsList from './ReportsList';
import BoulderStats from './BoulderStats';
import CompetitionBoulderStats from './CompetitionBoulderStats';

export default function ReportsAndStats(): JSX.Element {
  const [activeTab, setActiveTab] = useState<number>(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number): void => {
    setActiveTab(newValue);
  };

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
        <Typography variant="h5" gutterBottom>
          Signalements et Statistiques
        </Typography>
        <Box sx={{ width: '100%' }}>
          {/* ✅ Scrollable au lieu de centered : les 3 onglets ne se tassent plus sur mobile */}
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
          >
            <Tab label="Signalements" />
            <Tab label="Stats Blocs Quotidiens" />
            <Tab label="Stats Blocs Compétitions" />
          </Tabs>
        </Box>
        {activeTab === 0 && <ReportsList />}
        {activeTab === 1 && <BoulderStats />}
        {activeTab === 2 && <CompetitionBoulderStats />}
      </Paper>
    </Container>
  );
}