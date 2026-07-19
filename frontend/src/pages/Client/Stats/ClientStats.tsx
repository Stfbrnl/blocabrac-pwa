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
  updateDoc,
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
  criteria?: {
    color?: string;
    // "all" signifie : il faut posséder la totalité des blocs de cette couleur
    // actuellement en salle (cas du badge "master"). Sinon, un nombre fixe.
    count?: string | number;
  };
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

// Ordre des niveaux/couleurs, du plus faible au plus élevé.
// Les badges couleur commencent à violet : aucun badge n'existe pour jaune/vert/bleu.
const colorOrder = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'];

// Un badge reste actif tant que le client a encore, dans ses stats, au moins
// "count" bloc(s) validé(s) de la couleur du badge qui existent toujours en salle.
// Dès qu'un mur change et que ces blocs disparaissent, le badge repasse en grisé,
// et redevient coloré automatiquement dès qu'un bloc de cette couleur est de nouveau validé.
// Fonction pure (sans dépendance au state du composant) pour pouvoir être appelée à la fois
// pendant le chargement des données (synchronisation du niveau) et pendant le rendu (affichage).
const computeBadgeActive = (
  badge: Badge,
  validatedByColor: Record<string, number>,
  totalByColor: Record<string, number>
): boolean => {
  const color = badge.criteria?.color || badge.color;
  if (!color) return true; // badge non lié à une couleur -> toujours actif

  const validated = validatedByColor[color] || 0;
  const rawCount = badge.criteria?.count;

  // Cas "master" : count === "all" -> il faut posséder tous les blocs de cette
  // couleur actuellement en salle
  if (String(rawCount).toLowerCase() === 'all') {
    const total = totalByColor[color] || 0;
    return total > 0 && validated >= total;
  }

  const required = parseInt(String(rawCount ?? '1'), 10) || 1;
  return validated >= required;
};

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

  // Pour chaque couleur : nombre de blocs DISTINCTS encore présents en salle
  // que le client a validés (tous historiques confondus, indépendamment du filtre de période)
  const [validatedExistingByColor, setValidatedExistingByColor] = useState<Record<string, number>>({});
  // Pour chaque couleur : nombre total de blocs actuellement en salle (inventaire courant)
  const [totalInventoryByColor, setTotalInventoryByColor] = useState<Record<string, number>>({});

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
  const getBadgeDisplayName = (badge: Badge): string => {
    if (userGender === 'Femme' && badge.feminineName) {
      return badge.feminineName;
    }
    return badge.name;
  };

  // Couleur d'affichage du badge
  const getBadgeColor = (badge: Badge): string => {
    if (badge.color && levelColors[badge.color]) {
      return levelColors[badge.color];
    }
    return badge.color || '#9E9E9E';
  };

  // Un badge reste actif tant que le client a encore, dans ses stats, au moins
  // "count" bloc(s) validé(s) de la couleur du badge qui existent toujours en salle.
  const isBadgeActive = (badge: Badge): boolean =>
    computeBadgeActive(badge, validatedExistingByColor, totalInventoryByColor);

  useEffect(() => {
    if (!user || loadingAuth) return;

    const fetchStats = async () => {
      try {
        setLoading(true);

        // Récupérer le genre et le niveau actuels du client depuis la collection "users"
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.exists() ? userDoc.data() : null;
        if (userData) {
          setUserGender(userData.gender || 'Homme');
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
        // Blocs distincts, encore existants en salle, validés par le client, groupés par couleur
        // (tout l'historique confondu, indépendant du filtre de période choisi à l'écran)
        const existingValidatedBoulderIdsByColor: Record<string, Set<string>> = {};

        for (const resultDoc of boulderResultsSnapshot.docs) {
          const result = resultDoc.data();
          const resultDate = result.createdAt instanceof Timestamp
            ? result.createdAt.toDate()
            : result.createdAt?.seconds
              ? new Date(result.createdAt.seconds * 1000)
              : new Date();

          // ✅ Vérifier si le bloc existe toujours en salle, indépendamment de la période
          // affichée à l'écran : c'est ce qui détermine si un badge reste actif ou non.
          const boulderDoc = await getDoc(doc(db, 'boulders', result.boulderId));
          if (!boulderDoc.exists()) continue; // bloc supprimé/remplacé lors d'un changement de mur

          const boulderData = boulderDoc.data() as BoulderData;
          const color = boulderData.color || boulderData.difficulty || 'Inconnu';

          if (result.success === true) {
            if (!existingValidatedBoulderIdsByColor[color]) {
              existingValidatedBoulderIdsByColor[color] = new Set();
            }
            existingValidatedBoulderIdsByColor[color].add(result.boulderId);
          }

          // Le filtrage par période ne s'applique qu'à l'affichage des tableaux de stats
          if (startDateFilter && resultDate < startDateFilter) continue;
          if (endDateFilter && resultDate >= endDateFilter) continue;

          boulderStatsData.push({
            ...result,
            boulderNumber: boulderData.number || result.boulderId,
            wall: boulderData.wall || 'Inconnu',
            difficulty: boulderData.difficulty || boulderData.color || 'Inconnu',
            difficulty_level: boulderData.difficulty_level || 'Inconnu',
            difficulty_type: boulderData.difficulty_types ? boulderData.difficulty_types[0] : 'Inconnu',
            created_at: boulderData.created_at || 'Inconnu',
            color: color,
            createdAt: resultDate,
          });

          if (result.success === true) {
            colorCounts[color] = (colorCounts[color] || 0) + 1;
          }
        }
        setBoulderStats(boulderStatsData);
        setColorStats(colorCounts);
        const validatedExistingByColorLocal: Record<string, number> = Object.fromEntries(
          Object.entries(existingValidatedBoulderIdsByColor).map(([color, ids]) => [color, ids.size])
        );
        setValidatedExistingByColor(validatedExistingByColorLocal);

        // Inventaire courant des blocs en salle, par couleur (sert au badge "master"
        // qui exige la totalité des blocs d'une couleur, et pourra servir à d'autres
        // badges du même type à l'avenir)
        const bouldersSnapshot = await getDocs(collection(db, 'boulders'));
        const inventoryByColor: Record<string, number> = {};
        bouldersSnapshot.forEach((boulderDoc) => {
          const data = boulderDoc.data() as BoulderData;
          const color = data.color || data.difficulty || 'Inconnu';
          inventoryByColor[color] = (inventoryByColor[color] || 0) + 1;
        });
        setTotalInventoryByColor(inventoryByColor);

        // Requête pour client_course_results
        const courseResultsSnapshot = await getDocs(
          query(collection(db, 'client_course_results'), where('userId', '==', user.uid))
        );

        const courseStatsData: any[] = [];
        for (const resultDoc of courseResultsSnapshot.docs) {
          const result = resultDoc.data();
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
              date: resultDate,
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
              const awardedAt = data.awardedAt instanceof Timestamp
                ? data.awardedAt.toDate()
                : data.awardedAt?.seconds
                  ? new Date(data.awardedAt.seconds * 1000)
                  : new Date();

              const badge: Badge = {
                id: badgeData.id,
                name: badgeData.name || 'Badge inconnu',
                feminineName: badgeData.feminineName,
                description: badgeData.description || '',
                color: badgeData.color,
                criteria: badgeData.criteria,
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

        // ✅ Synchronisation automatique du niveau du client d'après ses badges actifs :
        // le niveau devient la couleur du badge le plus élevé qui n'est pas grisé.
        // Comme il n'existe pas de badge en dessous de violet, ce mécanisme ne
        // s'applique qu'à partir de ce niveau ; en dessous, le niveau reste géré
        // manuellement (profil du client ou administration).
        // Si un admin a verrouillé le niveau (levelOverride), on ne le touche jamais.
        if (!userData?.levelOverride) {
          const activeBadgeColors = clientBadgesList
            .filter((cb) => computeBadgeActive(cb.badge, validatedExistingByColorLocal, inventoryByColor))
            .map((cb) => cb.badge.criteria?.color || cb.badge.color)
            .filter((color): color is string => !!color && colorOrder.includes(color));

          if (activeBadgeColors.length > 0) {
            const highestActiveColor = activeBadgeColors.reduce((highest, color) =>
              colorOrder.indexOf(color) > colorOrder.indexOf(highest) ? color : highest
            );

            if (userData && userData.level !== highestActiveColor) {
              await updateDoc(doc(db, 'users', user.uid), { level: highestActiveColor });
            }
          }
        }

        // Récupérer les diplômes du client
        const diplomasQuery = query(
          collection(db, 'diplomas'),
          where('userId', '==', user.uid)
        );
        const diplomasSnapshot = await getDocs(diplomasQuery);
        const diplomasList: Diploma[] = diplomasSnapshot.docs.map((diplomaDoc) => {
          const data = diplomaDoc.data();
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
    const fontUrl = 'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;700&display=swap';
    const link = document.createElement('link');
    link.href = fontUrl;
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    const diplomaElement = document.createElement('div');
    diplomaElement.style.width = '800px';
    diplomaElement.style.height = '600px';
    diplomaElement.style.backgroundImage = `url(${logo})`;
    diplomaElement.style.backgroundSize = 'cover';
    diplomaElement.style.backgroundPosition = 'center';
    diplomaElement.style.position = 'relative';
    diplomaElement.style.fontFamily = "'EB Garamond', serif";
    diplomaElement.style.boxSizing = 'border-box';

    const textZone = document.createElement('div');
    textZone.style.position = 'absolute';
    textZone.style.top = '38%';
    textZone.style.bottom = '8%';
    textZone.style.left = '16%';
    textZone.style.right = '16%';
    textZone.style.display = 'flex';
    textZone.style.flexDirection = 'column';
    textZone.style.alignItems = 'center';
    textZone.style.justifyContent = 'space-between';
    textZone.style.textAlign = 'center';
    textZone.style.color = '#D4AF37';
    diplomaElement.appendChild(textZone);

    const title = document.createElement('h1');
    title.textContent = 'DIPLÔME OFFICIEL';
    title.style.fontSize = '34px';
    title.style.fontWeight = '700';
    title.style.margin = '0';
    title.style.color = '#D4AF37';
    title.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.6)';
    textZone.appendChild(title);

    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.alignItems = 'center';
    content.style.gap = '12px';

    const userName = document.createElement('p');
    userName.textContent = `Ce diplôme est décerné à : ${diploma.userName}`;
    userName.style.fontSize = '20px';
    userName.style.fontWeight = '400';
    userName.style.margin = '0';
    userName.style.color = '#D4AF37';
    userName.style.textShadow = '1px 1px 3px rgba(0, 0, 0, 0.6)';
    content.appendChild(userName);

    const diplomaType = document.createElement('p');
    diplomaType.textContent = `Type : ${diploma.type}`;
    diplomaType.style.fontSize = '18px';
    diplomaType.style.fontWeight = '400';
    diplomaType.style.margin = '0';
    diplomaType.style.color = '#D4AF37';
    diplomaType.style.textShadow = '1px 1px 3px rgba(0, 0, 0, 0.6)';
    content.appendChild(diplomaType);

    const diplomaDate = document.createElement('p');
    diplomaDate.textContent = `Le ${formatDate(diploma.awardedAt)}`;
    diplomaDate.style.fontSize = '16px';
    diplomaDate.style.fontWeight = '400';
    diplomaDate.style.margin = '0';
    diplomaDate.style.color = '#D4AF37';
    diplomaDate.style.textShadow = '1px 1px 3px rgba(0, 0, 0, 0.6)';
    content.appendChild(diplomaDate);

    const moniteurName = document.createElement('p');
    moniteurName.textContent = `Décerné par : ${diploma.awardedByName}`;
    moniteurName.style.fontSize = '16px';
    moniteurName.style.fontWeight = '400';
    moniteurName.style.margin = '0';
    moniteurName.style.color = '#D4AF37';
    moniteurName.style.textShadow = '1px 1px 3px rgba(0, 0, 0, 0.6)';
    content.appendChild(moniteurName);

    textZone.appendChild(content);

    const footer = document.createElement('p');
    footer.textContent = 'Félicitations pour votre progression !';
    footer.style.fontSize = '15px';
    footer.style.fontStyle = 'italic';
    footer.style.margin = '0';
    footer.style.color = '#D4AF37';
    footer.style.textShadow = '1px 1px 3px rgba(0, 0, 0, 0.6)';
    textZone.appendChild(footer);

    document.body.appendChild(diplomaElement);

    await new Promise((resolve) => {
      const checkFont = () => {
        if (document.fonts?.check('16px EB Garamond')) {
          resolve(true);
        } else {
          setTimeout(checkFont, 100);
        }
      };
      checkFont();
    });

    const canvas = await html2canvas.default(diplomaElement, {
      scale: 2,
      logging: false,
      useCORS: true,
      backgroundColor: null,
    });

    document.body.removeChild(diplomaElement);

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [210, 297],
    });

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = pdf.internal.pageSize.getWidth();
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    pdf.save(`diplome_${diploma.userName.replace(/\s+/g, '_')}_${diploma.type.replace(/\s+/g, '_')}.pdf`);
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
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
        {/* ✅ flexWrap pour que les champs date passent à la ligne sur mobile */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
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

      {/* Onglets — scrollables sur mobile pour ne jamais être tronqués */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(e: React.SyntheticEvent, newValue: 'stats' | 'badges' | 'diplomas') => setActiveTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
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

          {/* ✅ Empilé verticalement sur mobile/tablette, côte à côte à partir de "md" */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mt: 2 }}>
            {/* Tableau des blocs */}
            <Paper sx={{ p: 2, flex: 1, minWidth: 0 }}>
              <Typography variant="h6">Blocs</Typography>
              {/* ✅ Scroll horizontal de secours si le tableau reste trop large */}
              <TableContainer sx={{ overflowX: 'auto' }}>
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
            <Paper sx={{ p: 2, flex: 1, minWidth: 0 }}>
              <Typography variant="h6">Cours</Typography>
              <TableContainer sx={{ overflowX: 'auto' }}>
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
                const active = isBadgeActive(cb.badge);
                const displayColor = active ? badgeColor : '#BDBDBD';
                return (
                  <Card
                    key={index}
                    sx={{ width: 250, mb: 2, overflow: 'hidden', opacity: active ? 1 : 0.65 }}
                  >
                    <Box
                      sx={{
                        backgroundColor: displayColor,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        py: 2,
                        filter: active ? 'none' : 'grayscale(1)',
                      }}
                    >
                      <MilitaryTechIcon
                        sx={{
                          fontSize: 56,
                          color: !active
                            ? '#757575'
                            : ['#000000', '#800080', '#0000FF', '#FF0000'].includes(badgeColor)
                              ? '#FFFFFF'
                              : '#000000',
                        }}
                      />
                    </Box>
                    <CardContent>
                      <Typography variant="h6" sx={{ color: active ? badgeColor : 'text.disabled' }}>
                        {getBadgeDisplayName(cb.badge)}
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        {cb.badge.description}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                        Décerné par {cb.awardedByName} le {formatDate(cb.awardedAt)}
                      </Typography>
                      {!active && (
                        <Chip
                          label="Badge inactif : aucun bloc de cette couleur en salle"
                          size="small"
                          sx={{ mt: 1, backgroundColor: '#E0E0E0', color: '#616161', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
                        />
                      )}
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
            <TableContainer sx={{ overflowX: 'auto' }}>
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
