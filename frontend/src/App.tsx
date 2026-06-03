import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { AuthProvider } from './context/AuthContext';

// Pages publiques
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';

// Pages protégées
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Client from './pages/Client';
import Ouvreur from './pages/Ouvreur';
import OuvreurScreen from './pages/Ouvreur/OuvreurScreen';
import MoniteurScreen from './pages/Moniteur/MoniteurScreen';
import Admin from './pages/Admin';
import AdminUsers from './pages/AdminUsers';
import AdminHomeContent from './pages/AdminHomeContent';
import AdminCompetitionManagement from './pages/AdminCompetitionManagement';
import AdminCompetitionList from './pages/AdminCompetitionList';
import AdminCompetitionStats from './pages/AdminCompetitionStats';

// Pages Moniteur
import GroupsList from './pages/Moniteur/Groups/GroupsList';
import GroupForm from './pages/Moniteur/Groups/GroupForm';

const theme = createTheme();

const App: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <Router basename="/blocabrac-pwa"> {/* ✅ Ajout du basename pour GitHub Pages */}
        <AuthProvider>
          <Navbar />
          <Routes>
            {/* Routes publiques */}
            <Route path="/" element={<Home />} />

            {/* Routes protégées */}
            <Route
              path="/client"
              element={
                <ProtectedRoute allowedRoles={['client']}>
                  <Client />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ouvreur"
              element={
                <ProtectedRoute allowedRoles={['ouvreur']}>
                  <OuvreurScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/moniteur"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <MoniteurScreen />
                </ProtectedRoute>
              }
            />
            {/* Routes Moniteur - Gestion des groupes */}
            <Route
              path="/moniteur/groups"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <GroupsList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/moniteur/groups/new"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <GroupForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/moniteur/groups/edit/:groupId"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <GroupForm />
                </ProtectedRoute>
              }
            />

            {/* Routes Admin */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminUsers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/home-content"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminHomeContent />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/competitions/create"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminCompetitionManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/competitions/list"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminCompetitionList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/competitions/stats"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminCompetitionStats />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
};

export default App;