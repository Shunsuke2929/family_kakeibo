# 家計簿Webアプリ

スマホ向けの家計簿Webアプリです。公開前提の構成として、`画面 + AI API` をまとめて `Cloud Run` に載せられるようにしてあります。レンタルサーバーは不要です。

## 重要（2026-03-28 時点の現行構成）

- 共有データの正本は **Firestore** です。`localStorage` はキャッシュ用途です。
- Google 認証は維持しつつ、家計簿本体のログイン保持は **HttpOnly Cookie セッション** を優先します。ページ復帰・オンライン復帰・定期 keepalive でもセッション確認を行い、長期放置後も再ログイン頻度を下げる構成です。Drive アクセストークンは設定画面の Drive 確認と、ユーザー操作によるレシート一括同期で使います。
- レシート画像/PDFは **最大3ファイルまで選択後、Gemini AI解析ボタン押下で解析と Cloud Storage 一時保存を開始**します。Google Drive へ残す場合は、設定画面の **Google Driveへ一括同期** ボタンからユーザーOAuthでまとめて反映します。同期後、一覧・検索のレシートリンクは Drive リンクへ更新されます。
- レシート画像/PDFのAI解析後、商品別明細・税率・税込金額・税率別合計・読み取り不確実な項目は、支出フォームのメモ欄へ固定フォーマットで自動反映します。商品別明細は参考情報であり、保存金額はレシート総額を優先します。
- レシートの `未処理キュー` は **旧方式で保留になった再送待ちだけ** を示します。現行の通常導線では、解析開始時または保存時に Cloud Storage へ保護し、Drive へ残す時だけ設定画面から一括同期します。旧方式の再送待ちは7日超で自動削除されます。
- 起動直後はタブ未選択で始まり、本文はユーザーがタブを押した時だけ開きます。最新の household 正本を明示的に取り直したい時は、ヘッダーの `最新読込` ボタンを使います。
- 分割レシートは一覧カードの `まとめて編集` から、同じレシートに属する明細をまとめて修正できます。
- フロント実装は `app.js` 1本集中を少しずつ解きほぐしており、`settings / settlement / auth / receipt / shared-sync / search / monthly-close / expense-groups / expenses / expense-list` は `src/js/features/` へ段階分離しています。
- 固定費テンプレ設定は通常の設定画面から外し、支出登録フォーム内の `支出テンプレ` として読み込み・保存します。既存の `recurringTemplateConfig` は互換データとして保持します。
- PWA 通知は **バックエンドから** `expenses / transfers / child-transactions` の **create / delete のみ** を best effort 送信します。通知の有効化は各端末の設定タブから行います。
- Android APK 化は **既存 Webapp と分離した `android/` プロジェクト** で進めています。P0 は TWA ベースで、本番 URL をそのまま Android アプリとして開く方針です。
- UI/UX の現行デザイン正本は [DESIGN.md](DESIGN.md) の `Green Ledger / Household Finance Dashboard` です。白・淡いグリーン・深いグリーンを中心に、支出登録3導線、今月のやりくり費、主要3費目ミニ進捗を優先します。旧 `Fluent Family Warm / Dashboard-first` は履歴上の過去方針です。

## 構成

- フロント
  - [index.html](index.html)
  - [src/css/styles.css](src/css/styles.css)
  - [src/js/app.js](src/js/app.js)
  - [src/js/features/auth.js](src/js/features/auth.js)
  - [src/js/features/receipt.js](src/js/features/receipt.js)
  - [src/js/config.js](src/js/config.js)
- デザイン正本
  - [DESIGN.md](DESIGN.md)
- Cloud Run バックエンド
  - [backend/app.py](backend/app.py)
  - [backend/requirements.txt](backend/requirements.txt)
  - [Dockerfile](Dockerfile)
- Android APK (P0)
  - [android/README.md](android/README.md)
  - [FEATURE_ANDROID_APK_P0_SPEC.md](FEATURE_ANDROID_APK_P0_SPEC.md)
  - [IMPLEMENT_ANDROID_APK_P0_PROMPT.md](IMPLEMENT_ANDROID_APK_P0_PROMPT.md)

## Android APK (P0)

- 既存 Webapp を止めずに Android APK を追加するため、`android/` に **Trusted Web Activity (TWA)** ベースの独立プロジェクトを追加しています。
- Web 側の変更は最小限で、`/.well-known/assetlinks.json` と `manifest.json` の整備に留めています。
- Android 側は同じ本番 URL を app link でアプリへ戻しやすくし、release 署名プロパティ経由のビルド導線も用意しています。
- Android Studio での開き方、debug APK の作り方、assetlinks の差し替え方法、Pixel 10 Pro の確認観点は [android/README.md](android/README.md) を参照してください。

## できること

- Googleログイン
- レシート画像 / PDF / テキストの AI 解析
- 支出登録、編集、削除
- 一覧 / 検索 / 送金 / 子供口座 / 設定
- 集計タブの `月次集計 / 年次集計 / 精算レポートβ`
- 家計財布ルール、家計プール残高
- 支出テンプレの読み込み・保存
- XLSX出力
- Google Drive保存

## 公開方法

本アプリケーションは、GCP (Google Cloud Platform) および Firebase 上にセルフホストして利用するテンプレートです。

### 1. ローカル設定ファイルの作成

セキュリティ確保のため、個人データや認証情報を含む設定ファイルは本リポジトリの追跡対象から外されています（`.gitignore` に登録済み）。デプロイまたはローカルテストの前に、以下のテンプレートから実設定ファイルをコピーして作成してください。

```bash
# フロントエンド設定ファイルの作成
cp src/js/config.example.js src/js/config.js

# バックエンド環境変数の作成
cp .env.example .env

# デプロイ用構成ファイルの作成
cp cloudbuild.yaml.example cloudbuild.yaml
```

> [!WARNING]
> 作成した `src/js/config.js`、`.env`、および `cloudbuild.yaml` は個人用の本番設定、シークレット、およびアクセス権情報を含むため、**絶対に公開リポジトリへコミットしないでください**。これらはローカル/本番環境ごとの生成物として扱われます。

### 2. 環境変数の設定 (GCP / Firebase)

作成した `.env` および `cloudbuild.yaml` の各種プレースホルダーを環境に合わせて編集します。

- `FRONTEND_ORIGIN`: デプロイされた本番フロントエンドのドメイン（例: `https://your-app-xxxx.a.run.app`）。
- `HOUSEHOLD_ID`: Firestore上の世帯データを論理的に分離するためのドキュメント ID（例: `demo-household`）。
  > [!IMPORTANT]
  > バックエンド（`backend/app.py`）のデフォルト値は `YOUR_HOUSEHOLD_ID` です。セルフホストで利用する場合は、衝突を避けるために必ず独自の `HOUSEHOLD_ID` を明示的に設定してください。
- `RECEIPT_TEMP_BUCKET`: レシート画像の一時保管用に用意した Cloud Storage (GCS) のバケット名。
- `DRIVE_SHARED_FOLDER_ID`: レシート原本やデータバックアップを同期保存する Google Drive フォルダのフォルダ ID（URLの最後のランダムな文字列）。

### 3. Cloud Run へのデプロイ

バックエンド API および静的画面配信は、単一の Cloud Run サービスとして動作します。
作成した `cloudbuild.yaml` をご自身の環境の値に編集後、以下のコマンドで Cloud Build 経由でデプロイを実行します。

```powershell
gcloud config list
# Cloud Build 経由でデプロイを実行
CLOUDSDK_PYTHON="python" `
gcloud builds submit --config cloudbuild.yaml --project YOUR_GCP_PROJECT_ID .
```

### 4. config.js を本番URLに合わせる

デプロイ完了時に取得される本番サービス URL を、作成した `src/js/config.js` 内に反映します。

```js
window.APP_CONFIG = {
  auth: {
    allowedEmails: ["your-email@example.com", "partner-email@example.com"],
    googleClientId: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
  },
  app: {
    frontendOrigin: "https://YOUR_CLOUD_RUN_URL",
  },
  drive: {
    folderOwnerEmail: "your-email@example.com",
    folderPathLabel: "Google Drive/My Family Kakeibo/Receipts",
    folderId: "YOUR_GOOGLE_DRIVE_FOLDER_ID",
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  },
  ai: {
    provider: "cloud-run",
    apiBaseUrl: "https://YOUR_CLOUD_RUN_URL",
    modelOption: "free_gemini35",
  },
};
```

## Google 側で必要な設定

### Googleログイン

OAuth クライアントの `承認済みの JavaScript 生成元` に以下を入れます。

- ローカル確認用: `http://localhost:5500`
- 本番用: `https://YOUR_CLOUD_RUN_URL`

### テストユーザー

OAuth 同意画面のテストユーザーに以下を登録します。

- `your-email@example.com`
- `partner-email@example.com`

### Google Drive

保存先フォルダ名・パスは任意です。ご自身の Google Drive 上で任意のフォルダを作成し、その folder ID を設定してください。
（`folderPathLabel` は UI 上に表示する視覚的ラベルに過ぎず、実際の同期保存先はフォルダ ID で識別されます）

- オーナー: `your-email@example.com`
- フォルダパス表示ラベル (UI用): `Google Drive/My Family Kakeibo/Receipts` (または任意のパス表示文字列)
- フォルダID: `YOUR_GOOGLE_DRIVE_FOLDER_ID`

### Gemini API

Cloud Run 側で `GEMINI_FREE_API_KEY` を Secret Manager 参照として設定してください。ブラウザの `config.js` に API キーは入れません。完全Free運用の成立条件は、`GEMINI_FREE_API_KEY` の所属プロジェクトが Cloud Billing 未紐づきであることです。

通常利用は `free_gemini35` を既定にし、`free_gemini25` も同じFree Tier専用APIキーで使います。`free_gemini35` は Rate Limit時だけ `free_gemini25` へ自動fallbackし、`free_gemini25` は失敗時にFree軽量モデルへ最大1回だけfallbackします。`paid_gemini35` / `paid_gemini25` はユーザーが明示選択した場合だけ使い、Paid API内でも別モデルへ自動fallbackしません。Paid APIを使う場合も `GEMINI_PAID_API_KEY` を明示選択時だけ参照し、`GEMINI_API_KEY` / `GOOGLE_API_KEY` は使いません。

フロントは任意のモデル名を送らず、`free_gemini35` / `free_gemini25` / `paid_gemini35` / `paid_gemini25` の論理値だけを送ります。バックエンドで `gemini-3.5-flash` / `gemini-2.5-flash` / `gemini-2.5-flash-lite` にホワイトリスト変換し、Vertex AI、Google Search Grounding、Batch API、Context cache、Pro系モデル、自動Paid fallbackは使いません。

JSON解析失敗時は、Paidキー未設定とは分けて `GEMINI_INVALID_JSON` / `GEMINI_MAX_TOKENS` / `GEMINI_EMPTY_RESPONSE` などに分類します。JSON repair、最小JSONモードは選択中モデルの回復を優先し、Free 3.5からFree 2.5へのモデル跨ぎfallbackはRate Limit時だけ行います。response text断片・raw response・画像base64・レシート本文全文は永続ログに保存しません。

Free Tier の Gemini API では、Google が入力・出力をサービス改善に利用する条件があります。家計簿データやレシート画像は個人情報を含み得るため、Paid Tierを使わない方針と同時に、送信内容の最小化・確認運用を維持してください。

## ローカル確認

ローカルで画面確認するだけなら、今まで通り次で起動できます。

```powershell
python -m http.server 5500
```

アクセス先:

- [http://localhost:5500](http://localhost:5500)

補足:
- ローカルでは Googleログイン確認ができます
- AI候補抽出は `ai.apiBaseUrl` に Cloud Run URL を入れたあとに本番APIを使います
- Cloud Run 未設定時は簡易候補にフォールバックします

## 注意

- 以前 `config.js` に入れていた Gemini API キーは公開向きではありません
- もし過去にブラウザ側へ入れたキーを使っていたなら、Google AI Studio で再発行して古いキーは無効化するのをおすすめします
