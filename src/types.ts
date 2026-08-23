import { SchoolType } from './services/schoolConfig';

export type { SchoolType };

export interface SchoolProfile {
  id: string;
  fullName: string;
  schoolName: string;
  schoolType?: SchoolType;
  city?: string;
  governorate?: string;
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
  // Official organization fields from edara_accounts (Supabase is authoritative)
  school_name?: string | null;
  principal_name?: string | null;
  manager_name?: string | null;
  owner_name?: string | null;
  job_title?: string | null;
  phone?: string | null;
  address?: string | null;
  governorate?: string | null;
  governorate_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GovernorateDriveConfig {
  governorateName: string;
  folderId: string;
  folderUrl: string;
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
  branch?: string;
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
  | 'admin'
  | 'governorate_drive'
  | 'archive'
  | 'backup'
  | 'mail'
  | 'settings';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

// ===== Correspondence (Official Administrative Mail from Edara News) =====

export interface Correspondence {
  id: string;
  message_id: string;
  sender_display_name: string;
  subject: string;
  description: string;
  sent_at: string;
  attachment_name: string;
  local_attachment_path: string;
  is_read: number;
  created_at: string;
}

// ===== Mail (Supabase RLS-enforced, receive-only) =====

export interface MailAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storedPath: string;
  createdAt: string;
}

export interface MailMessage {
  id: string;
  remoteId: number | null;
  folder: 'inbox' | 'sent';
  subject: string;
  body: string;
  senderAccountId: string;
  senderOrgType: string;
  senderOrgId: string;
  senderDisplayName: string;
  recipientOrgType: string;
  recipientOrgId: string;
  recipientDisplayName: string;
  isRead: number;
  status: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: MailAttachment[];
}

export interface MailContact {
  senderAccountId: string;
  senderDisplayName: string;
  unreadCount: number;
  totalCount: number;
  latestMessageAt: string;
  latestSubject: string;
  messages: MailMessage[];
}


