import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Student, SchoolProfile } from '../types';
import { api } from '../services/api';
import { getGradesForSchoolType, DEFAULT_SECTIONS, isPreparatoryGrade } from '../services/schoolConfig';
import {
  Users,
  Search,
  UserPlus,
  Edit2,
  Trash2,
  Eye,
  Loader2,
  X,
  Save,
  FileSpreadsheet,
  Upload,
  Check,
  CheckSquare,
  AlertCircle,
  User,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';

interface StudentsViewProps {
  schoolProfile?: SchoolProfile | null;
  onRefreshStats: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({
  schoolProfile,
  onRefreshStats,
  showToast,
}) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Available grades based on registered school type
  const availableGrades = getGradesForSchoolType(schoolProfile?.schoolType);

  // Modal states
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);

  // Delete modal
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Import preview modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreviewList, setImportPreviewList] = useState<Partial<Student>[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  // Form state
  const [formValues, setFormValues] = useState<{
    fullName: string;
    gender: 'ذكر' | 'أنثى';
    dob: string;
    grade: string;
    section: string;
    branch: string;
    phone: string;
    parentName: string;
    parentPhone: string;
    address: string;
    notes: string;
  }>({
    fullName: '',
    gender: 'ذكر',
    dob: '',
      grade: availableGrades[0] || 'الأول الابتدائي',
      section: 'أ',
      branch: '',
      phone: '',
      parentName: '',
    parentPhone: '',
    address: '',
    notes: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const fetchStudents = async (query = '') => {
    setIsLoading(true);
    try {
      const res = await api.getStudents(query);
      if (res.success) {
        setStudents(res.students);
      }
    } catch (err) {
      showToast('فشل في تحميل قائمة الطلاب.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStudents(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setFormValues({
      fullName: '',
      gender: 'ذكر',
      dob: '2012-01-01',
      grade: availableGrades[0] || 'الأول الابتدائي',
      section: 'أ',
      branch: '',
      phone: '',
      parentName: '',
      parentPhone: '',
      address: '',
      notes: '',
    });
    setFormErrors({});
    setIsAddEditOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormValues({
      fullName: student.fullName,
      gender: student.gender,
      dob: student.dob || '',
      grade: availableGrades.includes(student.grade) ? student.grade : availableGrades[0] || student.grade,
      section: student.section || 'أ',
      branch: student.branch || '',
      phone: student.phone,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      address: student.address,
      notes: student.notes || '',
    });
    setFormErrors({});
    setIsAddEditOpen(true);
  };

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!formValues.fullName.trim()) errs.fullName = 'اسم الطالب مطلوب.';
    if (!formValues.grade.trim()) errs.grade = 'الصف الدراسي مطلوب.';
    if (!formValues.phone.trim()) errs.phone = 'رقم هاتف الطالب مطلوب.';
    if (!formValues.parentName.trim()) errs.parentName = 'اسم ولي الأمر مطلوب.';
    if (!formValues.parentPhone.trim()) errs.parentPhone = 'رقم هاتف ولي الأمر مطلوب.';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      if (editingStudent) {
        const res = await api.updateStudent(editingStudent.id, formValues);
        if (res.success) {
          showToast('تم تحديث بيانات الطالب بنجاح.', 'success');
          setIsAddEditOpen(false);
          fetchStudents(searchQuery);
          onRefreshStats();
        } else {
          showToast(res.message || 'فشل الحفظ.', 'error');
        }
      } else {
        const res = await api.createStudent(formValues);
        if (res.success) {
          showToast('تم إضافة الطالب بنجاح.', 'success');
          setIsAddEditOpen(false);
          fetchStudents(searchQuery);
          onRefreshStats();
        } else {
          showToast(res.message || 'فشل الحفظ.', 'error');
        }
      }
    } catch (err) {
      showToast('حدث خطأ غير متوقع.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingStudent) return;
    setIsDeleting(true);
    try {
      const res = await api.deleteStudent(deletingStudent.id);
      if (res.success) {
        showToast('تم حذف الطالب بنجاح.', 'success');
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deletingStudent.id);
          return next;
        });
        setDeletingStudent(null);
        fetchStudents(searchQuery);
        onRefreshStats();
      } else {
        showToast(res.message || 'فشل الحذف.', 'error');
      }
    } catch (err) {
      showToast('حدث خطأ أثناء تنفيذ الحذف.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const visibleIds = students.map((s) => s.id);
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
      const res = await api.deleteStudentsBulk(Array.from(selectedIds));
      if (res.success) {
        showToast(res.message || 'تم حذف الطلاب المحددين بنجاح.', 'success');
        setIsBulkDeleteOpen(false);
        clearSelection();
        fetchStudents(searchQuery);
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
        if (students.some((s) => s.id === id)) next.add(id);
      }
      return next;
    });
  }, [students]);

  // Excel Export: Divided into SEPARATE WORKSHEETS by GRADE!
  const exportToExcel = () => {
    if (students.length === 0) {
      showToast('لا توجد بيانات طلاب لتصديرها.', 'info');
      return;
    }

    const wb = XLSX.utils.book_new();
    const rawYear = schoolProfile?.academicYear || '2026-2027';
    const yearStr = rawYear.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));

    // Get list of unique grades present or available
    const gradesSet = new Set<string>();
    availableGrades.forEach((g) => gradesSet.add(g));
    students.forEach((s) => {
      if (s.grade) gradesSet.add(s.grade);
    });

    let sheetCount = 0;
    gradesSet.forEach((g) => {
      const gradeStudents = students.filter((s) => s.grade === g);
      if (gradeStudents.length > 0) {
        const dataRows = gradeStudents.map((s) => ({
          'كود الطالب': String(s.studentCode || ''),
          'الاسم الكامل': s.fullName,
          'الجنس': s.gender,
          'الصف الدراسي': s.grade,
          'الشعبة': s.section || 'أ',
          'الفرع': s.branch || '',
          'رقم الهاتف': String(s.phone || ''),
          'اسم ولي الأمر': s.parentName,
          'رقم هاتف ولي الأمر': String(s.parentPhone || ''),
          'تاريخ الميلاد': s.dob || '',
          'العنوان': s.address || '',
          'ملاحظات': s.notes || '',
        }));

        const ws = XLSX.utils.json_to_sheet(dataRows);
        const sheetName = g.substring(0, 30);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        sheetCount++;
      }
    });

    if (sheetCount === 0) {
      const dataRows = students.map((s) => ({
        'كود الطالب': String(s.studentCode || ''),
        'الاسم الكامل': s.fullName,
        'الجنس': s.gender,
        'الصف الدراسي': s.grade,
        'الشعبة': s.section || 'أ',
        'رقم الهاتف': String(s.phone || ''),
        'اسم ولي الأمر': s.parentName,
        'رقم هاتف ولي الأمر': String(s.parentPhone || ''),
        'تاريخ الميلاد': s.dob || '',
        'العنوان': s.address || '',
        'ملاحظات': s.notes || '',
      }));
      const ws = XLSX.utils.json_to_sheet(dataRows);
      XLSX.utils.book_append_sheet(wb, ws, 'الطلاب');
    }

    const fileName = `طلاب المدرسة - ${yearStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast('تم تصدير سجلات الطلاب مقسمة بحسب الصفوف بنجاح.', 'success');
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
        const importedList: Partial<Student>[] = [];

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const json: any[] = XLSX.utils.sheet_to_json(ws);
          for (const row of json) {
            const fullName =
              row['الاسم الكامل'] ||
              row['اسم الطالب'] ||
              row['الاسم'] ||
              row['اسم الطالب الكامل'] ||
              row['Name'] ||
              '';
            if (!fullName || !String(fullName).trim()) continue;

            importedList.push({
              studentCode: String(row['كود الطالب'] || row['الكود'] || '').trim(),
              fullName: String(fullName).trim(),
              gender: row['الجنس'] === 'أنثى' || row['الجنس'] === 'انثى' ? 'أنثى' : 'ذكر',
              grade: String(row['الصف الدراسي'] || row['الصف'] || sheetName || availableGrades[0] || 'الأول الابتدائي').trim(),
              section: String(row['الشعبة'] || row['شعبة'] || 'أ').trim(),
              branch: String(row['الفرع'] || row['فرع'] || '').trim(),
              phone: String(row['رقم الهاتف'] || row['الهاتف'] || row['هاتف الطالب'] || '').trim(),
              parentName: String(row['اسم ولي الأمر'] || row['ولي الأمر'] || row['اسم الولي'] || '').trim(),
              parentPhone: String(row['رقم هاتف ولي الأمر'] || row['هاتف ولي الأمر'] || row['هاتف الولي'] || '').trim(),
              dob: String(row['تاريخ الميلاد'] || row['الميلاد'] || '').trim(),
              address: String(row['العنوان'] || row['السكن'] || '').trim(),
              notes: String(row['ملاحظات'] || '').trim(),
            });
          }
        }

        if (importedList.length === 0) {
          showToast('لم يتم العثور على سجلات طلاب صالحة في الملف.', 'error');
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
      const res = await api.importStudents(importPreviewList);
      if (res.success) {
        showToast(res.message || `تم استيراد ${res.count} طالب بنجاح.`, 'success');
        setIsImportModalOpen(false);
        setImportPreviewList([]);
        fetchStudents(searchQuery);
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
            <Users className="w-7 h-7 text-blue-600" />
            <span>سجل الطلاب</span>
          </h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            إدارة بيانات الطلاب المسجلين واستيراد/تصدير جداول Excel المقسمة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Excel Export Button */}
          <button
            onClick={exportToExcel}
            className="bg-[#107c42] hover:bg-[#107c42]/90 active:bg-[#107c42]/80 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer text-sm"
            title="تصدير السجلات إلى ملف Excel مقسم بحسب الصفوف"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>

          {/* Excel Import Button */}
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

          {/* Add Student Button */}
          <button
            onClick={handleOpenAdd}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 cursor-pointer text-sm"
          >
            <UserPlus className="w-5 h-5" />
            <span>إضافة طالب جديد</span>
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
            placeholder="البحث باسم الطالب، كود الطالب، رقم الهاتف أو اسم ولي الأمر..."
            className="w-full pl-4 pr-11 py-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
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
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-bold text-blue-900">
            <CheckSquare className="w-4 h-4 text-blue-600" />
            <span>
              تم تحديد {selectedCount} {selectedCount === 1 ? 'طالب' : selectedCount === 2 ? 'طالبان' : 'طلاب'}
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
              className="px-4 py-2 rounded-xl bg-white border border-blue-200 text-blue-700 font-bold text-sm flex items-center gap-2 hover:bg-blue-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>إلغاء التحديد</span>
            </button>
          </div>
        </div>
      )}

      {/* Students Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="font-semibold text-sm">جاري تحميل سجلات الطلاب...</span>
          </div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 bg-slate-100 text-slate-400 rounded-full">
              <Users className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">لا يوجد طلاب حتى الآن</h3>
            <p className="text-slate-500 text-sm max-w-sm">
              لم يتم العثور على طلاب مسجلين. يمكنك إضافة طالب جديد أو استيراد قائمة من ملف Excel.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleOpenAdd}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-all"
              >
                + إضافة طالب الآن
              </button>
            </div>
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
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4">كود الطالب</th>
                  <th className="py-3.5 px-4">اسم الطالب الكامل</th>
                  <th className="py-3.5 px-4">الجنس</th>
                  <th className="py-3.5 px-4">الصف الدراسي</th>
                  <th className="py-3.5 px-4">رقم الهاتف</th>
                  <th className="py-3.5 px-4">ولي الأمر</th>
                  <th className="py-3.5 px-4">هاتف ولي الأمر</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => (
                  <tr
                    key={student.id}
                    className={`transition-colors ${selectedIds.has(student.id) ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'}`}
                  >
                    <td className="py-3.5 px-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(student.id)}
                        onChange={() => toggleSelect(student.id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-700 dir-ltr text-right">
                      {student.studentCode}
                    </td>
                    <td className="py-3.5 px-4 font-extrabold text-slate-900">{student.fullName}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          student.gender === 'ذكر'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-pink-50 text-pink-700 border border-pink-200'
                        }`}
                      >
                        {student.gender}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <span>{student.grade}</span>
                        <span className="bg-slate-100 text-slate-700 border border-slate-200 text-xs px-2 py-0.5 rounded-md font-bold">
                          شعبة {student.section || 'أ'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700 dir-ltr text-right">
                      {student.phone}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">{student.parentName}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-700 dir-ltr text-right">
                      {student.parentPhone}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setViewingStudent(student)}
                          className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="عرض التفاصيل"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(student)}
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="تعديل"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingStudent(student)}
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

      {/* Add / Edit Student Modal */}
      {isAddEditOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <span>{editingStudent ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}</span>
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
                    اسم الطالب الكامل <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formValues.fullName}
                    onChange={(e) => setFormValues({ ...formValues, fullName: e.target.value })}
                    placeholder="الاسم الرباعي واللقب"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                  {formErrors.fullName && <p className="text-red-600 text-xs font-bold mt-1">{formErrors.fullName}</p>}
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الجنس</label>
                  <select
                    value={formValues.gender}
                    onChange={(e) => setFormValues({ ...formValues, gender: e.target.value as 'ذكر' | 'أنثى' })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
                  >
                    <option value="ذكر">ذكر</option>
                    <option value="أنثى">أنثى</option>
                  </select>
                </div>

                {/* Grade Dropdown based on registered school type */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الصف الدراسي <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formValues.grade}
                    onChange={(e) =>
                      setFormValues({ ...formValues, grade: e.target.value, branch: '' })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
                  >
                    {availableGrades.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  {formErrors.grade && <p className="text-red-600 text-xs font-bold mt-1">{formErrors.grade}</p>}
                </div>

                {/* Branch Dropdown — only for Preparatory (المرحلة الإعدادية) */}
                {isPreparatoryGrade(formValues.grade) && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      الفرع <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formValues.branch}
                      onChange={(e) => setFormValues({ ...formValues, branch: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
                    >
                      <option value="SCIENTIFIC">الفرع العلمي</option>
                      <option value="LITERARY">الفرع الأدبي</option>
                    </select>
                  </div>
                )}

                {/* Section Dropdown */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الشعبة <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formValues.section}
                    onChange={(e) => setFormValues({ ...formValues, section: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
                  >
                    {DEFAULT_SECTIONS.map((sec) => (
                      <option key={sec} value={sec}>
                        شعبة {sec}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الميلاد</label>
                  <input
                    type="date"
                    value={formValues.dob}
                    onChange={(e) => setFormValues({ ...formValues, dob: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم هاتف الطالب <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formValues.phone}
                    onChange={(e) => setFormValues({ ...formValues, phone: e.target.value })}
                    placeholder="07XXXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none dir-ltr text-right"
                  />
                  {formErrors.phone && <p className="text-red-600 text-xs font-bold mt-1">{formErrors.phone}</p>}
                </div>

                {/* Parent Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم ولي الأمر <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formValues.parentName}
                    onChange={(e) => setFormValues({ ...formValues, parentName: e.target.value })}
                    placeholder="اسم والد الطالب أو الولي"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                  {formErrors.parentName && <p className="text-red-600 text-xs font-bold mt-1">{formErrors.parentName}</p>}
                </div>

                {/* Parent Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم هاتف ولي الأمر <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formValues.parentPhone}
                    onChange={(e) => setFormValues({ ...formValues, parentPhone: e.target.value })}
                    placeholder="07XXXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none dir-ltr text-right"
                  />
                  {formErrors.parentPhone && <p className="text-red-600 text-xs font-bold mt-1">{formErrors.parentPhone}</p>}
                </div>

                {/* Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">العنوان السكني</label>
                  <input
                    type="text"
                    value={formValues.address}
                    onChange={(e) => setFormValues({ ...formValues, address: e.target.value })}
                    placeholder="المنطقة / المحلة / الزقاق"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  value={formValues.notes}
                  onChange={(e) => setFormValues({ ...formValues, notes: e.target.value })}
                  placeholder="أي ملاحظات حول الطالب، الحالة الصحية أو الدراسية..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
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
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm flex items-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{editingStudent ? 'تحديث البيانات' : 'حفظ الطالب'}</span>
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
                <FileSpreadsheet className="w-5 h-5 text-[#107c42]" />
                <h3 className="text-lg font-bold">معاينة استيراد بيانات الطلاب من Excel</h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 flex items-center gap-3">
                <Check className="w-6 h-6 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-extrabold text-sm">
                    عدد السجلات التي سيتم استيرادها: {importPreviewList.length} طالب
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    سيتم تخصيص أكواد تلقائية للطريقة، والتأكد من عدم تكرار البيانات.
                  </p>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-right">
                  <thead className="bg-slate-100 text-slate-700 font-bold">
                    <tr>
                      <th className="p-2.5">الاسم</th>
                      <th className="p-2.5">الجنس</th>
                      <th className="p-2.5">الصف</th>
                      <th className="p-2.5">الشعبة</th>
                      <th className="p-2.5">الهاتف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreviewList.slice(0, 8).map((st, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">{st.fullName}</td>
                        <td className="p-2.5">{st.gender}</td>
                        <td className="p-2.5">{st.grade}</td>
                        <td className="p-2.5">شعبة {st.section || 'أ'}</td>
                        <td className="p-2.5 dir-ltr text-right">{st.phone || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreviewList.length > 8 && (
                  <div className="p-2 bg-slate-50 text-center text-slate-500 text-[11px]">
                    + {importPreviewList.length - 8} سجل آخر غير معروض المعاينة
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
                className="px-6 py-2.5 bg-[#107c42] hover:bg-[#107c42]/90 text-white font-bold text-sm rounded-xl flex items-center gap-2 shadow-md shadow-[#107c42]/20"
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>تأكيد الاستيراد</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Student Details Modal */}
      {viewingStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                <span>بطاقة الطالب التفصيلية</span>
              </h3>
              <button
                onClick={() => setViewingStudent(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="flex items-center justify-between p-3 bg-blue-50/80 rounded-xl border border-blue-100">
                <span className="font-bold text-blue-900">{viewingStudent.fullName}</span>
                <span className="font-mono font-extrabold text-blue-700 bg-white px-2.5 py-1 rounded-md border border-blue-200">
                  {viewingStudent.studentCode}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">الجنس</span>
                  <span className="font-bold text-slate-800">{viewingStudent.gender}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">الصف الدراسي</span>
                  <span className="font-bold text-slate-800">{viewingStudent.grade}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">تاريخ الميلاد</span>
                  <span className="font-bold text-slate-800">{viewingStudent.dob || 'غير مسجل'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">هاتف الطالب</span>
                  <span className="font-bold text-slate-800 dir-ltr text-right">{viewingStudent.phone}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">اسم ولي الأمر</span>
                  <span className="font-bold text-slate-800">{viewingStudent.parentName}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">هاتف ولي الأمر</span>
                  <span className="font-bold text-slate-800 dir-ltr text-right">{viewingStudent.parentPhone}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-xs text-slate-500 font-semibold block">العنوان</span>
                <span className="font-bold text-slate-800">{viewingStudent.address || 'غير مدون'}</span>
              </div>

              {viewingStudent.notes && (
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500 font-semibold block">ملاحظات</span>
                  <span className="font-medium text-slate-800">{viewingStudent.notes}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setViewingStudent(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-900"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingStudent}
        title="تأكيد حذف الطالب"
        message={`هل أنت تأكد من رغبتك في حذف الطالب (${deletingStudent?.fullName}) بشكل نهائي؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmText="حذف الطالب"
        cancelText="إلغاء"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingStudent(null)}
      />

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isBulkDeleteOpen}
        title="تأكيد حذف العناصر المحددة"
        message={`هل أنت متأكد من رغبتك في حذف ${selectedCount} ${selectedCount === 1 ? 'طالب' : selectedCount === 2 ? 'طالبان' : 'طلاب'} محددين بشكل نهائي؟ لا يمكن التراجع عن هذا الإجراء.`}
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
