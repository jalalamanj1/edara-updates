// Port of MENTIS Core/SubjectManager.cs — grade-aware subject lists for grid prefill.
// Subject logic is centralized in ../services/schoolConfig (Iraqi education structure).

import { getSubjectsForGrade } from '../services/schoolConfig';

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

export function getSubjects(grade: string, branch?: string): string[] {
  return getSubjectsForGrade(grade, branch);
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
