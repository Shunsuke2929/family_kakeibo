window.APP_CONFIG = {
  auth: {
    allowedEmails: ["your-email@example.com", "partner-email@example.com"],
    googleClientId: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
  },
  app: {
    frontendOrigin: "YOUR_CLOUD_RUN_URL",
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
  }
};
