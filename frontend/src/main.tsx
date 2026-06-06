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

// Pages Moniteur
import MoniteurScreen from './pages/Moniteur/MoniteurScreen';
import GroupsList from './pages/Moniteur/Groups/GroupsList';
import GroupForm from './pages/Moniteur/Groups/GroupForm';
import CoursesList from './pages/Moniteur/Courses/CoursesList';
import CourseForm from './pages/Moniteur/Courses/CourseForm';
import CourseDetail from './pages/Moniteur/Courses/CourseDetail';
import ExercisesList from './pages/Moniteur/Exercises/ExercisesList';
import ExerciseForm from './pages/Moniteur/Exercises/ExerciseForm';
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
import Client from './pages/Client';

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
            <Route
              path="/client"
              element={
                <ProtectedRoute allowedRoles={['client']}>
                  <Client />
                </ProtectedRoute>
              }
            />

            {/* ========== ROUTES OUVREUR ========== */}
            <Route
              path="/ouvreur"
              element={
                <ProtectedRoute allowedRoles={['ouvreur']}>
                  <OuvreurScreen />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ouvreur/daily-boulders"
              element={
                <ProtectedRoute allowedRoles={['ouvreur']}>
                  <DailyBouldersList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ouvreur/daily-boulders/:wall"
              element={
                <ProtectedRoute allowedRoles={['ouvreur']}>
                  <DailyBoulderForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ouvreur/competition-boulders"
              element={
                <ProtectedRoute allowedRoles={['ouvreur']}>
                  <CompetitionBouldersList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ouvreur/competition-boulders/:competitionId/add"
              element={
                <ProtectedRoute allowedRoles={['ouvreur']}>
                  <CompetitionBoulderForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ouvreur/competition-boulders/:competitionId/edit/:boulderId"
              element={
                <ProtectedRoute allowedRoles={['ouvreur']}>
                  <CompetitionBoulderForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ouvreur/reports-and-stats"
              element={
                <ProtectedRoute allowedRoles={['ouvreur']}>
                  <ReportsAndStats />
                </ProtectedRoute>
              }
            />

            {/* ========== ROUTES MONITEUR ========== */}
            <Route
              path="/moniteur"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <MoniteurScreen />
                </ProtectedRoute>
              }
            />
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
            {/* ✅ NOUVELLES ROUTES POUR SÉANCES, EXERCICES, MESSAGES */}
            <Route
              path="/moniteur/courses"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <CoursesList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/moniteur/courses/new"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <CourseForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/moniteur/courses/edit/:courseId"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <CourseForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/moniteur/courses/:courseId"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <CourseDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/moniteur/exercises"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <ExercisesList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/moniteur/exercises/new"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <ExerciseForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/moniteur/exercises/edit/:exerciseId"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <ExerciseForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/moniteur/messages"
              element={
                <ProtectedRoute allowedRoles={['moniteur']}>
                  <MessagesList />
                </ProtectedRoute>
              }
            />

            {/* ========== ROUTES ADMIN ========== */}
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
              path="/admin/competitions/register"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminCompetitionRegistration />
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
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);