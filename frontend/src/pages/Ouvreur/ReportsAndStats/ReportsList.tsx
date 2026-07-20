import React, { useState, useEffect } from 'react';
import {
  Typography, Paper, Box, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Select, MenuItem,
  InputLabel, FormControl, IconButton, Button, Dialog, DialogTitle,
  DialogContent, DialogActions
} from '@mui/material';
import { Check as CheckIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { collection, query, where, onSnapshot, updateDoc, doc, deleteDoc, getDocs } from 'firebase/firestore';
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
  const [openResetDialog, setOpenResetDialog] = useState(false);

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

  const handleMarkAsResolved = async (reportId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'boulder_reports', reportId), { status: 'resolved' });
    } catch (error: unknown) {
      console.error('Erreur lors de la mise à jour :', error);
    }
  };

  const handleIgnoreReport = async (reportId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'boulder_reports', reportId), { status: 'ignored' });
    } catch (error: unknown) {
      console.error('Erreur lors de la mise à jour :', error);
    }
  };

  const handleResetReports = async (): Promise<void> => {
    try {
      const q = query(collection(db, 'boulder_reports'));
      const snapshot = await getDocs(q);
      for (const doc of snapshot.docs) {
        await deleteDoc(doc.ref);
      }
      setOpenResetDialog(false);
    } catch (error: unknown) {
      console.error('Erreur lors de la réinitialisation :', error);
    }
  };

  const filteredReports = filterType === 'all'
    ? reports
    : reports.filter(report => report.report_type === filterType);

  const getReportTypeColor = (type: ReportType): 'error' | 'warning' | 'info' | 'default' => {
    switch (type) {
      case 'défaillance_prisede': return 'error';
      case 'trop_difficile': return 'warning';
      case 'trop_simple': return 'info';
      default: return 'default';
    }
  };

  const getStatusColor = (status: string): 'warning' | 'success' | 'default' => {
    switch (status) {
      case 'pending': return 'warning';
      case 'resolved': return 'success';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      {/* ✅ flexWrap pour empiler filtre + bouton sur mobile */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 1, flexWrap: 'wrap' }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel id="filtrer-par-type-select-label">Filtrer par type</InputLabel>
          <Select
            labelId="filtrer-par-type-select-label" id="filtrer-par-type-select"
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
        <Button
          variant="outlined"
          color="error"
          onClick={() => setOpenResetDialog(true)}
          disabled={reports.length === 0}
        >
          Réinitialiser les signalements
        </Button>
      </Box>

      {/* ✅ Scroll horizontal indispensable pour ce tableau à 8 colonnes */}
      <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 900 }}>
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
                {/* ✅ Largeur max + retour à la ligne pour éviter qu'un message long n'étire le tableau à l'infini */}
                <TableCell sx={{ maxWidth: 220, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                  {report.message}
                </TableCell>
                <TableCell>{new Date(report.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Chip
                    label={report.status}
                    color={getStatusColor(report.status)}
                  />
                </TableCell>
                <TableCell>
                  {report.status === 'pending' && (
                    <>
                      <IconButton
                        color="primary"
                        onClick={() => handleMarkAsResolved(report.id)}
                        title="Marquer comme résolu"
                      >
                        <CheckIcon />
                      </IconButton>
                      <IconButton
                        color="error"
                        onClick={() => handleIgnoreReport(report.id)}
                        title="Ignorer"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={openResetDialog}
        onClose={() => setOpenResetDialog(false)}
      >
        <DialogTitle>Réinitialiser les signalements</DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir supprimer tous les signalements ?
            Cette action est irréversible.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenResetDialog(false)}>Annuler</Button>
          <Button
            onClick={handleResetReports}
            color="error"
            variant="contained"
          >
            Réinitialiser
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}