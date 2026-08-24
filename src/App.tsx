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
import { startDrivePolling, stopDrivePolling, resetDriveBaseline } from './services/drivePoller';
import { startNewsPolling, stopNewsPolling, resetNewsBaseline } from './services/newsPoller';

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

  // Auto-update state
  const [updateModal, setUpdateModal] = useState<{
    version: string;
    notes: string | null;
    downloadUrl: string;
  } | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

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

  // Notification click handler: navigate based on notification type
  useEffect(() => {
    const bridge = (window as any).edaraDesktop;

    // Listen for unified notification clicks from notificationService
    const handleUnifiedClick = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      if (detail.type === 'drive') {
        setCurrentTab('governorate_drive');
        if (bridge?.focusWindow) bridge.focusWindow();
      } else if (detail.type === 'news') {
        setCurrentTab('dashboard');
        if (bridge?.focusWindow) bridge.focusWindow();
      } else if (detail.type === 'mail' && detail.target) {
        setMailParams({ messageId: detail.target });
        setCurrentTab('mail');
        if (bridge?.focusWindow) bridge.focusWindow();
      }
    };
    window.addEventListener('edara-notification-click', handleUnifiedClick);

    // Also handle legacy Electron IPC notification-click (for mail)
    if (bridge?.onNotificationClick) {
      const handler = (data: { messageId?: string }) => {
        if (data?.messageId) {
          // Try to parse as JSON payload first (unified format)
          try {
            const payload = JSON.parse(data.messageId);
            if (payload.type === 'drive') {
              setCurrentTab('governorate_drive');
            } else if (payload.type === 'news') {
              setCurrentTab('dashboard');
            } else if (payload.type === 'mail' && payload.target) {
              setMailParams({ messageId: payload.target });
              setCurrentTab('mail');
            }
          } catch {
            // Legacy format — treat as mail messageId
            setMailParams({ messageId: data.messageId });
            setCurrentTab('mail');
          }
          if (bridge?.focusWindow) bridge.focusWindow();
        }
      };
      bridge.onNotificationClick(handler);
      return () => {
        window.removeEventListener('edara-notification-click', handleUnifiedClick);
        if (bridge.offNotificationClick) bridge.offNotificationClick(handler);
      };
    }

    return () => {
      window.removeEventListener('edara-notification-click', handleUnifiedClick);
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
          status.downloadUrl &&
          !notifiedVersionsRef.current.has(status.latestVersion)
        ) {
          notifiedVersionsRef.current.add(status.latestVersion);
          setUpdateModal({
            version: status.latestVersion,
            notes: status.releaseNotes || null,
            downloadUrl: status.downloadUrl,
          });
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
  }, []);

  // Listen for download progress from Electron main process
  useEffect(() => {
    const bridge = (window as any).edaraDesktop;
    if (!bridge?.onUpdateDownloadProgress) return;

    const handler = (data: { progress: number }) => {
      setDownloadProgress(data.progress);
    };
    bridge.onUpdateDownloadProgress(handler);
    return () => {
      if (bridge?.offUpdateDownloadProgress) bridge.offUpdateDownloadProgress(handler);
    };
  }, []);

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
    stopDrivePolling();
    stopNewsPolling();
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

  // ─── Auto-update: download, install, restart ─────────────────────────────
  const handleDownloadAndInstall = useCallback(async (url: string) => {
    setUpdateModal(null);
    setDownloadProgress(0);
    try {
      const result = await api.downloadUpdate(url);
      if (result.canceled) {
        setDownloadProgress(null);
        return;
      }
      if (!result.success || !result.filePath) {
        setDownloadProgress(null);
        showToast(result.error || 'فشل تنزيل التحديث.', 'error');
        return;
      }
      // Download complete — install
      setDownloadProgress(null);
      setIsInstalling(true);
      const installResult = await api.installUpdate(result.filePath);
      if (!installResult.success) {
        setIsInstalling(false);
        showToast(installResult.error || 'فشل تثبيت التحديث.', 'error');
      }
      // If success, the app is quitting — no need to update state
    } catch (err) {
      setDownloadProgress(null);
      setIsInstalling(false);
      showToast('حدث خطأ أثناء التحديث.', 'error');
    }
  }, [showToast]);

  // ─── Start/stop pollers based on app step ────────────────────────────────
  useEffect(() => {
    if (appStep === 'main') {
      getAccount().then((acct) => {
        if (acct?.id) {
          resetDriveBaseline(acct.id);
          resetNewsBaseline(acct.id);
        }
      });
      startDrivePolling();
      startNewsPolling();
    } else {
      stopDrivePolling();
      stopNewsPolling();
    }
  }, [appStep]);

  // Reset drive baseline on logout (account switch)
  useEffect(() => {
    if (appStep === 'login') {
      resetDriveBaseline('');
      resetNewsBaseline('');
    }
  }, [appStep]);

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
                  onInstallUpdate={(url) => setUpdateModal({ version: '', notes: null, downloadUrl: url })}
                />
                )}
              </div>
            </main>
          </div>
        </div>
      )}

      {/* ─── Auto-Update: Confirm Modal ─────────────────────────────────── */}
      {updateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-blue-600 text-white flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-sm">U</div>
              <h3 className="text-lg font-bold">تحديث جديد متاح</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-700 font-bold text-sm">
                يتوفر إصدار جديد من Edara <span className="text-blue-600">v{updateModal.version}</span>.
                هل تريد التنزيل والتثبيت الآن؟
              </p>
              {updateModal.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {updateModal.notes}
                </div>
              )}
              <p className="text-xs text-slate-400 font-medium">
                سيتم تنزيل المثبّت ثم تثبيت التحديث وإعادة تشغيل التطبيق تلقائياً.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setUpdateModal(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                لاحقاً
              </button>
              <button
                onClick={() => handleDownloadAndInstall(updateModal.downloadUrl)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                تنزيل وتثبيت
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Auto-Update: Download Progress Overlay ──────────────────────── */}
      {(downloadProgress !== null || isInstalling) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full border border-slate-200 p-8 text-center">
            {isInstalling ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
                <h3 className="text-lg font-black text-slate-900 mb-2">جاري تثبيت التحديث...</h3>
                <p className="text-sm text-slate-500">سيتم إعادة تشغيل التطبيق تلقائياً بعد الانتهاء.</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-2xl font-black text-blue-600">{downloadProgress}%</span>
                </div>
                <h3 className="text-lg font-black text-slate-900 mb-2">جاري تنزيل التحديث...</h3>
                <div className="w-full bg-slate-200 rounded-full h-2.5 mt-3">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
