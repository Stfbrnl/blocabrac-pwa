import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Box, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Select, MenuItem,
  InputLabel, FormControl, IconButton
} from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';

type ReportType = 'défaillance_prisede' | 'morphologie' | 'trop_difficile' | 'trop_simple' | 'autre';

interface Report {
  id: string;
  boulder_id: string;
  wall: string;
  boulder_number: number;
  report_type: ReportType;
  message: string;
  user_id: string;
  user_name: string;
  created_at: string;
  status: 'pending' | 'resolved' | 'ignored';
}

export default function ReportsList(): JSX.Element {
  const [reports, setReports] = useState<Report[]>([]);
  const [filterType, setFilterType] = useState<ReportType | 'all'>('all');

  // ✅ Charger les signalements
  useEffect(() => {
    const q = query(collection(db, 'boulder_reports'), where('status', '!=', 'ignored'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReports(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Report[]);
    });
    return () => unsubscribe();
  }, []);

  // ✅ Marquer un signalement comme résolu
  const handleMarkAsResolved = async (reportId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'boulder_reports', reportId), { status: 'resolved' });
    } catch (error: unknown) {
      console.error('Erreur lors de la mise à jour :', error);
    }
  };

  // ✅ Filtrer les signalements par type
  const filteredReports = filterType === 'all'
    ? reports
    : reports.filter(report => report.report_type === filterType);

  // ✅ Couleurs pour les types de signalements
  const getReportTypeColor = (type: ReportType): 'error' | 'warning' | 'info' | 'default' => {
    switch (type) {
      case 'défaillance_prisede': return 'error';
      case 'trop_difficile': return 'warning';
      case 'trop_simple': return 'info';
      default: return 'default';
    }
  };

  // ✅ Couleurs pour les statuts
  const getStatusColor = (status: string): 'warning' | 'success' | 'default' => {
    switch (status) {
      case 'pending': return 'warning';
      case 'resolved': return 'success';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <FormControl sx={{ minWidth: 200, mb: 2 }}>
        <InputLabel>Filtrer par type</InputLabel>
        <Select
          value={filterType}
          onChange={(e: any): void => setFilterType(e.target.value as ReportType | 'all')}
          label="Filtrer par type"
        >
          <MenuItem value="all">Tous les signalements</MenuItem>
          <MenuItem value="défaillance_prisede">Défaillance de prise</MenuItem>
          <MenuItem value="morphologie">Morphologie</MenuItem>
          <MenuItem value="trop_difficile">Trop difficile</MenuItem>
          <MenuItem value="trop_simple">Trop simple</MenuItem>
          <MenuItem value="autre">Autre</MenuItem>
        </Select>
      </FormControl>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Bloc</TableCell>
              <TableCell>Mur</TableCell>
              <TableCell>Utilisateur</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredReports.map((report: Report) => (
              <TableRow key={report.id}>
                <TableCell>
                  <Chip
                    label={report.report_type.replace('_', ' ')}
                    color={getReportTypeColor(report.report_type)}
                  />
                </TableCell>
                <TableCell>#{report.boulder_number}</TableCell>
                <TableCell>{report.wall}</TableCell>
                <TableCell>{report.user_name}</TableCell>
                <TableCell>{report.message}</TableCell>
                <TableCell>{new Date(report.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Chip
                    label={report.status}
                    color={getStatusColor(report.status)}
                  />
                </TableCell>
                <TableCell>
                  {report.status === 'pending' && (
                    <IconButton
                      color="primary"
                      onClick={() => handleMarkAsResolved(report.id)}
                      title="Marquer comme résolu"
                    >
                      <CheckIcon />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}