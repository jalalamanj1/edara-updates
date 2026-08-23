import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import { GovernorateDriveConfig } from '../types';
import { normalizeDigits } from '../utils/numberUtils';
import { normalizeArabicSearch } from '../utils/arabicSearch';
import {
  Building,
  Search,
  Download,
  Folder,
  FileText,
  RefreshCw,
  Loader2,
  ChevronLeft,
  WifiOff,
  AlertTriangle,
  FileCode2,
  LayoutGrid,
  LayoutList,
  Eye,
  X,
  Image as ImageIcon,
  FileSpreadsheet,
  Maximize2,
} from 'lucide-react';

interface GovernorateDriveViewProps {
  onRefreshStats: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size?: number;
  modifiedTime?: string;
  createdTime?: string;
  downloadUrl?: string;
  viewUrl?: string;
  parentId?: string | null;
}

type ConfigError =
  | 'none'
  | 'offline'
  | 'auth_error'
  | 'no_account'
  | 'no_governorate'
  | 'no_cities'
  | 'no_folder'
  | 'governorate_mismatch'
  | 'not_configured'
  | 'server_error';

// ─── Module-level cache (survives component unmount/tab switches) ───────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _cachedConfig: GovernorateDriveConfig | null = null;

interface CachedFileList {
  items: DriveItem[];
  timestamp: number;
}
const _fileCache: Record<string, CachedFileList> = {};

// In-flight request deduplication
let _inflightConfig: Promise<{ success: boolean; config?: GovernorateDriveConfig; code?: string }> | null = null;
const _inflightFiles: Record<string, Promise<{ success: boolean; items: DriveItem[] }>> = {};

function getCachedFiles(folderId: string): DriveItem[] | null {
  const cached = _fileCache[folderId];
  if (!cached) return null;
  return cached.items;
}

function isCacheStale(folderId: string): boolean {
  const cached = _fileCache[folderId];
  if (!cached) return true;
  return Date.now() - cached.timestamp > CACHE_TTL_MS;
}

function setCachedFiles(folderId: string, items: DriveItem[]): void {
  _fileCache[folderId] = { items, timestamp: Date.now() };
}

// ─── Public preload function (called from App.tsx after login) ──────────────
let _preloadStarted = false;
export function preloadGovernorateDrive(): void {
  if (_preloadStarted || _cachedConfig) return;
  _preloadStarted = true;
  // Fire-and-forget: resolve config, then fetch root folder files
  (async () => {
    try {
      const { api } = await import('../services/api');
      if (!_cachedConfig) {
        const result = await api.getGovernorateDriveConfig();
        if (result.success && result.config) {
          _cachedConfig = result.config;
          // Preload root folder files in background
          if (result.config.folderId) {
            const fileResult = await api.getGovernorateDriveFiles(result.config.folderId);
            if (fileResult.success) {
              setCachedFiles(result.config.folderId, fileResult.items || []);
            }
          }
        }
      }
    } catch {
      // silent — preload is best-effort
    }
  })();
}

// ─── Clear cache on logout ──────────────────────────────────────────────────
export function clearGovernorateDriveCache(): void {
  _cachedConfig = null;
  Object.keys(_fileCache).forEach((k) => delete _fileCache[k]);
  _inflightConfig = null;
  Object.keys(_inflightFiles).forEach((k) => delete _inflightFiles[k]);
  _preloadStarted = false;
}

const CONFIG_ERROR_MESSAGES: Record<ConfigError, string> = {
  none: '',
  offline: 'لا يوجد اتصال بالإنترنت. يرجى التحقق من الاتصال والمحاولة مرة أخرى.',
  auth_error: 'يرجى تسجيل الدخول مرة أخرى.',
  no_account: 'لم يتم العثور على حسابك في النظام.',
  no_governorate: 'لم يتم تحديد المحافظة لك. يرجى التواصل مع الإدارة.',
  no_cities: 'لم يتم العثور على مدن لهذه المحافظة. يرجى التواصل مع الإدارة.',
  no_folder: 'لم يتم تهيئة مجلد المحافظة بعد. يرجى التواصل مع الإدارة.',
  governorate_mismatch: 'الملف المحدد لا ينتمي لمحافظتك.',
  not_configured: 'خدمة Supabase غير مهيأة.',
  server_error: 'حدث خطأ في تحميل إعدادات المحافظة.',
};

export const GovernorateDriveView: React.FC<GovernorateDriveViewProps> = ({
  showToast,
}) => {
  const [config, setConfig] = useState<GovernorateDriveConfig | null>(_cachedConfig);
  const [configLoading, setConfigLoading] = useState(!_cachedConfig);
  const [configError, setConfigError] = useState<ConfigError>('none');

  const [allItems, setAllItems] = useState<DriveItem[]>(() => {
    // Initialize from cache if available
    if (_cachedConfig?.folderId) {
      return getCachedFiles(_cachedConfig.folderId) || [];
    }
    return [];
  });
  const [currentFolderId, setCurrentFolderId] = useState<string>('');
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([
    { id: '', name: 'كتب رسمية' },
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const items = useMemo<DriveItem[]>(() => {
    const q = normalizeArabicSearch(searchQuery);
    if (!q) return allItems;
    return allItems.filter((it) => normalizeArabicSearch(it.name).includes(q));
  }, [allItems, searchQuery]);

  const hasQuery = searchQuery.trim().length > 0;
  const isSearchNoResults = hasQuery && items.length === 0 && allItems.length > 0;
  const [errorState, setErrorState] = useState<'none' | 'offline' | 'error'>('none');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [previewItem, setPreviewItem] = useState<DriveItem | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewItem(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load config — use module-level cache, deduplicate in-flight requests
  useEffect(() => {
    let cancelled = false;
    const loadConfig = async () => {
      if (_cachedConfig) {
        if (!cancelled) {
          setConfig(_cachedConfig);
          setConfigError('none');
          setConfigLoading(false);
        }
        return;
      }
      setConfigLoading(true);
      const t0 = performance.now();
      try {
        if (!navigator.onLine) {
          if (!cancelled) { setConfigError('offline'); setConfigLoading(false); }
          return;
        }
        // Deduplicate concurrent config requests
        if (!_inflightConfig) {
          _inflightConfig = api.getGovernorateDriveConfig();
        }
        const result = await _inflightConfig;
        _inflightConfig = null;
        const elapsed = Math.round(performance.now() - t0);
        console.log(`[GOV DRIVE PERF] config resolved in ${elapsed}ms`);
        if (cancelled) return;
        if (result.success && result.config) {
          _cachedConfig = result.config;
          setConfig(result.config);
          setConfigError('none');
        } else {
          setConfigError((result.code as ConfigError) || 'server_error');
        }
      } catch (e) {
        _inflightConfig = null;
        if (!cancelled) setConfigError('offline');
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    };
    loadConfig();
    return () => { cancelled = true; };
  }, []);

  // Fetch drive files — module-level cache, dedup in-flight, background refresh
  const fetchDriveItems = useCallback(async (folderId: string, force = false) => {
    const cached = getCachedFiles(folderId);
    const cacheStale = isCacheStale(folderId);
    const hasCache = !!cached;

    // Show cached data immediately (no loading spinner)
    if (hasCache) {
      setAllItems(cached);
      setErrorState('none');
    }

    // If cache is fresh and not forced, skip network entirely
    if (hasCache && !cacheStale && !force) {
      console.log(`[GOV DRIVE PERF] cache HIT for ${folderId} (${cached.length} items, ${Math.round(Date.now() - (_fileCache[folderId]?.timestamp || 0))}ms old)`);
      return;
    }

    // Show loading only if we have no cache at all
    if (!hasCache) {
      setIsLoading(true);
      setErrorState('none');
    }

    if (!navigator.onLine) {
      setErrorState('offline');
      setIsLoading(false);
      return;
    }

    // Deduplicate in-flight requests for the same folder
    if (_inflightFiles[folderId]) {
      try {
        const result = await _inflightFiles[folderId];
        if (result.success) {
          setAllItems(result.items);
          setErrorState('none');
        }
      } catch {
        // keep cached data
      }
      setIsLoading(false);
      return;
    }

    const t0 = performance.now();
    const requestPromise = api.getGovernorateDriveFiles(folderId);
    _inflightFiles[folderId] = requestPromise;

    try {
      const res = await requestPromise;
      const elapsed = Math.round(performance.now() - t0);
      console.log(`[GOV DRIVE PERF] files loaded in ${elapsed}ms (${res.items?.length || 0} items)`);
      if (res.success) {
        const list = res.items || [];
        setCachedFiles(folderId, list);
        setAllItems(list);
        setErrorState('none');
      } else {
        // Don't replace working cached data with error
        if (!hasCache) setErrorState('error');
      }
    } catch (e) {
      // Don't replace working cached data with error
      if (!hasCache) setErrorState(!navigator.onLine ? 'offline' : 'error');
    } finally {
      delete _inflightFiles[folderId];
      setIsLoading(false);
    }
  }, []);

  // Initial load + background refresh when stale
  useEffect(() => {
    if (config?.folderId) {
      setCurrentFolderId(config.folderId);
      setBreadcrumbs([{ id: config.folderId, name: config.governorateName || 'كتب رسمية' }]);
      // Fetch (will use cache if fresh, refresh in background if stale)
      fetchDriveItems(config.folderId);
    }
  }, [config?.folderId, fetchDriveItems]);

  // Background refresh every 60s (only if stale, otherwise no-op)
  useEffect(() => {
    if (!config?.folderId) return;
    const timer = setInterval(() => {
      if (isCacheStale(currentFolderId)) {
        fetchDriveItems(currentFolderId);
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [currentFolderId, config?.folderId, fetchDriveItems]);

  const handleOpenFolder = (folder: DriveItem) => {
    setCurrentFolderId(folder.id);
    setSearchQuery('');
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const handleNavigateBreadcrumb = (index: number) => {
    const target = breadcrumbs[index];
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    setCurrentFolderId(target.id);
    setSearchQuery('');
  };

  const handleDownload = (item: DriveItem) => {
    try {
      if (item.downloadUrl) {
        const a = document.createElement('a');
        a.href = item.downloadUrl;
        a.download = item.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('تم تنزيل الملف بنجاح.', 'success');
      } else {
        showToast('جاري تحضير الملف للتنزيل...', 'info');
      }
    } catch {
      showToast('تعذر تنزيل الملف.', 'error');
    }
  };

  const handleView = (item: DriveItem) => setPreviewItem(item);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return normalizeDigits(bytes) + ' B';
    if (bytes < 1024 * 1024) return normalizeDigits((bytes / 1024).toFixed(1)) + ' KB';
    return normalizeDigits((bytes / (1024 * 1024)).toFixed(1)) + ' MB';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return normalizeDigits(dateStr);
      return normalizeDigits(d.toLocaleDateString('ar-EG-u-nu-latn'));
    } catch {
      return normalizeDigits(dateStr);
    }
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="font-semibold text-sm">جاري تحميل إعدادات المحافظة...</span>
        </div>
      </div>
    );
  }

  if (configError !== 'none') {
    return (
      <div className="space-y-6 pb-8 select-none">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
              <Building className="w-7 h-7 text-blue-600" />
              <span>كتب رسمية</span>
            </h2>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="p-16 text-center flex flex-col items-center justify-center gap-4">
            <div className="p-4 bg-amber-50 text-amber-600 rounded-full border border-amber-200">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900">خطأ في تحميل الملفات</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto">
                {CONFIG_ERROR_MESSAGES[configError]}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 select-none">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Building className="w-7 h-7 text-blue-600" />
            <span>كتب رسمية</span>
          </h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            {config?.governorateName || 'كتب رسمية'} — للقراءة فقط
          </p>
        </div>
        <button
          onClick={() => fetchDriveItems(currentFolderId, true)}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold px-4 py-2.5 rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 cursor-pointer text-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>تحديث</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن ملف..."
              className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
            />
            <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-2 px-2.5 py-0.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-300 transition-colors"
              >
                مسح
              </button>
            )}
          </div>
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-blue-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>شبكة</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-blue-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-4 h-4" />
              <span>قائمة</span>
            </button>
          </div>
        </div>

        {!searchQuery && breadcrumbs.length > 0 && (
          <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-slate-100 text-xs font-bold text-slate-600">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id || 'root'}>
                {idx > 0 && <ChevronLeft className="w-3.5 h-3.5 text-slate-400 rotate-180" />}
                <button
                  onClick={() => handleNavigateBreadcrumb(idx)}
                  className={`hover:text-blue-700 transition-colors cursor-pointer ${
                    idx === breadcrumbs.length - 1 ? 'text-blue-700 font-extrabold' : 'text-slate-500'
                  }`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="font-semibold text-sm">جاري تحميل كتب رسمية...</span>
          </div>
        ) : errorState === 'offline' ? (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-4">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-full border border-blue-200">
              <WifiOff className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900">لا يمكن تحميل الملفات دون اتصال بالإنترنت.</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto">يرجى التحقق من الاتصال بالشبكة وإعادة المحاولة.</p>
            </div>
            <button
              onClick={() => fetchDriveItems(currentFolderId, true)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : errorState === 'error' ? (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-4">
            <div className="p-4 bg-red-50 text-red-600 rounded-full border border-red-200">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900">تعذر الوصول إلى كتب رسمية حالياً.</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto">حدث خطأ أثناء تحميل المجلد السحابي.</p>
            </div>
            <button
              onClick={() => fetchDriveItems(currentFolderId, true)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : isSearchNoResults ? (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 bg-slate-100 text-slate-400 rounded-full">
              <Search className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-black text-slate-800">لا توجد نتائج مطابقة للبحث.</h3>
            <p className="text-slate-500 text-sm max-w-md leading-relaxed">
              لم يتم العثور على ملفات تطابق &quot;{searchQuery}&quot;. جرّب كلمات بحث مختلفة.
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 bg-slate-100 text-slate-400 rounded-full">
              <Building className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-black text-slate-800">لا توجد ملفات حالياً.</h3>
            <p className="text-slate-500 text-sm max-w-md leading-relaxed">
              لا توجد ملفات متاحة في مجلد المحافظة حالياً.
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {items.some((i) => i.isFolder) && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">المجلدات</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {items.filter((i) => i.isFolder).map((folder) => (
                    <div
                      key={folder.id}
                      onClick={() => handleOpenFolder(folder)}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-300 transition-all cursor-pointer flex items-center gap-3 group"
                    >
                      <div className="p-2.5 bg-blue-100 text-blue-700 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                        <Folder className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 text-sm truncate">{folder.name}</p>
                        <span className="text-xs text-slate-400 font-medium block mt-0.5">مجلد فرعي</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {items.some((i) => !i.isFolder) && (
              <div className="space-y-3">
                {items.some((i) => i.isFolder) && (
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pt-2 border-t border-slate-100">
                    الملفات المتاحة
                  </h4>
                )}

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {items.filter((i) => !i.isFolder).map((file) => (
                      <div
                        key={file.id}
                        className="bg-white rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all flex flex-col justify-between group overflow-hidden"
                      >
                        <div
                          onClick={() => handleView(file)}
                          className="relative h-36 bg-slate-100 border-b border-slate-200 flex items-center justify-center overflow-hidden cursor-pointer group-hover:bg-blue-50/30 transition-colors"
                        >
                          {file.mimeType.includes('image') || file.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
                            <img
                              src={`https://drive.google.com/thumbnail?id=${file.id}&sz=w500`}
                              alt={file.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-full h-full relative flex items-center justify-center p-3 bg-gradient-to-br from-slate-50 to-blue-50/40">
                              <img
                                src={`https://drive.google.com/thumbnail?id=${file.id}&sz=w400`}
                                alt={file.name}
                                className="max-w-full max-h-full object-contain rounded shadow-xs"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-blue-50/20">
                                {file.mimeType.includes('pdf') ? (
                                  <FileText className="w-12 h-12 text-red-500/80 drop-shadow-xs" />
                                ) : file.mimeType.includes('sheet') || file.mimeType.includes('spreadsheet') ? (
                                  <FileSpreadsheet className="w-12 h-12 text-[#107c42]/80 drop-shadow-xs" />
                                ) : (
                                  <FileCode2 className="w-12 h-12 text-blue-600/80 drop-shadow-xs" />
                                )}
                              </div>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                            <span className="px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0 transition-transform">
                              <Maximize2 className="w-3.5 h-3.5" />
                              <span>افتح</span>
                            </span>
                          </div>
                        </div>

                        <div className="p-4 flex-1 flex flex-col justify-between">
                          <div>
                            <h5
                              onClick={() => handleView(file)}
                              className="font-bold text-slate-900 text-sm line-clamp-2 leading-snug mb-1 hover:text-blue-800 transition-colors cursor-pointer"
                              title={file.name}
                            >
                              {file.name}
                            </h5>
                          </div>
                          <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                              <span>{formatDate(file.createdTime || file.modifiedTime)}</span>
                              <span className="font-mono">{formatFileSize(file.size)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleView(file)}
                                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>افتح</span>
                              </button>
                              <button
                                onClick={() => handleDownload(file)}
                                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>تنزيل</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-right text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider">
                          <th className="py-3.5 px-4">اسم الملف</th>
                          <th className="py-3.5 px-4">التاريخ</th>
                          <th className="py-3.5 px-4">الحجم</th>
                          <th className="py-3.5 px-4 text-center">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.filter((i) => !i.isFolder).map((file) => (
                          <tr key={file.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                              {file.mimeType.includes('pdf') ? (
                                <FileText className="w-4 h-4 text-red-500 shrink-0" />
                              ) : file.mimeType.includes('image') ? (
                                <ImageIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                              ) : file.mimeType.includes('sheet') || file.mimeType.includes('spreadsheet') ? (
                                <FileSpreadsheet className="w-4 h-4 text-[#107c42] shrink-0" />
                              ) : (
                                <FileCode2 className="w-4 h-4 text-blue-600 shrink-0" />
                              )}
                              <span
                                onClick={() => handleView(file)}
                                className="truncate max-w-xs hover:text-blue-700 cursor-pointer transition-colors"
                                title={file.name}
                              >
                                {file.name}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-600">
                              {formatDate(file.createdTime || file.modifiedTime)}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                              {formatFileSize(file.size)}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleView(file)}
                                  className="px-2.5 py-1 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>افتح</span>
                                </button>
                                <button
                                  onClick={() => handleDownload(file)}
                                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer border border-blue-200"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>تنزيل</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {previewItem && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden relative">
            <div className="flex items-center justify-between p-4 px-6 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-blue-100 text-blue-800 rounded-xl shrink-0">
                  {previewItem.mimeType.includes('pdf') ? (
                    <FileText className="w-5 h-5 text-red-600" />
                  ) : previewItem.mimeType.includes('image') ? (
                    <ImageIcon className="w-5 h-5 text-emerald-600" />
                  ) : previewItem.mimeType.includes('sheet') || previewItem.mimeType.includes('spreadsheet') ? (
                    <FileSpreadsheet className="w-5 h-5 text-[#107c42]" />
                  ) : (
                    <FileCode2 className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 truncate" title={previewItem.name}>
                    {previewItem.name}
                  </h3>
                  {previewItem.size && (
                    <span className="text-xs text-slate-500 font-medium mt-0.5">{formatFileSize(previewItem.size)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDownload(previewItem)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>تنزيل</span>
                </button>
                <button
                  onClick={() => setPreviewItem(null)}
                  className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-950/5 relative overflow-hidden flex items-center justify-center p-2">
              {previewItem.mimeType.includes('image') ||
              previewItem.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img
                    src={previewItem.downloadUrl || `https://drive.google.com/uc?export=view&id=${previewItem.id}`}
                    alt={previewItem.name}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                  <iframe
                    src={`https://drive.google.com/file/d/${previewItem.id}/preview`}
                    className="w-full h-full rounded-lg border-0 bg-white"
                    title={previewItem.name}
                    allow="autoplay"
                  />
                </div>
              ) : (
                <iframe
                  src={
                    previewItem.id && !previewItem.id.startsWith('doc-')
                      ? `https://drive.google.com/file/d/${previewItem.id}/preview`
                      : previewItem.viewUrl ||
                        `https://docs.google.com/viewer?url=${encodeURIComponent(previewItem.downloadUrl || '')}&embedded=true`
                  }
                  className="w-full h-full rounded-lg border-0 bg-white shadow-inner"
                  title={previewItem.name}
                  allow="autoplay"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
