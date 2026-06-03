# Android APK (P0)

このディレクトリは、既存 Webapp を止めずに Android APK 化を進めるための **分離された Android プロジェクト** です。

## 方針

- 既存 Webapp は Cloud Run 上でそのまま使い続ける
- Android 側は **Trusted Web Activity (TWA)** で本番 URL を開く
- Webapp 本体の認証や集計ロジックは Android 向けに作り替えない

## 現在の start URL

- `https://YOUR_CLOUD_RUN_URL/`
- 起動時は `source=android-twa` を付けて開きます
- 同じホストの https リンクは、Digital Asset Links が成立していればアプリ側で受けられるよう intent filter を入れています

## 主要情報

- package name: `YOUR_ANDROID_PACKAGE_NAME`
- app name: `うちの家計簿`
- minSdk: `26`
- targetSdk: `35`
- versionName: `0.2.0`

## Android Studio で開く

1. Android Studio を開く
2. `android/` ディレクトリをプロジェクトとして開く
3. 初回同期を待つ

## debug APK を作る

PowerShell 例:

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```

出力想定:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

## release ビルド

release 署名は `gradle.properties` かコマンドライン property から渡せるようにしています。

例:

```properties
KKB_RELEASE_STORE_FILE=C:\\keystore\\kakeibo-release.jks
KKB_RELEASE_STORE_PASSWORD=*****
KKB_RELEASE_KEY_ALIAS=kakeibo
KKB_RELEASE_KEY_PASSWORD=*****
```

PowerShell 例:

```powershell
Set-Location android
.\gradlew.bat assembleRelease
```

出力想定:

```text
android\app\build\outputs\apk\release\app-release.apk
```

## assetlinks

TWA をフルスクリーンで成立させるには、Web 側の `/.well-known/assetlinks.json` に **正しい SHA-256 fingerprint** を入れる必要があります。

現状のファイルは雛形です。debug / release の証明書 fingerprint が確定したら置き換えてください。

PowerShell 例:

```powershell
Set-Location android
.\gradlew.bat signingReport
```

`app > Variant: debug / release` の `SHA-256` を確認して、[/.well-known/assetlinks.json](.well-known/assetlinks.json) の該当 fingerprint と差し替えます。

## Pixel 10 Pro で優先確認すること

1. アプリ起動
2. Google ログイン
3. 集計 / 一覧 / 検索 / 送金 / 設定 / 履歴
4. レシート撮影
5. 画像ファイル選択
6. PWA 通知
7. 戻るボタン
8. 同じ本番URLのリンクをタップした時に、アプリへ戻って来るか
9. `Google Driveへ一括同期` の実行

## 実運用メモ

- ログイン保持は Web 側の Cookie セッションで維持されます。Android 側はそのセッションを保持するブラウザ実装に依存するため、Chrome 系ブラウザを前提に確認してください。
- `Brave` や一部のブラウザでは TWA としてではなく、単なるブラウザ表示へ寄ることがあります。実運用の確認は Chrome 系で行うのが安全です。
- release 署名後は `signingReport` で release fingerprint を取得し、`/.well-known/assetlinks.json` の release 用 placeholder を差し替えてください。

## 注意

- この Android プロジェクトは **Webapp と分離** されています
- Android 側が未完成でも、既存 Webapp 本体はそのまま利用可能です
