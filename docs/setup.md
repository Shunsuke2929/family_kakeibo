# 詳細セットアップガイド (docs/setup.md)

本アプリケーションを独自の Google Cloud (GCP) および Firebase 環境に導入するための詳細な手順を説明します。

---

## 1. Google Cloud プロジェクトの作成と有効化

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスし、新しいプロジェクトを作成します（例: `my-family-kakeibo`）。
2. プロジェクトの課金を有効にします（Cloud Run や Secret Manager などのリソース利用に必要です）。
3. 以下の API を有効化します：
   - Cloud Run API
   - Cloud Build API
   - Secret Manager API
   - Google Drive API (Google Drive 同期を使用する場合)
   - Identity and Access Management (IAM) API

---

## 2. Firebase & Firestore の初期化

1. [Firebase Console](https://console.firebase.google.com/) にアクセスし、「プロジェクトを追加」から作成した GCP プロジェクトを選択して紐付けます。
2. 左メニューの **Build** > **Firestore Database** を選択し、「データベースの作成」を実行します。
   - ロケーションは `asia-northeast1 (東京)` または任意の近いリージョンを選択します。
   - 初期設定は「テストモード」ではなく「本番環境モード」を推奨します（Security Rules を後で適用します）。
3. 左メニューの **Build** > **Storage** を選択し、レシート画像を一時保管するための GCS バケットを作成します。バケット名はバックエンドの環境変数 `RECEIPT_TEMP_BUCKET` として設定します。

---

## 3. Google OAuth 2.0 クライアントの設定

ユーザー認証および Google Drive とのデータ同期を行うために OAuth 認証情報を設定します。

1. GCP コンソールの「API とサービス」 > 「OAuth 同意画面」に移動します。
   - ユーザータイプを「外部」または「内部」（家族全員が同じ Google Workspace ドメインの場合のみ）として作成します。
   - 必要なスコープとして `.../auth/drive.file` および `.../auth/drive.readonly` を追加します。
   - テストユーザーとして、家族のメールアドレスを登録します。
2. 「認証情報」画面に移動し、「認証情報を作成」 > 「OAuth クライアント ID」を選択します。
   - アプリケーションの種類: **ウェブ アプリケーション**
   - 名前: `Kakeibo Web`
   - **承認された JavaScript 生成元**:
     - `http://localhost:5000` (ローカルテスト用)
     - `https://YOUR_CLOUD_RUN_URL` (本番環境の Cloud Run URL)
   - **承認されたリダイレクト URI**:
     - `http://localhost:5000` (ローカルテスト用)
     - `https://YOUR_CLOUD_RUN_URL` (本番環境の Cloud Run URL)
3. 作成後に表示される **クライアント ID** を控えておきます。

---

## 4. Secret Manager によるシークレットの登録

API キーや認証情報などの機密データを安全に環境変数に注入するため、GCP の Secret Manager を利用します。

GCP コンソールの「セキュリティ」 > 「Secret Manager」に移動し、以下のシークレットを作成します。

1. **`kakeibo-gemini-free-api-key`**: Gemini API（無料枠）用の API キーを値として登録します。
2. **`kakeibo-gemini-paid-api-key`**: 必要に応じて、Gemini API（従量課金枠）用の API キーを値として登録します。使わない場合は無料用と同じキー、またはダミーの文字列を登録します。
3. **`kakeibo-discord-webhook-url`** (オプション): トランザクション登録・削除を Discord へ通知する場合は、Discord チャンネルの Webhook URL を登録します。

> [!NOTE]
> Cloud Run がこれらのシークレットを読み取るためには、Cloud Run のランタイムサービスアカウント（デフォルトでは `PROJECT_NUMBER-compute@developer.gserviceaccount.com`）に対して、対象シークレットの「シークレットの参照者 (Secret Manager Secret Accessor)」ロールを IAM で付与する必要があります。

---

## 5. 設定ファイルの実値設定

### 5.1 フロントエンド設定 (`src/js/config.js`)
`src/js/config.example.js` からコピーして `src/js/config.js` を作成します。

```javascript
window.APP_CONFIG = {
  auth: {
    // アプリにログインを許可する Google アカウント（メールアドレス）
    allowedEmails: ["your-email@example.com", "partner-email@example.com"],
    // 取得した Google OAuth 2.0 クライアント ID
    googleClientId: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
  },
  app: {
    // 本番環境のフロントエンドのベース URL (Cloud Run の URL など)
    frontendOrigin: "https://your-kakeibo-app.run.app",
    brandName: "家族の家計簿",
    titleLabel: "家計簿Webアプリ",
    version: "1.00",
    updateHistory: [ ... ],
  },
  drive: {
    // レシート画像・バックアップファイルを格納する Google Drive フォルダのオーナーメールアドレス
    folderOwnerEmail: "your-email@example.com",
    // 画面上に表示するフォルダパスのラベル
    folderPathLabel: "マイドライブ/家計簿バックアップ/レシート",
    // Google Drive フォルダの ID (ブラウザでそのフォルダを開いた時の URL 末尾の英数字)
    folderId: "YOUR_GOOGLE_DRIVE_FOLDER_ID",
    scopes: [ ... ],
  },
  ai: {
    provider: "cloud-run",
    apiBaseUrl: "https://your-kakeibo-app.run.app", // バックエンド API のベース URL
    modelOption: "free_gemini35",
  },
};
```

### 5.2 バックエンド設定 (`.env`)
`.env.example` からコピーして `.env` を作成します。

```ini
FLASK_ENV=production
FRONTEND_ORIGIN=https://your-kakeibo-app.run.app
RECEIPT_TEMP_BUCKET=your-firebase-project-id-receipt-temp
DRIVE_SHARED_FOLDER_ID=YOUR_GOOGLE_DRIVE_FOLDER_ID
GEMINI_FREE_API_KEY=kakeibo-gemini-free-api-key:latest
GEMINI_PAID_API_KEY=kakeibo-gemini-paid-api-key:latest
```

---

## 6. Cloud Run へのデプロイ

`cloudbuild.yaml.example` をコピーして `cloudbuild.yaml` を作成し、環境変数やプロジェクト設定を書き換えます。その後、以下のコマンドを実行してデプロイを行います。

```bash
cp cloudbuild.yaml.example cloudbuild.yaml
# 各種パラメータを実値に編集します
gcloud builds submit --config cloudbuild.yaml --project YOUR_GCP_PROJECT_ID .
```

デプロイ完了後、ターミナルに表示される Cloud Run の URL を、フロントエンドの `config.js` (`frontendOrigin`, `apiBaseUrl`) および Google OAuth クライアントの「承認されたリダイレクト URI」に反映します。
