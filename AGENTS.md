# パスワード生成ツール

文字数と文字種条件からランダムなパスワードを生成し、ワンクリックでクリップボードへコピーできる静的単一ページアプリ。

## アプリ概要と構成

- エントリ: `public/index.html`（CSS/JS インライン、フレームワークなし）
- 文字数: `#lengthRange`（range）と `#lengthNumber`（number）で 8〜64。`#lengthValue` に現在値を表示。初期値 16。`clampLength()` で正規化し、両 UI と表示を同期
- 文字種: `#upper` / `#lower` / `#digits` / `#symbols`（初期はすべて ON）。各プールは `ABCDEFGHIJKLMNOPQRSTUVWXYZ` / `abcdefghijklmnopqrstuvwxyz` / `0123456789` / `!@#$%^&*()_+-=[]{}|;:,.<>?`
- 生成: `crypto.getRandomValues` による棄却サンプリングで偏りを抑え、選択文字種が複数あるときは各集合から最低1文字を確保（長さが足りる場合）し、Fisher–Yates でシャッフル。条件変更や「生成」(`#generateBtn`) で `refreshPassword()` が走る
- 文字種ゼロ選択: `#password` を空にし、`#message` に「文字種を1つ以上選んでください」
- コピー: `#copyBtn` → `navigator.clipboard.writeText`。成功時はボタン文言を一時的に「コピーしました」、`#message` に成功表示
- 永続化: キー `pwgen:options` に `{ length, upper, lower, digits, symbols }` のみ保存。壊れた値・全文字種 OFF・読み書き失敗時は既定値へフォールバック。パスワード本体は保存しない
- テスト: `tests/app.spec.ts`（Playwright、`file://` で `public/index.html` を開く）
- 配信: Cloudflare Workers assets（`wrangler.jsonc`）

現状の仕様の正は README.md と `tests/app.spec.ts` である。`PLAN.md` は初回実装時の計画（歴史的文書）であり、受け入れ条件の最新ソースとしては扱わない。

## 技術スタック（不変）

- バニラJS・単一 `public/index.html`（CSS/JSインライン）・ビルドなし
- 配信: Cloudflare Workers assets（`wrangler.jsonc`）
- テスト: Playwright（`tests/app.spec.ts`、`npm test`）
- 保守時もこのスタックを維持すること。フレームワーク・ビルドツール・宣言外ライブラリの導入は禁止

## 品質不変条件

次を壊してはならない。変更後は必ず `npm run verify` が通る状態を維持すること。

- **favicon**: `<link rel="icon" href="data:image/svg+xml,...">` のインライン data URI（外部ファイル・外部 URL 不可）
- **フッター**: hub（apps.jozo.beer）への導線。リンク先 `https://apps.jozo.beer` とリンクテキスト `apps.jozo.beer` は変えない

```html
<footer style="margin-top:3rem;text-align:center;font-size:.8rem;opacity:.6">
  <a href="https://apps.jozo.beer" style="color:inherit">apps.jozo.beer</a>
</footer>
```

スタイル（リンク色を含む）はテーマに合わせて調整してよい。リンク色を変える場合は背景とのコントラストを確保すること。body が flex/grid のセンタリングレイアウトのときは、`flex-direction: column` にするかメインコンテナ末尾に置き、フッターが横並びの flex アイテムにならないようにする。

その他:

- 静的アプリ（`public/` 配下のみ）。サーバコード・外部 API・ビルドツールは使わない
- `public/index.html` を単一ファイルで完結させる（CSS/JS インライン可）
- 雛形のスモークテスト（ページロード・ページエラーなし）は削除しない
- README.md は削除しない

## 保守の進め方

1. 変更したい振る舞いを受け入れ条件として `tests/app.spec.ts` に先に書く（または既存テストを更新する）
2. `public/index.html` を実装・修正する
3. `npm test` と `npm run verify` を通す
4. `npm run deploy` で Cloudflare Workers へデプロイする
