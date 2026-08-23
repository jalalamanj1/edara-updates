import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AppStep, NavigationTab, SchoolProfile, ToastMessage } from './types';
import { api, InitResponse } from './services/api';
import { SplashScreen } from './components/SplashScreen';
import { LoginView } from './components/LoginView';
import { RegistrationWindow } from './components/RegistrationWindow';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ToastContainer } from './components/Toast';
import { mailSync } from './services/mailSync';
import { login, signOut, bootstrapFromSession, touchDevice, getAccount } from './services/auth';

// Views
import { DashboardView } from './views/DashboardView';
import { StudentsView } from './views/StudentsView';
import { StaffView } from './views/StaffView';
import { DocumentsView } from './views/DocumentsView';
import { ArchiveView } from './views/ArchiveView';
import { AdminFilesView } from './views/AdminFilesView';
import { GovernorateDriveView } from './views/GovernorateDriveView';
import { BackupRestoreView } from './views/BackupRestoreView';
import { SettingsView } from './views/SettingsView';
import { MailView } from './views/MailView';
import { CorrespondenceView } from './views/CorrespondenceView';
import { preloadGovernorateDrive, clearGovernorateDriveCache } from './views/GovernorateDriveView';

export const App: React.FC = () => {
  const [appStep, setAppStep] = useState<AppStep>('splash');
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');

  // Navigation handler that supports params (e.g., contactId for mail)
  const handleNavigate = useCallback((tab: NavigationTab, params?: Record<string, string>) => {
    if (tab === 'mail' && params) {
      setMailParams(params);
    }
    setCurrentTab(tab);
  }, []);

  const [initData, setInitData] = useState<InitResponse | null>(null);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile | null>(null);
  const [stats, setStats] = useState({
    studentsCount: 0,
    staffCount: 0,
    documentsCount: 0,
  });

  // Mail navigation params (contactId or messageId from dashboard/notification)
  const [mailParams, setMailParams] = useState<Record<string, string> | null>(null);

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

  // Mail Sync Lifecycle: start polling on login, stop on logout.
  useEffect(() => {
    if (appStep !== 'main') {
      mailSync.stop();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const account = await getAccount();
        if (!cancelled && account?.id) {
          mailSync.start(account.id);
        }
      } catch {
        // ignore — mail sync won't start, user can still use the app
      }
    })();
    return () => {
      cancelled = true;
      mailSync.stop();
    };
  }, [appStep]);

  // Focus-based immediate sync: when the window regains focus, trigger a sync.
  useEffect(() => {
    if (appStep !== 'main') return;
    const handleFocus = () => mailSync.focusSync();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [appStep]);

  // Preload Governorate Drive data in background after entering main app.
  // Does NOT block startup — fires async and silently caches results.
  useEffect(() => {
    if (appStep === 'main') {
      preloadGovernorateDrive();
    }
  }, [appStep]);

  // Notification click handler: navigate to mail and open the specific message.
  useEffect(() => {
    const bridge = (window as any).edaraDesktop;
    if (!bridge?.onNotificationClick) return;
    const handler = (data: { messageId?: string }) => {
      if (data?.messageId) {
        setMailParams({ messageId: data.messageId });
        setCurrentTab('mail');
        // Focus the window if it's in the background
        if (bridge.focusWindow) bridge.focusWindow();
      }
    };
    bridge.onNotificationClick(handler);
    return () => {
      if (bridge.offNotificationClick) bridge.offNotificationClick(handler);
    };
  }, []);

  // Lightweight device heartbeat while the app is open (updates last_seen_at).
  useEffect(() => {
    if (appStep !== 'main') return;
    touchDevice();
    const timer = setInterval(() => touchDevice(), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [appStep]);

  // Fetch / Refresh Stats and Data
  const refreshAppData = useCallback(async (prefetchedData?: InitResponse | null) => {
    try {
      const data = prefetchedData !== undefined ? prefetchedData : await api.init();
      if (!data) return null;
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

  // Sync the Supabase account identity into the local school_profile.
  //
  // This is the SINGLE SOURCE OF TRUTH for school identity. The authenticated
  // edara_accounts record determines:
  //   - schoolName  ← organization_name
  //   - city        ← city
  //   - email       ← email
  //
  // If a local school_profile exists, it is OVERWRITTEN with the account data.
  // If no local school_profile exists, one is CREATED from the account data.
  //
  // This runs on EVERY login and splash restore, so the school identity always
  // matches the authenticated Supabase account. Demo/mock/hardcoded data is
  // never used as a fallback.
  const syncAccountToProfile = useCallback(async (): Promise<{ profile: SchoolProfile | null; initData: InitResponse | null }> => {
    try {
      const account = await getAccount();
      if (!account) return { profile: null, initData: null };

      // Get the current local profile (may be stale, demo, or empty)
      const initData = await api.init();
      const current = initData.schoolProfile;

      // Merge: Supabase account is AUTHORITATIVE for all official organization fields.
      // Local SQLite only provides user-specific app settings (academicYear, etc.).
      const merged: SchoolProfile = {
        id: current?.id || account.id,
        fullName: current?.fullName || account.organization_name || '',
        schoolName: account.organization_name || current?.schoolName || '',
        schoolType: current?.schoolType,
        city: account.city ?? current?.city,
        governorate: account.governorate ?? current?.governorate,
        principalTitle: account.job_title ?? current?.principalTitle,
        email: account.email ?? current?.email,
        // Official fields: Supabase is authoritative, fallback to local SQLite
        phone: account.phone ?? current?.phone ?? '',
        address: account.address ?? current?.address ?? '',
        principalName: account.principal_name ?? current?.principalName ?? '',
        academicYear: current?.academicYear || '',
        registeredAt: current?.registeredAt || account.created_at || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Persist to local SQLite via the registration endpoint (upsert)
      await api.register({
        fullName: merged.fullName,
        schoolName: merged.schoolName,
        schoolType: merged.schoolType,
        email: merged.email || undefined,
        phone: merged.phone,
        address: merged.address,
        principalName: merged.principalName,
        academicYear: merged.academicYear,
        city: merged.city || undefined,
      });

      return { profile: merged, initData };
    } catch (err) {
      console.error('[App] syncAccountToProfile failed:', err);
      return { profile: null, initData: null };
    }
  }, []);

  // Resolve the next app step from the local registration state.
  const resolveStepFromRegistration = (registered?: boolean) => {
    setAppStep(registered ? 'main' : 'registration');
  };

  // Handle Splash Screen completion: verify session + device, then route.
  const handleSplashComplete = async () => {
    const res = await bootstrapFromSession();
    if (res.ok) {
      // Sync account identity FIRST (writes to local SQLite),
      // THEN refresh from the (now-correct) local data.
      // syncAccountToProfile internally calls api.init(), so we reuse that
      // result instead of calling api.init() a second time via refreshAppData.
      const { initData } = await syncAccountToProfile();
      const data = await refreshAppData(initData);
      resolveStepFromRegistration(data?.registered);
      return;
    }
    if (res.error) showToast(res.error, 'error');
    setAppStep('login');
  };

  // Handle Login submission.
  const handleLogin = async (email: string, password: string) => {
    const res = await login(email, password);
    if (res.ok) {
      // Sync account identity FIRST (writes to local SQLite),
      // THEN refresh from the (now-correct) local data.
      const { initData } = await syncAccountToProfile();
      const data = await refreshAppData(initData);
      resolveStepFromRegistration(data?.registered);
    }
    return res;
  };

  // Handle Logout: end the Supabase session; the device stays registered.
  const handleLogout = async () => {
    await signOut();
    setSchoolProfile(null);
    clearGovernorateDriveCache();
    // Clear all account-specific localStorage caches
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('edara_desktop_mail_inbox_') || k.startsWith('edara_desktop_mail_notified_'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
    setAppStep('login');
    showToast('تم تسجيل الخروج بنجاح.', 'info');
  };

  const handleProfileUpdated = useCallback((updated: SchoolProfile) => {
    setSchoolProfile(updated);
    refreshAppData();
  }, [refreshAppData]);
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
                    onNavigate={handleNavigate}
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
                    schoolProfile={schoolProfile}
                  />
                )}

                {currentTab === 'archive' && (
                  <ArchiveView
                    showToast={showToast}
                    onRefreshStats={refreshAppData}
                  />
                )}

                {currentTab === 'admin' && (
                  <AdminFilesView
                    onRefreshStats={refreshAppData}
                    showToast={showToast}
                  />
                )}

                {currentTab === 'governorate_drive' && (
                  <GovernorateDriveView
                    onRefreshStats={refreshAppData}
                    showToast={showToast}
                  />
                )}

                {currentTab === 'mail' && (
                  <MailView schoolProfile={schoolProfile} mailParams={mailParams} onMailParamsConsumed={() => setMailParams(null)} />
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
                  onProfileUpdated={handleProfileUpdated}
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
