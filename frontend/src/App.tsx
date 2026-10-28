import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/guards';
import { AdminPage } from './pages/AdminPage';
import { AttemptDetailPage } from './pages/AttemptDetailPage';
import { ClassDetailPage } from './pages/ClassDetailPage';
import { CoursePage } from './pages/CoursePage';
import { HomePage } from './pages/HomePage';
import { LearnPage } from './pages/LearnPage';
import { LessonPage } from './pages/LessonPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProgressPage } from './pages/ProgressPage';
import { QuizPage } from './pages/QuizPage';
import { RegisterPage } from './pages/RegisterPage';
import { SkillsPage } from './pages/SkillsPage';
import { TeachPage } from './pages/TeachPage';
import { TutorHistoryPage } from './pages/TutorHistoryPage';
import { WorksheetDetailPage } from './pages/WorksheetDetailPage';
import { WorksheetsPage } from './pages/WorksheetsPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="learn" element={<LearnPage />} />
          <Route path="learn/:id" element={<LessonPage />} />
          <Route
            path="quiz/:id"
            element={
              <RequireAuth>
                <QuizPage />
              </RequireAuth>
            }
          />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="skills/:id" element={<CoursePage />} />
          <Route
            path="tutor"
            element={
              <RequireAuth>
                <TutorHistoryPage />
              </RequireAuth>
            }
          />
          <Route
            path="progress"
            element={
              <RequireAuth>
                <ProgressPage />
              </RequireAuth>
            }
          />
          <Route
            path="history/:id"
            element={
              <RequireAuth>
                <AttemptDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="teach"
            element={
              <RequireAuth roles={['TEACHER', 'ADMIN']}>
                <TeachPage />
              </RequireAuth>
            }
          />
          <Route
            path="teach/classes/:id"
            element={
              <RequireAuth roles={['TEACHER', 'ADMIN']}>
                <ClassDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="worksheets"
            element={
              <RequireAuth roles={['TEACHER', 'ADMIN']}>
                <WorksheetsPage />
              </RequireAuth>
            }
          />
          <Route
            path="worksheets/:id"
            element={
              <RequireAuth roles={['TEACHER', 'ADMIN']}>
                <WorksheetDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="admin"
            element={
              <RequireAuth roles={['ADMIN']}>
                <AdminPage />
              </RequireAuth>
            }
          />
          <Route
            path="profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
