import React, { useState, useEffect, ChangeEvent } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import {
  Container,
  Typography,
  Box,
  Paper,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
} from '@mui/material';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech';
import { jsPDF } from 'jspdf';
import * as html2canvas from 'html2canvas';
import logo from '../../../assets/logo-blocabrac.png';

// Couleurs des niveaux
const levelColors: Record<string, string> = {
  jaune: '#FFFF00',
  vert: '#00FF00',
  bleu: '#0000FF',
  violet: '#800080',
  rouge: '#FF0000',
  noir: '#000000',
  blanc: '#FFFFFF',
  rose: '#FFC0CB',
};

interface Exercise {
  id: string;
  name: string;
}

interface BoulderData extends DocumentData {
  number?: number;
  wall?: string;
  difficulty?: string;
  difficulty_level?: string;
  difficulty_types?: string[];
  created_at?: string | Timestamp;
  color?: string;
}

interface CourseData extends DocumentData {
  title?: string;
  date?: string | Timestamp;
}

interface Badge {
  id: string;
  name: string;
  feminineName?: string;
  description: string;
  color?: string;
}

interface ClientBadge {
  badge: Badge;
  awardedAt: Date;
  awardedByName: string;
}

interface Diploma {
  id: string;
  userId: string;
  userName: string;
  type: string;
  awardedAt: Date;
  awardedBy: string;
  awardedByName: string;
}

const ClientStats: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [boulderStats, setBoulderStats] = useState<any[]>([]);
  const [courseStats, setCourseStats] = useState<any[]>([]);
  const [colorStats, setColorStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openResetDialog, setOpenResetDialog] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'badges' | 'diplomas'>('stats');
  const [badges, setBadges] = useState<Badge[]>([]);
  const [clientBadges, setClientBadges] = useState<ClientBadge[]>([]);
  const [diplomas, setDiplomas] = useState<Diploma[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  // Genre du client connecté, récupéré depuis Firestore "users"
  const [userGender, setUserGender] = useState<string>('Homme');

  // États pour les statistiques par période
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'custom'>('week');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Fonction pour convertir un Timestamp ou Date en string
  const formatDate = (date: Date | { seconds: number; nanoseconds: number } | any): string => {
    if (date instanceof Date) {
      return date.toLocaleDateString('fr-FR');
    } else if (date instanceof Timestamp) {
      return date.toDate().toLocaleDateString('fr-FR');
    } else if (date?.seconds) {
      return new Date(date.seconds * 1000).toLocaleDateString('fr-FR');
    } else if (typeof date === 'string' && date) {
      return date;
    } else {
      return 'N/A';
    }
  };

  // Choisit le bon nom de badge selon le genre du client.
  // "Femme" -> feminineName si défini, sinon fallback sur name.
  // "Homme" / "Autre" -> toujours name.
  const getBadgeDisplayName = (badge: Badge): string => {
    if (userGender === 'Femme' && badge.feminineName) {
      return badge.feminineName;
    }
    return badge.name;
  };

  // Couleur d'affichage du badge : on résout d'abord via levelColors
  // (si badge.color correspond à un nom de niveau connu), sinon on utilise
  // badge.color tel quel (peut déjà être un code hexa), sinon un gris neutre.
  const getBadgeColor = (badge: Badge): string => {
    if (badge.color && levelColors[badge.color]) {
      return levelColors[badge.color];
    }
    return badge.color || '#9E9E9E';
  };

  useEffect(() => {
    if (!user || loadingAuth) return;

    const fetchStats = async () => {
      try {
        setLoading(true);

        // Récupérer le genre du client depuis la collection "users"
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserGender(userDoc.data().gender || 'Homme');
        }

        // Récupérer les exercices
        const exercisesQuery = query(collection(db, 'exercises'));
        const exercisesSnapshot = await getDocs(exercisesQuery);
        const exercisesList = exercisesSnapshot.docs.map((exerciseDoc) => ({
          id: exerciseDoc.id,
          name: exerciseDoc.data().name || `Exercice ${exerciseDoc.id}`,
        }));
        setExercises(exercisesList);

        // Calculer les dates en fonction de la période sélectionnée
        const now = new Date();
        let startDateFilter: Date | null = null;
        let endDateFilter: Date | null = null;

        switch (period) {
          case 'day':
            startDateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            break;
          case 'week':
            startDateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
            endDateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay()) + 1);
            break;
          case 'month':
            startDateFilter = new Date(now.getFullYear(), now.getMonth(), 1);
            endDateFilter = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            break;
          case 'year':
            startDateFilter = new Date(now.getFullYear(), 0, 1);
            endDateFilter = new Date(now.getFullYear() + 1, 0, 1);
            break;
          case 'custom':
            if (startDate && endDate) {
              startDateFilter = new Date(startDate);
              endDateFilter = new Date(endDate);
              endDateFilter.setDate(endDateFilter.getDate() + 1);
            }
            break;
        }

        // Requête pour client_boulder_results
        const boulderResultsSnapshot = await getDocs(
          query(collection(db, 'client_boulder_results'), where('userId', '==', user.uid))
        );

        const boulderStatsData: any[] = [];
        const colorCounts: Record<string, number> = {};

        for (const resultDoc of boulderResultsSnapshot.docs) {
          const result = resultDoc.data();
          // Conversion systématique du Timestamp en Date
          const resultDate = result.createdAt instanceof Timestamp
            ? result.createdAt.toDate()
            : result.createdAt?.seconds
              ? new Date(result.createdAt.seconds * 1000)
              : new Date();

          // Filtrer par période
          if (startDateFilter && resultDate < startDateFilter) continue;
          if (endDateFilter && resultDate >= endDateFilter) continue;

          const boulderDoc = await getDoc(doc(db, 'boulders', result.boulderId));
          if (boulderDoc.exists()) {
            const boulderData = boulderDoc.data() as BoulderData;
            const color = boulderData.color || boulderData.difficulty || 'Inconnu';

            boulderStatsData.push({
              ...result,
              boulderNumber: boulderData.number || result.boulderId,
              wall: boulderData.wall || 'Inconnu',
              difficulty: boulderData.difficulty || boulderData.color || 'Inconnu',
              difficulty_level: boulderData.difficulty_level || 'Inconnu',
              difficulty_type: boulderData.difficulty_types ? boulderData.difficulty_types[0] : 'Inconnu',
              created_at: boulderData.created_at || 'Inconnu',
              color: color,
              createdAt: resultDate, // Date déjà convertie
            });

            // Compter les blocs validés par couleur
            if (result.success === true) {
              colorCounts[color] = (colorCounts[color] || 0) + 1;
            }
          }
        }
        setBoulderStats(boulderStatsData);
        setColorStats(colorCounts);

        // Requête pour client_course_results
        const courseResultsSnapshot = await getDocs(
          query(collection(db, 'client_course_results'), where('userId', '==', user.uid))
        );

        const courseStatsData: any[] = [];
        for (const resultDoc of courseResultsSnapshot.docs) {
          const result = resultDoc.data();
          // Conversion systématique du Timestamp en Date
          const resultDate = result.date instanceof Timestamp
            ? result.date.toDate()
            : result.date?.seconds
              ? new Date(result.date.seconds * 1000)
              : new Date();

          const courseDoc = await getDoc(doc(db, 'courses', result.courseId));
          if (courseDoc.exists()) {
            const courseData = courseDoc.data() as CourseData;
            courseStatsData.push({
              ...result,
              courseTitle: courseData.title || result.courseId,
              courseDate: courseData.date ? formatDate(courseData.date) : 'Inconnu',
              date: resultDate, // Date déjà convertie
              exerciseName: result.exerciseName || exercisesList.find((ex) => ex.id === result.exerciseId)?.name || result.exerciseId,
            });
          }
        }
        setCourseStats(courseStatsData);

        // Récupérer les badges du client
        const clientBadgesQuery = query(
          collection(db, 'client_badges'),
          where('userId', '==', user.uid)
        );
        const clientBadgesSnapshot = await getDocs(clientBadgesQuery);
        const clientBadgesList = await Promise.all(
          clientBadgesSnapshot.docs.map(async (badgeLinkDoc) => {
            const data = badgeLinkDoc.data();
            const badgeId = data.badgeId;
            if (!badgeId) return null;

            const badgeDoc = await getDoc(doc(db, 'badges', badgeId));
            if (badgeDoc.exists()) {
              const badgeData = badgeDoc.data();
              // Conversion systématique du Timestamp en Date
              const awardedAt = data.awardedAt instanceof Timestamp
                ? data.awardedAt.toDate()
                : data.awardedAt?.seconds
                  ? new Date(data.awardedAt.seconds * 1000)
                  : new Date();

              // Création explicite de l'objet Badge
              const badge: Badge = {
                id: badgeData.id,
                name: badgeData.name || 'Badge inconnu',
                feminineName: badgeData.feminineName,
                description: badgeData.description || '',
                color: badgeData.color,
              };

              return {
                badge,
                awardedAt,
                awardedByName: data.awardedByName || 'Moniteur inconnu',
              };
            }
            return null;
          })
        ).then((results) =>
          results.filter(
            (r): r is ClientBadge => r !== null
          )
        );
        setClientBadges(clientBadgesList);

        // Récupérer les diplômes du client
        const diplomasQuery = query(
          collection(db, 'diplomas'),
          where('userId', '==', user.uid)
        );
        const diplomasSnapshot = await getDocs(diplomasQuery);
        const diplomasList: Diploma[] = diplomasSnapshot.docs.map((diplomaDoc) => {
          const data = diplomaDoc.data();
          // Conversion systématique du Timestamp en Date
          const awardedAt = data.awardedAt instanceof Timestamp
            ? data.awardedAt.toDate()
            : data.awardedAt?.seconds
              ? new Date(data.awardedAt.seconds * 1000)
              : new Date();

          return {
            id: diplomaDoc.id,
            userId: data.userId || '',
            userName: data.userName || user.displayName || user.email?.split('@')[0] || user.uid,
            type: data.type || '',
            awardedAt,
            awardedBy: data.awardedBy || '',
            awardedByName: data.awardedByName || 'Moniteur inconnu',
          };
        });
        setDiplomas(diplomasList);

      } catch (err: unknown) {
        setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
        console.error('Erreur Firestore:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user, loadingAuth, period, startDate, endDate]);

  // Réinitialiser les stats
  const handleResetStats = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const boulderResultsSnapshot = await getDocs(
        query(collection(db, 'client_boulder_results'), where('userId', '==', user.uid))
      );
      for (const resultDoc of boulderResultsSnapshot.docs) {
        await deleteDoc(doc(db, 'client_boulder_results', resultDoc.id));
      }

      const courseResultsSnapshot = await getDocs(
        query(collection(db, 'client_course_results'), where('userId', '==', user.uid))
      );
      for (const resultDoc of courseResultsSnapshot.docs) {
        await deleteDoc(doc(db, 'client_course_results', resultDoc.id));
      }

      setBoulderStats([]);
      setCourseStats([]);
      setColorStats({});
      setSuccess('Statistiques réinitialisées avec succès!');
      setOpenResetDialog(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
      setOpenResetDialog(false);
    } finally {
      setLoading(false);
    }
  };

  // Générer un PDF pour un diplôme
  const generateDiplomaPDF = async (diploma: Diploma) => {
    const diplomaElement = document.createElement('div');
    diplomaElement.style.width = '800px';
    diplomaElement.style.height = '600px';
    diplomaElement.style.backgroundColor = '#FFFFFF';
    diplomaElement.style.border = '10px solid #000000';
    diplomaElement.style.padding = '20px';
    diplomaElement.style.textAlign = 'center';
    diplomaElement.style.fontFamily = 'Arial, sans-serif';
    diplomaElement.style.position = 'relative';
    diplomaElement.style.overflow = 'hidden';

    // Ajouter le logo
    const logoImg = document.createElement('img');
    logoImg.src = logo;
    logoImg.style.width = '150px';
    logoImg.style.position = 'absolute';
    logoImg.style.top = '20px';
    logoImg.style.left = '20px';
    diplomaElement.appendChild(logoImg);

    // Titre
    const title = document.createElement('h1');
    title.textContent = 'DIPLÔME OFFICIEL BLOCABRAC';
    title.style.color = '#FFD700';
    title.style.fontSize = '36px';
    title.style.marginTop = '100px';
    title.style.marginBottom = '40px';
    diplomaElement.appendChild(title);

    // Contenu
    const content = document.createElement('div');
    content.style.color = '#000000';
    content.style.fontSize = '24px';
    content.style.lineHeight = '1.6';
    content.innerHTML = `
      <p><strong style="color: #00FF00;">Décerné à :</strong> ${diploma.userName}</p>
      <p><strong style="color: #00FF00;">Type :</strong> ${diploma.type}</p>
      <p><strong style="color: #00FF00;">Par :</strong> ${diploma.awardedByName}</p>
      <p><strong style="color: #00FF00;">Le :</strong> ${formatDate(diploma.awardedAt)}</p>
    `;
    diplomaElement.appendChild(content);

    // Pied de page
    const footer = document.createElement('p');
    footer.textContent = 'Félicitations pour votre progression !';
    footer.style.color = '#FFD700';
    footer.style.fontSize = '18px';
    footer.style.position = 'absolute';
    footer.style.bottom = '40px';
    footer.style.width = '100%';
    footer.style.textAlign = 'center';
    diplomaElement.appendChild(footer);

    // Ajouter temporairement au DOM
    document.body.appendChild(diplomaElement);

    // Capturer en canvas
    const canvas = await html2canvas.default(diplomaElement, {
      scale: 2,
      logging: false,
      useCORS: true,
    });

    // Supprimer l'élément temporaire
    document.body.removeChild(diplomaElement);

    // Créer le PDF
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [210, 297],
    });

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = pdf.internal.pageSize.getWidth();
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    pdf.save(`diplome_${diploma.userName}_${diploma.type.replace(/\s+/g, '_')}.pdf`);
  };

  // Gestion des changements de période
  const handlePeriodChange = (event: SelectChangeEvent<'day' | 'week' | 'month' | 'year' | 'custom'>) => {
    setPeriod(event.target.value as 'day' | 'week' | 'month' | 'year' | 'custom');
  };

  // Gestion des changements de date
  const handleStartDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    setStartDate(event.target.value);
  };

  const handleEndDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEndDate(event.target.value);
  };

  if (loadingAuth || loading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!user) return null;

  return (
    <Container maxWidth="lg">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ mt: 4 }}>Mes statistiques</Typography>
        <Button
          variant="outlined"
          color="error"
          onClick={() => setOpenResetDialog(true)}
          disabled={boulderStats.length === 0 && courseStats.length === 0}
        >
          Réinitialiser les stats
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {/* Sélecteur de période */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Filtrer par période:</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel id="period-select-label">Période</InputLabel>
            <Select
              labelId="period-select-label"
              id="period-select"
              value={period}
              onChange={handlePeriodChange}
              label="Période"
            >
              <MenuItem value="day">Aujourd'hui</MenuItem>
              <MenuItem value="week">Cette semaine</MenuItem>
              <MenuItem value="month">Ce mois</MenuItem>
              <MenuItem value="year">Cette année</MenuItem>
              <MenuItem value="custom">Période personnalisée</MenuItem>
            </Select>
          </FormControl>

          {period === 'custom' && (
            <>
              <TextField
                label="Date de début"
                type="date"
                id="start-date-input"
                slotProps={{ inputLabel: { shrink: true } }}
                value={startDate}
                onChange={handleStartDateChange}
                sx={{ minWidth: 150 }}
              />
              <TextField
                label="Date de fin"
                type="date"
                id="end-date-input"
                slotProps={{ inputLabel: { shrink: true } }}
                value={endDate}
                onChange={handleEndDateChange}
                sx={{ minWidth: 150 }}
              />
            </>
          )}
        </Box>
      </Paper>

      {/* Onglets */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Tabs value={activeTab} onChange={(e: React.SyntheticEvent, newValue: 'stats' | 'badges' | 'diplomas') => setActiveTab(newValue)}>
          <Tab label="Statistiques" value="stats" />
          <Tab label="Mes badges" value="badges" />
          <Tab label="Mes diplômes" value="diplomas" />
        </Tabs>
      </Paper>

      {/* Contenu des onglets */}
      {activeTab === 'stats' && (
        <>
          {/* Statistiques par couleur */}
          {Object.keys(colorStats).length > 0 && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Blocs validés par couleur:</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {Object.entries(colorStats).map(([color, count]) => (
                  <Box key={color} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{
                      width: 20,
                      height: 20,
                      backgroundColor: levelColors[color] || '#CCCCCC',
                      borderRadius: '4px'
                    }} />
                    <Typography>{color}: {count}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          )}

          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            {/* Tableau des blocs */}
            <Paper sx={{ p: 2, flex: 1 }}>
              <Typography variant="h6">Blocs</Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Mur / N°</TableCell>
                      <TableCell>Niveau</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Réussi</TableCell>
                      <TableCell>Note</TableCell>
                      <TableCell>Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {boulderStats.map((stat, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {stat.wall} / {stat.boulderNumber}
                        </TableCell>
                        <TableCell>
                          <Box sx={{
                            backgroundColor: levelColors[stat.difficulty] || '#CCCCCC',
                            color: ['noir', 'blanc'].includes(stat.difficulty) ? 'black' : 'white',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            display: 'inline-block'
                          }}>
                            {stat.difficulty_level}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {stat.difficulty_type && (
                            <Chip
                              label={stat.difficulty_type}
                              size="small"
                              sx={{ backgroundColor: 'rgba(0,0,0,0.1)' }}
                            />
                          )}
                        </TableCell>
                        <TableCell>{stat.success === true ? '✅' : '❌'}</TableCell>
                        <TableCell>{stat.rating || 'Non noté'}</TableCell>
                        <TableCell>{formatDate(stat.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            {/* Tableau des cours */}
            <Paper sx={{ p: 2, flex: 1 }}>
              <Typography variant="h6">Cours</Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Cours</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Exercice</TableCell>
                      <TableCell>Réussi</TableCell>
                      <TableCell>Date validation</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {courseStats.map((stat, index) => (
                      <TableRow key={index}>
                        <TableCell>{stat.courseTitle}</TableCell>
                        <TableCell>{stat.courseDate}</TableCell>
                        <TableCell>{stat.exerciseName || stat.exerciseId}</TableCell>
                        <TableCell>{stat.success === true ? '✅' : '❌'}</TableCell>
                        <TableCell>{formatDate(stat.date)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        </>
      )}

      {/* Onglet "Mes badges" */}
      {activeTab === 'badges' && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Mes badges</Typography>
          {clientBadges.length === 0 ? (
            <Typography>Vous n'avez pas encore reçu de badges.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {clientBadges.map((cb, index) => {
                const badgeColor = getBadgeColor(cb.badge);
                return (
                  <Card key={index} sx={{ width: 250, mb: 2, overflow: 'hidden' }}>
                    {/* Bandeau coloré + icône médaille reprenant la couleur du badge */}
                    <Box
                      sx={{
                        backgroundColor: badgeColor,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        py: 2,
                      }}
                    >
                      <MilitaryTechIcon
                        sx={{
                          fontSize: 56,
                          color: ['#000000', '#800080', '#0000FF', '#FF0000'].includes(badgeColor)
                            ? '#FFFFFF'
                            : '#000000',
                        }}
                      />
                    </Box>
                    <CardContent>
                      {/* Un seul nom affiché, choisi selon le genre du client, dans la couleur du badge */}
                      <Typography variant="h6" sx={{ color: badgeColor }}>
                        {getBadgeDisplayName(cb.badge)}
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        {cb.badge.description}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                        Décerné par {cb.awardedByName} le {formatDate(cb.awardedAt)}
                      </Typography>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
        </Paper>
      )}

      {/* Onglet "Mes diplômes" */}
      {activeTab === 'diplomas' && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Mes diplômes</Typography>
          {diplomas.length === 0 ? (
            <Typography>Vous n'avez pas encore reçu de diplômes.</Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>Décerné par</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {diplomas.map((diploma) => (
                    <TableRow key={diploma.id}>
                      <TableCell>{diploma.type}</TableCell>
                      <TableCell>{diploma.awardedByName}</TableCell>
                      <TableCell>{formatDate(diploma.awardedAt)}</TableCell>
                      <TableCell>
                        <Button
                          variant="outlined"
                          onClick={() => generateDiplomaPDF(diploma)}
                        >
                          Télécharger
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* Dialogue de confirmation pour la réinitialisation */}
      <Dialog
        open={openResetDialog}
        onClose={() => setOpenResetDialog(false)}
      >
        <DialogTitle>Réinitialiser les statistiques</DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir supprimer toutes vos statistiques (blocs et cours) ?
            Cette action est irréversible.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenResetDialog(false)}>Annuler</Button>
          <Button
            onClick={handleResetStats}
            color="error"
            variant="contained"
          >
            Réinitialiser
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ClientStats;