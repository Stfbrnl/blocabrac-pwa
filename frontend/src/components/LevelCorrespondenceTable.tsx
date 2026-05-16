import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box
} from '@mui/material';

const LevelCorrespondenceTable: React.FC = () => {
  const correspondenceData = [
    { color: 'Jaune', range: '3A à 3C', label: 'Débutant', hex: '#FFD700' },
    { color: 'Vert', range: '4A à 4B+', label: 'Débutant', hex: '#90EE90' },
    { color: 'Bleu', range: '4C à 5A+', label: 'En formation de grimpeur', hex: '#ADD8E6' },
    { color: 'Violet', range: '5B à 5C+', label: 'En formation de grimpeur', hex: '#E6E6FA' },
    { color: 'Rouge', range: '6A à 6B', label: 'En formation de grimpeur', hex: '#F08080' },
    { color: 'Noir', range: '6B+ à 6C+', label: 'Grimpeur confirmé', hex: '#000000' },
    { color: 'Blanc', range: '7A à 7B', label: 'Grimpeur expert', hex: '#FFFFFF' },
    { color: 'Rose', range: '7B+ à 8A', label: 'Grimpeur mutant', hex: '#FF1493' },
  ];

  return (
    <Box sx={{ my: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        📌 Correspondance indicative entre les codes-couleur de BLOCABRAC et les cotations internationales.
        <br />
        ⚠️ <strong>Ces correspondances sont discutables</strong> et peuvent varier selon les salles ou les pays.
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Couleur</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Cotation Internationale</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Libellé</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {correspondenceData.map((row, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        backgroundColor: row.hex,
                        border: '1px solid #ccc',
                        borderRadius: '3px',
                      }}
                    />
                    {row.color}
                  </Box>
                </TableCell>
                <TableCell>{row.range}</TableCell>
                <TableCell>{row.label}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default LevelCorrespondenceTable;