import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { AuthProvider } from './context/AuthContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Ouvreur from './pages/Ouvreur';
import Client from './pages/Client';
import Moniteur from './pages/Moniteur';
import Admin from './pages/Admin';
import AdminUsers from './pages/AdminUsers';
import AdminHomeContent from './pages/AdminHomeContent';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';

const theme = createTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <AuthProvider>
          <Navbar />
          <Routes>
            {/* Page d'accueil */}
            <Route path="/" element={<Home />} />

            {/* Authentification */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Pages protégées par rôle */}
            <Route path="/client" element={<ProtectedRoute role="client"><Client /></ProtectedRoute>} />
            <Route path="/ouvreur" element={<ProtectedRoute role="ouvreur"><Ouvreur /></ProtectedRoute>} />
            <Route path="/moniteur" element={<ProtectedRoute role="moniteur"><Moniteur /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute role="admin"><Admin /></ProtectedRoute>} />

            {/* Pages admin spécifiques */}
            <Route path="/admin/users" element={<ProtectedRoute role="admin"><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/home-content" element={<ProtectedRoute role="admin"><AdminHomeContent /></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);