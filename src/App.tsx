import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AppStep, NavigationTab, SchoolProfile, ToastMessage } from './types';
import { api, InitResponse } from './services/api';
import { SplashScreen } from './components/SplashScreen';
import { LoginView } from './components/LoginView';
import { RegistrationWindow } from './components/RegistrationWindow';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ToastContainer } from './components/Toast';
import { ministryNotifications } from './services/ministryNotifications';
import { login, signOut, bootstrapFromSession, touchDevice, getAccount } from './services/auth';

// Views
import { DashboardView } from './views/DashboardView';
import { StudentsView } from './views/StudentsView';
import { StaffView } from './views/StaffView';
import { DocumentsView } from './views/DocumentsView';
import { ArchiveView } from './views/ArchiveView';
import { MinistryDocsView } from './views/MinistryDocsView';
import { AdminFilesView } from './views/AdminFilesView';
import { BackupRestoreView } from './views/BackupRestoreView';
import { SettingsView } from './views/SettingsView';

export const App: React.FC = () => {
  const [appStep, setAppStep] = useState<AppStep>('splash');
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');

  const [initData, setInitData] = useState<InitResponse | null>(null);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile | null>(null);
  const [stats, setStats] = useState({
    studentsCount: 0,
    staffCount: 0,
    documentsCount: 0,
    ministryDocsCount: 0,
  });

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Keep the Ministry Drive notification poller alive while the app is open,
  // independent of which tab is active. (No state kept here to avoid re-renders.)
  useEffect(() => {
    if (appStep !== 'main') return;
    const unsubscribe = ministryNotifications.subscribe(() => {});
    return () => unsubscribe();
  }, [appStep]);

  // Lightweight device heartbeat while the app is open (updates last_seen_at).
  useEffect(() => {
    if (appStep !== 'main') return;
    touchDevice();
    const timer = setInterval(() => touchDevice(), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [appStep]);

  // Fetch / Refresh Stats and Data
  const refreshAppData = useCallback(async () => {
    try {
      const data = await api.init();
      setInitData(data);
      if (data.schoolProfile) {
        setSchoolProfile(data.schoolProfile);
      }
      if (data.stats) {
        setStats(data.stats);
      }
      return data;
    } catch (err) {
      console.error('Failed to initialize Edara app state:', err);
      showToast('خطأ في تحميل بيانات التطبيق الأساسية.', 'error');
      return null;
    }
  }, [showToast]);

  useEffect(() => {
    refreshAppData();
  }, [refreshAppData]);

  // Check for updates on launch, then re-check every 3 hours while running
  const UPDATE_CHECK_INTERVAL = 3 * 60 * 60 * 1000;
  const notifiedVersionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const runUpdateCheck = async () => {
      try {
        const status = await api.checkUpdates();
        if (
          !cancelled &&
          status.hasUpdate &&
          status.latestVersion &&
          !notifiedVersionsRef.current.has(status.latestVersion)
        ) {
          notifiedVersionsRef.current.add(status.latestVersion);
          showToast(
            `يتوفر إصدار جديد من Edara (v${status.latestVersion}). يمكنك تنزيله من الإعدادات > حول التطبيق.`,
            'info'
          );
        }
      } catch (err) {
        console.warn('Update check failed:', err);
      }
    };

    runUpdateCheck();
    const timer = setInterval(runUpdateCheck, UPDATE_CHECK_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [showToast]);

  // Merge the Supabase organization account city (governorate) into the local
  // school profile so documents auto-fill from the authoritative org account.
  const syncAccountCity = useCallback(async () => {
    try {
      const account = await getAccount();
      if (account?.city) {
        setSchoolProfile((prev) => (prev ? { ...prev, city: account.city ?? undefined } : prev));
      }
    } catch {
      /* best-effort; local profile city is the fallback */
    }
  }, []);

  // Resolve the next app step from the local registration state.
  const resolveStepFromRegistration = (registered?: boolean) => {
    setAppStep(registered ? 'main' : 'registration');
  };

  // Handle Splash Screen completion: verify session + device, then route.
  const handleSplashComplete = async () => {
    await refreshAppData();
    const res = await bootstrapFromSession();
    if (res.ok) {
      const data = await refreshAppData();
      resolveStepFromRegistration(data?.registered);
      await syncAccountCity();
      return;
    }
    if (res.error) showToast(res.error, 'error');
    setAppStep('login');
  };

  // Handle Login submission.
  const handleLogin = async (email: string, password: string) => {
    const res = await login(email, password);
    if (res.ok) {
      const data = await refreshAppData();
      resolveStepFromRegistration(data?.registered);
      await syncAccountCity();
    }
    return res;
  };

  // Handle Logout: end the Supabase session; the device stays registered.
  const handleLogout = async () => {
    await signOut();
    setSchoolProfile(null);
    setAppStep('login');
    showToast('تم تسجيل الخروج بنجاح.', 'info');
  };

  // Handle Registration Success
  const handleRegistrationSuccess = (profile: SchoolProfile) => {
    setSchoolProfile(profile);
    showToast('تم تسجيل بيانات المؤسسة بنجاح!', 'success');
    refreshAppData();
    setAppStep('main');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans dir-rtl antialiased flex flex-col overflow-hidden">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* 1. Splash Screen */}
      {appStep === 'splash' && <SplashScreen onComplete={handleSplashComplete} />}

      {/* 2. Login */}
      {appStep === 'login' && (
        <LoginView onLogin={handleLogin} />
      )}

      {/* 3. Registration Window */}
      {appStep === 'registration' && (
        <RegistrationWindow onRegistered={handleRegistrationSuccess} />
      )}

      {/* 4. Main Application Shell */}
      {appStep === 'main' && (
        <div className="flex h-screen w-screen overflow-hidden bg-slate-100">
          {/* Right Sidebar for RTL */}
          <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
            {/* Header */}
            <Header schoolProfile={schoolProfile} onLogout={handleLogout} />

            {/* Page View Container */}
            <main className="flex-1 p-6 overflow-y-auto min-w-0">
              <div className="max-w-7xl mx-auto h-full">
                {currentTab === 'dashboard' && (
                  <DashboardView
                    schoolProfile={schoolProfile}
                    stats={stats}
                    onNavigate={setCurrentTab}
                  />
                )}

                {currentTab === 'students' && (
                  <StudentsView
                    schoolProfile={schoolProfile}
                    onRefreshStats={refreshAppData}
                    showToast={showToast}
                  />
                )}

                {currentTab === 'staff' && (
                  <StaffView
                    onRefreshStats={refreshAppData}
                    showToast={showToast}
                  />
                )}

                {currentTab === 'documents' && (
                  <DocumentsView
                    onRefreshStats={refreshAppData}
                    showToast={showToast}
                  />
                )}

                {currentTab === 'archive' && (
                  <ArchiveView
                    showToast={showToast}
                    onRefreshStats={refreshAppData}
                  />
                )}

                {currentTab === 'ministry' && (
                  <MinistryDocsView
                    onRefreshStats={refreshAppData}
                    showToast={showToast}
                  />
                )}

                {currentTab === 'admin' && (
                  <AdminFilesView
                    onRefreshStats={refreshAppData}
                    showToast={showToast}
                  />
                )}

                {currentTab === 'backup' && (
                  <BackupRestoreView
                    onDataReloaded={refreshAppData}
                    showToast={showToast}
                  />
                )}

                {currentTab === 'settings' && (
                <SettingsView
                  schoolProfile={schoolProfile}
                  onProfileUpdated={(updated) => {
                    setSchoolProfile(updated);
                    refreshAppData();
                  }}
                  showToast={showToast}
                />
                )}
              </div>
            </main>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
