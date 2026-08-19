// Centralized Public Google Drive Folder Configuration for Ministry Documents
import { APP_CONFIG, extractFolderId } from './appConfig';

export { APP_CONFIG, extractFolderId };
export const PUBLIC_MINISTRY_DRIVE_FOLDER_URL = APP_CONFIG.ministryDocuments.publicGoogleDriveFolderUrl;

export interface MinistryDriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size?: number;
  modifiedTime?: string;
  docNumber?: string;
  department?: string;
  downloadUrl?: string;
  viewUrl?: string;
  parentId?: string | null;
}
