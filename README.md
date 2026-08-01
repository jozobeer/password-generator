# パスワード生成ツール

指定した文字数と条件（英大文字・英小文字・数字・記号）に基づいてランダムなパスワードを生成する静的単一ページアプリ。生成結果をワンクリックでクリップボードにコピーできる。

## 公開URL

https://password-generator.jozo.beer

## 開発

[kojo](https://github.com/jozobeer/kojo)（1日1アプリ自動生成基盤）により生成されたリポジトリです。

- `npm run verify` — 検証（実装の完成条件チェック）
- `npm run deploy` — Cloudflare Workers へデプロイ

## 構成

- `public/index.html` — アプリ本体（CSS/JSインラインの単一ファイル）
- `PLAN.md` — 受け入れ条件付きの実装計画
