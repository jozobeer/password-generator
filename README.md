# パスワード生成ツール

文字数（8〜64、初期16）と文字種（英大文字・英小文字・数字・記号）を指定してランダムなパスワードを生成する静的単一ページアプリ。スライダーと数値入力は双方向に同期し、条件変更のたびに即時再生成する。「生成」で作り直し、「コピー」でクリップボードへ格納。生成条件は `localStorage`（キー `pwgen:options`）に自動保存され、再訪時に復元する（パスワード本体は保存しない）。

## 公開URL

https://password-generator.jozo.beer

## 開発

[kojo](https://github.com/jozobeer/kojo)（1日1アプリ自動生成基盤）により生成されたリポジトリです。

初回セットアップ: `npm install`（Playwright ブラウザ未取得の環境では `npx playwright install chromium`）

- `npm test` — Playwright によるブラウザテスト
- `npm run verify` — 不変条件チェック（favicon / apps.jozo.beer フッター）とテスト
- `npm run deploy` — Cloudflare Workers へデプロイ

## 構成

- `public/index.html` — アプリ本体（CSS/JSインラインの単一ファイル）
- `tests/app.spec.ts` — Playwright による受け入れ条件のテスト
- `PLAN.md` — 初回実装時の計画（歴史的文書。現状の正は README とテスト）
