// Centralized Iraqi education structure: the single source of truth for
// school stages, grades, branches, age ranges and subjects.
// All UI (registration, students, documents) must consume this config.

export type SchoolStage = 'PRIMARY' | 'INTERMEDIATE' | 'PREPARATORY';
export type SchoolBranch = 'SCIENTIFIC' | 'LITERARY';

export interface GradeInfo {
  value: string;
  stage: SchoolStage;
  order: number;
  ageRange: [number, number];
}

export interface StageInfo {
  stage: SchoolStage;
  label: string; // 'المرحلة الابتدائية'
  shortLabel: string; // 'ابتدائية'
  description: string;
  grades: GradeInfo[];
}

export const EDUCAL_LABELS = {
  SCIENTIFIC: 'الفرع العلمي',
  LITERARY: 'الفرع الأدبي',
};

// --- Age-aware grade metadata -------------------------------------------------
function grade(value: string, order: number, ageRange: [number, number]): GradeInfo {
  return { value, stage: 'PRIMARY', order, ageRange };
}

export const EDUCATION_STRUCTURE: Record<SchoolStage, StageInfo> = {
  PRIMARY: {
    stage: 'PRIMARY',
    label: 'المرحلة الابتدائية',
    shortLabel: 'ابتدائية',
    description: 'المرحلة الابتدائية (الصف الأول حتى السادس الابتدائي)',
    grades: [
      { value: 'الأول الابتدائي', stage: 'PRIMARY', order: 1, ageRange: [6, 7] },
      { value: 'الثاني الابتدائي', stage: 'PRIMARY', order: 2, ageRange: [7, 8] },
      { value: 'الثالث الابتدائي', stage: 'PRIMARY', order: 3, ageRange: [8, 9] },
      { value: 'الرابع الابتدائي', stage: 'PRIMARY', order: 4, ageRange: [9, 10] },
      { value: 'الخامس الابتدائي', stage: 'PRIMARY', order: 5, ageRange: [10, 11] },
      { value: 'السادس الابتدائي', stage: 'PRIMARY', order: 6, ageRange: [11, 12] },
    ],
  },
  INTERMEDIATE: {
    stage: 'INTERMEDIATE',
    label: 'المرحلة المتوسطة',
    shortLabel: 'متوسطة',
    description: 'المرحلة المتوسطة (الأول حتى الثالث المتوسط)',
    grades: [
      { value: 'الأول المتوسط', stage: 'INTERMEDIATE', order: 1, ageRange: [12, 13] },
      { value: 'الثاني المتوسط', stage: 'INTERMEDIATE', order: 2, ageRange: [13, 14] },
      { value: 'الثالث المتوسط', stage: 'INTERMEDIATE', order: 3, ageRange: [14, 15] },
    ],
  },
  PREPARATORY: {
    stage: 'PREPARATORY',
    label: 'المرحلة الإعدادية',
    shortLabel: 'إعدادية',
    description: 'المرحلة الإعدادية (الرابع حتى السادس الإعدادي) مع الفرع العلمي أو الأدبي',
    grades: [
      { value: 'الرابع الإعدادي', stage: 'PREPARATORY', order: 4, ageRange: [15, 16] },
      { value: 'الخامس الإعدادي', stage: 'PREPARATORY', order: 5, ageRange: [16, 17] },
      { value: 'السادس الإعدادي', stage: 'PREPARATORY', order: 6, ageRange: [17, 18] },
    ],
  },
};

// --- School type -> grades (single source of truth) --------------------------
// The school type selected at registration is the ONLY thing that determines
// which grades are available across the whole application. Four school types:
//   PRIMARY     -> primary grades only
//   INTERMEDIATE-> intermediate grades only
//   HIGH        -> preparatory grades only (with Scientific/Literary branches)
//   SECONDARY   -> intermediate + preparatory grades (branches only on prep)
export type SchoolType = 'PRIMARY' | 'INTERMEDIATE' | 'HIGH' | 'SECONDARY';

export interface SchoolTypeOption {
  value: SchoolType;
  label: string;
  description: string;
  grades: string[];
}

// School type -> concrete grade list. SECONDARY is intermediate + preparatory.
export const SCHOOL_TYPE_GRADES: Record<SchoolType, string[]> = {
  PRIMARY: EDUCATION_STRUCTURE.PRIMARY.grades.map((g) => g.value),
  INTERMEDIATE: EDUCATION_STRUCTURE.INTERMEDIATE.grades.map((g) => g.value),
  HIGH: EDUCATION_STRUCTURE.PREPARATORY.grades.map((g) => g.value),
  SECONDARY: [
    ...EDUCATION_STRUCTURE.INTERMEDIATE.grades.map((g) => g.value),
    ...EDUCATION_STRUCTURE.PREPARATORY.grades.map((g) => g.value),
  ],
};

export const SCHOOL_TYPE_OPTIONS: SchoolTypeOption[] = [
  {
    value: 'PRIMARY',
    label: 'مدرسة ابتدائية',
    description: 'المرحلة الابتدائية (الأول حتى السادس الابتدائي)',
    grades: SCHOOL_TYPE_GRADES.PRIMARY,
  },
  {
    value: 'INTERMEDIATE',
    label: 'مدرسة متوسطة',
    description: 'المرحلة المتوسطة (الأول حتى الثالث المتوسط)',
    grades: SCHOOL_TYPE_GRADES.INTERMEDIATE,
  },
  {
    value: 'HIGH',
    label: 'مدرسة ثانوية (إعدادية)',
    description: 'المرحلة الإعدادية (الرابع حتى السادس الإعدادي) مع الفرع العلمي أو الأدبي',
    grades: SCHOOL_TYPE_GRADES.HIGH,
  },
  {
    value: 'SECONDARY',
    label: 'مدرسة ثانوية (متوسطة + إعدادية)',
    description: 'المرحلة المتوسطة (الأول حتى الثالث المتوسط) والمرحلة الإعدادية (الرابع حتى السادس الإعدادي)',
    grades: SCHOOL_TYPE_GRADES.SECONDARY,
  },
];

export function resolveSchoolType(type?: string | null): SchoolType {
  if (!type) return 'PRIMARY';
  const str = String(type).trim();
  const upper = str.toUpperCase();

  if (upper === 'PRIMARY' || str === 'ابتدائية' || str.includes('ابتدائ')) return 'PRIMARY';
  if (upper === 'INTERMEDIATE' || upper === 'MIDDLE' || str === 'متوسطة' || str.includes('متوسط')) return 'INTERMEDIATE';
  if (upper === 'HIGH' || upper === 'HIGH_SCHOOL' || str === 'ثانوية' || str.includes('ثانو')) return 'HIGH';
  if (upper === 'SECONDARY' || upper === 'SECONDARY_SCHOOL') return 'SECONDARY';

  // Legacy single-stage value: a preparatory-only school is a High School.
  if (upper === 'PREPARATORY' || str === 'إعدادية' || str === 'اعدادية' || str.includes('إعداد') || str.includes('اعداد')) {
    return 'HIGH';
  }

  if (SCHOOL_TYPE_OPTIONS.some((o) => o.value === (type as SchoolType))) return type as SchoolType;

  return 'PRIMARY';
}

export function getGradesForSchoolType(type?: string | null): string[] {
  const t = resolveSchoolType(type);
  return SCHOOL_TYPE_GRADES[t];
}

export function getSchoolTypeLabel(type?: string | null): string {
  const t = resolveSchoolType(type);
  return SCHOOL_TYPE_OPTIONS.find((o) => o.value === t)?.label || '';
}

export function getSchoolTypeDetails(type?: string | null): SchoolTypeOption {
  const t = resolveSchoolType(type);
  return SCHOOL_TYPE_OPTIONS.find((o) => o.value === t) || SCHOOL_TYPE_OPTIONS[0];
}

// --- Branch helpers -----------------------------------------------------------
export function isPreparatoryGrade(grade?: string | null): boolean {
  return !!grade && grade.includes('إعدادي');
}

export function getBranchesForGrade(grade?: string | null): SchoolBranch[] {
  return isPreparatoryGrade(grade) ? ['SCIENTIFIC', 'LITERARY'] : [];
}

export function getBranchLabel(branch?: SchoolBranch | string | null): string {
  if (branch === 'SCIENTIFIC') return EDUCAL_LABELS.SCIENTIFIC;
  if (branch === 'LITERARY') return EDUCAL_LABELS.LITERARY;
  return '';
}

// --- Age metadata -------------------------------------------------------------
export function getGradeInfo(grade?: string | null): GradeInfo | null {
  if (!grade) return null;
  for (const stage of Object.values(EDUCATION_STRUCTURE)) {
    const g = stage.grades.find((x) => x.value === grade);
    if (g) return g;
  }
  return null;
}

export function getAgeRange(grade?: string | null): [number, number] | null {
  return getGradeInfo(grade)?.ageRange || null;
}

// --- Subjects (centralized Iraqi curriculum) ----------------------------------
function extractGradeNumber(grade: string): number {
  if (!grade) return 0;
  if (grade.includes('الأول')) return 1;
  if (grade.includes('الثاني')) return 2;
  if (grade.includes('الثالث')) return 3;
  if (grade.includes('الرابع')) return 4;
  if (grade.includes('الخامس')) return 5;
  if (grade.includes('السادس')) return 6;
  return 0;
}

const PRIMARY_SUBJECTS = [
  'التربية الإسلامية',
  'اللغة العربية',
  'القراءة',
  'القواعد',
  'اللغة الإنجليزية',
  'الرياضيات',
  'العلوم',
  'التربية الفنية',
  'التربية الرياضية',
];

const INTERMEDIATE_SUBJECTS = [
  'التربية الإسلامية',
  'اللغة العربية',
  'اللغة الإنكليزية',
  'الرياضيات',
  'الأحياء',
  'الكيمياء',
  'الفيزياء',
  'الاجتماعيات',
  'الحاسوب',
  'التربية الأخلاقية',
];

const PREP_SCI_45 = [
  'التربية الإسلامية',
  'اللغة العربية',
  'اللغة الإنكليزية',
  'الرياضيات',
  'الفيزياء',
  'الكيمياء',
  'الأحياء',
  'الحاسوب',
];

const PREP_LIT_45 = [
  'التربية الإسلامية',
  'اللغة العربية',
  'اللغة الإنكليزية',
  'الرياضيات',
  'التاريخ',
  'الجغرافية',
  'علم الاجتماع',
  'الاقتصاد',
  'الحاسوب',
];

const PREP_SCI_6 = [
  'التربية الإسلامية',
  'اللغة العربية',
  'اللغة الإنكليزية',
  'الرياضيات',
  'الفيزياء',
  'الكيمياء',
  'الأحياء',
];

const PREP_LIT_6 = [
  'التربية الإسلامية',
  'اللغة العربية',
  'اللغة الإنكليزية',
  'الرياضيات',
  'التاريخ',
  'الجغرافية',
  'الاقتصاد',
];

export function getSubjectsForGrade(grade?: string | null, branch?: SchoolBranch | string | null): string[] {
  if (!grade) return [];
  if (grade.includes('ابتدائي')) {
    const subj = [...PRIMARY_SUBJECTS];
    if (extractGradeNumber(grade) >= 5) subj.splice(7, 0, 'الاجتماعيات');
    return subj;
  }
  if (grade.includes('متوسط')) return [...INTERMEDIATE_SUBJECTS];
  if (grade.includes('إعدادي')) {
    const num = extractGradeNumber(grade);
    const isLit = branch === 'LITERARY';
    if (num >= 6) return isLit ? [...PREP_LIT_6] : [...PREP_SCI_6];
    return isLit ? [...PREP_LIT_45] : [...PREP_SCI_45];
  }
  return [];
}

export const DEFAULT_SECTIONS = ['أ', 'ب', 'ج', 'د', 'هـ'];
