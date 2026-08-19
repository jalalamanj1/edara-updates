// Centralized Application Configuration
// The developer/application owner can configure global constants here.

export const APP_CONFIG = {
  ministryDocuments: {
    publicGoogleDriveFolderUrl:
      'https://drive.google.com/drive/folders/1KpUNo2Z0dqdxaY2kWkVT-67jrax2bmAy?usp=sharing',
  },
  adminFiles: {
    publicGoogleDriveFolderUrl:
      'https://drive.google.com/drive/folders/1xA6aTN-nrghtnWKdlRXrBlxLPSP94XDO?usp=sharing',
  },
};

/**
 * Extracts Google Drive Folder ID from a standard Google Drive folder URL
 */
export function extractFolderId(url: string = APP_CONFIG.ministryDocuments.publicGoogleDriveFolderUrl): string | null {
  if (!url) return null;
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
