import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { ministryNotifications } from '../services/ministryNotifications';
import { normalizeDigits } from '../utils/numberUtils';
import { normalizeArabicSearch } from '../utils/arabicSearch';
import {
  Landmark,
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

interface MinistryDocsViewProps {
  onRefreshStats: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface MinistryDriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size?: number;
  modifiedTime?: string;
  createdTime?: string;
  docNumber?: string;
  department?: string;
  downloadUrl?: string;
  viewUrl?: string;
  parentId?: string | null;
}

export const MinistryDocsView: React.FC<MinistryDocsViewProps> = ({
  showToast,
}) => {
  const [allItems, setAllItems] = useState<MinistryDriveItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>('');
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([
    { id: '', name: 'المجلد الرئيسي' },
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Per-folder client-side cache so navigation/search never hit the network.
  const cacheRef = useRef<Record<string, MinistryDriveItem[]>>({});

  // Instant local search: filter the already-loaded (cached) items by normalized text.
  const items = useMemo<MinistryDriveItem[]>(() => {
    const q = normalizeArabicSearch(searchQuery);
    if (!q) return allItems;
    return allItems.filter((it) => {
      const haystack = normalizeArabicSearch(
        `${it.name} ${it.docNumber || ''} ${it.department || ''}`
      );
      return haystack.includes(q);
    });
  }, [allItems, searchQuery]);

  const hasQuery = searchQuery.trim().length > 0;
  const isSearchNoResults = hasQuery && items.length === 0 && allItems.length > 0;
  const [errorState, setErrorState] = useState<'none' | 'offline' | 'error'>('none');
  
  // View mode switcher: 'grid' or 'list'
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modal previewer state
  const [previewItem, setPreviewItem] = useState<MinistryDriveItem | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewItem(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Loads ALL files of a folder ONCE and caches them. Search is performed locally
  // on the cached data, so typing never triggers a network request.
  const fetchDriveItems = useCallback(async (folderId = '', force = false) => {
    const cached = cacheRef.current[folderId];
    const silent = !!cached && !force;
    if (cached) setAllItems(cached); // show instantly from cache
    if (!silent) {
      setIsLoading(true);
      setErrorState('none');
    }

    if (!navigator.onLine) {
      setErrorState('offline');
      if (!silent) setIsLoading(false);
      return;
    }

    try {
      const res = await api.getMinistryDriveFiles(folderId, ''); // no server-side search
      if (res.success) {
        const list = res.items || [];
        cacheRef.current[folderId] = list;
        setAllItems(list);
        const ids = list.map((i) => i.id);
        if (ids.length) ministryNotifications.markSeenWith(ids).catch(() => {});
        setErrorState('none');
      } else {
        setErrorState('error');
      }
    } catch (err) {
      setErrorState(!navigator.onLine ? 'offline' : 'error');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  // Load the folder when navigating (cache-first, then silent background refresh).
  useEffect(() => {
    fetchDriveItems(currentFolderId);
  }, [currentFolderId, fetchDriveItems]);

  // Keep the cache fresh in the background without interrupting the user.
  useEffect(() => {
    const timer = setInterval(() => {
      fetchDriveItems(currentFolderId);
    }, 60000);
    return () => clearInterval(timer);
  }, [currentFolderId, fetchDriveItems]);

  const handleOpenFolder = (folder: MinistryDriveItem) => {
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

  const handleDownload = (item: MinistryDriveItem) => {
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
    } catch (e) {
      showToast('تعذر تنزيل الملف.', 'error');
    }
  };

  const handleView = (item: MinistryDriveItem) => {
    setPreviewItem(item);
  };

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
      if (isNaN(d.getTime())) {
        return normalizeDigits(dateStr);
      }
      return normalizeDigits(d.toLocaleDateString('ar-EG-u-nu-latn'));
    } catch {
      return normalizeDigits(dateStr);
    }
  };

  return (
    <div className="space-y-6 pb-8 select-none">
      {/* Top Header Section */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Landmark className="w-7 h-7 text-blue-600" />
            <span>مستندات الوزارة والكتب الرسمية</span>
          </h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            السجل الرسمي للكتب الوزارية والقرارات والتعاميم والتعليمات الصادرة
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

      {/* Search & Breadcrumb & View Toggle Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Search Field */}
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

          {/* View Switcher Controls */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-blue-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="عرض شبكة البطاقات"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>شبكة</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-blue-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="عرض قائمة الجدول"
            >
              <LayoutList className="w-4 h-4" />
              <span>قائمة</span>
            </button>
          </div>
        </div>

        {/* Breadcrumb path */}
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

      {/* Main Content Area */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Loading State */}
        {isLoading ? (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="font-semibold text-sm">جاري تحميل كتب ومستندات الوزارة...</span>
          </div>
        ) : errorState === 'offline' ? (
          /* Offline Error State */
          <div className="p-16 text-center flex flex-col items-center justify-center gap-4">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-full border border-blue-200">
              <WifiOff className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900">لا يمكن تحميل مستندات الوزارة دون اتصال بالإنترنت.</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto">
                يرجى التحقق من الاتصال بالشبكة وإعادة المحاولة.
              </p>
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
          /* General Error State */
          <div className="p-16 text-center flex flex-col items-center justify-center gap-4">
            <div className="p-4 bg-red-50 text-red-600 rounded-full border border-red-200">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900">تعذر الوصول إلى مستندات الوزارة حالياً.</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto">
                حدث خطأ أثناء تحميل السجل من المجلد السحابي المعتمد.
              </p>
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
          /* No search results */
          <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 bg-slate-100 text-slate-400 rounded-full">
              <Search className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-black text-slate-800">لا توجد نتائج مطابقة للبحث.</h3>
            <p className="text-slate-500 text-sm max-w-md leading-relaxed">
              لم يتم العثور على ملفات تطابق "{searchQuery}". جرّب كلمات بحث مختلفة.
            </p>
          </div>
        ) : items.length === 0 ? (
          /* Empty State */
          <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 bg-slate-100 text-slate-400 rounded-full">
              <Landmark className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-black text-slate-800">لا توجد مستندات وزارية حالياً.</h3>
            <p className="text-slate-500 text-sm max-w-md leading-relaxed">
              لا توجد ملفات متاحة في مجلد مستندات الوزارة حالياً.
            </p>
          </div>
        ) : (
          /* Drive Library Items Layout */
          <div className="p-6 space-y-6">
            {/* Folders Section (if any) */}
            {items.some((i) => i.isFolder) && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">المجلدات</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {items
                    .filter((i) => i.isFolder)
                    .map((folder) => (
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

            {/* Files Section */}
            {items.some((i) => !i.isFolder) && (
              <div className="space-y-3">
                {items.some((i) => i.isFolder) && (
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pt-2 border-t border-slate-100">
                    الملفات المتاحة
                  </h4>
                )}

                {/* GRID VIEW */}
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {items
                      .filter((i) => !i.isFolder)
                      .map((file) => (
                        <div
                          key={file.id}
                          className="bg-white rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all flex flex-col justify-between group overflow-hidden"
                        >
                          {/* Small View Thumbnail Header */}
                          <div
                            onClick={() => handleView(file)}
                            className="relative h-36 bg-slate-100 border-b border-slate-200 flex items-center justify-center overflow-hidden cursor-pointer group-hover:bg-blue-50/30 transition-colors"
                          >
                            {/* Integrated Thumbnail / Preview */}
                            {file.mimeType.includes('image') || file.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
                              <img
                                src={`https://drive.google.com/thumbnail?id=${file.id}&sz=w500`}
                                alt={file.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  // Fallback icon if thumbnail isn't rendered
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full relative flex items-center justify-center p-3 bg-gradient-to-br from-slate-50 to-blue-50/40">
                                <img
                                  src={`https://drive.google.com/thumbnail?id=${file.id}&sz=w400`}
                                  alt={file.name}
                                  className="max-w-full max-h-full object-contain rounded shadow-xs"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                  }}
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

                            {/* Hover Overlay "افتح" Button */}
                            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                              <span className="px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0 transition-transform">
                                <Maximize2 className="w-3.5 h-3.5" />
                                <span>افتح</span>
                              </span>
                            </div>

                            {/* Department Tag Overlay */}
                            <div className="absolute top-2.5 right-2.5 z-10">
                              <span className="text-[10px] font-extrabold bg-white/95 backdrop-blur-xs text-blue-900 border border-blue-200 px-2.5 py-0.5 rounded-full shadow-xs">
                                {file.department || 'وزارة التربية'}
                              </span>
                            </div>
                          </div>

                          {/* Card Content */}
                          <div className="p-4 flex-1 flex flex-col justify-between">
                            <div>
                              <h5
                                onClick={() => handleView(file)}
                                className="font-bold text-slate-900 text-sm line-clamp-2 leading-snug mb-1 hover:text-blue-800 transition-colors cursor-pointer"
                                title={file.name}
                              >
                                {file.name}
                              </h5>

                              {file.docNumber && (
                                <p className="text-xs font-mono font-bold text-blue-800 dir-ltr text-right mb-2">
                                  {normalizeDigits(file.docNumber)}
                                </p>
                              )}
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
                  /* LIST VIEW (Table) */
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-right text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider">
                          <th className="py-3.5 px-4">رقم الكتاب</th>
                          <th className="py-3.5 px-4">اسم المستند الوزاري</th>
                          <th className="py-3.5 px-4">الجهة الصادرة</th>
                          <th className="py-3.5 px-4">التاريخ</th>
                          <th className="py-3.5 px-4">الحجم</th>
                          <th className="py-3.5 px-4 text-center">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items
                          .filter((i) => !i.isFolder)
                          .map((file) => (
                            <tr key={file.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3.5 px-4 font-mono font-bold text-blue-800 dir-ltr text-right">
                                {normalizeDigits(file.docNumber || '-')}
                              </td>
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
                              <td className="py-3.5 px-4">
                                <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded-full text-xs font-bold">
                                  {file.department || 'وزارة التربية'}
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
                                    title="معاينة المستند"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>افتح</span>
                                  </button>
                                  <button
                                    onClick={() => handleDownload(file)}
                                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer border border-blue-200"
                                    title="تنزيل المستند"
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

      {/* In-App Pop-Up Window Modal Previewer */}
      {previewItem && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden relative">
            {/* Modal Header */}
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
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-0.5">
                    {previewItem.docNumber && (
                      <span className="font-mono text-blue-800 font-bold dir-ltr">
                        {normalizeDigits(previewItem.docNumber)}
                      </span>
                    )}
                    {previewItem.department && (
                      <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.2 rounded-md font-bold">
                        {previewItem.department}
                      </span>
                    )}
                    {previewItem.size && <span>• {formatFileSize(previewItem.size)}</span>}
                  </div>
                </div>
              </div>

              {/* Header Action Controls */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDownload(previewItem)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="تنزيل الملف"
                >
                  <Download className="w-4 h-4" />
                  <span>تنزيل</span>
                </button>
                <button
                  onClick={() => setPreviewItem(null)}
                  className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
                  title="إغلاق المعاينة"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body Container */}
            <div className="flex-1 bg-slate-950/5 relative overflow-hidden flex items-center justify-center p-2">
              {previewItem.mimeType.includes('image') ||
              previewItem.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img
                    src={
                      previewItem.downloadUrl ||
                      `https://drive.google.com/uc?export=view&id=${previewItem.id}`
                    }
                    alt={previewItem.name}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
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


