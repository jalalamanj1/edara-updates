// Port of MENTIS Core/SubjectManager.cs — grade-aware subject lists for grid prefill.

export function extractGradeNumber(grade: string): number {
  if (!grade) return 0;
  if (grade.includes('الأول')) return 1;
  if (grade.includes('الثاني')) return 2;
  if (grade.includes('الثالث')) return 3;
  if (grade.includes('الرابع')) return 4;
  if (grade.includes('الخامس')) return 5;
  if (grade.includes('السادس')) return 6;
  return 0;
}

export function getPrimarySubjects(grade: string): string[] {
  const subjects = [
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
  if (extractGradeNumber(grade) >= 5) subjects.splice(7, 0, 'الاجتماعيات');
  return subjects;
}

export function getMiddleSchoolSubjects(grade: string): string[] {
  if (extractGradeNumber(grade) === 1) {
    return [
      'التربية الإسلامية',
      'اللغة العربية',
      'اللغة الإنجليزية',
      'الرياضيات',
      'العلوم',
      'الاجتماعيات',
      'الحاسوب',
      'التربية الفنية',
      'التربية الرياضية',
    ];
  }
  return [
    'التربية الإسلامية',
    'اللغة العربية',
    'اللغة الإنجليزية',
    'الرياضيات',
    'الفيزياء',
    'الكيمياء',
    'الأحياء',
    'الاجتماعيات',
    'الحاسوب',
    'التربية الفنية',
    'التربية الرياضية',
  ];
}

export function getScientificSubjects(): string[] {
  return [
    'التربية الإسلامية',
    'اللغة العربية',
    'اللغة الإنجليزية',
    'الرياضيات',
    'الفيزياء',
    'الكيمياء',
    'الأحياء',
    'التربية الفنية',
    'التربية الرياضية',
  ];
}

export function getLiterarySubjects(): string[] {
  return [
    'التربية الإسلامية',
    'اللغة العربية',
    'اللغة الإنجليزية',
    'الرياضيات',
    'التاريخ',
    'الجغرافية',
    'الاقتصاد',
    'الفلسفة وعلم النفس',
    'التربية الفنية',
    'التربية الرياضية',
  ];
}

export function getSubjects(grade: string): string[] {
  if (!grade) return [];
  if (grade.includes('متوسط')) return getMiddleSchoolSubjects(grade);
  if (grade.includes('علمي')) return getScientificSubjects();
  if (grade.includes('أدبي')) return getLiterarySubjects();
  if (grade.includes('ابتدائي')) return getPrimarySubjects(grade);
  return [];
}

export function isSubjectGridColumn(columnKey: string): boolean {
  return columnKey === 'sub' || columnKey === 'className' || columnKey.startsWith('sub');
}

export const PRIMARY_GRADES = [
  'الأول الابتدائي',
  'الثاني الابتدائي',
  'الثالث الابتدائي',
  'الرابع الابتدائي',
  'الخامس الابتدائي',
  'السادس الابتدائي',
];

export const SECONDARY_GRADES = [
  'الأول المتوسط',
  'الثاني المتوسط',
  'الثالث المتوسط',
  'الرابع العلمي',
  'الرابع الأدبي',
  'الخامس العلمي',
  'الخامس الأدبي',
  'السادس العلمي',
  'السادس الأدبي',
];

export const BIRTH_CITIES = [
  'بغداد',
  'البصرة',
  'نينوى',
  'أربيل',
  'السليمانية',
  'دهوك',
  'كركوك',
  'النجف',
  'كربلاء',
  'الأنبار',
  'ديالى',
  'واسط',
  'ميسان',
  'ذي قار',
  'صلاح الدين',
  'بابل',
  'القادسية',
  'المثنى',
];

// All Iraqi governorates (المحافظات) — used for the organization account city.
export const IRAQI_GOVERNORATES = [
  'بغداد',
  'البصرة',
  'نينوى',
  'أربيل',
  'السليمانية',
  'دهوك',
  'كركوك',
  'الأنبار',
  'ديالى',
  'صلاح الدين',
  'بابل',
  'كربلاء',
  'النجف',
  'واسط',
  'القادسية',
  'المثنى',
  'ذي قار',
  'ميسان',
];

export const ROUND_OPTIONS = ['الدور الأول', 'الدور الثاني', 'الدور الثالث'];
export const RESULT_OPTIONS = ['ناجح', 'راسب', 'مكمل'];
