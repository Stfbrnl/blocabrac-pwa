import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './context/AuthContext';

// ✅ Imports ADMIN (fichiers à la racine de /pages/)
import Admin from './pages/Admin';
import AdminCompetitionList from './pages/AdminCompetitionList';
import AdminCompetitionManagement from './pages/AdminCompetitionManagement';
import AdminCompetitionRegistration from './pages/AdminCompetitionRegistration';
import AdminCompetitionStats from './pages/AdminCompetitionStats';
import AdminHomeContent from './pages/AdminHomeContent';
import AdminUsers from './pages/AdminUsers';

// ✅ Imports OUVREUR (fichiers existants)
import Ouvreur from './pages/Ouvreur';
import OuvreurScreen from './pages/Ouvreur/OuvreurScreen';
import DailyBouldersList from './pages/Ouvreur/DailyBoulders/DailyBouldersList';
import DailyBoulderForm from './pages/Ouvreur/DailyBoulders/DailyBoulderForm';
import CompetitionBouldersList from './pages/Ouvreur/CompetitionBoulders/CompetitionBouldersList';
import CompetitionBoulderForm from './pages/Ouvreur/CompetitionBoulders/CompetitionBoulderForm';

// ✅ Imports MONITEUR (fichiers existants dans votre arborescence)
import Moniteur from './pages/Moniteur';
import MoniteurScreen from './pages/Moniteur/MoniteurScreen';
import GroupsList from './pages/Moniteur/Groups/GroupsList';
import GroupForm from './pages/Moniteur/Groups/GroupForm';
import CoursesList from './pages/Moniteur/Courses/CoursesList';
import CourseForm from './pages/Moniteur/Courses/CourseForm';
import CourseDetail from './pages/Moniteur/Courses/CourseDetail';

// ✅ Imports publics
import Client from './pages/Client';
import ForgotPassword from './pages/ForgotPassword';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ProtectedRoute from './components/ProtectedRoute';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
  },
});

export default function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Routes>
            {/* ===== ROUTES PUBLIQUES ===== */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* ===== ROUTES ADMIN ===== */}
            <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><Admin /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/home-content" element={<ProtectedRoute allowedRoles={['admin']}><AdminHomeContent /></ProtectedRoute>} />
            <Route path="/admin/competitions/list" element={<ProtectedRoute allowedRoles={['admin']}><AdminCompetitionList /></ProtectedRoute>} />
            <Route path="/admin/competitions/create" element={<ProtectedRoute allowedRoles={['admin']}><AdminCompetitionManagement /></ProtectedRoute>} />
            <Route path="/admin/competitions/register" element={<ProtectedRoute allowedRoles={['admin']}><AdminCompetitionRegistration /></ProtectedRoute>} />
            <Route path="/admin/competitions/stats" element={<ProtectedRoute allowedRoles={['admin']}><AdminCompetitionStats /></ProtectedRoute>} />

            {/* ===== ROUTES OUVREUR ===== */}
            <Route path="/ouvreur" element={<ProtectedRoute allowedRoles={['ouvreur']}><Ouvreur /></ProtectedRoute>} />
            <Route path="/ouvreur/screen" element={<ProtectedRoute allowedRoles={['ouvreur']}><OuvreurScreen /></ProtectedRoute>} />
            <Route path="/ouvreur/daily-boulders" element={<ProtectedRoute allowedRoles={['ouvreur']}><DailyBouldersList /></ProtectedRoute>} />
            <Route path="/ouvreur/daily-boulders/:wall" element={<ProtectedRoute allowedRoles={['ouvreur']}><DailyBoulderForm /></ProtectedRoute>} />
            <Route path="/ouvreur/competition-boulders" element={<ProtectedRoute allowedRoles={['ouvreur']}><CompetitionBouldersList /></ProtectedRoute>} />
            <Route path="/ouvreur/competition-boulders/:competitionId/add" element={<ProtectedRoute allowedRoles={['ouvreur']}><CompetitionBoulderForm /></ProtectedRoute>} />

            {/* ===== ROUTES MONITEUR ===== */}
            <Route path="/moniteur" element={<ProtectedRoute allowedRoles={['moniteur']}><Moniteur /></ProtectedRoute>} />
            <Route path="/moniteur/screen" element={<ProtectedRoute allowedRoles={['moniteur']}><MoniteurScreen /></ProtectedRoute>} />
            <Route path="/moniteur/groups" element={<ProtectedRoute allowedRoles={['moniteur']}><GroupsList /></ProtectedRoute>} />
            <Route path="/moniteur/groups/add" element={<ProtectedRoute allowedRoles={['moniteur']}><GroupForm /></ProtectedRoute>} />
            <Route path="/moniteur/groups/edit/:groupId" element={<ProtectedRoute allowedRoles={['moniteur']}><GroupForm /></ProtectedRoute>} />
            <Route path="/moniteur/courses" element={<ProtectedRoute allowedRoles={['moniteur']}><CoursesList /></ProtectedRoute>} />
            <Route path="/moniteur/courses/add" element={<ProtectedRoute allowedRoles={['moniteur']}><CourseForm /></ProtectedRoute>} />
            <Route path="/moniteur/courses/edit/:courseId" element={<ProtectedRoute allowedRoles={['moniteur']}><CourseForm /></ProtectedRoute>} />
            <Route path="/moniteur/courses/:courseId" element={<ProtectedRoute allowedRoles={['moniteur']}><CourseDetail /></ProtectedRoute>} />

            {/* ===== ROUTES CLIENT ===== */}
            <Route path="/client" element={<ProtectedRoute allowedRoles={['client']}><Client /></ProtectedRoute>} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}