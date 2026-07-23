import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

// Pages publiques
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));

// Pages Client
const Client = lazy(() => import('./pages/Client'));
const ClientScreen = lazy(() => import('./pages/Client/ClientScreen'));
const ClientDaily = lazy(() => import('./pages/Client/Daily/ClientDaily'));
const ClientCompetitions = lazy(() => import('./pages/Client/Competitions/ClientCompetitions'));
const ClientCompetitionStats = lazy(() => import('./pages/Client/Competitions/ClientCompetitionStats'));
const ClientCourses = lazy(() => import('./pages/Client/Courses/ClientCourses'));
const ClientCourseSession = lazy(() => import('./pages/Client/Courses/ClientCourseSession'));
const ClientProfile = lazy(() => import('./pages/Client/Profile/ClientProfile'));
const ClientStats = lazy(() => import('./pages/Client/Stats/ClientStats'));
const ClientMessages = lazy(() => import('./pages/Client/Messages/ClientMessages'));
const ClientClassement = lazy(() => import('./pages/Client/Classement/ClientClassement'));
const ClientFriends = lazy(() => import('./pages/Client/Friends/ClientFriends'));
const ClientHelp = lazy(() => import('./pages/Client/Help/ClientHelp'));

// Pages Ouvreur
const OuvreurScreen = lazy(() => import('./pages/Ouvreur/OuvreurScreen'));
const DailyBouldersList = lazy(() => import('./pages/Ouvreur/DailyBoulders/DailyBouldersList'));
const DailyBoulderForm = lazy(() => import('./pages/Ouvreur/DailyBoulders/DailyBoulderForm'));
const CompetitionBouldersList = lazy(() => import('./pages/Ouvreur/CompetitionBoulders/CompetitionBouldersList'));
const CompetitionBoulderForm = lazy(() => import('./pages/Ouvreur/CompetitionBoulders/CompetitionBoulderForm'));
const ReportsAndStats = lazy(() => import('./pages/Ouvreur/ReportsAndStats/ReportsAndStats'));
const BoulderStats = lazy(() => import('./pages/Ouvreur/ReportsAndStats/BoulderStats'));
const CompetitionBoulderStats = lazy(() => import('./pages/Ouvreur/ReportsAndStats/CompetitionBoulderStats'));

// Pages Moniteur
const MoniteurScreen = lazy(() => import('./pages/Moniteur/MoniteurScreen'));
const GroupsList = lazy(() => import('./pages/Moniteur/Groups/GroupsList'));
const GroupForm = lazy(() => import('./pages/Moniteur/Groups/GroupForm'));
const CoursesList = lazy(() => import('./pages/Moniteur/Courses/CoursesList'));
const CourseForm = lazy(() => import('./pages/Moniteur/Courses/CourseForm'));
const CourseDetail = lazy(() => import('./pages/Moniteur/Courses/CourseDetail'));
const ExercisesList = lazy(() => import('./pages/Moniteur/Exercises/ExercisesList'));
const ExerciseForm = lazy(() => import('./pages/Moniteur/Exercises/ExerciseForm'));
const StatsList = lazy(() => import('./pages/Moniteur/Stats/StatsList'));
const MessagesList = lazy(() => import('./pages/Moniteur/Messages/MessagesList'));

// Pages Admin
const Admin = lazy(() => import('./pages/Admin'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminHomeContent = lazy(() => import('./pages/AdminHomeContent'));
const AdminCompetitionManagement = lazy(() => import('./pages/AdminCompetitionManagement'));
const AdminCompetitionList = lazy(() => import('./pages/AdminCompetitionList'));
const AdminCompetitionRegistration = lazy(() => import('./pages/AdminCompetitionRegistration'));
const AdminCompetitionStats = lazy(() => import('./pages/AdminCompetitionStats'));
const AdminAnnouncements = lazy(() => import('./pages/AdminAnnouncements'));

export default function AppRoutes() {
  return (
    <Suspense fallback={<div>Chargement...</div>}>
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
        <Route path="/client/messages" element={<ProtectedRoute role="client"><ClientMessages /></ProtectedRoute>} />
        <Route path="/client/classement" element={<ProtectedRoute role="client"><ClientClassement /></ProtectedRoute>} />
        {/* ✅ Accessible au staff aussi : tout compte porte le rôle "client" en plus de
            ses éventuels autres rôles (voir AdminUsers.tsx + firestore.rules). */}
        <Route path="/client/friends" element={<ProtectedRoute role="client"><ClientFriends /></ProtectedRoute>} />
        <Route path="/client/aide" element={<ProtectedRoute role="client"><ClientHelp /></ProtectedRoute>} />

        {/* ========== ROUTES OUVREUR ========== */}
        <Route path="/ouvreur" element={<ProtectedRoute role="ouvreur"><OuvreurScreen /></ProtectedRoute>} />
        <Route path="/ouvreur/daily-boulders" element={<ProtectedRoute role="ouvreur"><DailyBouldersList /></ProtectedRoute>} />
        <Route path="/ouvreur/daily-boulders/:wall" element={<ProtectedRoute role="ouvreur"><DailyBoulderForm /></ProtectedRoute>} />
        <Route path="/ouvreur/competition-boulders" element={<ProtectedRoute role="ouvreur"><CompetitionBouldersList /></ProtectedRoute>} />
        <Route path="/ouvreur/competition-boulders/:competitionId/add" element={<ProtectedRoute role="ouvreur"><CompetitionBoulderForm /></ProtectedRoute>} />
        <Route path="/ouvreur/competition-boulders/:competitionId/edit/:boulderId" element={<ProtectedRoute role="ouvreur"><CompetitionBoulderForm /></ProtectedRoute>} />
        <Route path="/ouvreur/reports-and-stats" element={<ProtectedRoute role="ouvreur"><ReportsAndStats /></ProtectedRoute>} />
        <Route path="/ouvreur/reports-and-stats/boulders/:wall" element={<ProtectedRoute role="ouvreur"><BoulderStats /></ProtectedRoute>} />
        <Route path="/ouvreur/reports-and-stats/competitions" element={<ProtectedRoute role="ouvreur"><CompetitionBoulderStats /></ProtectedRoute>} />

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
        <Route path="/admin/announcements" element={<ProtectedRoute role="admin"><AdminAnnouncements /></ProtectedRoute>} />
      </Routes>
    </Suspense>
  );
}
