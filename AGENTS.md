# パスワード生成ツール

このリポジトリは kojo が生成した単一ページWebアプリです。

## アイデア

# パスワード生成ツール

指定した文字数と条件（英大文字・英小文字・数字・記号）に基づいてランダムなパスワードを生成する静的単一ページアプリ。生成結果をワンクリックでクリップボードにコピーできる。

## 受け入れ条件の種

- 文字数スライダーまたは入力欄で指定した長さちょうどのパスワードが生成される
- 英大文字・英小文字・数字・記号の各チェックボックスをオフにすると、生成結果にその文字種が含まれなくなる
- コピー ボタンを押すと生成されたパスワード文字列がクリップボードに格納される


## 制約

- 静的アプリ（`public/` 配下のみ）。サーバコード・外部API・ビルドツールは使わない
- `public/index.html` を単一ファイルで完結させる（CSS/JSインライン可）
- favicon を `<link rel="icon" href="data:image/svg+xml,...">` のインライン data URI で含める（外部ファイル・外部URL不可。アプリのテーマに合った絵柄にする）
- hub（apps.jozo.beer）へのフッター導線を入れる。マークアップは次のとおり固定する:

  ```html
  <footer style="margin-top:3rem;text-align:center;font-size:.8rem;opacity:.6">
    <a href="https://apps.jozo.beer" style="color:inherit">apps.jozo.beer</a>
  </footer>
  ```

  スタイル（リンク色を含む）はアプリのテーマに合わせて調整してよいが、リンク先 `https://apps.jozo.beer` とリンクテキスト `apps.jozo.beer` は変えない。リンク色を変える場合は背景とのコントラストを確保すること

  配置は縦方向の通常フローの最下部に統合する。body がセンタリングレイアウト（display:flex / display:grid で中央寄せ）の場合、`</body>` 直前に置くと footer がその flex/grid アイテムになりレイアウトが崩れる（row 方向 flex では横並びになる）ため、body を flex-direction: column にするか、センタリング済みメインコンテナ内の末尾に置くこと。それ以外の場合は `</body>` 直前でよい
- README.md はテンプレートが生成済み。削除しないこと
- apple-touch-icon / manifest / og-image / robots / sitemap は factory が公開時に自動生成するため、builder は書かない
- 完成条件: PLAN.md の受け入れ条件をすべて満たし、`npm run verify` が通ること
