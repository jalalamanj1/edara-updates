import React, { useState, useEffect } from 'react';
import { SchoolProfile } from '../types';
import { api, UpdateStatus } from '../services/api';
import { normalizeDigits } from '../utils/numberUtils';
import { cloudBackupApi, CloudProviderType } from '../services/cloudBackup';
import {
  Settings,
  HardDrive,
  Database,
  FolderOpen,
  Info,
  Save,
  Loader2,
  Phone,
  Calendar,
  UserCheck,
  Cloud,
  CheckCircle2,
  Unplug,
  LogIn,
  Edit3,
  Download,
  RefreshCw,
  ExternalLink,
  X,
  Palette,
  Sun,
  Moon,
  Monitor,
  MapPin,
} from 'lucide-react';

import { getTheme, setTheme, type ThemeMode } from '../services/theme';


interface SettingsViewProps {
  schoolProfile: SchoolProfile | null;
  onProfileUpdated: (updated: SchoolProfile) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onInstallUpdate?: (downloadUrl: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  schoolProfile,
  onProfileUpdated,
  showToast,
  onInstallUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<'editable' | 'backup_accounts' | 'storage' | 'about' | 'appearance'>('editable');

  // Theme (Appearance) state
  const [theme, setThemeState] = useState<ThemeMode>(getTheme());
  const handleThemeChange = (mode: ThemeMode) => {
    setTheme(mode);
    setThemeState(mode);
    showToast('تم حفظ المظهر المفضل.', 'success');
  };

  // Data directory (archiving folder) state
  const [dataDir, setDataDir] = useState('');
  const [isChangingDir, setIsChangingDir] = useState(false);

  useEffect(() => {
    api
      .getDataDir()
      .then((res) => {
        if (res && res.success) setDataDir(res.dataDir);
      })
      .catch(() => {});
  }, []);

  const handleChangeDataDir = async () => {
    try {
      const selected = api.selectDirectory();
      if (!selected) return;
      setIsChangingDir(true);
      const res = await api.setDataDir(selected);
      if (res.success) {
        setDataDir(res.dataDir);
        showToast('تم حفظ مجلد الأرشفة. أعد تشغيل التطبيق لتطبيق التغييرات.', 'success');
      } else {
        showToast(res.message || 'فشل تغيير مجلد الأرشفة.', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || 'تعذر تغيير مجلد الأرشفة.', 'error');
    } finally {
      setIsChangingDir(false);
    }
  };

  // Academic years
  const currentYear = new Date().getFullYear();
  const academicYears = Array.from({ length: 6 }, (_, i) => {
    const start = currentYear - 1 + i;
    return `${start}–${start + 1}`;
  });

  // Editable fields state
  const [principalName, setPrincipalName] = useState(schoolProfile?.principalName || '');
  const PRINCIPAL_TITLES = ['مدير المدرسة', 'مديرة المدرسة'];
  const [principalTitle, setPrincipalTitle] = useState(
    PRINCIPAL_TITLES.includes(schoolProfile?.principalTitle || '')
      ? schoolProfile!.principalTitle!
      : PRINCIPAL_TITLES[0]
  );
  const [phone, setPhone] = useState(schoolProfile?.phone || '');
  const [address, setAddress] = useState(schoolProfile?.address || '');
  const [academicYear, setAcademicYear] = useState(schoolProfile?.academicYear || `${currentYear}–${currentYear + 1}`);
  const [isSaving, setIsSaving] = useState(false);

  // Cloud Backup Accounts state
  const [googleAccount, setGoogleAccount] = useState<{ email: string; status: string } | null>(null);
  const [microsoftAccount, setMicrosoftAccount] = useState<{ email: string; status: string } | null>(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  // Device-code connect flow state
  const [connectModal, setConnectModal] = useState<{
    provider: CloudProviderType;
    userCode: string;
    verificationUrl: string;
    authUrl?: string;
    interval: number;
  } | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Update checking state
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  // Update checking state

  const fetchUpdateStatus = async () => {
    try {
      const res = await api.getUpdateStatus();
      if (res) setUpdateStatus(res);
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    fetchUpdateStatus();
  }, []);

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    try {
      const res = await api.checkUpdates();
      if (res) setUpdateStatus(res);
      if (res.hasUpdate) {
        showToast(`يوجد إصدار جديد: v${res.latestVersion}`, 'info');
      } else {
        showToast('أنت على أحدث إصدار.', 'success');
      }
    } catch (err) {
      showToast('تعذر التحقق من التحديثات.', 'error');
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  useEffect(() => {
    if (schoolProfile) {
      setPrincipalName(schoolProfile.principalName || '');
      setPrincipalTitle(
        PRINCIPAL_TITLES.includes(schoolProfile.principalTitle || '')
          ? schoolProfile.principalTitle!
          : PRINCIPAL_TITLES[0]
      );
      setPhone(schoolProfile.phone || '');
      setAddress(schoolProfile.address || '');
      setAcademicYear(schoolProfile.academicYear || `${currentYear}–${currentYear + 1}`);
    }
  }, [schoolProfile]);

  const fetchBackupAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const res = await api.getBackupAccounts();
      if (res.success) {
        setGoogleAccount(res.googleAccount);
        setMicrosoftAccount(res.microsoftAccount);
      }
    } catch (err) {
      // ignore
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  useEffect(() => {
    fetchBackupAccounts();
  }, []);

  const handleConnectAccount = async (provider: CloudProviderType) => {
    try {
      const info = await cloudBackupApi.startConnect(provider);
      if (!info.success) {
        showToast(info.message || 'فشل بدء تسجيل الدخول.', 'error');
        return;
      }
      setConnectModal({
        provider,
        userCode: info.userCode || '',
        verificationUrl: info.verificationUrl || '',
        authUrl: info.authUrl,
        interval: info.interval || 5,
      });
      if (info.authUrl) {
        api.openExternalUrl(info.authUrl);
      }
    } catch (err) {
      showToast('حدث خطأ أثناء ربط الحساب.', 'error');
    }
  };

  const handleDisconnectAccount = async (provider: CloudProviderType) => {
    try {
      const res = await cloudBackupApi.disconnect(provider);
      if (res.success) {
        showToast(res.message, 'info');
        fetchBackupAccounts();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('حدث خطأ أثناء قطع الاتصال.', 'error');
    }
  };

  const cancelConnect = () => {
    setConnectModal(null);
    setIsPolling(false);
  };

  useEffect(() => {
    if (!connectModal || isPolling) return;
    setIsPolling(true);
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (stopped) return;
      try {
        const res = await cloudBackupApi.pollConnect(connectModal.provider);
        if (stopped) return;
        if (res.status === 'done') {
          setConnectModal(null);
          setIsPolling(false);
          showToast(`تم ربط حساب ${connectModal.provider === 'google' ? 'Google' : 'Microsoft'} بنجاح.`, 'success');
          fetchBackupAccounts();
        } else if (res.status === 'error') {
          setConnectModal(null);
          setIsPolling(false);
          showToast(res.message || 'فشل تسجيل الدخول.', 'error');
        }
      } catch (err) {
        // transient network error - keep polling
      }
    };

    timer = setInterval(poll, Math.max(connectModal.interval, 3) * 1000);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [connectModal, isPolling]);

  const handleSaveEditableFields = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!principalName.trim() || !phone.trim() || !academicYear.trim()) {
      showToast('يرجى تعبئة جميع الحقول المطلوبة.', 'error');
      return;
    }

    if (!schoolProfile) return;

    setIsSaving(true);
    try {
      // 1. Persist official fields to Supabase (authoritative source)
      const { updateAccountProfile } = await import('../services/auth');
      const profileResult = await updateAccountProfile({
        principal_name: principalName.trim(),
        phone: normalizeDigits(phone.trim()),
        address: address.trim(),
        job_title: principalTitle.trim(),
      });

      if (!profileResult.ok) {
        showToast(profileResult.error || 'فشل تحديث البيانات الرسمية.', 'error');
        return;
      }

      // 2. Update local SQLite cache (for offline fallback)
      const updateData: SchoolProfile = {
        ...schoolProfile,
        principalName: principalName.trim(),
        principalTitle: principalTitle.trim(),
        phone: normalizeDigits(phone.trim()),
        address: address.trim(),
        academicYear: normalizeDigits(academicYear.trim()),
      };

      const res = await api.register(updateData);
      if (res.success && res.schoolProfile) {
        onProfileUpdated(res.schoolProfile);
        showToast('تم حفظ التغييرات بنجاح.', 'success');
      } else {
        // Supabase succeeded but local cache failed — still a success
        onProfileUpdated(updateData);
        showToast('تم حفظ التغييرات بنجاح.', 'success');
      }
    } catch (err) {
      showToast('حدث خطأ أثناء الاتصال بالنظام.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-8 select-none">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
          <Settings className="w-7 h-7 text-slate-700" />
          <span>إعدادات النظام</span>
        </h2>
        <p className="text-slate-500 text-sm mt-1 font-medium">
          تعديل البيانات المتاحة، الحسابات السحابية، التخزين والمعلومات العامة
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white p-1.5 rounded-2xl shadow-xs">
        <button
          onClick={() => setActiveTab('editable')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'editable'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Edit3 className="w-4 h-4" />
          <span>1. بيانات المدرسة</span>
        </button>

        <button
          onClick={() => setActiveTab('backup_accounts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'backup_accounts'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Cloud className="w-4 h-4" />
          <span>2. حساب النسخ الاحتياطي</span>
        </button>

        <button
          onClick={() => setActiveTab('storage')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'storage'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>3. التخزين وقاعدة البيانات</span>
        </button>

        <button
          onClick={() => setActiveTab('about')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'about'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Info className="w-4 h-4" />
          <span>4. حول التطبيق</span>
        </button>

        <button
          onClick={() => setActiveTab('appearance')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'appearance'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>المظهر</span>
        </button>
      </div>

      {/* Section 1: School Data Settings (Editable Fields) */}
      {activeTab === 'editable' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-blue-600" />
              <span>بيانات المدرسة</span>
            </h3>
            <p className="text-slate-500 text-xs mt-1 font-medium">
              يمكنك تعديل بيانات المدير والهاتف والعنوان وصفة المدير. البيانات تُحفظ مباشرة في نظام الحسابات.
            </p>
          </div>

          <form onSubmit={handleSaveEditableFields} className="max-w-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
              {/* اسم المدير / المدير العام — editable */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  اسم المدير / المدير العام <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={principalName}
                    onChange={(e) => setPrincipalName(e.target.value)}
                    placeholder="اسم مدير المدرسة"
                    className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                  <UserCheck className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* رقم الهاتف — editable */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  رقم الهاتف <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(normalizeDigits(e.target.value))}
                    placeholder="07XXXXXXXXX"
                    className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none dir-ltr"
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* صفة المدير — editable (structured selector) */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  صفة المدير
                </label>
                <div className="relative">
                  <select
                    value={principalTitle}
                    onChange={(e) => setPrincipalTitle(e.target.value)}
                    className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
                  >
                    {PRINCIPAL_TITLES.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </select>
                  <UserCheck className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
                <p className="text-xs text-slate-400 font-medium mt-1.5">
                  تُستخدم صفة المدير داخل قوالب المستندات.
                </p>
              </div>

              {/* العنوان — editable */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  العنوان
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="عنوان المدرسة"
                    className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                  <MapPin className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* السنة الدراسية — editable (local user preference) */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  السنة الدراسية الحالية <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
                  >
                    {academicYears.map((yr) => (
                      <option key={yr} value={normalizeDigits(yr)}>
                        {normalizeDigits(yr)}
                      </option>
                    ))}
                  </select>
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="flex justify-start mt-6" dir="rtl">
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                <span>حفظ التغييرات</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Section 3: Backup Authentication / Cloud Accounts */}
      {activeTab === 'backup_accounts' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Cloud className="w-5 h-5 text-blue-600" />
              <span>حساب النسخ الاحتياطي (ربط السحابة)</span>
            </h3>
            <p className="text-slate-500 text-xs mt-1 font-medium">
              ربط حسابات التخزين السحابي لرفع النسخ الاحتياطية تلقائياً في مجلد "EDARA Backups" عند النقر على "إنشاء نسخة احتياطية".
            </p>
          </div>

          {isLoadingAccounts ? (
            <div className="p-8 text-center flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span>جاري التحقق من حالة الحسابات السحابية...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Google Drive Account Card */}
              <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 font-black text-slate-900 text-base">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">
                        G
                      </div>
                      <span>Google Drive</span>
                    </div>
                    {googleAccount ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md text-xs font-bold border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>متصل</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-200 text-slate-600 rounded-md text-xs font-bold">
                        <span>غير متصل</span>
                      </span>
                    )}
                  </div>

                  <p className="text-slate-600 text-xs leading-relaxed">
                    يتم تخزين النسخ الاحتياطية تلقائياً داخل حسابك في Google Drive بمجلد خاص باسم <strong className="text-slate-900 font-mono">EDARA Backups</strong>.
                  </p>

                  {googleAccount && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-800 dir-ltr text-right">
                      {googleAccount.email}
                    </div>
                  )}
                </div>

                <div>
                  {googleAccount ? (
                    <button
                      onClick={() => handleDisconnectAccount('google')}
                      className="w-full py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-xl text-xs border border-red-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Unplug className="w-4 h-4" />
                      <span>قطع الاتصال</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnectAccount('google')}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>تسجيل الدخول بحساب Google</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Microsoft OneDrive Account Card */}
              <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 font-black text-slate-900 text-base">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                        M
                      </div>
                      <span>Microsoft OneDrive</span>
                    </div>
                    {microsoftAccount ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md text-xs font-bold border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>متصل</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-200 text-slate-600 rounded-md text-xs font-bold">
                        <span>غير متصل</span>
                      </span>
                    )}
                  </div>

                  <p className="text-slate-600 text-xs leading-relaxed">
                    يتم تخزين النسخ الاحتياطية تلقائياً داخل حسابك في OneDrive بمجلد خاص باسم <strong className="text-slate-900 font-mono">EDARA Backups</strong>.
                  </p>

                  {microsoftAccount && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-800 dir-ltr text-right">
                      {microsoftAccount.email}
                    </div>
                  )}
                </div>

                <div>
                  {microsoftAccount ? (
                    <button
                      onClick={() => handleDisconnectAccount('microsoft')}
                      className="w-full py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-xl text-xs border border-red-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Unplug className="w-4 h-4" />
                      <span>قطع الاتصال</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnectAccount('microsoft')}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>تسجيل الدخول بحساب Microsoft</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 4: Storage & Database Info */}
      {activeTab === 'storage' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            <span>معلومات قاعدة البيانات المحلية والتخزين</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-xs font-semibold text-slate-500">نوع قاعدة البيانات</span>
              <p className="font-bold text-slate-900 text-base">SQLite 3 (محلي آمن بدون إنترنت)</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-xs font-semibold text-slate-500">حالة التخزين</span>
              <p className="font-bold text-emerald-700 text-base">نشط ويعمل محلياً</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 md:col-span-2">
              <span className="text-xs font-semibold text-slate-500">مجلد أرشفة البيانات والمستندات</span>
              <p className="font-mono text-xs text-slate-800 bg-white p-2.5 rounded-lg border border-slate-200 mt-1 dir-ltr text-right font-bold truncate" title={dataDir}>
                {dataDir || '...'}
              </p>
              <button
                onClick={handleChangeDataDir}
                disabled={isChangingDir}
                className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>تغيير المجلد</span>
              </button>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                يُستخدم هذا المجلد لحفظ قاعدة البيانات والمستندات المولّدة. يُطبَّق المسار الجديد بعد إعادة تشغيل التطبيق.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Section 5: About Application (Edara branding) */}
      {activeTab === 'about' && (
        <div className="space-y-6">
          {/* Hero: logo on the right (RTL), app info on the left */}
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
              {/* Logo (right in RTL) */}
              <div className="flex justify-center md:justify-start shrink-0">
                <img
                  src="/logo.png"
                  alt="Edara"
                  className="w-36 h-36 md:w-44 md:h-44 object-contain"
                />
              </div>

              {/* App info (left in RTL) */}
              <div className="flex-1 text-right space-y-3">
                <h3 className="text-3xl font-black text-slate-900">Edara</h3>
                <p className="text-lg font-bold text-blue-600">نظام إدارة المدارس</p>
                <p className="text-slate-600 text-sm leading-relaxed max-w-md">
                  تطبيق مكتبي متكامل لإدارة المؤسسات والمدارس التعليمية، يعمل بشكل كامل محلياً وبدون اتصال بالإنترنت.
                </p>
              </div>
            </div>
          </div>

          {/* Info + Updates cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Application info card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 text-sm">
              <h4 className="font-black text-slate-900 text-lg flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-600" />
                <span>معلومات التطبيق</span>
              </h4>

              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="font-semibold text-slate-600">الإصدار:</span>
                <span className="font-mono font-bold text-slate-900 bg-slate-50 px-2.5 py-0.5 rounded border border-slate-200">
                  {updateStatus?.currentVersion || '1.0.4'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">المطور:</span>
                <a
                  href="https://jalalamanj.online"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    api.openExternalDeveloperWebsite();
                  }}
                  className="font-bold text-blue-600 hover:text-blue-800 hover:underline transition-all dir-ltr"
                >
                  Jalal Amanj
                </a>
              </div>
            </div>

            {/* Update Check Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-slate-900 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-blue-600" />
                  <span>التحديثات</span>
                </h4>
                {updateStatus?.hasUpdate && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md text-xs font-bold border border-emerald-200">
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>يوجد إصدار جديد</span>
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">الحالة:</span>
                  {isCheckingUpdates ? (
                    <span className="flex items-center gap-1.5 text-slate-600 font-bold">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <span>جاري التحقق...</span>
                    </span>
                  ) : updateStatus?.hasUpdate ? (
                    <span className="font-bold text-emerald-700">
                      يتوفر إصدار أحدث (v{updateStatus.latestVersion})
                    </span>
                  ) : updateStatus?.error ? (
                    <span className="font-bold text-amber-600">{updateStatus.error}</span>
                  ) : (
                    <span className="font-bold text-slate-700">لا يوجد إصدار جديد متاح بعد.</span>
                  )}
                </div>

                {updateStatus?.checkedAt && (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-500">آخر فحص:</span>
                    <span className="font-bold text-slate-700 dir-ltr font-mono text-xs">
                      {new Date(updateStatus.checkedAt).toLocaleString('ar-EG-u-nu-latn', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                )}

                {updateStatus?.releaseNotes && (
                  <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-28 overflow-y-auto whitespace-pre-wrap">
                    {updateStatus.releaseNotes}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCheckUpdates}
                  disabled={isCheckingUpdates}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
                  <span>التحقق من التحديثات</span>
                </button>

                {updateStatus?.hasUpdate && updateStatus.downloadUrl && (
                  <button
                    onClick={() => {
                      if (onInstallUpdate) {
                        onInstallUpdate(updateStatus.downloadUrl!);
                      } else {
                        api.openExternalUrl(updateStatus.downloadUrl!);
                      }
                    }}
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>تنزيل وتثبيت</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400 font-medium text-center">
            جميع الحقوق محفوظة © {new Date().getFullYear()} Jalal Amanj (جلال أمانج)
          </div>
        </div>
      )}

      {/* Section: Appearance / Theme */}
      {activeTab === 'appearance' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Palette className="w-5 h-5 text-blue-600" />
              <span>المظهر</span>
            </h3>
            <p className="text-slate-500 text-xs mt-1 font-medium">
              اختر المظهر المفضل لتطبيق Edara. يُحفظ اختيارك ويبقى بعد إغلاق التطبيق وإعادة فتحه.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(
              [
                { key: 'light', label: 'فاتح', icon: Sun, desc: 'المظهر الفاتح الحالي لنظام Edara.' },
                { key: 'dark', label: 'داكن', icon: Moon, desc: 'مظهر داكن احترافي يناسب بيئات العمل.' },
                { key: 'system', label: 'تلقائي', icon: Monitor, desc: 'يتبع الوقت المحلي (فاتح ٦ صباحاً–٦ مساءً، داكن الباقي).' },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const selected = theme === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => handleThemeChange(opt.key)}
                  className={`p-5 rounded-2xl border text-right transition-all cursor-pointer flex flex-col gap-3 ${
                    selected
                      ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/30'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Icon className={`w-6 h-6 ${selected ? 'text-blue-600' : 'text-slate-500'}`} />
                    {selected && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
                  </div>
                  <span className={`font-black text-base ${selected ? 'text-blue-700' : 'text-slate-800'}`}>
                    {opt.label}
                  </span>
                  <span className="text-xs text-slate-500 font-medium leading-relaxed">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Device-Code Connect Modal */}
      {connectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-bold text-sm">
                  {connectModal.provider === 'google' ? 'G' : 'M'}
                </div>
                <h3 className="text-lg font-bold">
                  {connectModal.provider === 'google' ? 'تسجيل الدخول إلى Google' : 'تسجيل الدخول إلى Microsoft'}
                </h3>
              </div>
              <button onClick={cancelConnect} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="p-3 bg-blue-50 text-blue-900 rounded-2xl border border-blue-200 flex items-center gap-2 text-xs font-semibold">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                <span>جاري انتظار إكمال تسجيل الدخول على صفحة المزود...</span>
              </div>

              {connectModal.authUrl ? (
                <div>
                  <p className="text-slate-700 font-bold mb-2">افتح رابط تسجيل الدخول لحساب {connectModal.provider === 'google' ? 'Google' : 'Microsoft'}:</p>
                  <button
                    onClick={() => api.openExternalUrl(connectModal.authUrl!)}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span dir="ltr" className="font-mono">فتح صفحة تسجيل الدخول</span>
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-slate-700 font-bold mb-2">1. افتح صفحة تسجيل الدخول:</p>
                    <button
                      onClick={() => api.openExternalUrl(connectModal.verificationUrl)}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span dir="ltr" className="font-mono">{connectModal.verificationUrl}</span>
                    </button>
                  </div>

                  <div>
                    <p className="text-slate-700 font-bold mb-2">2. أدخل رمز التحقق التالي:</p>
                    <div className="bg-slate-50 border-2 border-dashed border-blue-300 rounded-2xl py-4 text-center">
                      <span className="font-mono font-black text-3xl tracking-[0.3em] text-blue-700 dir-ltr select-all">
                        {connectModal.userCode}
                      </span>
                    </div>
                  </div>
                </>
              )}

              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 leading-relaxed">
                افتح صفحة المزود في المتصفح، سجّل الدخول بحسابك. سيتصل التطبيق بالحساب تلقائياً بعد اكتمال العملية.
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={cancelConnect}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
