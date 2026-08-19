import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { normalizeDigits } from '../utils/numberUtils';
import {
  FolderOpen,
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
  Upload,
  Trash2,
  Info,
  CheckSquare,
} from 'lucide-react';

interface AdminFilesViewProps {
  onRefreshStats: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface AdminDriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size?: number;
  createdTime?: string;
  modifiedTime?: string;
  description?: string;
  uploader?: string | null;
  canDelete?: boolean;
  downloadUrl?: string;
  viewUrl?: string;
  parentId?: string | null;
}

export const AdminFilesView: React.FC<AdminFilesViewProps> = ({ showToast }) => {
  const [items, setItems] = useState<AdminDriveItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>('');
  const [folderName, setFolderName] = useState<string>('ملفات إدارية');
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([
    { id: '', name: 'ملفات إدارية' },
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorState, setErrorState] = useState<'none' | 'offline' | 'error'>('none');
  const [requiresAuth, setRequiresAuth] = useState(false);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [previewItem, setPreviewItem] = useState<AdminDriveItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewItem(null);
        setUploadOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchDriveItems = async (folderId = '', search = '') => {
    setIsLoading(true);
    setErrorState('none');
    setRequiresAuth(false);
    try {
      if (!navigator.onLine) {
        setErrorState('offline');
        setIsLoading(false);
        return;
      }
      const res = await api.getAdminFiles(folderId, search);
      if (res.success) {
        setItems(res.items || []);
        setFolderName(res.folderName || 'ملفات إدارية');
        setRequiresAuth(!!res.requiresAuth);
      } else {
        setErrorState('error');
      }
    } catch (err) {
      setErrorState('error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDriveItems(currentFolderId, searchQuery);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId, searchQuery]);

  const handleOpenFolder = (folder: AdminDriveItem) => {
    setCurrentFolderId(folder.id);
    setSearchQuery('');
    setSelectedIds(new Set());
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const handleNavigateBreadcrumb = (index: number) => {
    const target = breadcrumbs[index];
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    setCurrentFolderId(target.id);
    setSearchQuery('');
    setSelectedIds(new Set());
  };

  const handleDownload = (item: AdminDriveItem) => {
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

  const handleView = (item: AdminDriveItem) => setPreviewItem(item);

  const handleDelete = async (item: AdminDriveItem) => {
    if (!item.canDelete) {
      showToast('لا يمكن حذف هذا الملف بعد انتهاء المهلة المسموحة (24 ساعة).', 'error');
      return;
    }
    if (!window.confirm('هل أنت متأكد من حذف هذا الملف؟ لا يمكن التراجع بعد الحذف.')) return;
    try {
      const r = await api.deleteAdminFile(item.id);
      if (r.success) {
        showToast('تم حذف الملف بنجاح.', 'success');
        setSelectedIds((prev) => {
          const n = new Set(prev);
          n.delete(item.id);
          return n;
        });
        fetchDriveItems(currentFolderId, searchQuery);
      } else {
        showToast(r.message || 'تعذر حذف الملف.', 'error');
      }
    } catch (e) {
      showToast('تعذر حذف الملف.', 'error');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const fileItems = items.filter((i) => !i.isFolder);
  const allSelected = fileItems.length > 0 && fileItems.every((i) => selectedIds.has(i.id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allSelected) fileItems.forEach((i) => n.delete(i.id));
      else fileItems.forEach((i) => n.add(i.id));
      return n;
    });
  };

  const handleBulkDownload = () => {
    fileItems.filter((i) => selectedIds.has(i.id) && i.downloadUrl).forEach((i) => handleDownload(i));
  };

  const handleBulkDelete = async () => {
    const toDelete = fileItems.filter((i) => selectedIds.has(i.id) && i.canDelete);
    if (toDelete.length === 0) {
      showToast('لا توجد ملفات محددة ضمن المهلة المسموحة للحذف.', 'info');
      return;
    }
    if (!window.confirm(`سيتم حذف ${toDelete.length} ملف نهائياً. هل أنت متأكد؟`)) return;
    try {
      for (const it of toDelete) {
        await api.deleteAdminFile(it.id);
      }
      showToast(`تم حذف ${toDelete.length} ملف بنجاح.`, 'success');
      setSelectedIds(new Set());
      fetchDriveItems(currentFolderId, searchQuery);
    } catch (e) {
      showToast('تعذر حذف بعض الملفات.', 'error');
    }
  };

  const handleUpload = async () => {
    if (!uploadTitle.trim()) {
      showToast('عنوان الملف مطلوب.', 'error');
      return;
    }
    if (!uploadFile) {
      showToast('يرجى اختيار ملف للرفع.', 'error');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('title', uploadTitle.trim());
      fd.append('description', uploadDescription.trim());
      fd.append('folderId', currentFolderId);
      fd.append('file', uploadFile);
      const r = await api.uploadAdminFile(fd);
      if (r.success) {
        showToast('تم رفع الملف بنجاح.', 'success');
        setUploadOpen(false);
        setUploadTitle('');
        setUploadDescription('');
        setUploadFile(null);
        fetchDriveItems(currentFolderId, searchQuery);
      } else {
        showToast(r.message || 'فشل رفع الملف.', 'error');
      }
    } catch (e) {
      showToast('فشل رفع الملف.', 'error');
    } finally {
      setUploading(false);
    }
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
      if (isNaN(d.getTime())) return normalizeDigits(dateStr);
      return normalizeDigits(d.toLocaleDateString('ar-EG-u-nu-latn'));
    } catch {
      return normalizeDigits(dateStr);
    }
  };

  const metaDate = (i: AdminDriveItem) => formatDate(i.createdTime || i.modifiedTime);

  return (
    <div className="space-y-6 pb-8 select-none">
      {/* Top Header Section */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <FolderOpen className="w-7 h-7 text-blue-600" />
            <span>ملفات إدارية</span>
          </h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            مجلد الملفات الإدارية المشترك — رفع، تنزيل، ومعاينة المستندات
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setUploadOpen(true)}
            disabled={requiresAuth || isLoading}
            className="bg-[#107c42] hover:bg-[#107c42]/90 active:bg-[#107c42]/80 text-white font-bold px-4 py-2.5 rounded-xl shadow-md shadow-[#107c42]/20 transition-all flex items-center gap-2 cursor-pointer text-sm disabled:opacity-50"
            title="رفع ملف جديد"
          >
            <Upload className="w-4 h-4" />
            <span>رفع ملف</span>
          </button>
          <button
            onClick={() => fetchDriveItems(currentFolderId, searchQuery)}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold px-4 py-2.5 rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 cursor-pointer text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Auth required banner */}
      {requiresAuth && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm font-bold text-amber-800">
          <Info className="w-4 h-4 shrink-0" />
          <span>لتتمكن من رفع الملفات وحذفها، يرجى ربط حساب Google Drive من تبويب الإعدادات ← النسخ الاحتياطي.</span>
        </div>
      )}

      {/* Search & Breadcrumb & View Toggle Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="البحث باسم الملف..."
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
              title="عرض شبكة البطاقات"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>شبكة</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-blue-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="عرض قائمة الجدول"
            >
              <LayoutList className="w-4 h-4" />
              <span>قائمة</span>
            </button>
          </div>
        </div>

        {/* Selection bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 bg-blue-50/60 -mx-4 -mb-4 px-4 py-3 rounded-b-2xl">
            <span className="text-sm font-bold text-blue-800 flex items-center gap-2">
              <CheckSquare className="w-4 h-4" />
              {normalizeDigits(selectedIds.size)} ملف محدد
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkDownload}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تنزيل المحدد</span>
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف المحدد</span>
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

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
        {isLoading ? (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="font-semibold text-sm">جاري تحميل ملفات الإدارة...</span>
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
              onClick={() => fetchDriveItems(currentFolderId, searchQuery)}
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
              <h3 className="text-lg font-black text-slate-900">تعذر الوصول إلى ملفات الإدارة حالياً.</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto">حدث خطأ أثناء تحميل السجل من المجلد السحابي.</p>
            </div>
            <button
              onClick={() => fetchDriveItems(currentFolderId, searchQuery)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 bg-slate-100 text-slate-400 rounded-full">
              <FolderOpen className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-black text-slate-800">لا توجد ملفات إدارية حالياً.</h3>
            <p className="text-slate-500 text-sm max-w-md leading-relaxed">
              يمكنك رفع ملفات إدارية جديدة عبر زر «رفع ملف».
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Folders Section */}
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
            {fileItems.length > 0 && (
              <div className="space-y-3">
                {items.some((i) => i.isFolder) && (
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pt-2 border-t border-slate-100">
                    الملفات المتاحة
                  </h4>
                )}

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {fileItems.map((file) => (
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
                              onError={(e) => {
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

                          {/* Selection checkbox */}
                          <div className="absolute top-2.5 right-2.5 z-10">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(file.id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleSelect(file.id)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              title="تحديد الملف"
                            />
                          </div>

                          {/* Uploader tag */}
                          {file.uploader && (
                            <div className="absolute top-2.5 left-2.5 z-10">
                              <span className="text-[10px] font-extrabold bg-white/95 backdrop-blur-xs text-[#107c42] border border-[#107c42]/30 px-2.5 py-0.5 rounded-full shadow-xs">
                                {file.uploader}
                              </span>
                            </div>
                          )}
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
                            {file.description && (
                              <p className="text-xs text-slate-500 line-clamp-2 mb-2">{file.description}</p>
                            )}
                            <div className="text-xs text-slate-400 font-medium">
                              {metaDate(file)} • {file.uploader || '—'}
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                              <span>{metaDate(file)}</span>
                              <span className="font-mono">{formatFileSize(file.size)}</span>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
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
                              {file.canDelete && (
                                <button
                                  onClick={() => handleDelete(file)}
                                  className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-red-200"
                                  title="حذف (متاح خلال 24 ساعة من الرفع)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>حذف</span>
                                </button>
                              )}
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
                          <th className="py-3.5 px-4 w-10">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={toggleSelectAll}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              title="تحديد الكل"
                            />
                          </th>
                          <th className="py-3.5 px-4">اسم الملف</th>
                          <th className="py-3.5 px-4">الجهة الرافعة</th>
                          <th className="py-3.5 px-4">التاريخ</th>
                          <th className="py-3.5 px-4">الحجم</th>
                          <th className="py-3.5 px-4 text-center">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {fileItems.map((file) => (
                          <tr key={file.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(file.id)}
                                onChange={() => toggleSelect(file.id)}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
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
                              <span className="bg-[#107c42]/10 text-[#107c42] border border-[#107c42]/20 px-2.5 py-0.5 rounded-full text-xs font-bold">
                                {file.uploader || '—'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-600">{metaDate(file)}</td>
                            <td className="py-3.5 px-4 font-mono text-xs text-slate-500">{formatFileSize(file.size)}</td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleView(file)}
                                  className="px-2.5 py-1 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                                  title="معاينة الملف"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>افتح</span>
                                </button>
                                <button
                                  onClick={() => handleDownload(file)}
                                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer border border-blue-200"
                                  title="تنزيل الملف"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>تنزيل</span>
                                </button>
                                {file.canDelete && (
                                  <button
                                    onClick={() => handleDelete(file)}
                                    className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer border border-red-200"
                                    title="حذف (متاح خلال 24 ساعة من الرفع)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>حذف</span>
                                  </button>
                                )}
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

      {/* Upload Modal */}
      {uploadOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#107c42]/30 rounded-lg text-[#107c42]">
                  <Upload className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg">رفع ملف إداري جديد</h3>
              </div>
              <button
                onClick={() => setUploadOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  عنوان الملف <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="مثال: قرار دوام شهر سبتمبر"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">الوصف (اختياري)</label>
                <textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  rows={3}
                  placeholder="تفاصيل إضافية عن الملف..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">الملف</label>
                <input
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-[#107c42] file:text-white file:font-bold file:cursor-pointer hover:file:bg-[#107c42]/90 cursor-pointer"
                />
                <p className="text-xs text-slate-400 mt-1.5">
                  سيتم تسجيل اسم المدرسة كجهة رافعة والتاريخ تلقائياً. يمكن حذف الملف خلال 24 ساعة فقط من رفعه.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setUploadOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-100 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !uploadTitle.trim() || !uploadFile}
                className="px-5 py-2.5 rounded-xl bg-[#107c42] hover:bg-[#107c42]/90 active:bg-[#107c42]/80 text-white font-bold text-sm shadow-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>{uploading ? 'جاري الرفع...' : 'رفع الملف'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Previewer */}
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
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-0.5">
                    {previewItem.uploader && (
                      <span className="bg-[#107c42]/10 text-[#107c42] border border-[#107c42]/20 px-2 py-0.2 rounded-md font-bold">
                        {previewItem.uploader}
                      </span>
                    )}
                    {previewItem.size && <span>• {formatFileSize(previewItem.size)}</span>}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDownload(previewItem)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="تنزيل الملف"
                >
                  <Download className="w-4 h-4" />
                  <span>تنزيل</span>
                </button>
                {previewItem.canDelete && (
                  <button
                    onClick={() => handleDelete(previewItem)}
                    className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="حذف الملف"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف</span>
                  </button>
                )}
                <button
                  onClick={() => setPreviewItem(null)}
                  className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
                  title="إغلاق المعاينة"
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
