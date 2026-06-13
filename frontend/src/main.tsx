import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { AuthProvider } from './context/AuthContext';

// Pages publiques
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';

// Pages Client
import Client from './pages/Client';
import ClientScreen from './pages/Client/ClientScreen';
import ClientDaily from './pages/Client/Daily/ClientDaily';
import ClientCompetitions from './pages/Client/Competitions/ClientCompetitions';
import ClientCompetitionStats from './pages/Client/Competitions/ClientCompetitionStats';
import ClientCourses from './pages/Client/Courses/ClientCourses';
import ClientCourseSession from './pages/Client/Courses/ClientCourseSession';
import ClientProfile from './pages/Client/Profile/ClientProfile';
import ClientStats from './pages/Client/Stats/ClientStats';

// Pages Ouvreur
import OuvreurScreen from './pages/Ouvreur/OuvreurScreen';
import DailyBouldersList from './pages/Ouvreur/DailyBoulders/DailyBouldersList';
import DailyBoulderForm from './pages/Ouvreur/DailyBoulders/DailyBoulderForm';
import CompetitionBouldersList from './pages/Ouvreur/CompetitionBoulders/CompetitionBouldersList';
import CompetitionBoulderForm from './pages/Ouvreur/CompetitionBoulders/CompetitionBoulderForm';
import ReportsAndStats from './pages/Ouvreur/ReportsAndStats/ReportsAndStats';
import BoulderStats from './pages/Ouvreur/ReportsAndStats/BoulderStats';
import CompetitionBoulderStats from './pages/Ouvreur/ReportsAndStats/CompetitionBoulderStats'; // ✅ CORRIGÉ : CompetitionBoulderStats

// Pages Moniteur
import MoniteurScreen from './pages/Moniteur/MoniteurScreen';
import GroupsList from './pages/Moniteur/Groups/GroupsList';
import GroupForm from './pages/Moniteur/Groups/GroupForm';
import CoursesList from './pages/Moniteur/Courses/CoursesList';
import CourseForm from './pages/Moniteur/Courses/CourseForm';
import CourseDetail from './pages/Moniteur/Courses/CourseDetail';
import ExercisesList from './pages/Moniteur/Exercises/ExercisesList';
import ExerciseForm from './pages/Moniteur/Exercises/ExerciseForm';
import StatsList from './pages/Moniteur/Stats/StatsList';
import MessagesList from './pages/Moniteur/Messages/MessagesList';

// Pages Admin
import Admin from './pages/Admin';
import AdminUsers from './pages/AdminUsers';
import AdminHomeContent from './pages/AdminHomeContent';
import AdminCompetitionManagement from './pages/AdminCompetitionManagement';
import AdminCompetitionList from './pages/AdminCompetitionList';
import AdminCompetitionRegistration from './pages/AdminCompetitionRegistration';
import AdminCompetitionStats from './pages/AdminCompetitionStats';

// Composants partagés
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';

const theme = createTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <BrowserRouter basename="/blocabrac-pwa">
        <AuthProvider>
          <Navbar />
          <Routes>
            {/* ========== ROUTES PUBLIQUES ========== */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* ========== ROUTES CLIENT ========== */}
            <Route path="/client" element={<ProtectedRoute role="client"><Client /></ProtectedRoute>} />
            <Route path="/client/screen" element={<ProtectedRoute role="client"><ClientScreen /></ProtectedRoute>} />
            <Route path="/client/daily" element={<ProtectedRoute role="client"><ClientDaily /></ProtectedRoute>} />
            <Route path="/client/competitions" element={<ProtectedRoute role="client"><ClientCompetitions /></ProtectedRoute>} />
            <Route path="/client/competitions/stats" element={<ProtectedRoute role="client"><ClientCompetitionStats /></ProtectedRoute>} />
            <Route path="/client/courses" element={<ProtectedRoute role="client"><ClientCourses /></ProtectedRoute>} />
            <Route path="/client/courses/session/:sessionId" element={<ProtectedRoute role="client"><ClientCourseSession /></ProtectedRoute>} />
            <Route path="/client/profile" element={<ProtectedRoute role="client"><ClientProfile /></ProtectedRoute>} />
            <Route path="/client/stats" element={<ProtectedRoute role="client"><ClientStats /></ProtectedRoute>} />

            {/* ========== ROUTES OUVREUR ========== */}
            <Route path="/ouvreur" element={<ProtectedRoute role="ouvreur"><OuvreurScreen /></ProtectedRoute>} />
            <Route path="/ouvreur/daily-boulders" element={<ProtectedRoute role="ouvreur"><DailyBouldersList /></ProtectedRoute>} />
            <Route path="/ouvreur/daily-boulders/:wall" element={<ProtectedRoute role="ouvreur"><DailyBoulderForm /></ProtectedRoute>} />
            <Route path="/ouvreur/competition-boulders" element={<ProtectedRoute role="ouvreur"><CompetitionBouldersList /></ProtectedRoute>} />
            <Route path="/ouvreur/competition-boulders/:competitionId/add" element={<ProtectedRoute role="ouvreur"><CompetitionBoulderForm /></ProtectedRoute>} />
            <Route path="/ouvreur/competition-boulders/:competitionId/edit/:boulderId" element={<ProtectedRoute role="ouvreur"><CompetitionBoulderForm /></ProtectedRoute>} />
            <Route path="/ouvreur/reports-and-stats" element={<ProtectedRoute role="ouvreur"><ReportsAndStats /></ProtectedRoute>} />
            <Route path="/ouvreur/reports-and-stats/boulders/:wall" element={<ProtectedRoute role="ouvreur"><BoulderStats /></ProtectedRoute>} />
            <Route path="/ouvreur/reports-and-stats/competitions" element={<ProtectedRoute role="ouvreur"><CompetitionBoulderStats /></ProtectedRoute>} /> {/* ✅ CORRIGÉ */}

            {/* ========== ROUTES MONITEUR ========== */}
            <Route path="/moniteur" element={<ProtectedRoute role="moniteur"><MoniteurScreen /></ProtectedRoute>} />
            <Route path="/moniteur/groups" element={<ProtectedRoute role="moniteur"><GroupsList /></ProtectedRoute>} />
            <Route path="/moniteur/groups/new" element={<ProtectedRoute role="moniteur"><GroupForm /></ProtectedRoute>} />
            <Route path="/moniteur/groups/edit/:groupId" element={<ProtectedRoute role="moniteur"><GroupForm /></ProtectedRoute>} />
            <Route path="/moniteur/courses" element={<ProtectedRoute role="moniteur"><CoursesList /></ProtectedRoute>} />
            <Route path="/moniteur/courses/new" element={<ProtectedRoute role="moniteur"><CourseForm /></ProtectedRoute>} />
            <Route path="/moniteur/courses/edit/:courseId" element={<ProtectedRoute role="moniteur"><CourseForm /></ProtectedRoute>} />
            <Route path="/moniteur/courses/:courseId" element={<ProtectedRoute role="moniteur"><CourseDetail /></ProtectedRoute>} />
            <Route path="/moniteur/exercises" element={<ProtectedRoute role="moniteur"><ExercisesList /></ProtectedRoute>} />
            <Route path="/moniteur/exercises/new" element={<ProtectedRoute role="moniteur"><ExerciseForm /></ProtectedRoute>} />
            <Route path="/moniteur/exercises/edit/:exerciseId" element={<ProtectedRoute role="moniteur"><ExerciseForm /></ProtectedRoute>} />
            <Route path="/moniteur/stats" element={<ProtectedRoute role="moniteur"><StatsList /></ProtectedRoute>} />
            <Route path="/moniteur/messages" element={<ProtectedRoute role="moniteur"><MessagesList /></ProtectedRoute>} />

            {/* ========== ROUTES ADMIN ========== */}
            <Route path="/admin" element={<ProtectedRoute role="admin"><Admin /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute role="admin"><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/home-content" element={<ProtectedRoute role="admin"><AdminHomeContent /></ProtectedRoute>} />
            <Route path="/admin/competitions/create" element={<ProtectedRoute role="admin"><AdminCompetitionManagement /></ProtectedRoute>} />
            <Route path="/admin/competitions/list" element={<ProtectedRoute role="admin"><AdminCompetitionList /></ProtectedRoute>} />
            <Route path="/admin/competitions/register" element={<ProtectedRoute role="admin"><AdminCompetitionRegistration /></ProtectedRoute>} />
            <Route path="/admin/competitions/stats" element={<ProtectedRoute role="admin"><AdminCompetitionStats /></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);