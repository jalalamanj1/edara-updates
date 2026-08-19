import { SchoolType } from './services/schoolConfig';

export type { SchoolType };

export interface SchoolProfile {
  id: string;
  fullName: string;
  schoolName: string;
  schoolType?: SchoolType;
  city?: string;
  principalTitle?: string;
  email?: string;
  phone: string;
  address: string;
  principalName: string;
  academicYear: string;
  registeredAt: string;
  updatedAt: string;
}

export type AccountType = 'school' | 'ministry_branch';

export interface Account {
  id: string;
  auth_user_id: string;
  account_type: AccountType;
  organization_name: string;
  email: string | null;
  maximum_devices: number;
  is_active: boolean;
  city?: string | null;
  created_at: string;
  updated_at: string;
}

export type DeviceStatus =
  | 'ok'
  | 'registered'
  | 'revoked'
  | 'limit'
  | 'no_account'
  | 'disabled'
  | 'unauthenticated'
  | 'not_found';

export interface Student {
  id: string;
  studentCode: string;
  fullName: string;
  gender: 'ذكر' | 'أنثى';
  dob: string;
  grade: string;
  section?: string;
  phone: string;
  parentName: string;
  parentPhone: string;
  address: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Staff {
  id: string;
  staffCode: string;
  fullName: string;
  jobCategory?: string;
  jobTitle: string;
  specialty?: string;
  department: string;
  phone: string;
  email?: string;
  address: string;
  employmentDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateGridColumn {
  key: string;
  header: string;
  fillWeight?: number;
  readOnly?: boolean;
  hidden?: boolean;
}

export interface TemplateFixedRow {
  label: string;
  placeholders: string[];
  hidden?: boolean;
}

export interface TemplateGrid {
  id: string;
  title?: string;
  addButtonLabel?: string;
  deleteButtonLabel?: string;
  height?: number;
  defaultRows?: number;
  fillEmpty?: boolean;
  autoCalculateTotal?: boolean;
  totalColumnIndex?: number;
  rowNumberSeparator?: string;
  columns: TemplateGridColumn[];
  fixedRows?: TemplateFixedRow[];
}

export interface DocumentTemplate {
  id: string;
  name: string;
  fileName?: string;
  filePath: string;
  fileType: string;
  placeholders: string[];
  allPlaceholders?: string[];
  category?: string;
  templateType?: 'single' | 'table';
  fieldLabels?: Record<string, string>;
  grids?: TemplateGrid[];
  employeeMode?: boolean;
  manualEditOption?: boolean;
  calculateTotals?: boolean;
  cleanUnusedPlaceholders?: boolean;
  allowAddRows?: boolean;
  defaultRows?: number;
  sortOrder?: number;
  previewPath?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedDocument {
  id: string;
  templateId: string;
  templateName?: string;
  name: string;
  filePath: string;
  placeholderValues?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolDocument {
  id: string;
  title: string;
  docType: string;
  description?: string;
  docDate: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MinistryDocument {
  id: string;
  title: string;
  ministryDepartment: string;
  docNumber: string;
  docDate: string;
  description?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupHistoryItem {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
  backupType?: 'local' | 'cloud_gdrive' | 'cloud_onedrive';
  status: 'success' | 'failed';
}

export type AppStep = 'splash' | 'login' | 'registration' | 'main';

export type NavigationTab = 
  | 'dashboard'
  | 'students'
  | 'staff'
  | 'documents'
  | 'ministry'
  | 'admin'
  | 'archive'
  | 'backup'
  | 'settings';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

