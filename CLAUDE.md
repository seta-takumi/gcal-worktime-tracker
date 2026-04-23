# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 拡張機能の読み込み・動作確認

ビルドステップはない。`chrome://extensions` でこのフォルダを「パッケージ化されていない拡張機能」として読み込む。コード変更後は同画面でリロードボタンを押す。

Service Worker のログは `chrome://extensions` → 拡張機能カードの「Service Worker」リンクから開くコンソールで確認できる。content script のログは Google カレンダーのページのコンソールで確認できる。

## アーキテクチャ

### メッセージフロー

content script と popup は直接 API を呼ばず、すべて background（Service Worker）にメッセージを送って結果を受け取る。

```
content.js / popup.js
  ↓ chrome.runtime.sendMessage
background.js（Service Worker）
  ↓ Google Calendar API v3
  ↓ chrome.storage.sync / local
  → sendResponse
```

メッセージタイプは `src/shared/constants.js` に定義:
- `TRIGGER_WEEKLY_UPDATE`: カレンダーロード時に content.js が送信 → 対象週の終日予定を計算・書き込み
- `GET_TODAY_REMAINING`: popup.js と content.js が送信 → 当日の残り作業可能時間を返す

非同期レスポンスのため、`onMessage` リスナーは必ず `return true` している。

### 計算ロジック（`src/shared/timeUtils.js`）

- `getTargetWeek(date)`: 月〜金は今週、土日は翌週の月〜金を返す
- `calcWorkableMinutes(events, workStart, workEnd)`: `mergeIntervals` で重複をマージしてから差し引く
- `isSelfAccepted(ev)`: `attendees` に自分（`self: true`）がいて `responseStatus !== "accepted"` なら除外。参加者なし予定は常に対象
- `hasNonExtensionAllDayEvent(events)`: `transparent` / `workingLocation` な終日イベントはスキップ判定から除外

### ストレージ

- `chrome.storage.sync` キー `workingHours`: `{ start: "HH:mm", end: "HH:mm" }`
- `chrome.storage.local` キー `weekCache`: API エラー時のフォールバック用キャッシュ

### 拡張機能作成イベントの識別

`extendedProperties.private.workHoursExtension = "v1"` で自分が作ったイベントを識別する。タイトルは判定に使わない。

## 注意点

- background.js は `type: module` なので ES Modules の `import` が使える。content.js は通常スクリプトなので使えない（すべてのロジックは background 側に集約し、content.js はメッセージ送受信と DOM 操作のみ）
- `chrome.identity.getAuthToken` は `interactive: true` にしないとユーザー操作なしに認証できない。ポップアップ表示（`GET_TODAY_REMAINING`）では `interactive: false` を使いキャッシュトークンのみ試みる
- `oauth2.client_id` は GCP で「Chrome 拡張機能」タイプで作成したクライアント ID を設定する。拡張機能 ID（`chrome://extensions` に表示）と GCP のアプリケーション ID が一致している必要がある
