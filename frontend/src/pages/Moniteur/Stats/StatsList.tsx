import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../../../services/firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  Container,
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  SelectChangeEvent,
} from '@mui/material';
import { jsPDF } from 'jspdf';
import * as html2canvas from 'html2canvas';
import diplomaBackground from '../../../assets/diploma-background.png';
import { buildMiniCompetitionRanking, selectableMiniCompetitions } from '../../../utils/miniCompetitionRanking';
import { buildMiniCompetitionReleve } from '../../../utils/miniCompetitionReleve';
import { boulderColorChipSx } from '../../../utils/boulderColorDisplay';

// Types pour les données
interface User {
  id: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface Group {
  id: string;
  name: string;
  students: string[];
  moniteurId: string;
}

interface Exercise {
  id: string;
  name: string;
}

interface Boulder {
  id: string;
  wall?: string;
  /** ✅ Ajouté le 07/11/2026 pour l'ordre des colonnes du relevé : les numéros sont attachés
   *  au MUR, donc l'ordre est « mur du circuit, puis numéro ». Gratuit — même document. */
  number?: number;
  difficulty?: string;
  color?: string;
  difficulty_level?: string;
  difficulty_types?: string[];
}

interface Badge {
  id: string;
  name: string;
  feminineName?: string;
  description: string;
  criteria?: {
    color?: string;
    count?: number | string;
  };
  type: 'automatic' | 'manual';
  color?: string;
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

interface UserResult {
  id: string;
  displayName: string;
  email?: string;
  results: {
    exerciseId: string;
    exerciseName: string;
    success: boolean;
    date: Date;
    badgeAwarded?: boolean;
    courseId?: string;
    boulderId?: string;
    boulderColor?: string;
    attempts?: number;
    miniCompetitionId?: string;
  }[];
}

/**
 * Une séance, réduite à ce dont le relevé a besoin.
 *
 * ⚠️ POURQUOI SEULEMENT LES SÉANCES QUE CE MONITEUR A CRÉÉES : `firestore.rules` n'autorise la
 * lecture d'un `courses` qu'à son `createdBy`, à un élève du groupe, ou à un admin — le
 * `moniteurId` du groupe n'ouvre que l'ÉCRITURE. Une requête sur toute la collection serait
 * donc refusée en bloc (Firestore refuse une requête qu'il ne peut pas prouver autorisée),
 * et c'est pourquoi on reprend exactement la requête de `CoursesList.tsx`.
 *
 * ⚠️ Et le filtre par mini-compétition se fait CÔTÉ CLIENT plutôt qu'avec un
 * `array-contains` : combiné à l'égalité sur `createdBy`, il exigerait un index composite,
 * et `firestore.indexes.json` a déjà dérivé de la production. Une poignée de séances par
 * moniteur ne justifie pas un index.
 */
interface CourseLite {
  id: string;
  name: string;
  date: string;
  Participants: string[];
  optedOut: string[];
  miniCompetitions: string[];
}

interface MiniCompetition {
  id: string;
  name: string;
  boulderIds: string[];
  /** Auteur. Absent sur les documents créés avant que le formulaire ne l'écrive. */
  createdBy?: string;
}

const StatsList: React.FC = () => {
  const [user, loadingAuth] = useAuthState(auth);
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [miniCompetitions, setMiniCompetitions] = useState<MiniCompetition[]>([]);
  const [selectedMiniCompetitionId, setSelectedMiniCompetitionId] = useState<string>('');
  const [mesSeances, setMesSeances] = useState<CourseLite[]>([]);
  const [seanceChoisieId, setSeanceChoisieId] = useState<string>('');

  // États pour les filtres
  const [filters, setFilters] = useState<{
    period: string;
    exercise?: string;
    exerciseType?: string;
    user?: string;
    group?: string;
    boulderColor?: string;
  }>({
    period: 'week',
    exercise: undefined,
    exerciseType: undefined,
    user: undefined,
    group: undefined,
    boulderColor: undefined,
  });

  // États pour les dialogues
  const [openManualBadgeDialog, setOpenManualBadgeDialog] = useState<boolean>(false);
  const [openDiplomaDialog, setOpenDiplomaDialog] = useState<boolean>(false);
  const [selectedResult, setSelectedResult] = useState<{
    userId: string;
    exerciseId: string;
    exerciseName: string;
    boulderColor?: string;
  } | null>(null);
  const [selectedBadgeId, setSelectedBadgeId] = useState<string>('');
  const [selectedClientForDiploma, setSelectedClientForDiploma] = useState<{ id: string; name: string } | null>(null);
  const [selectedDiplomaType, setSelectedDiplomaType] = useState<string>('');
  const [diplomaTypes] = useState<string[]>([
    'Grotte de bronze',
    'Grotte d\'argent',
    'Grotte d\'or',
    'Bloc de bronze',
    'Bloc d\'argent',
    'Bloc d\'or',
  ]);

  // ✅ Construit "Prénom Nom" à partir de first_name/last_name, avec fallback
  const getFullName = (u: User | undefined, fallbackId: string): string => {
    if (!u) return fallbackId;
    const composed = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    if (composed) return composed;
    return u.displayName || u.email?.split('@')[0] || fallbackId;
  };

  // Fonction pour convertir un Timestamp ou Date en string
  const formatDate = (date: unknown): string => {
    if (!date) return 'N/A';
    if (date instanceof Date) return date.toLocaleDateString('fr-FR');
    if (date instanceof Timestamp) return date.toDate().toLocaleDateString('fr-FR');
    if (typeof date === 'object' && 'seconds' in date) return new Date((date as { seconds: number }).seconds * 1000).toLocaleDateString('fr-FR');
    if (typeof date === 'string' && date) return date;
    return 'N/A';
  };

  // Récupérer les données
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Récupérer les utilisateurs
        const usersQuery = query(collection(db, 'users'));
        const usersSnapshot = await getDocs(usersQuery);
        const usersList: User[] = usersSnapshot.docs.map((userDoc) => {
          const data = userDoc.data();
          return {
            id: userDoc.id,
            displayName: data.displayName || data.email?.split('@')[0] || userDoc.id,
            firstName: data.first_name || '',
            lastName: data.last_name || '',
            email: data.email || '',
          };
        });
        setUsers(usersList);

        // Récupérer les exercices
        const exercisesQuery = query(collection(db, 'exercises'));
        const exercisesSnapshot = await getDocs(exercisesQuery);
        const exercisesList: Exercise[] = exercisesSnapshot.docs.map((exerciseDoc) => ({
          id: exerciseDoc.id,
          name: exerciseDoc.data().name || `Exercice ${exerciseDoc.id}`,
        }));
        setExercises(exercisesList);

        // Récupérer les groupes du moniteur
        const groupsQuery = query(collection(db, 'Groups'), where('moniteurId', '==', user.uid));
        const groupsSnapshot = await getDocs(groupsQuery);
        const groupsList: Group[] = groupsSnapshot.docs.map((groupDoc) => ({
          id: groupDoc.id,
          name: groupDoc.data().name,
          students: groupDoc.data().students || [],
          moniteurId: groupDoc.data().moniteurId,
        }));
        setGroups(groupsList);

        // ✅ Les séances que CE moniteur a créées — même requête que CoursesList.tsx, la
        // seule que les règles autorisent (voir l'interface CourseLite). Elles servent à
        // connaître les PARTICIPANTS d'une séance, c'est-à-dire les lignes du relevé : un
        // élève qui n'a rien validé n'existe pas dans `client_course_results`, donc il ne
        // peut pas venir de là.
        const seancesSnapshot = await getDocs(
          query(collection(db, 'courses'), where('createdBy', '==', user.uid))
        );
        setMesSeances(seancesSnapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || '',
            date: data.date || '',
            Participants: data.Participants || [],
            optedOut: data.optedOut || [],
            miniCompetitions: data.miniCompetitions || [],
          };
        }));

        // Récupérer les blocs
        const bouldersQuery = query(collection(db, 'boulders'));
        const bouldersSnapshot = await getDocs(bouldersQuery);
        const bouldersList: Boulder[] = bouldersSnapshot.docs.map((boulderDoc) => ({
          id: boulderDoc.id,
          wall: boulderDoc.data().wall,
          number: boulderDoc.data().number,
          difficulty: boulderDoc.data().difficulty,
          color: boulderDoc.data().color,
          difficulty_level: boulderDoc.data().difficulty_level,
          difficulty_types: boulderDoc.data().difficulty_types,
        }));
        setBoulders(bouldersList);

        // ✅ Toutes les mini-compétitions, sans filtre sur `createdBy` : il en faut le NOM
        // pour libeller chaque ligne de résultat, y compris celles d'un collègue. Le filtre
        // sur l'auteur est reporté à l'affichage (selectableMiniCompetitions), où il admet
        // aussi celles qui ont réellement été jouées. Collection minuscule (1 document en
        // production), sans index composite.
        const miniCompetitionsSnapshot = await getDocs(collection(db, 'mini_competitions'));
        const miniCompetitionsList: MiniCompetition[] = miniCompetitionsSnapshot.docs.map((d) => ({
          id: d.id,
          name: d.data().name || '',
          boulderIds: d.data().boulderIds || [],
          createdBy: d.data().createdBy,
        }));
        setMiniCompetitions(miniCompetitionsList);

        // Récupérer les badges
        const badgesQuery = query(collection(db, 'badges'));
        const badgesSnapshot = await getDocs(badgesQuery);
        const badgesList: Badge[] = badgesSnapshot.docs.map((badgeDoc) => {
          const badgeData = badgeDoc.data();
          return {
            id: badgeDoc.id,
            name: badgeData.name || 'Badge inconnu',
            feminineName: badgeData.feminineName,
            description: badgeData.description || '',
            criteria: badgeData.criteria,
            type: badgeData.type || 'manual',
            color: badgeData.color,
          };
        });
        setBadges(badgesList);

        // Récupérer les résultats des clients
        const resultsQuery = query(collection(db, 'client_course_results'));
        const resultsSnapshot = await getDocs(resultsQuery);
        const resultsData: UserResult[] = [];

        for (const resultDoc of resultsSnapshot.docs) {
          const data = resultDoc.data();
          // ✅ Même correctif que côté client : le champ réellement écrit est "createdAt"
          const rawResultDate = data.createdAt ?? data.date;
          const resultDate = rawResultDate instanceof Timestamp
            ? rawResultDate.toDate()
            : rawResultDate?.seconds
              ? new Date(rawResultDate.seconds * 1000)
              : rawResultDate
                ? new Date(rawResultDate)
                : new Date();

          const userResult = resultsData.find((ur) => ur.id === data.userId);
          if (userResult) {
            userResult.results.push({
              exerciseId: data.exerciseId,
              exerciseName: exercisesList.find((ex) => ex.id === data.exerciseId)?.name || data.exerciseName || data.exerciseId,
              success: data.success || false,
              date: resultDate,
              badgeAwarded: data.badgeAwarded || false,
              courseId: data.courseId || '',
              boulderId: data.boulderId,
              boulderColor: data.boulderColor,
              attempts: data.attempts,
              miniCompetitionId: data.miniCompetitionId,
            });
          } else {
            const matchedUser = usersList.find((u) => u.id === data.userId);
            resultsData.push({
              id: data.userId,
              displayName: getFullName(matchedUser, data.userId),
              email: matchedUser?.email || '',
              results: [
                {
                  exerciseId: data.exerciseId,
                  exerciseName: exercisesList.find((ex) => ex.id === data.exerciseId)?.name || data.exerciseName || data.exerciseId,
                  success: data.success || false,
                  date: resultDate,
                  badgeAwarded: data.badgeAwarded || false,
                  courseId: data.courseId || '',
                  boulderId: data.boulderId,
                  boulderColor: data.boulderColor,
                  attempts: data.attempts,
                  miniCompetitionId: data.miniCompetitionId,
                },
              ],
            });
          }
        }
        setUserResults(resultsData);

        setIsLoading(false);
      } catch (err: unknown) {
        setError(`Erreur lors du chargement des données : ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  // Filtrer les résultats
  const filteredResults = (): UserResult[] => {
    let filteredData = [...userResults];

    if (filters.period !== 'all') {
      const now = new Date();
      let startDate: Date | null = null;
      let endDate: Date | null = null;

      switch (filters.period) {
        case 'day':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          break;
        case 'week':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay()) + 1);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
        case 'trimester':
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          endDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear() + 1, 0, 1);
          break;
      }

      if (startDate && endDate) {
        filteredData = filteredData.map((userResult) => ({
          ...userResult,
          results: userResult.results.filter((result) => {
            const resultDate = new Date(result.date);
            return resultDate >= startDate && resultDate <= endDate;
          }),
        }));
      }
    }

    if (filters.exercise) {
      filteredData = filteredData.map((userResult) => ({
        ...userResult,
        results: userResult.results.filter((result) => result.exerciseId === filters.exercise),
      }));
    }

    if (filters.exerciseType) {
      filteredData = filteredData.map((userResult) => ({
        ...userResult,
        results: userResult.results.filter((result) =>
          (result.exerciseName || '').toLowerCase().includes(filters.exerciseType?.toLowerCase() || '')
        ),
      }));
    }

    if (filters.user) {
      filteredData = filteredData.filter((userResult) => userResult.id === filters.user);
    }

    if (filters.group) {
      const group = groups.find((g) => g.id === filters.group);
      if (group) {
        filteredData = filteredData.filter((userResult) => group.students.includes(userResult.id));
      }
    }

    if (filters.boulderColor) {
      filteredData = filteredData.map((userResult) => ({
        ...userResult,
        results: userResult.results.filter((result) => result.boulderColor === filters.boulderColor),
      }));
    }

    return filteredData.filter((userResult) => userResult.results.length > 0);
  };

  // ✅ Classement d'une mini-compétition : le calcul vit dans utils/miniCompetitionRanking.ts
  // (pur, testé). Pas de filtre période/mur ici — une mini-compétition a sa propre
  // temporalité, celle de la séance qui la contient.
  //
  // ⚠️ Le rang y est un rang de COMPÉTITION (1, 1, 3) : c'était un `index + 1`, qui donnait
  // deux positions différentes à deux élèves au même score, départagés par l'ordre des
  // documents Firestore. Dans un cours, l'égalité est la règle — en début de séance tout le
  // monde est à zéro.
  const getMiniCompetitionRanking = (miniCompetitionId: string) =>
    buildMiniCompetitionRanking(userResults, miniCompetitionId);

  // ─── LE RELEVÉ ────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ UN RELEVÉ N'EST PAS UN CLASSEMENT (voir utils/miniCompetitionReleve.ts) : le classement
  // dit qui a gagné, le relevé dit qui a buté sur quoi. Aucun des deux ne se déduit de l'autre.
  //
  // ⚠️ TOUT EST DÉRIVÉ, aucun setState dans un effet : la séance courante se calcule depuis
  // l'état, avec un repli sur la plus récente. Un effet qui « choisirait » la séance par
  // défaut déclencherait une cascade de rendus (et ESLint le refuse).
  const seancesDeLaMiniCompetition = selectedMiniCompetitionId
    ? mesSeances
      .filter((c) => c.miniCompetitions.includes(selectedMiniCompetitionId))
      // Plus récente d'abord : c'est celle qu'on vient de faire tourner.
      .sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const seanceCourante = seancesDeLaMiniCompetition.find((c) => c.id === seanceChoisieId)
    ?? seancesDeLaMiniCompetition[0]
    ?? null;

  const releve = (() => {
    if (!selectedMiniCompetitionId || !seanceCourante) return null;
    const definition = miniCompetitions.find((m) => m.id === selectedMiniCompetitionId);
    if (!definition) return null;

    // Les LIGNES viennent des participants de la séance, jamais des résultats.
    const participants = seanceCourante.Participants.map((uid) => ({
      id: uid,
      displayName: getFullName(users.find((u) => u.id === uid), uid),
      desiste: seanceCourante.optedOut.includes(uid),
    }));

    // Les COLONNES viennent de la définition de la mini-compétition, donc un bloc que
    // personne n'a touché garde sa colonne — une colonne vide dit « personne n'a essayé ».
    // ⚠️ On ne transmet QUE mur et numéro : la couleur courante n'a rien à faire ici (voir
    // le piège ② du module), et l'interface d'entrée n'a d'ailleurs pas de champ pour elle.
    const blocsDeLEpreuve = definition.boulderIds.map((id) => {
      const b = boulders.find((x) => x.id === id);
      return { id, wall: b?.wall, number: b?.number };
    });

    // Les RÉSULTATS de cette mini-compétition, tous élèves confondus : le module écarte
    // lui-même ceux qui ne sont pas de la séance, et les COMPTE au lieu de les ignorer.
    const resultats = userResults.flatMap((ur) => ur.results
      .filter((r) => r.miniCompetitionId === selectedMiniCompetitionId)
      .map((r) => ({
        userId: ur.id,
        boulderId: r.boulderId,
        // ⚠️ La couleur FIGÉE à la validation, jamais celle du bloc aujourd'hui.
        boulderColor: r.boulderColor,
        attempts: r.attempts,
        success: r.success,
      })));

    return buildMiniCompetitionReleve(participants, blocsDeLEpreuve, resultats);
  })();

  // ⚠️ Les mini-compétitions proposées ne sont plus seulement celles dont ce moniteur est
  // l'auteur : voir selectableMiniCompetitions. Faire jouer celle d'un collègue dans sa
  // propre séance faisait disparaître le bloc « Classement » en entier, sans message.
  const miniCompetitionsProposees = user
    ? selectableMiniCompetitions(miniCompetitions, userResults, user.uid)
    : [];

  // Libellé de la colonne « Exercice » pour un résultat de bloc : ces documents n'ont pas
  // d'`exerciseId`, la cellule restait donc VIDE, chez le moniteur comme chez l'élève.
  const nomMiniCompetition = (miniCompetitionId?: string): string => {
    const trouvee = miniCompetitions.find((m) => m.id === miniCompetitionId);
    return trouvee ? `Mini-compétition : ${trouvee.name}` : 'Mini-compétition';
  };

  // Attribuer un badge à un utilisateur
  const awardBadgeToUser = async (userId: string, badgeId: string): Promise<void> => {
    if (!user) return;

    const moniteurFullName = getFullName(
      users.find((u) => u.id === user.uid),
      user.displayName || user.email?.split('@')[0] || user.uid
    );

    const newClientBadgeId = `${userId}_${badgeId}_${Date.now()}`;
    await setDoc(doc(db, 'client_badges', newClientBadgeId), {
      userId: userId,
      badgeId: badgeId,
      awardedAt: serverTimestamp(),
      awardedBy: user.uid,
      awardedByName: moniteurFullName,
    });
  };

  // Attribuer un badge manuellement
  const handleManualAwardBadge = (userId: string, userName: string): void => {
    setSelectedResult({
      userId,
      exerciseId: '',
      exerciseName: `Badge manuel pour ${userName}`,
      boulderColor: undefined,
    });
    setOpenManualBadgeDialog(true);
  };

  // Attribuer un diplôme
  const handleAwardDiploma = (userId: string, userName: string): void => {
    setSelectedClientForDiploma({ id: userId, name: userName });
    setOpenDiplomaDialog(true);
  };

  // ✅ Générer un PDF pour un diplôme — texte recentré dans la zone bleutée du fond
  const generateDiplomaPDF = async (diploma: Diploma) => {
    // Charger la police EB Garamond (via Google Fonts)
    const fontUrl = 'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;700&display=swap';
    const link = document.createElement('link');
    link.href = fontUrl;
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    // Conteneur principal : taille fixe correspondant à l'image de fond
    const diplomaElement = document.createElement('div');
    diplomaElement.style.width = '800px';
    diplomaElement.style.height = '600px';
    diplomaElement.style.backgroundImage = `url(${diplomaBackground})`;
    diplomaElement.style.backgroundSize = 'cover';
    diplomaElement.style.backgroundPosition = 'center';
    diplomaElement.style.position = 'relative';
    diplomaElement.style.fontFamily = "'EB Garamond', serif";
    diplomaElement.style.boxSizing = 'border-box';

    // ✅ Zone de texte contrainte à la partie bleutée du fond (sous le logo,
    // à l'intérieur des diagonales dorées) : verticalement de 38% à 92%,
    // largeur limitée à 68% centrée pour ne jamais toucher les diagonales latérales.
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

    // Titre principal
    const title = document.createElement('h1');
    title.textContent = 'DIPLÔME OFFICIEL';
    title.style.fontSize = '34px';
    title.style.fontWeight = '700';
    title.style.margin = '0';
    title.style.color = '#D4AF37';
    title.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.6)';
    textZone.appendChild(title);

    // Contenu principal (nom, diplôme, date, moniteur)
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.alignItems = 'center';
    content.style.gap = '12px';

    // Nom du titulaire
    const userName = document.createElement('p');
    userName.textContent = `Ce diplôme est décerné à : ${diploma.userName}`;
    userName.style.fontSize = '20px';
    userName.style.fontWeight = '400';
    userName.style.margin = '0';
    userName.style.color = '#D4AF37';
    userName.style.textShadow = '1px 1px 3px rgba(0, 0, 0, 0.6)';
    content.appendChild(userName);

    // Type de diplôme
    const diplomaType = document.createElement('p');
    diplomaType.textContent = `Type : ${diploma.type}`;
    diplomaType.style.fontSize = '18px';
    diplomaType.style.fontWeight = '400';
    diplomaType.style.margin = '0';
    diplomaType.style.color = '#D4AF37';
    diplomaType.style.textShadow = '1px 1px 3px rgba(0, 0, 0, 0.6)';
    content.appendChild(diplomaType);

    // Date
    const diplomaDate = document.createElement('p');
    diplomaDate.textContent = `Le ${formatDate(diploma.awardedAt)}`;
    diplomaDate.style.fontSize = '16px';
    diplomaDate.style.fontWeight = '400';
    diplomaDate.style.margin = '0';
    diplomaDate.style.color = '#D4AF37';
    diplomaDate.style.textShadow = '1px 1px 3px rgba(0, 0, 0, 0.6)';
    content.appendChild(diplomaDate);

    // Nom du moniteur
    const moniteurName = document.createElement('p');
    moniteurName.textContent = `Décerné par : ${diploma.awardedByName}`;
    moniteurName.style.fontSize = '16px';
    moniteurName.style.fontWeight = '400';
    moniteurName.style.margin = '0';
    moniteurName.style.color = '#D4AF37';
    moniteurName.style.textShadow = '1px 1px 3px rgba(0, 0, 0, 0.6)';
    content.appendChild(moniteurName);

    textZone.appendChild(content);

    // Pied de page
    const footer = document.createElement('p');
    footer.textContent = 'Félicitations pour votre progression !';
    footer.style.fontSize = '15px';
    footer.style.fontStyle = 'italic';
    footer.style.margin = '0';
    footer.style.color = '#D4AF37';
    footer.style.textShadow = '1px 1px 3px rgba(0, 0, 0, 0.6)';
    textZone.appendChild(footer);

    // Ajouter temporairement au DOM
    document.body.appendChild(diplomaElement);

    // Attendre que la police soit chargée
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

    // Capturer en canvas
    const canvas = await html2canvas.default(diplomaElement, {
      scale: 2,
      logging: false,
      useCORS: true,
      backgroundColor: null,
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
    pdf.save(`diplome_${diploma.userName.replace(/\s+/g, '_')}_${diploma.type.replace(/\s+/g, '_')}.pdf`);
  };

  // Confirmer l'attribution manuelle d'un badge
  const confirmManualAwardBadge = async (): Promise<void> => {
    if (!selectedResult || !selectedBadgeId || !user) return;

    try {
      await awardBadgeToUser(selectedResult.userId, selectedBadgeId);
      setSuccess(`Badge attribué manuellement à ${selectedResult.exerciseName.split(' pour ')[1]} !`);
      setOpenManualBadgeDialog(false);
    } catch (err: unknown) {
      setError(`Erreur lors de l'attribution du badge : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Confirmer l'attribution d'un diplôme
  const confirmAwardDiploma = async (): Promise<void> => {
    if (!selectedClientForDiploma || !selectedDiplomaType || !user) return;

    try {
      const moniteurFullName = getFullName(
        users.find((u) => u.id === user.uid),
        user.displayName || user.email?.split('@')[0] || user.uid
      );

      const diplomaId = `diploma_${selectedClientForDiploma.id}_${selectedDiplomaType.replace(/\s+/g, '_')}_${Date.now()}`;
      await setDoc(doc(db, 'diplomas', diplomaId), {
        userId: selectedClientForDiploma.id,
        userName: selectedClientForDiploma.name,
        type: selectedDiplomaType,
        awardedAt: serverTimestamp(),
        awardedBy: user.uid,
        awardedByName: moniteurFullName,
      });

      setSuccess(`Diplôme "${selectedDiplomaType}" attribué à ${selectedClientForDiploma.name} !`);
      setOpenDiplomaDialog(false);

      // Générer le PDF automatiquement
      const newDiploma: Diploma = {
        id: diplomaId,
        userId: selectedClientForDiploma.id,
        userName: selectedClientForDiploma.name,
        type: selectedDiplomaType,
        awardedAt: new Date(),
        awardedBy: user.uid,
        awardedByName: moniteurFullName,
      };
      await generateDiplomaPDF(newDiploma);
    } catch (err: unknown) {
      setError(`Erreur lors de l'attribution du diplôme : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Fermer les notifications
  const handleCloseSnackbar = (): void => {
    setError(null);
    setSuccess(null);
  };

  // Gestion des changements de filtres
  const handleFilterChange = (filterName: keyof typeof filters, value: string): void => {
    setFilters({ ...filters, [filterName]: value === '' ? undefined : value });
  };

  if (loadingAuth || isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Liste des exercices uniques
  const uniqueExercises: string[] = Array.from(
    new Set(userResults.flatMap((ur) => ur.results.map((r) => r.exerciseId)))
  ).filter((ex): ex is string => ex !== undefined);

  // Liste des types d'exercices uniques
  const uniqueExerciseTypes: string[] = Array.from(
    new Set(userResults.flatMap((ur) => ur.results.map((r) => r.exerciseName)))
  ).filter((type): type is string => type !== undefined);

  // Liste des couleurs de blocs uniques
  const uniqueBoulderColors: string[] = Array.from(
    new Set(boulders.map((b) => b.color).filter((color): color is string => color !== undefined))
  );

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 2, sm: 3 }, mt: { xs: 2, sm: 3 } }}>
        <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
          Statistiques des exercices
        </Typography>

        {/* Filtres */}
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            mb: 3,
            flexWrap: 'wrap',
          }}
        >
          <FormControl sx={{ minWidth: 140, flex: '1 1 140px' }}>
            <InputLabel id="periode-select-label">Période</InputLabel>
            <Select
              labelId="periode-select-label" id="periode-select"
              value={filters.period}
              onChange={(e: SelectChangeEvent<string>) => handleFilterChange('period', e.target.value)}
              label="Période"
            >
              <MenuItem value="day">Aujourd'hui</MenuItem>
              <MenuItem value="week">Cette semaine</MenuItem>
              <MenuItem value="month">Ce mois</MenuItem>
              <MenuItem value="trimester">Ce trimestre</MenuItem>
              <MenuItem value="year">Cette année</MenuItem>
              <MenuItem value="all">Toutes périodes</MenuItem>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200, flex: '1 1 200px' }}>
            <InputLabel id="exercice-select-label">Exercice</InputLabel>
            <Select
              labelId="exercice-select-label" id="exercice-select"
              value={filters.exercise || ''}
              onChange={(e: SelectChangeEvent<string>) => handleFilterChange('exercise', e.target.value)}
              label="Exercice"
            >
              <MenuItem value="">Tous</MenuItem>
              {uniqueExercises.map((exercise) => (
                <MenuItem key={exercise} value={exercise}>
                  {exercises.find((ex) => ex.id === exercise)?.name || exercise}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200, flex: '1 1 200px' }}>
            <InputLabel id="type-d-exercice-select-label">Type d'exercice</InputLabel>
            <Select
              labelId="type-d-exercice-select-label" id="type-d-exercice-select"
              value={filters.exerciseType || ''}
              onChange={(e: SelectChangeEvent<string>) => handleFilterChange('exerciseType', e.target.value)}
              label="Type d'exercice"
            >
              <MenuItem value="">Tous</MenuItem>
              {uniqueExerciseTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200, flex: '1 1 200px' }}>
            <InputLabel id="utilisateur-select-label">Utilisateur</InputLabel>
            <Select
              labelId="utilisateur-select-label" id="utilisateur-select"
              value={filters.user || ''}
              onChange={(e: SelectChangeEvent<string>) => handleFilterChange('user', e.target.value)}
              label="Utilisateur"
            >
              <MenuItem value="">Tous</MenuItem>
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {getFullName(u, u.id)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200, flex: '1 1 200px' }}>
            <InputLabel id="groupe-select-label">Groupe</InputLabel>
            <Select
              labelId="groupe-select-label" id="groupe-select"
              value={filters.group || ''}
              onChange={(e: SelectChangeEvent<string>) => handleFilterChange('group', e.target.value)}
              label="Groupe"
            >
              <MenuItem value="">Tous</MenuItem>
              {groups.map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200, flex: '1 1 200px' }}>
            <InputLabel id="couleur-de-bloc-select-label">Couleur de bloc</InputLabel>
            <Select
              labelId="couleur-de-bloc-select-label" id="couleur-de-bloc-select"
              value={filters.boulderColor || ''}
              onChange={(e: SelectChangeEvent<string>) => handleFilterChange('boulderColor', e.target.value)}
              label="Couleur de bloc"
            >
              <MenuItem value="">Toutes</MenuItem>
              {uniqueBoulderColors.map((color) => (
                <MenuItem key={color} value={color}>
                  {color}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Tableau des résultats */}
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 850 }}>
            <TableHead>
              <TableRow>
                <TableCell>Utilisateur</TableCell>
                <TableCell>Exercice</TableCell>
                <TableCell>Bloc</TableCell>
                <TableCell>Réussite</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Badge</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredResults().length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    Aucun résultat trouvé.
                  </TableCell>
                </TableRow>
              ) : (
                filteredResults().map((userResult) =>
                  userResult.results.map((result, index) => (
                    <TableRow key={`${userResult.id}-${result.exerciseId}-${index}`}>
                      <TableCell>{userResult.displayName}</TableCell>
                      <TableCell>
                        {/* ✅ Un résultat de bloc n'a pas d'`exerciseId` : la cellule restait
                            vide. Elle porte maintenant le nom de la mini-compétition. */}
                        {result.boulderId
                          ? nomMiniCompetition(result.miniCompetitionId)
                          : exercises.find((ex) => ex.id === result.exerciseId)?.name || result.exerciseName || result.exerciseId}
                      </TableCell>
                      <TableCell>
                        {/* ✅ `backgroundColor: 'bleu'` n'est pas une couleur CSS : la
                            pastille retombait sur le gris de MUI, avec du texte blanc
                            dessus. Voir utils/boulderColorDisplay.ts. */}
                        {result.boulderColor ? (
                          <Chip label={result.boulderColor} sx={boulderColorChipSx(result.boulderColor)} />
                        ) : (
                          'N/A'
                        )}
                      </TableCell>
                      <TableCell>
                        {result.success ? (
                          <Chip label="Réussi" color="success" />
                        ) : (
                          <Chip label="Échoué" color="error" />
                        )}
                      </TableCell>
                      <TableCell>
                        {formatDate(result.date)}
                      </TableCell>
                      <TableCell>
                        {result.badgeAwarded ? (
                          <Chip label="Badge attribué" color="primary" />
                        ) : (
                          <Chip label="Aucun badge" color="default" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          <Button
                            variant="outlined"
                            color="secondary"
                            size="small"
                            onClick={() => handleManualAwardBadge(userResult.id, userResult.displayName)}
                          >
                            Attribuer un badge
                          </Button>
                          <Button
                            variant="outlined"
                            color="info"
                            size="small"
                            onClick={() => handleAwardDiploma(userResult.id, userResult.displayName)}
                          >
                            Attribuer un diplôme
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Dialogue pour attribuer un badge manuellement */}
        <Dialog open={openManualBadgeDialog} onClose={() => setOpenManualBadgeDialog(false)} fullWidth maxWidth="xs">
          <DialogTitle>Attribuer un badge manuellement</DialogTitle>
          <DialogContent>
            <Typography>
              Attribuer un badge à {selectedResult?.exerciseName.split(' pour ')[1]} ?
            </Typography>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel id="badge-select-label">Badge</InputLabel>
              <Select
                labelId="badge-select-label" id="badge-select"
                value={selectedBadgeId || ''}
                onChange={(e: SelectChangeEvent<string>) => setSelectedBadgeId(e.target.value)}
                label="Badge"
              >
                {badges.map((badge) => (
                  <MenuItem key={badge.id} value={badge.id}>
                    {badge.name} ({badge.description})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenManualBadgeDialog(false)}>Annuler</Button>
            <Button onClick={confirmManualAwardBadge} color="primary">
              Confirmer
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialogue pour attribuer un diplôme */}
        <Dialog open={openDiplomaDialog} onClose={() => setOpenDiplomaDialog(false)} fullWidth maxWidth="xs">
          <DialogTitle>Attribuer un diplôme</DialogTitle>
          <DialogContent>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel id="type-de-diplome-select-label">Type de diplôme</InputLabel>
              <Select
                labelId="type-de-diplome-select-label" id="type-de-diplome-select"
                value={selectedDiplomaType}
                onChange={(e: SelectChangeEvent<string>) => setSelectedDiplomaType(e.target.value)}
                label="Type de diplôme"
              >
                {diplomaTypes.map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDiplomaDialog(false)}>Annuler</Button>
            <Button onClick={confirmAwardDiploma} color="primary">
              Attribuer et générer le PDF
            </Button>
          </DialogActions>
        </Dialog>

        {/* Notifications */}
        <Snackbar
          open={!!error || !!success}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={handleCloseSnackbar} severity={error ? 'error' : 'success'} sx={{ width: '100%' }}>
            {error || success}
          </Alert>
        </Snackbar>
      </Paper>

      {miniCompetitionsProposees.length > 0 && (
        <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
          <Typography variant="h5" gutterBottom sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            🏆 Classement mini-compétition
          </Typography>

          <FormControl sx={{ minWidth: 250, mb: 2 }}>
            <InputLabel id="mini-competition-select-label">Mini-compétition</InputLabel>
            <Select
              labelId="mini-competition-select-label"
              value={selectedMiniCompetitionId}
              onChange={(e: SelectChangeEvent<string>) => setSelectedMiniCompetitionId(e.target.value)}
              label="Mini-compétition"
            >
              {miniCompetitionsProposees.map((mc) => (
                <MenuItem key={mc.id} value={mc.id}>{mc.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedMiniCompetitionId && (() => {
            const ranking = getMiniCompetitionRanking(selectedMiniCompetitionId);
            return ranking.length === 0 ? (
              <Typography color="text.secondary">Aucun résultat enregistré pour cette mini-compétition.</Typography>
            ) : (
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table sx={{ minWidth: 400 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Rang</TableCell>
                      <TableCell>Participant</TableCell>
                      <TableCell>Blocs réussis</TableCell>
                      <TableCell>Points</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {/* ✅ Le rang vient du calcul (1, 1, 3), et la clé est l'uid : deux
                        homonymes produisaient une collision de clés React. */}
                    {ranking.map((entry) => (
                      <TableRow key={entry.userId} hover>
                        <TableCell>{entry.rank}</TableCell>
                        <TableCell>{entry.participant}</TableCell>
                        <TableCell>{entry.bouldersValidated}</TableCell>
                        <TableCell>{entry.score}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            );
          })()}
        </Paper>
      )}

      {/* ══════════════ RELEVÉ DES VALIDATIONS ══════════════
          ⚠️ UN RELEVÉ N'EST PAS UN CLASSEMENT. Le classement ci-dessus dit qui a gagné ; ce
          tableau dit QUI A FAIT QUOI, et aucun des deux ne se déduit de l'autre. Un classement
          ne dira jamais que Léa a buté trois fois sur le bleu de la dalle pendant que le reste
          du groupe le flashait — c'est pourtant la seule information de la séance qui ait une
          valeur pédagogique.

          ⚠️ RÉSERVE D'USAGE, à dire plutôt qu'à coder : ce tableau expose les échecs de chaque
          élève à qui regarde l'écran. Sur le téléphone de la monitrice, c'est son métier ;
          projeté ou tendu à un groupe, c'est autre chose. L'encadré gris le rappelle.

          Tout le calcul vit dans utils/miniCompetitionReleve.ts (pur, testé). */}
      {selectedMiniCompetitionId && seancesDeLaMiniCompetition.length === 0 && (
        <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
          <Typography variant="h5" gutterBottom sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            📋 Relevé des validations
          </Typography>
          {/* ⚠️ Dit POURQUOI il n'y a rien, au lieu de ne rien afficher : cette
              mini-compétition a bien été jouée (sinon elle ne serait pas proposée), mais dans
              la séance d'un collègue — et les règles ne laissent lire que ses propres séances.
              Un écran muet ici ferait croire à un bug. */}
          <Alert severity="info">
            Aucune de vos séances n’utilise cette mini-compétition. Le relevé par élève a besoin
            de la liste des participants d’une séance, et seules les séances que vous avez
            créées sont lisibles. Le classement ci-dessus, lui, reste complet.
          </Alert>
        </Paper>
      )}

      {releve && seanceCourante && (
        <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
          <Typography variant="h5" gutterBottom sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            📋 Relevé des validations
          </Typography>

          {/* Sélecteur de séance, seulement s'il y a un choix à faire. */}
          {seancesDeLaMiniCompetition.length > 1 ? (
            <FormControl sx={{ minWidth: 250, mb: 2 }}>
              <InputLabel id="releve-seance-label">Séance</InputLabel>
              <Select
                labelId="releve-seance-label"
                value={seanceCourante.id}
                onChange={(e: SelectChangeEvent<string>) => setSeanceChoisieId(e.target.value)}
                label="Séance"
              >
                {seancesDeLaMiniCompetition.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.date} — {c.name || 'séance sans nom'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Séance du {seanceCourante.date}
              {seanceCourante.name ? ` — ${seanceCourante.name}` : ''} ·{' '}
              {releve.effectif} élève{releve.effectif > 1 ? 's' : ''}
            </Typography>
          )}

          {releve.effectif === 0 ? (
            <Alert severity="info">Cette séance n’a aucun participant inscrit.</Alert>
          ) : (
            <>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 360 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1 }}>
                        Élève
                      </TableCell>
                      {releve.colonnes.map((c) => (
                        <TableCell key={c.boulderId} align="center" sx={{ whiteSpace: 'nowrap' }}>
                          {c.etiquette}
                        </TableCell>
                      ))}
                      <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>Réussis</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {/* La clé est l'uid, jamais le nom : deux homonymes existent dans cette
                        salle, et une collision de clés React est un défaut silencieux. */}
                    {releve.lignes.map((ligne) => (
                      <TableRow key={ligne.userId} hover>
                        <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', whiteSpace: 'nowrap' }}>
                          {ligne.displayName}
                          {ligne.desiste && (
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                              (désisté)
                            </Typography>
                          )}
                        </TableCell>
                        {ligne.cellules.map((cellule, i) => (
                          <TableCell key={releve.colonnes[i].boulderId} align="center">
                            {cellule === null ? (
                              // Rien d'enregistré : volontairement VIDE, pas un zéro. Un zéro
                              // se lirait comme « a essayé et raté ».
                              <Typography variant="caption" color="text.disabled">—</Typography>
                            ) : cellule.success ? (
                              // ⚠️ LA COULEUR EST CELLE FIGÉE À LA VALIDATION, jamais celle du
                              // bloc aujourd'hui : c'est le défaut du 18/10/2026 (80 points
                              // chez la monitrice contre 900 chez l'élève). Le module ne reçoit
                              // même pas la couleur courante, il ne peut donc pas la lire.
                              <Box
                                component="span"
                                title={cellule.couleurFigee
                                  ? `Réussi · ${cellule.couleurFigee} (couleur enregistrée ce jour-là)`
                                  : 'Réussi · couleur non enregistrée'}
                                sx={{
                                  ...boulderColorChipSx(cellule.couleurFigee),
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minWidth: 26,
                                  height: 26,
                                  px: 0.5,
                                  borderRadius: '13px',
                                  border: '1px solid',
                                  borderColor: 'divider',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                }}
                              >
                                {cellule.attempts ?? '✓'}
                              </Box>
                            ) : (
                              <Typography component="span" color="error" title="Tenté et échoué">✘</Typography>
                            )}
                          </TableCell>
                        ))}
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                          {ligne.blocsReussis}/{releve.colonnes.length}
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* ⚠️ LES MARGES ANNONCENT LEUR DÉNOMINATEUR. Un « 50 % » nu confond
                        « un seul a essayé et il a échoué » (ne dit rien du bloc) et « la
                        moitié du groupe a échoué » (dit qu'il était trop dur). */}
                    <TableRow>
                      <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', fontWeight: 600 }}>
                        Réussi / tenté
                      </TableCell>
                      {releve.colonnes.map((c) => (
                        <TableCell key={c.boulderId} align="center" sx={{ whiteSpace: 'nowrap' }}>
                          <strong>{c.reussis}</strong>/{c.tentes}
                        </TableCell>
                      ))}
                      <TableCell align="center">—</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', fontWeight: 600 }}>
                        Essais moyens
                      </TableCell>
                      {releve.colonnes.map((c) => (
                        <TableCell key={c.boulderId} align="center" sx={{ whiteSpace: 'nowrap' }}>
                          {c.essaisMoyensReussites ?? '—'}
                        </TableCell>
                      ))}
                      <TableCell align="center">—</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                Dans une case&nbsp;: le nombre d’essais, sur la couleur <strong>enregistrée le
                jour de la validation</strong> (une recotation ultérieure du bloc ne la change
                pas). ✘&nbsp;= tenté et échoué, —&nbsp;= rien d’enregistré. «&nbsp;Réussi /
                tenté&nbsp;» se lit sur {releve.effectif} élève{releve.effectif > 1 ? 's' : ''}&nbsp;:
                un bloc à 1/1 n’a été essayé que par une personne. Croisé avec les essais
                moyens, il distingue un bloc <em>sélectif</em> (peu de réussites, peu d’essais)
                d’un bloc <em>trop dur</em> (peu de réussites, beaucoup d’essais).
              </Typography>

              {/* ⚠️ Un résultat qui n'entre dans aucune case est SIGNALÉ, jamais ignoré :
                  sinon une validation se perdrait entre la liste des résultats et la grille
                  sans que rien ne le dise. */}
              {releve.resultatsHorsTableau.length > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {releve.resultatsHorsTableau.length} validation
                  {releve.resultatsHorsTableau.length > 1 ? 's' : ''} n’apparaî
                  {releve.resultatsHorsTableau.length > 1 ? 'ssent' : 't'} pas dans ce tableau&nbsp;:{' '}
                  {releve.resultatsHorsTableau.filter((x) => x.raison === 'eleve-hors-seance').length} d’un
                  élève qui n’est pas inscrit à cette séance,{' '}
                  {releve.resultatsHorsTableau.filter((x) => x.raison === 'bloc-hors-epreuve').length} sur
                  un bloc qui n’est plus dans la mini-compétition. Elles comptent dans le
                  classement ci-dessus.
                </Alert>
              )}

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                ⚠️ Ce tableau montre les échecs de chaque élève, nommément. À garder pour vous
                plutôt qu’à projeter ou à tendre au groupe.
              </Typography>
            </>
          )}
        </Paper>
      )}
    </Container>
  );
};

export default StatsList;