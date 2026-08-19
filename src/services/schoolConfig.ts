export type SchoolType = 'PRIMARY' | 'INTERMEDIATE' | 'HIGH_SCHOOL' | 'SECONDARY';

export interface SchoolTypeOption {
  value: SchoolType;
  label: string;
  description: string;
  grades: string[];
}

export const SCHOOL_TYPE_MAP: Record<SchoolType, SchoolTypeOption> = {
  PRIMARY: {
    value: 'PRIMARY',
    label: 'ابتدائية',
    description: 'المرحلة الابتدائية',
    grades: [
      'الأول الابتدائي',
      'الثاني الابتدائي',
      'الثالث الابتدائي',
      'الرابع الابتدائي',
      'الخامس الابتدائي',
      'السادس الابتدائي',
    ],
  },
  INTERMEDIATE: {
    value: 'INTERMEDIATE',
    label: 'متوسطة',
    description: 'المرحلة المتوسطة',
    grades: [
      'الأول المتوسط',
      'الثاني المتوسط',
      'الثالث المتوسط',
    ],
  },
  HIGH_SCHOOL: {
    value: 'HIGH_SCHOOL',
    label: 'إعدادية',
    description: 'المرحلة الإعدادية',
    grades: [
      'الرابع الإعدادي',
      'الخامس الإعدادي',
      'السادس الإعدادي',
    ],
  },
  SECONDARY: {
    value: 'SECONDARY',
    label: 'ثانوية',
    description: 'المرحلة الثانوية العامة',
    grades: [
      'الأول الثانوي',
      'الثاني الثانوي',
      'الثالث الثانوي',
      'الرابع الثانوي',
      'الخامس الثانوي',
      'السادس الثانوي',
    ],
  },
};

export const SCHOOL_TYPE_OPTIONS: SchoolTypeOption[] = [
  SCHOOL_TYPE_MAP.PRIMARY,
  SCHOOL_TYPE_MAP.INTERMEDIATE,
  SCHOOL_TYPE_MAP.HIGH_SCHOOL,
  SCHOOL_TYPE_MAP.SECONDARY,
];

export function resolveSchoolType(type?: SchoolType | string | null): SchoolType {
  if (!type) return 'PRIMARY';
  const str = String(type).trim();
  const upper = str.toUpperCase();

  if (upper === 'PRIMARY' || str === 'ابتدائية' || str.includes('ابتدائ')) {
    return 'PRIMARY';
  }
  if (upper === 'INTERMEDIATE' || str === 'متوسطة' || str.includes('متوسط')) {
    return 'INTERMEDIATE';
  }
  if (upper === 'HIGH_SCHOOL' || str === 'إعدادية' || str === 'اعدادية' || str.includes('إعداد') || str.includes('اعداد')) {
    return 'HIGH_SCHOOL';
  }
  if (upper === 'SECONDARY' || str === 'ثانوية' || str.includes('ثانوي')) {
    return 'SECONDARY';
  }

  if (SCHOOL_TYPE_MAP[type as SchoolType]) {
    return type as SchoolType;
  }

  return 'PRIMARY';
}

export function getGradesForSchoolType(type?: SchoolType | string | null): string[] {
  const resolved = resolveSchoolType(type);
  return SCHOOL_TYPE_MAP[resolved].grades;
}

export function getSchoolTypeLabel(type?: SchoolType | string | null): string {
  const resolved = resolveSchoolType(type);
  return SCHOOL_TYPE_MAP[resolved].label;
}

export function getSchoolTypeDetails(type?: SchoolType | string | null): SchoolTypeOption {
  const resolved = resolveSchoolType(type);
  return SCHOOL_TYPE_MAP[resolved];
}

export const DEFAULT_SECTIONS = ['أ', 'ب', 'ج', 'د', 'هـ'];
