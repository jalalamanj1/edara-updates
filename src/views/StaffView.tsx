import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Staff } from '../types';
import { api } from '../services/api';
import { STAFF_JOB_CATEGORIES, STAFF_JOB_TITLES, JobCategory } from '../services/staffConfig';
import {
  BriefcaseBusiness,
  Search,
  UserPlus,
  Edit2,
  Trash2,
  Eye,
  Loader2,
  X,
  Save,
  UserCheck,
  FileSpreadsheet,
  Upload,
  Check,
  CheckSquare,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';

interface StaffViewProps {
  onRefreshStats: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const StaffView: React.FC<StaffViewProps> = ({
  onRefreshStats,
  showToast,
}) => {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [viewingStaff, setViewingStaff] = useState<Staff | null>(null);

  // Delete modal
  const [deletingStaff, setDeletingStaff] = useState<Staff | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Import preview modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreviewList, setImportPreviewList] = useState<Partial<Staff>[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  // Selected category in modal
  const [selectedCategory, setSelectedCategory] = useState<JobCategory>('TEACHING');

  // Form values
  const [formValues, setFormValues] = useState<{
    fullName: string;
    jobCategory: JobCategory;
    jobTitle: string;
    department: string;
    phone: string;
    email: string;
    address: string;
    employmentDate: string;
    notes: string;
  }>({
    fullName: '',
    jobCategory: 'TEACHING',
    jobTitle: 'مدرس',
    department: 'الكادر التعليمي',
    phone: '',
    email: '',
    address: '',
    employmentDate: new Date().toISOString().substring(0, 10),
    notes: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const fetchStaff = async (query = '') => {
    setIsLoading(true);
    try {
      const res = await api.getStaff(query);
      if (res.success) {
        setStaffList(res.staff);
      }
    } catch (err) {
      showToast('فشل في تحميل سجلات الكادر والموظفين.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStaff(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleOpenAdd = () => {
    setEditingStaff(null);
    setSelectedCategory('TEACHING');
    setFormValues({
      fullName: '',
      jobCategory: 'TEACHING',
      jobTitle: STAFF_JOB_TITLES['TEACHING'][0],
      department: 'الكادر التعليمي',
      phone: '',
      email: '',
      address: '',
      employmentDate: new Date().toISOString().substring(0, 10),
      notes: '',
    });
    setFormErrors({});
    setIsAddEditOpen(true);
  };

  const handleOpenEdit = (staff: Staff) => {
    setEditingStaff(staff);
    const cat = staff.jobCategory || 'TEACHING';
    setSelectedCategory(cat);
    setFormValues({
      fullName: staff.fullName,
      jobCategory: cat,
      jobTitle: staff.jobTitle,
      department: staff.department,
      phone: staff.phone,
      email: staff.email || '',
      address: staff.address,
      employmentDate: staff.employmentDate || '',
      notes: staff.notes || '',
    });
    setFormErrors({});
    setIsAddEditOpen(true);
  };

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!formValues.fullName.trim()) errs.fullName = 'اسم الموظف مطلوب.';
    if (!formValues.jobTitle.trim()) errs.jobTitle = 'المسمى الوظيفي مطلوب.';
    if (!formValues.phone.trim()) errs.phone = 'رقم الهاتف مطلوب.';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      if (editingStaff) {
        const res = await api.updateStaff(editingStaff.id, formValues);
        if (res.success) {
          showToast('تم تحديث بيانات الموظف بنجاح.', 'success');
          setIsAddEditOpen(false);
          fetchStaff(searchQuery);
          onRefreshStats();
        } else {
          showToast(res.message || 'فشل الحفظ.', 'error');
        }
      } else {
        const res = await api.createStaff(formValues);
        if (res.success) {
          showToast('تم إضافة الموظف بنجاح.', 'success');
          setIsAddEditOpen(false);
          fetchStaff(searchQuery);
          onRefreshStats();
        } else {
          showToast(res.message || 'فشل الحفظ.', 'error');
        }
      }
    } catch (err) {
      showToast('حدث خطأ أثناء الحفظ.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingStaff) return;
    setIsDeleting(true);
    try {
      const res = await api.deleteStaff(deletingStaff.id);
      if (res.success) {
        showToast('تم حذف الموظف بنجاح.', 'success');
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deletingStaff.id);
          return next;
        });
        setDeletingStaff(null);
        fetchStaff(searchQuery);
        onRefreshStats();
      } else {
        showToast(res.message || 'فشل الحذف.', 'error');
      }
    } catch (err) {
      showToast('حدث خطأ أثناء الحذف.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const visibleIds = staffList.map((s) => s.id);
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

  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const res = await api.deleteStaffBulk(Array.from(selectedIds));
      if (res.success) {
        showToast(res.message || 'تم حذف الموظفين المحددين بنجاح.', 'success');
        setIsBulkDeleteOpen(false);
        clearSelection();
        fetchStaff(searchQuery);
        onRefreshStats();
      } else {
        showToast(res.message || 'فشل الحذف.', 'error');
      }
    } catch (err) {
      showToast('حدث خطأ أثناء تنفيذ الحذف.', 'error');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (staffList.some((s) => s.id === id)) next.add(id);
      }
      return next;
    });
  }, [staffList]);

  // Excel Export
  const exportToExcel = () => {
    if (staffList.length === 0) {
      showToast('لا توجد بيانات موظفين لتصديرها.', 'info');
      return;
    }

    const dataRows = staffList.map((s) => ({
      'كود الموظف': String(s.staffCode || ''),
      'الاسم الكامل': s.fullName,
      'المسمى الوظيفي': s.jobTitle,
      'القسم / التخصص': s.department,
      'رقم الهاتف': String(s.phone || ''),
      'البريد الإلكتروني': s.email || '',
      'تاريخ المباشرة': s.employmentDate || '',
      'العنوان': s.address || '',
      'ملاحظات': s.notes || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataRows);
    XLSX.utils.book_append_sheet(wb, ws, 'الكادر والموظفون');

    XLSX.writeFile(wb, 'سجل الموظفين والكادر.xlsx');
    showToast('تم تصدير سجل الموظفين إلى ملف Excel بنجاح.', 'success');
  };

  // Excel Import
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const importedList: Partial<Staff>[] = [];

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const json: any[] = XLSX.utils.sheet_to_json(ws);
          for (const row of json) {
            const fullName =
              row['الاسم الكامل'] ||
              row['اسم الموظف'] ||
              row['الاسم'] ||
              row['اسم الموظف الكامل'] ||
              row['Name'] ||
              '';
            if (!fullName || !String(fullName).trim()) continue;

            importedList.push({
              staffCode: String(row['كود الموظف'] || row['الكود'] || '').trim(),
              fullName: String(fullName).trim(),
              jobTitle: String(row['المسمى الوظيفي'] || row['الوظيفة'] || row['اللقب الوظيفي'] || 'مدرس').trim(),
              department: String(row['القسم / التخصص'] || row['القسم'] || row['التخصص'] || 'عام').trim(),
              phone: String(row['رقم الهاتف'] || row['الهاتف'] || '').trim(),
              email: String(row['البريد الإلكتروني'] || row['الإيميل'] || '').trim(),
              address: String(row['العنوان'] || row['السكن'] || '').trim(),
              employmentDate: String(row['تاريخ المباشرة'] || row['تاريخ التعيين'] || '').trim(),
              notes: String(row['ملاحظات'] || '').trim(),
            });
          }
        }

        if (importedList.length === 0) {
          showToast('لم يتم العثور على سجلات موظفين صالحة في الملف.', 'error');
          return;
        }

        setImportPreviewList(importedList);
        setIsImportModalOpen(true);
      } catch (err: any) {
        showToast('فشل قراءة ملف Excel: ' + err.message, 'error');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const confirmImport = async () => {
    setIsImporting(true);
    try {
      const res = await api.importStaff(importPreviewList);
      if (res.success) {
        showToast(res.message || `تم استيراد ${res.count} موظف بنجاح.`, 'success');
        setIsImportModalOpen(false);
        setImportPreviewList([]);
        fetchStaff(searchQuery);
        onRefreshStats();
      } else {
        showToast(res.message || 'فشل استيراد البيانات.', 'error');
      }
    } catch (err: any) {
      showToast('حدث خطأ أثناء الاستيراد.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-8 select-none">
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <BriefcaseBusiness className="w-7 h-7 text-indigo-600" />
            <span>سجل الموظفين والكادر</span>
          </h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            إدارة الكادر التعليمي، الإداري، المعلمين والفنيين مع دعم استيراد وتصدير Excel
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Excel Export */}
          <button
            onClick={exportToExcel}
            className="bg-[#107c42] hover:bg-[#107c42]/90 active:bg-[#107c42]/80 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer text-sm"
            title="تصدير السجلات إلى ملف Excel"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>

          {/* Excel Import */}
          <label className="bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer text-sm">
            <Upload className="w-4 h-4" />
            <span>استيراد Excel</span>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>

          {/* Add Staff */}
          <button
            onClick={handleOpenAdd}
            className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold px-5 py-2.5 rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer text-sm"
          >
            <UserPlus className="w-5 h-5" />
            <span>إضافة موظف جديد</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث باسم الموظف، المسمى الوظيفي، القسم، الكود أو رقم الهاتف..."
            className="w-full pl-4 pr-11 py-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
          />
          <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
          >
            مسح البحث
          </button>
        )}
      </div>

      {/* Selection Toolbar */}
      {selectedCount > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-bold text-indigo-900">
            <CheckSquare className="w-4 h-4 text-indigo-600" />
            <span>
              تم تحديد {selectedCount} {selectedCount === 1 ? 'موظف' : selectedCount === 2 ? 'موظفان' : 'موظفين'}
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
              className="px-4 py-2 rounded-xl bg-white border border-indigo-200 text-indigo-700 font-bold text-sm flex items-center gap-2 hover:bg-indigo-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>إلغاء التحديد</span>
            </button>
          </div>
        </div>
      )}

      {/* Staff Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <span className="font-semibold text-sm">جاري تحميل سجل الموظفين...</span>
          </div>
        ) : staffList.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 bg-slate-100 text-slate-400 rounded-full">
              <BriefcaseBusiness className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">لا يوجد موظفون حتى الآن</h3>
            <p className="text-slate-500 text-sm max-w-sm">
              لم يتم تسجيل موظفين أو أعضاء كادر تعليمي في السجل.
            </p>
            <button
              onClick={handleOpenAdd}
              className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-all"
            >
              + إضافة موظف جديد
            </button>
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
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4">كود الموظف</th>
                  <th className="py-3.5 px-4">اسم الموظف الكامل</th>
                  <th className="py-3.5 px-4">المسمى الوظيفي</th>
                  <th className="py-3.5 px-4">القسم / التخصص</th>
                  <th className="py-3.5 px-4">رقم الهاتف</th>
                  <th className="py-3.5 px-4">تاريخ المباشرة</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.map((staff) => (
                  <tr
                    key={staff.id}
                    className={`transition-colors ${selectedIds.has(staff.id) ? 'bg-indigo-50/70' : 'hover:bg-slate-50/80'}`}
                  >
                    <td className="py-3.5 px-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(staff.id)}
                        onChange={() => toggleSelect(staff.id)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-700 dir-ltr text-right">
                      {staff.staffCode}
                    </td>
                    <td className="py-3.5 px-4 font-extrabold text-slate-900">{staff.fullName}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">{staff.jobTitle}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-600">{staff.department}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-700 dir-ltr text-right">
                      {staff.phone}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-600">{staff.employmentDate || '-'}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setViewingStaff(staff)}
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="عرض التفاصيل"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(staff)}
                          className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="تعديل"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingStaff(staff)}
                          className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="حذف"
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

      {/* Add / Edit Staff Modal */}
      {isAddEditOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                <span>{editingStaff ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'}</span>
              </h3>
              <button
                onClick={() => setIsAddEditOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم الموظف الكامل <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formValues.fullName}
                    onChange={(e) => setFormValues({ ...formValues, fullName: e.target.value })}
                    placeholder="الاسم الرباعي واللقب"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  />
                  {formErrors.fullName && <p className="text-red-600 text-xs font-bold mt-1">{formErrors.fullName}</p>}
                </div>

                {/* Job Category */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    فئة الوظيفة <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formValues.jobCategory}
                    onChange={(e) => {
                      const cat = e.target.value as JobCategory;
                      const titles = STAFF_JOB_TITLES[cat] || [];
                      setSelectedCategory(cat);
                      setFormValues({
                        ...formValues,
                        jobCategory: cat,
                        jobTitle: titles[0] || '',
                      });
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-none cursor-pointer"
                  >
                    {STAFF_JOB_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Job Title */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المسمى الوظيفي <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formValues.jobTitle}
                    onChange={(e) => setFormValues({ ...formValues, jobTitle: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-none cursor-pointer"
                  >
                    {(STAFF_JOB_TITLES[formValues.jobCategory] || []).map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </select>
                  {formErrors.jobTitle && <p className="text-red-600 text-xs font-bold mt-1">{formErrors.jobTitle}</p>}
                </div>

                {/* Department */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">القسم / التخصص</label>
                  <input
                    type="text"
                    value={formValues.department}
                    onChange={(e) => setFormValues({ ...formValues, department: e.target.value })}
                    placeholder="مثال: قسم العلوم / الشؤون الإدارية"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم الهاتف <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formValues.phone}
                    onChange={(e) => setFormValues({ ...formValues, phone: e.target.value })}
                    placeholder="07XXXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-none dir-ltr text-right"
                  />
                  {formErrors.phone && <p className="text-red-600 text-xs font-bold mt-1">{formErrors.phone}</p>}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={formValues.email}
                    onChange={(e) => setFormValues({ ...formValues, email: e.target.value })}
                    placeholder="staff@school.edu"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-none dir-ltr text-right"
                  />
                </div>

                {/* Employment Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ المباشرة</label>
                  <input
                    type="date"
                    value={formValues.employmentDate}
                    onChange={(e) => setFormValues({ ...formValues, employmentDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان</label>
                <input
                  type="text"
                  value={formValues.address}
                  onChange={(e) => setFormValues({ ...formValues, address: e.target.value })}
                  placeholder="عنوان السكن الكامل"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  value={formValues.notes}
                  onChange={(e) => setFormValues({ ...formValues, notes: e.target.value })}
                  placeholder="ملاحظات أو شهادات أو معلومات أخرى..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddEditOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm flex items-center gap-2 shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{editingStaff ? 'تحديث البيانات' : 'حفظ الموظف'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Import Preview Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold">معاينة استيراد بيانات الموظفين من Excel</h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="p-4 bg-indigo-50 text-indigo-900 rounded-2xl border border-indigo-200 flex items-center gap-3">
                <Check className="w-6 h-6 shrink-0 text-indigo-600" />
                <div>
                  <p className="font-extrabold text-sm">
                    عدد السجلات التي سيتم استيرادها: {importPreviewList.length} موظف/أستاذ
                  </p>
                  <p className="text-xs text-indigo-700 mt-0.5">
                    سيتم إنشاء كود وظيفي تلقائي لكل سجل مستورد.
                  </p>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-right">
                  <thead className="bg-slate-100 text-slate-700 font-bold">
                    <tr>
                      <th className="p-2.5">الاسم</th>
                      <th className="p-2.5">الوظيفة</th>
                      <th className="p-2.5">القسم</th>
                      <th className="p-2.5">الهاتف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreviewList.slice(0, 8).map((st, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">{st.fullName}</td>
                        <td className="p-2.5">{st.jobTitle}</td>
                        <td className="p-2.5">{st.department}</td>
                        <td className="p-2.5 dir-ltr text-right">{st.phone || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreviewList.length > 8 && (
                  <div className="p-2 bg-slate-50 text-center text-slate-500 text-[11px]">
                    + {importPreviewList.length - 8} سجل آخر غير معروض بالمعاينة
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsImportModalOpen(false)}
                disabled={isImporting}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={confirmImport}
                disabled={isImporting}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl flex items-center gap-2 shadow-md shadow-indigo-600/20"
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>تأكيد الاستيراد</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Staff Details Modal */}
      {viewingStaff && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <BriefcaseBusiness className="w-5 h-5 text-indigo-600" />
                <span>بطاقة الموظف</span>
              </h3>
              <button
                onClick={() => setViewingStaff(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="flex items-center justify-between p-3 bg-indigo-50/80 rounded-xl border border-indigo-100">
                <span className="font-bold text-indigo-900">{viewingStaff.fullName}</span>
                <span className="font-mono font-extrabold text-indigo-700 bg-white px-2.5 py-1 rounded-md border border-indigo-200">
                  {viewingStaff.staffCode}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">المسمى الوظيفي</span>
                  <span className="font-bold text-slate-800">{viewingStaff.jobTitle}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">القسم</span>
                  <span className="font-bold text-slate-800">{viewingStaff.department}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">رقم الهاتف</span>
                  <span className="font-bold text-slate-800 dir-ltr text-right">{viewingStaff.phone}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">تاريخ المباشرة</span>
                  <span className="font-bold text-slate-800">{viewingStaff.employmentDate || 'غير مدون'}</span>
                </div>
              </div>

              {viewingStaff.email && (
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">البريد الإلكتروني</span>
                  <span className="font-bold text-slate-800 dir-ltr text-right">{viewingStaff.email}</span>
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-xs text-slate-500 font-semibold block">العنوان</span>
                <span className="font-bold text-slate-800">{viewingStaff.address || 'غير مدون'}</span>
              </div>

              {viewingStaff.notes && (
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">ملاحظات</span>
                  <span className="font-medium text-slate-800">{viewingStaff.notes}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setViewingStaff(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-900"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Staff Confirm Modal */}
      <ConfirmModal
        isOpen={!!deletingStaff}
        title="تأكيد حذف الموظف"
        message={`هل أنت تأكد من رغبتك في حذف الموظف (${deletingStaff?.fullName})؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmText="حذف الموظف"
        cancelText="إلغاء"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingStaff(null)}
      />

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isBulkDeleteOpen}
        title="تأكيد حذف العناصر المحددة"
        message={`هل أنت متأكد من رغبتك في حذف ${selectedCount} ${selectedCount === 1 ? 'موظف' : selectedCount === 2 ? 'موظفان' : 'موظفين'} محددين بشكل نهائي؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmText="حذف المحدد"
        cancelText="إلغاء"
        variant="danger"
        isLoading={isBulkDeleting}
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setIsBulkDeleteOpen(false)}
      />
    </div>
  );
};
