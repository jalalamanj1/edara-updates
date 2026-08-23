import {
  SchoolProfile,
  Student,
  Staff,
  SchoolDocument,
  BackupHistoryItem,
  DocumentTemplate,
  GeneratedDocument,
  GovernorateDriveConfig,
} from '../types';

export interface InitResponse {
  success: boolean;
  registered: boolean;
  schoolProfile: SchoolProfile | null;
  stats: {
    studentsCount: number;
    staffCount: number;
    documentsCount: number;
    templatesCount?: number;
  };
}

export interface UpdateStatus {
  success: boolean;
  checkedAt: string | null;
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  downloadUrl: string | null;
  releaseNotes: string | null;
  error: string | null;
}

export const api = {
  async init(): Promise<InitResponse> {
    const res = await fetch('/api/init');
    return res.json();
  },

  async register(data: {
    fullName: string;
    schoolName: string;
    schoolType?: string;
    email?: string;
    phone: string;
    address: string;
    principalName: string;
    academicYear: string;
    city?: string;
  }): Promise<{ success: boolean; message: string; schoolProfile?: SchoolProfile }> {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Students
  async getStudents(search = ''): Promise<{ success: boolean; students: Student[] }> {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`/api/students${query}`);
    return res.json();
  },

  async createStudent(student: Partial<Student>): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student),
    });
    return res.json();
  },

  async importStudents(students: Partial<Student>[]): Promise<{ success: boolean; count: number; message: string }> {
    const res = await fetch('/api/students/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students }),
    });
    return res.json();
  },

  async updateStudent(id: string, student: Partial<Student>): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/students/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student),
    });
    return res.json();
  },

  async deleteStudent(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/students/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  async deleteStudentsBulk(ids: string[]): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/students/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return res.json();
  },

  // Staff
  async getStaff(search = ''): Promise<{ success: boolean; staff: Staff[] }> {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`/api/staff${query}`);
    return res.json();
  },

  async createStaff(staff: Partial<Staff>): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staff),
    });
    return res.json();
  },

  async importStaff(staff: Partial<Staff>[]): Promise<{ success: boolean; count: number; message: string }> {
    const res = await fetch('/api/staff/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff }),
    });
    return res.json();
  },

  async updateStaff(id: string, staff: Partial<Staff>): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/staff/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staff),
    });
    return res.json();
  },

  async deleteStaff(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/staff/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  async deleteStaffBulk(ids: string[]): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/staff/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return res.json();
  },

  // Document Templates
  async getTemplates(search = ''): Promise<{ success: boolean; templates: DocumentTemplate[] }> {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`/api/document-templates${query}`);
    return res.json();
  },

  async uploadTemplate(formData: FormData): Promise<{ success: boolean; message: string; template?: DocumentTemplate }> {
    const res = await fetch('/api/document-templates', {
      method: 'POST',
      body: formData,
    });
    return res.json();
  },

  async deleteTemplate(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/document-templates/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  async generateDocument(
    templateId: string,
    data: {
      documentName: string;
      studentId?: string;
      values: Record<string, string>;
      format?: 'docx' | 'xlsx' | 'pdf';
    }
  ): Promise<{ success: boolean; message: string; document?: GeneratedDocument; fileType?: string; exportPath?: string }> {
    const res = await fetch(`/api/document-templates/${templateId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async getLastNumber(): Promise<{ success: boolean; last: number; next: number }> {
    const res = await fetch('/api/templates/last-number');
    return res.json();
  },

  async setLastNumber(number: number): Promise<{ success: boolean; last: number; next: number }> {
    const res = await fetch('/api/templates/last-number', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number }),
    });
    return res.json();
  },

  // Export log (سجل الصادرات)
  async getExportLog(): Promise<{ success: boolean; message?: string; logs: Array<{ id: string; title: string; docDate: string; no: string; to: string; filePath: string; createdAt: string }> }> {
    const res = await fetch('/api/export-log');
    return res.json();
  },

  async deleteExportLog(id: string): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`/api/export-log/${id}`, { method: 'DELETE' });
    return res.json();
  },

  async deleteExportLogBulk(ids: string[]): Promise<{ success: boolean; message?: string; deleted?: number }> {
    const res = await fetch('/api/export-log/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return res.json();
  },

  // Data directory configuration
  async getDataDir(): Promise<{ success: boolean; dataDir: string }> {
    const res = await fetch('/api/config/data-dir');
    return res.json();
  },

  async setDataDir(dataDir: string): Promise<{ success: boolean; dataDir: string; requiresRestart?: boolean; message?: string }> {
    const res = await fetch('/api/config/data-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataDir }),
    });
    return res.json();
  },

  // Open a native folder picker (returns selected directory path or null)
  selectDirectory(): string | null {
    const desktop = (window as any).edaraDesktop;
    if (desktop?.selectDirectory) {
      try {
        return desktop.selectDirectory() || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  },

  async createManualCopy(
    templateId: string
  ): Promise<{ success: boolean; message: string; document?: GeneratedDocument }> {
    const res = await fetch(`/api/document-templates/${templateId}/manual-copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return res.json();
  },

  getTemplatePreviewUrl(id: string): string {
    return `/api/document-templates/${id}/preview`;
  },

  // Open a local file (Word/Excel) from the desktop shell
  openFile(filePath: string): void {
    const desktop = (window as any).edaraDesktop;
    if (desktop?.openFile) {
      desktop.openFile(filePath);
    } else {
      window.open('/api/documents/open?path=' + encodeURIComponent(filePath), '_blank');
    }
  },

  // Send a generated document to the default printer from the desktop shell
  printFile(filePath: string): void {
    const desktop = (window as any).edaraDesktop;
    if (desktop?.printFile) {
      desktop.printFile(filePath);
    }
  },

  // Open the system default mail client via a mailto: link
  openMailTo(mailtoUrl: string): void {
    const desktop = (window as any).edaraDesktop;
    if (desktop?.openMailTo) {
      desktop.openMailTo(mailtoUrl);
    } else if (typeof window !== 'undefined') {
      window.location.href = mailtoUrl;
    }
  },

  // Reveal a local file in the system file manager (Electron only)
  showItemInFolder(filePath: string): void {
    const desktop = (window as any).edaraDesktop;
    if (desktop?.showItemInFolder) {
      desktop.showItemInFolder(filePath);
    }
  },

  // Generated Documents
  async getGeneratedDocuments(search = ''): Promise<{ success: boolean; documents: GeneratedDocument[] }> {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await fetch(`/api/generated-documents${query}`);
    return res.json();
  },

  async deleteGeneratedDocument(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/generated-documents/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  getGeneratedDocDownloadUrl(id: string): string {
    return `/api/generated-documents/download/${id}`;
  },

  getGeneratedDocPdfUrl(id: string): string {
    return `/api/generated-documents/pdf/${id}`;
  },

  // School Documents
  async getDocuments(search = '', type = ''): Promise<{ success: boolean; documents: SchoolDocument[] }> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (type) params.append('type', type);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/documents${query}`);
    return res.json();
  },

  async createDocument(formData: FormData): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/documents', {
      method: 'POST',
      body: formData,
    });
    return res.json();
  },

  async deleteDocument(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/documents/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  async deleteDocumentsBulk(ids: string[]): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/documents/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return res.json();
  },

  getDocumentDownloadUrl(id: string): string {
    return `/api/documents/download/${id}`;
  },

  // Governorate Drive (Read-Only, Governorate-Scoped)
  async getGovernorateDriveConfig(): Promise<{
    success: boolean;
    config?: GovernorateDriveConfig;
    message?: string;
    code?: string;
  }> {
    // Send the Supabase auth token so the server can verify the caller
    const { supabase } = await import('./supabase');
    let token = '';
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token || '';
    }
    const res = await fetch('/api/governorate-drive/config', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.json();
  },

  async getGovernorateDriveFiles(folderId: string, search = ''): Promise<{
    success: boolean;
    items: Array<{
      id: string;
      name: string;
      mimeType: string;
      isFolder: boolean;
      size?: number;
      modifiedTime?: string;
      createdTime?: string;
      downloadUrl?: string;
      viewUrl?: string;
      parentId?: string | null;
    }>;
    folderName?: string;
    message?: string;
  }> {
    const params = new URLSearchParams();
    params.append('folderId', folderId);
    if (search) params.append('search', search);
    const res = await fetch(`/api/governorate-drive/files?${params.toString()}`);
    return res.json();
  },

  // Administrative Files (Google Drive folder with upload / delete)
  async getAdminFiles(folderId = '', search = ''): Promise<{
    success: boolean;
    items: Array<{
      id: string;
      name: string;
      mimeType: string;
      isFolder: boolean;
      size?: number;
      createdTime?: string;
      modifiedTime?: string;
      description?: string;
      uploader?: string | null;
      canDelete?: boolean;
      downloadUrl?: string;
      viewUrl?: string;
      parentId?: string | null;
    }>;
    folderName?: string;
    requiresAuth?: boolean;
    message?: string;
  }> {
    const params = new URLSearchParams();
    if (folderId) params.append('folderId', folderId);
    if (search) params.append('search', search);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/admin-files/list${queryString}`);
    return res.json();
  },
  async uploadAdminFile(formData: FormData): Promise<{ success: boolean; message: string; item?: any }> {
    const res = await fetch('/api/admin-files/upload', { method: 'POST', body: formData });
    return res.json();
  },
  async deleteAdminFile(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/admin-files/${id}`, { method: 'DELETE' });
    return res.json();
  },

  // Backups & Cloud Accounts
  async getBackupAccounts(): Promise<{
    success: boolean;
    googleAccount: { email: string; status: string } | null;
    microsoftAccount: { email: string; status: string } | null;
  }> {
    const res = await fetch('/api/backup-accounts');
    return res.json();
  },

  async connectBackupAccount(
    provider: 'google' | 'microsoft',
    email?: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/backup-accounts/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, email }),
    });
    return res.json();
  },

  async disconnectBackupAccount(provider: 'google' | 'microsoft'): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/backup-accounts/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    return res.json();
  },

  async getBackupHistory(): Promise<{ success: boolean; backups: BackupHistoryItem[] }> {
    const res = await fetch('/api/backups/history');
    return res.json();
  },

  async createBackup(): Promise<{ success: boolean; message: string; backup?: BackupHistoryItem }> {
    const res = await fetch('/api/backups/create', {
      method: 'POST',
    });
    return res.json();
  },

  async restoreBackup(formData: FormData): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/backups/restore', {
      method: 'POST',
      body: formData,
    });
    return res.json();
  },

  getBackupDownloadUrl(id: string): string {
    return `/api/backups/download/${id}`;
  },

  // Updates
  async getUpdateStatus(): Promise<UpdateStatus> {
    const res = await fetch('/api/updates/status');
    return res.json();
  },

  async checkUpdates(): Promise<UpdateStatus> {
    const res = await fetch('/api/updates/check', { method: 'POST' });
    return res.json();
  },

  // Auto-update: download the installer EXE via Electron main process
  async downloadUpdate(url: string): Promise<{ success: boolean; filePath?: string; error?: string; canceled?: boolean }> {
    const bridge = (window as any).edaraDesktop;
    if (!bridge?.downloadUpdate) return { success: false, error: 'Not in Electron' };
    return bridge.downloadUpdate(url);
  },

  // Auto-update: run the installer silently and quit the app
  async installUpdate(filePath: string): Promise<{ success: boolean; error?: string }> {
    const bridge = (window as any).edaraDesktop;
    if (!bridge?.installUpdate) return { success: false, error: 'Not in Electron' };
    return bridge.installUpdate(filePath);
  },

  // Auto-update: cancel an in-progress download
  cancelUpdateDownload(): void {
    const bridge = (window as any).edaraDesktop;
    if (bridge?.cancelUpdateDownload) bridge.cancelUpdateDownload();
  },

  // Auto-update: subscribe to download progress
  onUpdateDownloadProgress(callback: (data: { progress: number; downloadedBytes: number; totalBytes: number }) => void): void {
    const bridge = (window as any).edaraDesktop;
    if (bridge?.onUpdateDownloadProgress) bridge.onUpdateDownloadProgress(callback);
  },

  // Auto-update: unsubscribe from download progress
  offUpdateDownloadProgress(callback: (data: { progress: number; downloadedBytes: number; totalBytes: number }) => void): void {
    const bridge = (window as any).edaraDesktop;
    if (bridge?.offUpdateDownloadProgress) bridge.offUpdateDownloadProgress(callback);
  },

  // Generic external URL opener (https only).
  // In Electron this is routed to the MAIN process via the preload bridge, which
  // calls shell.openExternal() and opens the OS DEFAULT browser. It must NEVER use
  // window.open() inside Electron, because that creates an embedded BrowserWindow
  // and Google will refuse/stall the OAuth account chooser (embedded-webview block).
  openExternalUrl(url: string): void {
    let safeUrl = '';
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') safeUrl = parsed.toString();
    } catch (e) {
      return;
    }
    if (!safeUrl) return;
    const bridge = (typeof window !== 'undefined' && (window as any).edaraDesktop) || null;
    if (bridge?.openExternalUrl) {
      bridge.openExternalUrl(safeUrl); // Electron main process -> system browser
      return;
    }
    // Only use window.open in a real (non-Electron) browser context. Inside Electron we
    // must NEVER call window.open(): it spawns an embedded BrowserWindow whose redirect
    // Google blocks, which makes the consent "Continue" button do nothing.
    if (typeof window !== 'undefined' && !(bridge && bridge.isDesktop)) {
      window.open(safeUrl, '_blank', 'noopener,noreferrer');
    }
  },

  // Developer URL opener
  openExternalDeveloperWebsite(): void {
    const targetUrl = 'https://jalalamanj.online';
    if (typeof window !== 'undefined' && (window as any).edaraDesktop?.openExternalWebsite) {
      (window as any).edaraDesktop.openExternalWebsite(targetUrl);
    } else if (typeof window !== 'undefined') {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  },

  // ---- Correspondence ----
  async getCorrespondence(): Promise<{ success: boolean; correspondence: any[] }> {
    const res = await fetch('/api/correspondence');
    return res.json();
  },

  async getCorrespondenceById(messageId: string): Promise<{ success: boolean; correspondence?: any }> {
    const res = await fetch(`/api/correspondence/${encodeURIComponent(messageId)}`);
    return res.json();
  },

  async saveCorrespondence(data: {
    message_id: string;
    sender_display_name: string;
    subject: string;
    description: string;
    sent_at: string;
    attachment_name?: string;
    local_attachment_path?: string;
  }): Promise<{ success: boolean; id?: string; duplicate?: boolean; message?: string }> {
    const res = await fetch('/api/correspondence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async saveCorrespondenceAttachment(messageId: string, filename: string, buffer: ArrayBuffer): Promise<{ success: boolean; localPath?: string; filename?: string; message?: string }> {
    // Convert ArrayBuffer to base64
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const res = await fetch('/api/correspondence/attachment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId, filename, buffer: base64 }),
    });
    return res.json();
  },

  async markCorrespondenceRead(messageId: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/correspondence/${encodeURIComponent(messageId)}/read`, { method: 'PUT' });
    return res.json();
  },

  async openCorrespondenceAttachment(messageId: string): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`/api/correspondence/open/${encodeURIComponent(messageId)}`);
    return res.json();
  },

  async deleteCorrespondence(messageId: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/correspondence/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
    return res.json();
  },
};
