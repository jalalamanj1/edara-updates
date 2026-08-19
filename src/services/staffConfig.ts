export type JobCategory = 'TEACHING' | 'ADMINISTRATION' | 'SERVICES';

export interface StaffCategoryOption {
  value: JobCategory;
  label: string;
  titles: {
    title: string;
    requiresSpecialty: boolean;
  }[];
}

export const TEACHING_SPECIALTIES = [
  'الرياضيات',
  'اللغة العربية',
  'اللغة الإنجليزية',
  'اللغة الكردية',
  'العلوم',
  'الأحياء',
  'الكيمياء',
  'الفيزياء',
  'الاجتماعيات',
  'التاريخ',
  'الجغرافية',
  'التربية الإسلامية',
  'التربية الرياضية',
  'الحاسوب',
  'الفنون',
  'أخرى',
];

export const STAFF_CATEGORIES: Record<JobCategory, StaffCategoryOption> = {
  TEACHING: {
    value: 'TEACHING',
    label: 'التدريس',
    titles: [
      { title: 'مدرس', requiresSpecialty: true },
      { title: 'معلم', requiresSpecialty: true },
      { title: 'معلم جامعي', requiresSpecialty: true },
      { title: 'مدرس مساعد', requiresSpecialty: true },
    ],
  },
  ADMINISTRATION: {
    value: 'ADMINISTRATION',
    label: 'الإدارة',
    titles: [
      { title: 'مدير', requiresSpecialty: false },
      { title: 'معاون مدير', requiresSpecialty: false },
      { title: 'أمين سر', requiresSpecialty: false },
      { title: 'محاسب', requiresSpecialty: false },
      { title: 'مرشد تربوي', requiresSpecialty: false },
      { title: 'أمينات المكتبة', requiresSpecialty: false },
      { title: 'مسؤول شؤون الطلاب', requiresSpecialty: false },
      { title: 'أخرى', requiresSpecialty: false },
    ],
  },
  SERVICES: {
    value: 'SERVICES',
    label: 'الخدمات',
    titles: [
      { title: 'عامل خدمات', requiresSpecialty: false },
      { title: 'حارس', requiresSpecialty: false },
      { title: 'سائق', requiresSpecialty: false },
      { title: 'طباخ', requiresSpecialty: false },
      { title: 'مستخدم', requiresSpecialty: false },
      { title: 'عامل نظافة', requiresSpecialty: false },
      { title: 'حرفي / صيانه', requiresSpecialty: false },
      { title: 'أخرى', requiresSpecialty: false },
    ],
  },
};

export function getCategoryLabel(category?: string | null): string {
  if (!category) return '';
  if (STAFF_CATEGORIES[category as JobCategory]) {
    return STAFF_CATEGORIES[category as JobCategory].label;
  }
  return category;
}

export const STAFF_JOB_CATEGORIES = [
  { value: 'TEACHING' as JobCategory, label: 'التدريس' },
  { value: 'ADMINISTRATION' as JobCategory, label: 'الإدارة' },
  { value: 'SERVICES' as JobCategory, label: 'الخدمات' },
];

export const STAFF_JOB_TITLES: Record<JobCategory, string[]> = {
  TEACHING: ['مدرس', 'معلم', 'معلم جامعي', 'مدرس مساعد'],
  ADMINISTRATION: ['مدير', 'معاون مدير', 'أمين سر', 'محاسب', 'مرشد تربوي', 'أمين مكتبة', 'مسؤول شؤون الطلاب', 'أخرى'],
  SERVICES: ['عامل خدمات', 'حارس', 'سائق', 'طباخ', 'مستخدم', 'عامل نظافة', 'حرفي / صيانة', 'أخرى'],
};

export function isSpecialtyRequired(category?: string | null, title?: string | null): boolean {
  if (!category || !STAFF_CATEGORIES[category as JobCategory]) {
    return false;
  }
  if (category === 'TEACHING') return true;
  const match = STAFF_CATEGORIES[category as JobCategory].titles.find((t) => t.title === title);
  return match ? match.requiresSpecialty : false;
}
