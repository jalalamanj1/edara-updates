import React, { useState } from 'react';
import { EdaraLogo } from './EdaraLogo';
import { SchoolProfile } from '../types';
import { Building2, User, Phone, Mail, MapPin, UserCheck, Calendar, Save, Loader2, AlertCircle, School } from 'lucide-react';
import { api } from '../services/api';
import { SCHOOL_TYPE_OPTIONS, SchoolType } from '../services/schoolConfig';
import { IRAQI_GOVERNORATES } from '../utils/subjects';
import { normalizeDigits } from '../utils/numberUtils';
import { updateAccountCity } from '../services/auth';

interface RegistrationWindowProps {
  onRegistered: (profile: SchoolProfile) => void;
}

export const RegistrationWindow: React.FC<RegistrationWindowProps> = ({ onRegistered }) => {
  // Generate academic years dynamically
  const currentYear = new Date().getFullYear();
  const academicYears = Array.from({ length: 6 }, (_, i) => {
    const start = currentYear - 1 + i;
    return `${start}–${start + 1}`;
  });

  const defaultAcademicYear = `${currentYear}–${currentYear + 1}`;

  const [formData, setFormData] = useState({
    fullName: '',
    schoolName: '',
    schoolType: 'SECONDARY' as SchoolType,
    email: '',
    phone: '',
    address: '',
    principalName: '',
    academicYear: defaultAcademicYear,
    city: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const validate = () => {
    const errs: Record<string, string> = {};

    if (!formData.fullName.trim()) {
      errs.fullName = 'هذا الحقل مطلوب.';
    }

    if (!formData.schoolName.trim()) {
      errs.schoolName = 'هذا الحقل مطلوب.';
    }

    if (!formData.schoolType) {
      errs.schoolType = 'يرجى اختيار نوع المدرسة.';
    }

    if (!formData.phone.trim()) {
      errs.phone = 'هذا الحقل مطلوب.';
    } else if (formData.phone.trim().length < 6) {
      errs.phone = 'يرجى إدخال رقم هاتف صحيح.';
    }

    if (!formData.address.trim()) {
      errs.address = 'هذا الحقل مطلوب.';
    }

    if (!formData.principalName.trim()) {
      errs.principalName = 'هذا الحقل مطلوب.';
    }

    if (!formData.city.trim()) {
      errs.city = 'يرجى اختيار المحافظة.';
    }

    if (!formData.academicYear.trim()) {
      errs.academicYear = 'هذا الحقل مطلوب.';
    }

    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        errs.email = 'يرجى إدخال بريد إلكتروني صحيح.';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!validate()) return;

    setIsLoading(true);
    try {
      const res = await api.register(formData);
      if (res.success && res.schoolProfile) {
        try {
          await updateAccountCity(formData.city.trim());
        } catch {
          /* Supabase city persistence is best-effort; local profile still holds it. */
        }
        onRegistered(res.schoolProfile);
      } else {
        setSubmitError(res.message || 'حدث خطأ أثناء حفظ بيانات التسجيل.');
      }
    } catch (err: any) {
      setSubmitError('تعذر الاتصال بالنظام المحلي.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-100 flex items-center justify-center p-6 overflow-y-auto dir-rtl select-none">
      <div className="bg-white rounded-3xl shadow-xl max-w-2xl w-full border border-slate-200 p-8 my-8">
        <div className="flex flex-col items-center text-center mb-8">
          <EdaraLogo size="lg" className="mb-4" />
          <h2 className="text-2xl font-black text-slate-900 mt-2">تسجيل المؤسسة</h2>
          <p className="text-slate-600 text-sm mt-1">
            يرجى إدخال البيانات الرئيسية للمدرسة أو المؤسسة التعليمية للبدء.
          </p>
        </div>

        {submitError && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Field 1: الاسم الكامل */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                الاسم الكامل للمسجّل <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="أدخل الاسم الكامل"
                  className={`w-full px-4 py-3 pr-10 rounded-xl border bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                    errors.fullName ? 'border-red-400 focus:ring-red-500' : 'border-slate-300 focus:ring-blue-600'
                  }`}
                />
                <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>
              {errors.fullName && <p className="text-red-600 text-xs font-bold mt-1">{errors.fullName}</p>}
            </div>

            {/* Field 2: اسم الشركة / المدرسة */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                اسم الشركة / المدرسة <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.schoolName}
                  onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                  placeholder="مثال: مدرسة الأمل الأهلية"
                  className={`w-full px-4 py-3 pr-10 rounded-xl border bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                    errors.schoolName ? 'border-red-400 focus:ring-red-500' : 'border-slate-300 focus:ring-blue-600'
                  }`}
                />
                <Building2 className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>
              {errors.schoolName && <p className="text-red-600 text-xs font-bold mt-1">{errors.schoolName}</p>}
            </div>

            {/* Field: نوع المدرسة */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                نوع المدرسة <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={formData.schoolType}
                  onChange={(e) => setFormData({ ...formData, schoolType: e.target.value as SchoolType })}
                  className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all appearance-none cursor-pointer"
                >
                  {SCHOOL_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <School className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>
              {errors.schoolType && <p className="text-red-600 text-xs font-bold mt-1">{errors.schoolType}</p>}
            </div>

            {/* Field: المحافظة (City / Governorate) */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                المحافظة <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className={`w-full px-4 py-3 pr-10 rounded-xl border bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 transition-all appearance-none cursor-pointer ${
                    errors.city ? 'border-red-400 focus:ring-red-500' : 'border-slate-300 focus:ring-blue-600'
                  }`}
                >
                  <option value="" disabled>
                    اختر المحافظة
                  </option>
                  {IRAQI_GOVERNORATES.map((gov) => (
                    <option key={gov} value={gov}>
                      {gov}
                    </option>
                  ))}
                </select>
                <MapPin className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>
              {errors.city && <p className="text-red-600 text-xs font-bold mt-1">{errors.city}</p>}
            </div>

            {/* Field 3: البريد الإلكتروني (OPTIONAL) */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                البريد الإلكتروني <span className="text-slate-400 text-xs font-normal">(اختياري)</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="name@school.edu"
                  className={`w-full px-4 py-3 pr-10 rounded-xl border bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 transition-all dir-ltr ${
                    errors.email ? 'border-red-400 focus:ring-red-500' : 'border-slate-300 focus:ring-blue-600'
                  }`}
                />
                <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>
              {errors.email && <p className="text-red-600 text-xs font-bold mt-1">{errors.email}</p>}
            </div>

            {/* Field 4: رقم الهاتف */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                رقم الهاتف <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: normalizeDigits(e.target.value) })}
                  placeholder="07XXXXXXXXX"
                  className={`w-full px-4 py-3 pr-10 rounded-xl border bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 transition-all dir-ltr ${
                    errors.phone ? 'border-red-400 focus:ring-red-500' : 'border-slate-300 focus:ring-blue-600'
                  }`}
                />
                <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>
              {errors.phone && <p className="text-red-600 text-xs font-bold mt-1">{errors.phone}</p>}
            </div>

            {/* Field 6: اسم المدير / المدير العام */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                اسم المدير / المدير العام <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.principalName}
                  onChange={(e) => setFormData({ ...formData, principalName: e.target.value })}
                  placeholder="اسم مدير المدرسة"
                  className={`w-full px-4 py-3 pr-10 rounded-xl border bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                    errors.principalName ? 'border-red-400 focus:ring-red-500' : 'border-slate-300 focus:ring-blue-600'
                  }`}
                />
                <UserCheck className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>
              {errors.principalName && <p className="text-red-600 text-xs font-bold mt-1">{errors.principalName}</p>}
            </div>

            {/* Field 7: السنة الدراسية */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                السنة الدراسية <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={formData.academicYear}
                  onChange={(e) => setFormData({ ...formData, academicYear: normalizeDigits(e.target.value) })}
                  className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all appearance-none cursor-pointer"
                >
                  {academicYears.map((yr) => (
                    <option key={yr} value={normalizeDigits(yr)}>
                      {normalizeDigits(yr)}
                    </option>
                  ))}
                </select>
                <Calendar className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>
              {errors.academicYear && <p className="text-red-600 text-xs font-bold mt-1">{errors.academicYear}</p>}
            </div>
          </div>

          {/* Field 5: العنوان */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1.5">
              العنوان الكامل <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <textarea
                rows={2}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="أدخل عنوان المدرسة الكامل (المحافظة / المدينة / الحي)"
                className={`w-full px-4 py-3 pr-10 rounded-xl border bg-slate-50 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.address ? 'border-red-400 focus:ring-red-500' : 'border-slate-300 focus:ring-blue-600'
                }`}
              />
              <MapPin className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
            {errors.address && <p className="text-red-600 text-xs font-bold mt-1">{errors.address}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-base shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 cursor-pointer mt-4"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>جاري حفظ بيانات المؤسسة...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>حفظ وبدء الاستخدام</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
