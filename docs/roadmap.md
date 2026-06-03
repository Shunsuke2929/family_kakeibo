# Roadmap & Future Issues (docs/roadmap.md)

本リポジトリは、クリーンでサニタイズされたセルフホスト向けの家計簿テンプレートです。
「Codex for Open Source」への応募に向けて、あるいは応募直後のプロジェクト立ち上げ期に作成すべき GitHub Issue のテンプレート案を以下に整理します。

---

## 📋 GitHub Issue Templates

以下の Issue 案をそのまま GitHub に転記して活用してください。

### Issue 1: Add automated secret scanning workflow

**Title:**
`[Feat] Add automated secret scanning workflow via GitHub Actions`

**Description:**
```markdown
### 概要
本プロジェクトは家計データや API キー、証明書などの機密データを多く扱うため、誤って実値がリポジトリにコミットされるのを防ぐ必要があります。
Gitleaks や GitHub Secret Scanning などを活用した CI ワークフローを整備してください。

### 要件
- プルリクエスト（PR）作成時および main ブランチへの push 時に、自動で secret scan を実行する
- シークレット（Google OAuth Client ID、GCP プロジェクト ID、API キー等）の流出を検知した場合にビルドを失敗させる
- 除外設定ルール（.gitleaksignore 等）の整備

### 期待される成果
- CI/CD パイプラインにおける情報漏洩リスクの自動化された防止
```

---

### Issue 2: Add sample screenshots and demo walkthrough

**Title:**
`[Docs] Add sample screenshots and interactive demo walkthrough`

**Description:**
```markdown
### 概要
ユーザーがセルフホストを検討する際に、実際の UI や操作感（AI OCR 解析やダッシュボードの表示等）を視覚的に理解できるよう、サンプルのスクリーンショットやモック画像、デモウォークスルーのドキュメントを拡充してください。

### 要件
- レシートの画像解析登録、やりくり費 KPI 進捗バー、年間精算レポートなどの主要 UI スクリーンショットを追加する
- セキュリティ上のリスクを避けるため、スクリーンショット内の金額や名前はすべて架空のテストデータとすること
- README からこれらの資料へ容易にアクセスできるようにリンクを整備する

### 期待される成果
- 導入を検討する開発者にとっての理解しやすさの向上
```

---

### Issue 3: Add Firebase / Cloud Run setup validator

**Title:**
`[Feat] Add Firebase / Cloud Run setup validation script`

**Description:**
```markdown
### 概要
セルフホスト導入時、必要な GCP 設定（Secret Manager の権限、Firestore のコレクション定義、環境変数等）に不足がないかを自動でセルフチェックできる、CLI セットアップバリデーターを開発してください。

### 要件
- `backend/tools/validate_setup.py`（仮称）のようなスクリプトの作成
- ローカルの `.env` や環境変数を読み込み、必要な環境変数がセットされているか検証する
- Google Application Default Credentials (ADC) を使って、Firestore や Secret Manager への最低限の読み書き権限を確認する
- 不足している設定がある場合、具体的な解決ガイド（docs/setup.md への参照など）を表示する

### 期待される成果
- ユーザー側の導入フェーズにおける環境起因のエラーとトラブルシューティングコストの削減
```

---

### Issue 4: Improve receipt OCR provider abstraction

**Title:**
`[Refactor] Improve receipt OCR provider abstraction layer`

**Description:**
```markdown
### 概要
現在は Gemini API による OCR 解析がバックエンドに密結合しています。
他の OCR エンジンや LLM API（Anthropic Claude, OpenAI GPT-4o, ローカルの Tesseract OCR 等）へ容易に切り替えられるよう、OCR 解析機能の抽象化インターフェースを導入してください。

### 要件
- `backend/ocr/base.py` のようなベースクラス/インターフェースの定義
- 既存の Gemini API ロジックを `backend/ocr/providers/gemini_provider.py` へ分離
- バックエンド設定（環境変数）から OCR プロバイダーを切り替えられる構造の設計
- 解析データ（店舗名、日付、合計金額、明細配列）の共通インターフェーススキーマの策定

### 期待される成果
- 他の LLM やローカル OCR の活用による、クラウド利用料削減やクローズド環境への展開の容易化
```

---

### Issue 5: Add test coverage for monthly closing and shared expense flows

**Title:**
`[Test] Add comprehensive test coverage for monthly closing and shared expense calculations`

**Description:**
```markdown
### 概要
家計簿アプリのコアロジックである「やりくり費（主要3費目）の集計」「メンバー間での立替金精算」「月次クローズ処理」に対して、自動テストを追加してロジックの堅牢性を保証してください。

### 要件
- Python (Flask backend) における単体テスト（PyTest）の導入
- JS 側で計算ロジックが分離されている場合のユニットテスト（Jest / Vitest）の検討
- 代理負担、個人負担、口座間送金といった複数の家計簿データ入力シナリオにおける、計算結果の整合性（不一致が出ないこと）の自動検証テストコード作成

### 期待される成果
- リファクタリング時や機能追加時における計算バグの先回り防止
```
