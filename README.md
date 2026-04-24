# gcal-worktime-tracker

Google カレンダーの予定をもとに、会議や休憩などを除いた 1 日の「作業可能時間」を自動計算する Chrome 拡張機能。

## 機能

- **終日予定の自動作成**: 対象週の平日に `🧑‍💻 作業可能 6h30m` 形式の終日予定を自動生成（カレンダーを開くたびに上書き更新）
- **ポップアップ表示**: 拡張アイコンをクリックすると当日の残り作業可能時間を表示
- **オーバーレイ表示**: Google カレンダー上に残り時間をリアルタイムでピン留め表示

## 計算ロジック

```
作業可能時間 = 就業時間帯の長さ − Σ(就業時間帯と重なる予定の所要時間)
```

- 就業時間帯はデフォルト **10:00–19:00**（設定で変更可能）
- `responseStatus == "accepted"`（参加承認済み）の会議のみ差し引く
- `lunch` を含む予定は参加判定によらず差し引く（休憩扱い）
- 同じ時間帯の会議は重複カウントしない（マージ処理）
- 結果は **5 分単位で切り下げ**、負になる場合は **0h** にクランプ

### スキップされる日

プライマリカレンダーに opaque（busy 設定）な終日イベント（有給・OOO 等）がある日は計算・書き込みをスキップする。勤務場所設定（`workingLocation`）や transparent な終日イベントはスキップ対象外。

## セットアップ

### 1. Google Cloud Console の設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. **Google Calendar API** を有効化
3. 「認証情報」→「OAuth 2.0 クライアント ID を作成」
   - アプリケーションの種類: **Chrome 拡張機能**
   - アプリケーション ID: 後述の拡張機能 ID を入力
4. 発行されたクライアント ID をコピー

### 2. manifest.json にクライアント ID を設定

```json
"oauth2": {
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/calendar.events"]
}
```

### 3. Chrome に拡張機能を読み込む

1. `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選択
4. 表示された**拡張機能 ID**（32 文字）を Google Cloud Console のクライアント ID 設定に入力して保存
5. 拡張機能をリロード

## 使い方

- `calendar.google.com` を開くと自動的に今週の終日予定が生成される（作業日の残りがなければ翌週を先行生成）
- 拡張アイコンをクリックすると当日の残り作業可能時間が表示される
- カレンダー右下のオーバーレイにも残り時間が常時表示される

## 設定

拡張アイコン右クリック →「オプション」から以下を変更できる。変更は次回カレンダーロード時に反映される。

| 設定項目 | 説明 | デフォルト |
| --- | --- | --- |
| 集計開始曜日 | 週（スプリント）の起点となる曜日。作業日はその曜日から土日を除く 5 日間が自動決定される（例: 水曜→水木金月火） | 月曜日 |
| 開始時刻 | 就業開始時刻 | 10:00 |
| 終了時刻 | 就業終了時刻 | 19:00 |

## ファイル構成

```
├── manifest.json
├── src/
│   ├── background/background.js   # Service Worker（認証・API・計算）
│   ├── content/content.js         # オーバーレイ表示・SPA 遷移検知
│   ├── popup/                     # ポップアップ UI
│   ├── options/                   # 設定 UI
│   └── shared/
│       ├── constants.js
│       ├── timeUtils.js           # 計算ロジック
│       └── calendarApi.js         # Google Calendar API ラッパー
└── icons/
```

## 仕様

詳細は [docs/spec.md](docs/spec.md) を参照。
