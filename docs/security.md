# セキュリティ設計とリスク管理 (docs/security.md)

本アプリケーションを一般公開するにあたり、設計時に配慮すべきセキュリティ上のリスク、認可モデル、データの秘匿性について記述します。

---

## 1. 公開リポジトリに含めてはいけないもの

本アプリケーションを Git で管理したり、GitHub 等の公開リポジトリへ push する際は、以下の情報を**絶対にコミットに含めないでください**。これらはすでに `.gitignore` で除外対象となっていますが、手動での追加時にも十分注意してください。

- **`.env` ファイル**: バックエンドの環境変数（実プロジェクト名、APIキーなど）。
- **`src/js/config.js`**: フロントエンドの実設定（利用者のメールアドレス、OAuth クライアント ID など）。
- **サービスアカウントキー (`*.json`)**: GCP や Firebase の認証情報ファイル。
- **SSL証明書 / 秘密鍵 (`*.pem`, `*.key`)**: 暗号通信や署名に使う鍵。
- **実家計データ / レシート画像**: テスト用の CSV やエクスポートした XLSX ファイル、画像キャッシュ等。

---

## 2. フロントエンド認可の限界と対策

フロントエンドにおける `allowedEmails` によるチェックは、以下の理由から**セキュリティ境界として機能しません**。

- フロントエンドの JavaScript はブラウザのメモリ上で動作し、ユーザーがデベロッパーツール等を使って任意のコード（例: `allowedEmails` 配列の改ざんや判定ロジックのスキップ）を実行できます。
- フロントエンドの制限を突破したユーザーが、直接データベース (Firestore) やバックエンド (Cloud Run API) に不正なリクエストを送信するリスクがあります。

したがって、**本当のセキュリティ制御（認可）は、必ずサーバーサイドおよびデータベース（GCP / Firebase プラットフォーム側）で実施**しなければなりません。

---

## 3. Firestore Security Rules (データベースの認可)

Firestore へのすべての直接リクエストに対して、ユーザーの認証状態とメールアドレスを検証し、特定の家族メンバーのみが読み書きできるようにルールを定义します。

以下は、推奨される `firestore.rules` の実装例です：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 認証されており、かつメールアドレスが許可リストに含まれているか判定するヘルパー関数
    function isAllowedUser(auth) {
      return auth != null 
        && auth.token.email_verified == true 
        && (auth.token.email == "husband@example.com" || auth.token.email == "wife@example.com");
    }

    // すべてのコレクションに対する読み書きの制限
    match /expenses/{document} {
      allow read, write: if isAllowedUser(request.auth);
    }
    
    match /transfers/{document} {
      allow read, write: if isAllowedUser(request.auth);
    }

    match /childTransactions/{document} {
      allow read, write: if isAllowedUser(request.auth);
    }

    match /settings/{document} {
      allow read, write: if isAllowedUser(request.auth);
    }
  }
}
```

---

## 4. Cloud Run バックエンド側でのトークン検証

バックエンド API (`/api/...`) へのアクセス時にも、リクエストを送信してきたユーザーが許可されたユーザーであるかを検証します。

1. **ID トークンの検証**:
   フロントエンドは Google ログインに成功した後、取得した ID トークン (JWT) をリクエストの `Authorization: Bearer <ID_TOKEN>` ヘッダー、または安全なセッション Cookie を介してバックエンドへ送信します。
2. **バックエンドでの検証ロジック**:
   バックエンド（Flask）は、`google-auth` ライブラリを使用して Google の公開鍵で署名をデコードし、トークンの有効期限 (`exp`)、発行元 (`iss`)、およびメールアドレス (`email`) が許可リスト（例: `config.js` の `allowedEmails` に対応するバックエンド側の設定）に存在することを確認します。

---

## 5. API キーをブラウザに露出させない設計 (Gemini API)

Gemini API などの外部 API キーは、以下の理由から**フロントエンド（ブラウザ上の JavaScript）に置いてはいけません**。

- ブラウザに読み込まれた API キーは、悪意ある第三者によって簡単に抽出され、キーが不正利用される原因になります（特に従量課金APIの場合、経済的被害に直結します）。

**対策**:
- フロントエンドは Gemini API を直接叩かず、Cloud Run 上のバックエンド API（`/api/analyze-receipt` 等）を仲介します。
- Gemini API キーは GCP の **Secret Manager** に保存し、Cloud Run のコンテナ起動時にシークレットマウント（または環境変数への安全なマッピング）を利用してバックエンドプログラムにのみ渡します。これにより、クライアントからはキーが一切見えなくなります。

---

## 6. レシート画像・家計データのライフサイクル管理

- **一時保存用バケット (Cloud Storage)**:
  AI 解析のために一時アップロードされるレシート画像・PDF を保管する GCS バケットには、自動削除ライフサイクルルール（例: 7日〜30日経過後に自動削除）を設定し、不要な個人データがクラウド上に残り続けないように設計します。
- **実データの同期**:
  最終的なレシート画像のアーカイブや家計データ (CSV / XLSX / JSON) のバックアップは、ユーザー自身の権限を利用してユーザーが所有する Google Drive 上のプライベートフォルダ (`DRIVE_SHARED_FOLDER_ID`) に同期されます。これにより、サービス運営側のインフラに恒久的にデータを蓄積することなく、プライバシーを保護した安全なデータ管理を実現します。
