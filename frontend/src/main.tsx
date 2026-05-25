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

// Pages Ouvreur
import OuvreurScreen from './pages/Ouvreur/OuvreurScreen';
import DailyBouldersList from './pages/Ouvreur/DailyBoulders/DailyBouldersList';
import DailyBoulderForm from './pages/Ouvreur/DailyBoulders/DailyBoulderForm';
import CompetitionBouldersList from './pages/Ouvreur/CompetitionBoulders/CompetitionBouldersList';
import CompetitionBoulderForm from './pages/Ouvreur/CompetitionBoulders/CompetitionBoulderForm';
import ReportsAndStats from './pages/Ouvreur/ReportsAndStats/ReportsAndStats';

// Pages protégées existantes
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Client from './pages/Client';
import Moniteur from './pages/Moniteur';
import Admin from './pages/Admin';
import AdminUsers from './pages/AdminUsers';
import AdminHomeContent from './pages/AdminHomeContent';
import AdminCompetitionManagement from './pages/AdminCompetitionManagement';
import AdminCompetitionList from './pages/AdminCompetitionList';
import AdminCompetitionRegistration from './pages/AdminCompetitionRegistration';
import AdminCompetitionStats from './pages/AdminCompetitionStats';

const theme = createTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <AuthProvider>
          <Navbar />
          <Routes>
            {/* ========== ROUTES PUBLIQUES ========== */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* ========== ROUTES OUVREUR ========== */}
            <Route path="/ouvreur" element={<ProtectedRoute role="ouvreur"><OuvreurScreen /></ProtectedRoute>} />
            <Route path="/ouvreur/daily-boulders" element={<ProtectedRoute role="ouvreur"><DailyBouldersList /></ProtectedRoute>} />
            <Route path="/ouvreur/daily-boulders/:wall" element={<ProtectedRoute role="ouvreur"><DailyBoulderForm /></ProtectedRoute>} />
            <Route path="/ouvreur/competition-boulders" element={<ProtectedRoute role="ouvreur"><CompetitionBouldersList /></ProtectedRoute>} />
            <Route path="/ouvreur/competition-boulders/:competitionId/add" element={<ProtectedRoute role="ouvreur"><CompetitionBoulderForm /></ProtectedRoute>} />
            <Route path="/ouvreur/competition-boulders/:competitionId/edit/:boulderId" element={<ProtectedRoute role="ouvreur"><CompetitionBoulderForm /></ProtectedRoute>} />
            <Route path="/ouvreur/reports-and-stats" element={<ProtectedRoute role="ouvreur"><ReportsAndStats /></ProtectedRoute>} />

            {/* ========== ROUTES EXISTANTES (Client/Moniteur/Admin) ========== */}
            <Route path="/client" element={<ProtectedRoute role="client"><Client /></ProtectedRoute>} />
            <Route path="/moniteur" element={<ProtectedRoute role="moniteur"><Moniteur /></ProtectedRoute>} />
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