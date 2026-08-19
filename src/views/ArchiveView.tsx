import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { ConfirmModal } from '../components/ConfirmModal';
import { Archive, FileText, Inbox, RefreshCw, ExternalLink, Building2, Hash, Trash2, CheckSquare, X, Share } from 'lucide-react';
import { ShareModal } from '../components/ShareModal';

interface ExportLogEntry {
  id: string;
  title: string;
  docDate: string;
  no: string;
  to: string;
  filePath: string;
  createdAt: string;
}

interface ArchiveViewProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshStats?: () => void;
}

export const ArchiveView: React.FC<ArchiveViewProps> = ({ showToast, onRefreshStats }) => {
  const [logs, setLogs] = useState<ExportLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Delete confirmation state
  const [deletingEntry, setDeletingEntry] = useState<ExportLogEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Share state
  const [sharingEntry, setSharingEntry] = useState<ExportLogEntry | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getExportLog();
      if (res.success) {
        setLogs(res.logs || []);
      } else {
        showToast(res.message || 'فشل تحميل سجل الصادرات.', 'error');
      }
    } catch (err) {
      showToast('حدث خطأ أثناء تحميل سجل الصادرات.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Keep selection in sync with loaded logs
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (logs.some((l) => l.id === id)) next.add(id);
      }
      return next;
    });
  }, [logs]);

  const handleOpen = (entry: ExportLogEntry) => {
    if (!entry.filePath) {
      showToast('لا يوجد ملف مرتبط بهذا القيد.', 'error');
      return;
    }
    api.openFile(entry.filePath);
  };

  const visibleIds = logs.map((l) => l.id);
  const selectedCount = selectedIds.size;
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected = visibleIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleDeleteConfirm = async () => {
    if (!deletingEntry) return;
    setIsDeleting(true);
    try {
      const res = await api.deleteExportLog(deletingEntry.id);
      if (res.success) {
        showToast('تم حذف القيد من الأرشيف بنجاح.', 'success');
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deletingEntry.id);
          return next;
        });
        setDeletingEntry(null);
        fetchLogs();
        onRefreshStats?.();
      } else {
        showToast(res.message || 'فشل حذف القيد.', 'error');
      }
    } catch (err) {
      showToast('حدث خطأ أثناء الحذف.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const res = await api.deleteExportLogBulk(Array.from(selectedIds));
      if (res.success) {
        showToast(res.message || `تم حذف ${res.deleted ?? selectedIds.size} قيود من الأرشيف بنجاح.`, 'success');
        setIsBulkDeleteOpen(false);
        clearSelection();
        fetchLogs();
        onRefreshStats?.();
      } else {
        showToast(res.message || 'فشل الحذف.', 'error');
      }
    } catch (err) {
      showToast('حدث خطأ أثناء تنفيذ الحذف.', 'error');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-8 select-none">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Archive className="w-7 h-7 text-blue-600" />
            <span>الأرشيف</span>
          </h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            سجل المستندات الصادرة التي تم إنشاؤها من النماذج
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-sm flex items-center gap-2 hover:bg-slate-50 hover:border-blue-300 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>تحديث</span>
        </button>
      </div>

      {/* Selection Toolbar */}
      {selectedCount > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
            <CheckSquare className="w-4 h-4 text-emerald-600" />
            <span>
              تم تحديد {selectedCount} {selectedCount === 1 ? 'قيد' : selectedCount === 2 ? 'قيدان' : 'قيود'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsBulkDeleteOpen(true)}
              className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>حذف المحدد</span>
            </button>
            <button
              onClick={clearSelection}
              className="px-4 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-700 font-bold text-sm flex items-center gap-2 hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>إلغاء التحديد</span>
            </button>
          </div>
        </div>
      )}

      {/* Export Log (سجل الصادرات) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            <span>سجل الصادرات ({logs.length})</span>
          </h3>
          <span className="text-xs text-slate-400 font-medium">اضغط على أي قيد لفتح المستند</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs font-semibold">جاري تحميل السجل...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
            <Inbox className="w-10 h-10 text-slate-300" />
            <p className="text-sm font-bold">لا توجد مستندات صادرة في السجل حالياً.</p>
            <p className="text-xs text-slate-400">ستظهر المستندات التي تنشئها من النماذج هنا تلقائياً.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-12">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={toggleSelectAll}
                      title="تحديد / إلغاء تحديد الكل"
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4">عنوان المستند</th>
                  <th className="py-3.5 px-4 text-center">التاريخ</th>
                  <th className="py-3.5 px-4 text-center">العدد</th>
                  <th className="py-3.5 px-4">الجهة</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => handleOpen(entry)}
                    className={`transition-colors hover:bg-blue-50/70 cursor-pointer ${selectedIds.has(entry.id) ? 'bg-emerald-50/70' : ''}`}
                  >
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(entry.id)}
                        onChange={() => toggleSelect(entry.id)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{entry.title}</span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-600 dir-ltr text-center align-middle">
                      {entry.docDate || '-'}
                    </td>
                    <td className="py-3.5 px-4 text-center align-middle">
                      <span className="inline-flex items-center justify-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-xs font-bold">
                        <Hash className="w-3 h-3" />
                        {entry.no || '-'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {entry.to ? (
                        <span className="inline-flex items-center gap-1 text-slate-700">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {entry.to}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpen(entry);
                          }}
                          className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1 text-xs font-bold transition-colors cursor-pointer"
                          title="فتح المستند"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>فتح</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSharingEntry(entry);
                          }}
                          className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1 text-xs font-bold transition-colors cursor-pointer"
                          title="مشاركة المستند"
                        >
                          <Share className="w-4 h-4" />
                          <span>مشاركة</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingEntry(entry);
                          }}
                          className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="حذف القيد"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={!!deletingEntry}
        title="حذف القيد"
        message={`هل أنت متأكد من حذف القيد (${deletingEntry?.title}) من الأرشيف؟ سيتم حذف ملف المستند المرتبط به أيضاً.`}
        confirmText="حذف القيد"
        cancelText="إلغاء"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingEntry(null)}
      />

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isBulkDeleteOpen}
        title="تأكيد حذف القيود المحددة"
        message={`هل أنت متأكد من رغبتك في حذف ${selectedCount} ${selectedCount === 1 ? 'قيد' : selectedCount === 2 ? 'قيدان' : 'قيود'} من الأرشيف بشكل نهائي؟ سيتم حذف ملفات المستندات المرتبطة بها أيضاً.`}
        confirmText="حذف المحدد"
        cancelText="إلغاء"
        variant="danger"
        isLoading={isBulkDeleting}
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setIsBulkDeleteOpen(false)}
      />

      {/* Share Modal */}
      <ShareModal entry={sharingEntry} onClose={() => setSharingEntry(null)} />
    </div>
  );
};

export default ArchiveView;
