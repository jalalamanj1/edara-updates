import React, { useState, useEffect } from 'react';
import { BackupHistoryItem } from '../types';
import { api } from '../services/api';
import { normalizeDigits } from '../utils/numberUtils';
import {
  DatabaseBackup,
  Download,
  Upload,
  History,
  ShieldCheck,
  FileArchive,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';

interface BackupRestoreViewProps {
  onDataReloaded: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const BackupRestoreView: React.FC<BackupRestoreViewProps> = ({
  onDataReloaded,
  showToast,
}) => {
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  // Selected restore file
  const [selectedRestoreFile, setSelectedRestoreFile] = useState<File | null>(null);

  // Restore confirm modal
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await api.getBackupHistory();
      if (res.success) {
        setHistory(res.backups);
      }
    } catch (err) {
      showToast('فشل تحميل سجل النسخ الاحتياطية.', 'error');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const res = await api.createBackup();
      if (res.success) {
        showToast('تم إنشاء وتخزين النسخة الاحتياطية بنجاح.', 'success');
        fetchHistory();
      } else {
        showToast(res.message || 'فشل إنشاء النسخة الاحتياطية.', 'error');
      }
    } catch (err) {
      showToast('حدث خطأ أثناء إنشاء النسخة الاحتياطية.', 'error');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedRestoreFile(e.target.files[0]);
      setIsRestoreConfirmOpen(true);
    }
  };

  const handleConfirmRestore = async () => {
    if (!selectedRestoreFile) return;
    setIsRestoring(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedRestoreFile);

      const res = await api.restoreBackup(formData);
      if (res.success) {
        showToast('تمت استعادة البيانات بنجاح من النسخة الاحتياطية!', 'success');
        setIsRestoreConfirmOpen(false);
        setSelectedRestoreFile(null);
        onDataReloaded();
        fetchHistory();
      } else {
        showToast(res.message || 'فشلت عملية استعادة النسخة الاحتياطية.', 'error');
      }
    } catch (err) {
      showToast('حدث خطأ أثناء استعادة البيانات.', 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'غير محدد';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-6 pb-8 select-none">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
          <DatabaseBackup className="w-7 h-7 text-blue-600" />
          <span>النسخ الاحتياطي</span>
        </h2>
        <p className="text-slate-500 text-sm mt-1 font-medium">
          حفظ كافة بيانات النظام، السجلات، والمستندات في أرشيف آمن مضغوط بصيغة (ZIP) مع إمكانية استعادتها بأي وقت.
        </p>
      </div>

      {/* Main Operations Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel 1: Create Backup */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl w-fit">
              <Download className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-black text-slate-900">إنشاء نسخة احتياطية جديدة</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              تتيح لك هذه العملية تجميع كافة بيانات الطلاب، الكادر، المستندات المدرسية، والكتب الوزارية وقواعد البيانات في ملف أرشيف واحد آمن.
            </p>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>محتويات الأرشيف المضغوط:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-500 pr-2">
                <li>قاعدة بيانات SQLite الكاملة (edara.db)</li>
                <li>المستندات العامة والمرفقات المخزنة</li>
                <li>كتب الوزارة والقرارات المنسوخة</li>
                <li>بيانات التسجيل وإعدادات المؤسسة</li>
              </ul>
            </div>
          </div>

          <button
            onClick={handleCreateBackup}
            disabled={isCreatingBackup}
            className="mt-6 w-full py-3.5 px-5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isCreatingBackup ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>جاري إنشاء وتجميع الأرشيف...</span>
              </>
            ) : (
              <>
                <DatabaseBackup className="w-5 h-5" />
                <span>إنشاء نسخة احتياطية الآن</span>
              </>
            )}
          </button>
        </div>

        {/* Panel 2: Restore Backup */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl w-fit">
              <Upload className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-black text-slate-900">استعادة نسخة احتياطية</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              استرجاع بيانات النظام من ملف أرشيف سابق. يتم إنشاء نسخة أمان تلقائية للبيانات الحالية قبل البدء بالاستعادة لمنع فقدان أية بيانات.
            </p>

            <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 text-center bg-slate-50/50 cursor-pointer transition-colors mt-2">
              <input
                type="file"
                accept=".zip"
                onChange={handleFileChange}
                className="hidden"
                id="restore-file-input"
              />
              <label htmlFor="restore-file-input" className="cursor-pointer block">
                <FileArchive className="w-10 h-10 text-blue-500 mx-auto mb-2" />
                <span className="font-bold text-slate-800 text-sm block">اضغط لاختيار ملف الأرشيف (ZIP)</span>
                <span className="text-xs text-slate-400 block mt-1">مثال: EDARA_Backup_2026-08-08.zip</span>
              </label>
            </div>
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>سيقوم النظام بتأمين نسخة احتياطية تلقائية قبل تنفيذ عملية الاستعادة.</span>
          </div>
        </div>
      </div>

      {/* Backup History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            <span>سجل النسخ الاحتياطية السابقة</span>
          </h3>
          <span className="text-xs font-bold text-slate-500">
            إجمالي النسخ: {normalizeDigits(history.length)}
          </span>
        </div>

        {isLoadingHistory ? (
          <div className="p-8 text-center flex items-center justify-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span>جاري تحميل السجل...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm font-medium">
            لا توجد نسخ احتياطية في السجل حتى الآن.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold text-xs uppercase">
                  <th className="py-3 px-4">اسم ملف النسخة الاحتياطية</th>
                  <th className="py-3 px-4">تاريخ الإنشاء</th>
                  <th className="py-3 px-4">حجم الملف</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-blue-700 dir-ltr text-right">
                      {item.fileName}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">
                      {normalizeDigits(new Date(item.createdAt).toLocaleString('ar-EG-u-nu-latn'))}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">
                      {formatFileSize(item.fileSize)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>مكتملة بنجاح</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <a
                        href={api.getBackupDownloadUrl(item.id)}
                        download
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>تحميل الأرشيف</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Required Confirmation Dialog for Restoration */}
      <ConfirmModal
        isOpen={isRestoreConfirmOpen}
        title="تأكيد استعادة النسخة الاحتياطية"
        message="سيتم استبدال البيانات الحالية بالبيانات الموجودة في النسخة الاحتياطية. هل تريد المتابعة؟"
        confirmText="استعادة النسخة الآن"
        cancelText="إلغاء"
        variant="warning"
        isLoading={isRestoring}
        onConfirm={handleConfirmRestore}
        onCancel={() => {
          setIsRestoreConfirmOpen(false);
          setSelectedRestoreFile(null);
        }}
      />
    </div>
  );
};
