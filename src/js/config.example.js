window.APP_CONFIG = {
  auth: {
    // List of Google accounts allowed to sign in
    allowedEmails: ["your-email@example.com", "partner-email@example.com"],
    // Google OAuth 2.0 Client ID
    googleClientId: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
  },
  app: {
    // Frontend Web URL (ex: Cloud Run service URL)
    frontendOrigin: "https://YOUR_CLOUD_RUN_URL",
    brandName: "うちの家計簿",
    titleLabel: "家計簿Webアプリ",
    version: "6.32",
    updateHistory: [
      {
        version: "6.32",
        date: "2026-06-01",
        summary: "Release update summary.",
      }
    ]
  },
  drive: {
    // Owner email of the Google Drive folder
    folderOwnerEmail: "your-email@example.com",
    // Folder path label shown in the UI
    folderPathLabel: "Google Drive/My Family Kakeibo/Receipts",
    // Google Drive folder ID for sync
    folderId: "YOUR_GOOGLE_DRIVE_FOLDER_ID",
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  },
  ai: {
    provider: "cloud-run",
    apiBaseUrl: "https://YOUR_CLOUD_RUN_URL",
    modelOption: "free_gemini35",
  }
};
