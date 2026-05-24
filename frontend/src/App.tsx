import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { AuthProvider } from './context/AuthContext';

// Pages publiques (accessibles sans authentification)
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';

// Pages protégées
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Client from './pages/Client';
import Ouvreur from './pages/Ouvreur';
import Moniteur from './pages/Moniteur';
import Admin from './pages/Admin';
import AdminUsers from './pages/AdminUsers';
import AdminHomeContent from './pages/AdminHomeContent';
import AdminCompetitionManagement from './pages/AdminCompetitionManagement';
import AdminCompetitionList from './pages/AdminCompetitionList';
import AdminCompetitionStats from './pages/AdminCompetitionStats';

const theme = createTheme();

const App: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <Router>
        <AuthProvider>
          <Navbar />
          <Routes>
            {/* ======================================= */}
            {/* ROUTES PUBLIQUES (sans ProtectedRoute) */}
            {/* ======================================= */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} /> {/* ✅ Route publique, EN DEHORS de ProtectedRoute */}

            {/* ======================================= */}
            {/* ROUTES PROTÉGÉES (avec ProtectedRoute) */}
            {/* ======================================= */}
            <Route path="/client" element={<ProtectedRoute role="client"><Client /></ProtectedRoute>} />
            <Route path="/ouvreur" element={<ProtectedRoute role="ouvreur"><Ouvreur /></ProtectedRoute>} />
            <Route path="/moniteur" element={<ProtectedRoute role="moniteur"><Moniteur /></ProtectedRoute>} />

            {/* Routes Admin */}
            <Route path="/admin" element={<ProtectedRoute role="admin"><Admin /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute role="admin"><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/home-content" element={<ProtectedRoute role="admin"><AdminHomeContent /></ProtectedRoute>} />
            <Route path="/admin/competitions/create" element={<ProtectedRoute role="admin"><AdminCompetitionManagement /></ProtectedRoute>} />
            <Route path="/admin/competitions/list" element={<ProtectedRoute role="admin"><AdminCompetitionList /></ProtectedRoute>} />
            <Route path="/admin/competitions/stats" element={<ProtectedRoute role="admin"><AdminCompetitionStats /></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
};

export default App;