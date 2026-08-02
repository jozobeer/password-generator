# PLAN: 生成条件の端末内保存・自動復元（Issue #1）

## 0. 前提（実測済み・2026-08-02）

この計画は推測ではなく、以下を実行して確かめた結果に基づく。

### テストランナーの挙動

| 確認項目 | 結果 |
|---|---|
| `npm run verify` を現状の main で実行 | `verify OK` / exit 0 |
| `node --test test/` | **常に失敗する（exit 1）**。ディレクトリが存在すればモジュール解決されて `MODULE_NOT_FOUND`、存在しなければ `Could not find 'test/'`。理由は状況で異なるが使えないことは同じ |
| `node --test test/*.test.mjs`（テストあり） | 可。exit 0 |
| テスト失敗時の exit code | 1 |
| **`test/` が存在しない状態で `node --test test/*.test.mjs`** | **`ℹ tests 0` / exit 0**。glob が展開されずリテラルのまま渡り、テスト 0 件で正常終了する |
| **`test/` が空の状態** | **`ℹ tests 0` / exit 0** |
| **空のテストファイルが 1 本ある状態** | **`ℹ tests 1` / exit 0**。node はテストファイル自体を 1 件として数えるため、「ファイルが存在する」検査でも「tests ≥ 1」検査でも空ファイルを検出できない |

最後の 3 行は重大な偽陽性である。テストが実質 0 件でも `npm run verify` が緑になる。
実測の結果、**実行されたテスト件数に意味のある下限を課す**ことが唯一の確実な対策だった（3.2 に仕様を書く）。

### 実ブラウザ検証の実行環境

Chromium の起動可否は**実行するプロセスの環境によって異なる**。実測した範囲は次のとおり:

| 実行環境 | Chromium 起動 | 備考 |
|---|---|---|
| 指揮者の通常シェル | 可 | v151.0.7922.34 |
| cursor-agent（`--force`）配下 | 可 | 起動・HTTP 配信・`localStorage` 読み書きまで確認済み |
| codex（`-s workspace-write`）配下 | **不可** | サンドボックスが阻む。`--no-sandbox` 等 4 通りの起動オプションを試して全滅 |

したがって `npm run verify` を完走できるのは指揮者と cursor-agent 系の環境に限られる。
**受け入れ条件を実行検証する役割を codex に割り当ててはならない。**

### 実ブラウザで確認済みの検証手段

| 確認項目 | 結果 |
|---|---|
| `http://` 配信下での `localStorage` 読み書き | 可。リロードをまたいで値が保持される |
| `about:blank` / `file://` での `localStorage` | **不可**（opaque origin。`SecurityError`）。テストは必ず HTTP 配信経由で行う |
| `page.addInitScript` によるページ script 実行前の localStorage 仕込み | 可 |
| `localStorage` getter に例外を注入した状態でのページ起動 | 可（`SecurityError` を再現できる） |
| 実装前の状態で「保存済み条件を仕込んで起動 → 復元されない」 | 確認済み。Round 2 の Red は確実に成立する |

### 既存実装（完了済み・変更しない振る舞い）

`public/index.html` 単一ファイル。文字数 8〜64（初期 16）をスライダーと数値入力で双方向指定、
文字種 4 種（英大文字・英小文字・数字・記号、初期は全 ON）、`crypto.getRandomValues` ＋棄却サンプリングと
Fisher–Yates シャッフルで生成、`navigator.clipboard.writeText` でコピー。
条件変更のたびに `refreshPassword()` が呼ばれて即時再生成される。
文字数の正規化は `clampLength()`（`Number.isFinite` 判定＋8〜64 クランプ）が担う。

## 1. 概要

生成条件（文字数・文字種 4 つ）を `localStorage` に自動保存し、再訪時に自動復元する。
追加 UI はゼロ。保存対象は条件のみで、生成されたパスワード本体は保存しない。

このリポジトリにはテストが 1 本も無く、`npm run verify` は静的な文字列検査だけである。
そのため実装より先にテスト基盤を用意する 2 ラウンド構成とする。

| ラウンド | 目的 | 成果物 |
|---|---|---|
| Round 1 | 実ブラウザでの検証基盤と、既存挙動の特性テスト | `test/` 一式、`scripts/run-tests.mjs`、`npm test` |
| Round 2 | 生成条件の保存・復元（Issue #1 本体） | `public/index.html` の変更、復元テスト |

Round 1 は利用者価値を生まないが、Round 2 の builder が本物の Red から TDD を始めるために必要である。
実装前の状態で「保存済み条件を仕込んで起動しても復元されない」ことを実測済みで、Red は確実に成立する。

## 2. 制約の解釈（AGENTS.md との整合）

AGENTS.md は「静的アプリ（`public/` 配下のみ）。サーバコード・外部 API・ビルドツールは使わない」と定める。
本計画はこれに反しない。根拠を明示しておく（reviewer はこの解釈を前提に判定すること）:

- 配信されるアプリは `public/index.html` 単一ファイルのままで、外部リソース参照も増やさない
- テスト用の HTTP 配信は `test/` 配下のテストハーネスであり、アプリのサーバコードではない。デプロイ物に含まれない
- `playwright` はテストツールであってビルドツールではない。`devDependencies` に既に `wrangler` がある前例に倣う
- `localStorage` はブラウザ内蔵 API であり外部 API ではない

## 3. Round 1: 実ブラウザ検証基盤と特性テスト

### 3.1 受け入れ条件

- [ ] `npm test` が `test/` 配下の Playwright テストを実行し、全件通って exit 0 になる
- [ ] `npm run verify` が既存の静的検査に加えてテストも実行し、テストが 1 件でも失敗したら非ゼロで終了する
- [ ] テストは `public/` を HTTP で配信した実 Chromium に対して実行される
      （`file://` と `about:blank` を使っていない。どちらも opaque origin となり localStorage が使えず、Round 2 の前提を壊す）
- [ ] **テスト消失・空洞化の偽陽性が塞がれている**。次の 3 つをすべて実演し、
      完了報告に実行したコマンドと exit code を書くこと。確認後は必ず元に戻し、最後にもう一度通ることを示す
  - `test/` ごと退避した状態で `npm run verify` を実行すると非ゼロで終了する
  - `test/` を空にした状態で `npm run verify` を実行すると非ゼロで終了する
  - テストファイルを**空ファイルに置換**した状態で `npm run verify` を実行すると非ゼロで終了する
      （node は空ファイルを `tests 1` と数えるため、件数下限が効いていないとここで素通りする）
- [ ] 以下の既存挙動が特性テストとして固定されている。いずれもページエラー 0 件であることを併せて確認する
  - 初期表示で 16 文字のパスワードが生成され、`#lengthNumber` / `#lengthRange` / `#lengthValue` が 16 で一致する
  - 文字数を 8 と 64 に変更すると、生成されるパスワードがちょうどその長さになる
  - 文字数を変更すると `#lengthNumber` / `#lengthRange` / `#lengthValue` が相互に同期する
  - 文字種を 1 つオフにすると、生成結果にその文字種の文字が一切含まれない（4 種それぞれで確認）
  - 文字種を全てオフにすると `#password` が空になり、`#message` にエラー文言が表示される
  - コピーボタンを押すとクリップボードに `#password` の値が入る
- [ ] **テストが実挙動を捉えていることの実演**: `public/index.html` を一時的に壊す（例: `clampLength` の上限を無効化する、
      文字種フィルタを外す）と該当テストが失敗することを確認し、完了報告に「壊した内容」と「落ちたテスト名」を書く。
      確認後は必ず元に戻し、`git diff public/index.html` が空であることを報告に含める
- [ ] `public/index.html` を変更していない（Round 1 はアプリ実装に触らない）

### 3.2 実装方針

ファイル構成:

```
test/
  server.mjs        … public/ を配信する依存ゼロの静的 HTTP サーバ（node:http）
  app.test.mjs      … 既存挙動の特性テスト
scripts/
  run-tests.mjs     … テストを起動し、実行件数の下限を保証するランナー（新規）
  verify.mjs        … 既存の静的検査（変更しない）
package.json        … scripts に test を追加し、verify から呼ぶ
```

- `test/server.mjs` は `server.listen(0)` でポートを自動割当し、`server.address().port` から URL を組み立てる
  （固定ポートは並列実行や他プロセスと衝突する）
- ブラウザは `chromium.launch()`（headless 既定）。テストごとに `browser.newContext()` を作る
  — コンテキストを分けないと localStorage がテストケース間で漏れる
- 各テストで `page.on("pageerror", ...)` を張り、未捕捉例外が出ていないことを確認する
- クリップボードの検証は `context.grantPermissions(["clipboard-read", "clipboard-write"])` を与えたうえで
  `navigator.clipboard.readText()` を読む。権限付与が効かない場合は `page.evaluate` で
  `navigator.clipboard.writeText` をスパイして呼び出し引数を検証する方式に切り替えてよい

`scripts/run-tests.mjs` の仕様（偽陽性対策の中核。実測に基づく）:

1. `fs.readdirSync("test")` で `*.test.mjs` を列挙する（シェルの glob に頼らない。
   glob は未展開のままリテラルで渡ると「テスト 0 件・exit 0」になる）
2. 1 件も無ければエラーを出して exit 1
3. `node --test <列挙したファイル...>` を子プロセスで実行し、出力をそのまま流す
4. 出力から `ℹ tests <N>` を取り出す。取り出せなければ exit 1
5. `N` が `MIN_TESTS` 未満ならエラーを出して exit 1。`MIN_TESTS` はファイル冒頭の定数とし、
   **Round 1 では 10** とする（空ファイル 1 本は `tests 1` と数えられるため、下限が 1 では検出できない）
6. 子プロセスが非ゼロ終了ならその値で終了する

`package.json`:

- `"test": "node scripts/run-tests.mjs"`
- `"verify": "node scripts/verify.mjs && npm test"`

`scripts/verify.mjs` は変更しない（テスト件数の保証は `run-tests.mjs` が担う）。

### 3.3 スコープ外（触らないもの）

`public/` 配下のすべて、`scripts/verify.mjs`、`README.md`、`AGENTS.md`、`wrangler.jsonc`。
変更してよいのは `test/` 配下（新規）、`scripts/run-tests.mjs`（新規）、`package.json`、`package-lock.json` のみ。

## 4. Round 2: 生成条件の保存・復元

### 4.1 保存フォーマットと復元アルゴリズム（確定仕様）

キー・スキーマ・復元規則をすべて固定する。テストが値を仕込み期待値を determinisitc に決めるために必要であり、
実装者の裁量に委ねると受け入れ条件の合否が判定者によって割れる。

- キー: `pwgen:options`（単一キー）
- 値: JSON 文字列。既定値 `D` は次のとおり（現在の HTML 属性値と一致する）
  ```json
  { "length": 16, "upper": true, "lower": true, "digits": true, "symbols": true }
  ```

**復元アルゴリズム。上から順に判定し、最初に該当した時点で確定する。**

1. `localStorage.getItem("pwgen:options")` が例外を投げる、または `null` → **`D` を採用**
2. `JSON.parse` が例外を投げる → **`D` を採用**
3. 解析結果が object でない（プリミティブ・`null`・配列を含む） → **`D` を採用**
4. `upper` / `lower` / `digits` / `symbols` のいずれかが `typeof !== "boolean"`（欠損を含む） → **`D` を採用**
5. 文字種 4 つがすべて `false` → **`D` を採用**
6. `length` が `typeof !== "number"` または `Number.isFinite` でない（欠損を含む） → **`D` を採用**
7. ここまで該当しなければ、**文字種 4 つはそのまま採用し、`length` は `clampLength()` を通した値を採用する**

部分復元は 7 の length クランプだけであり、それ以外はすべて「丸ごと `D` に倒す」。
中途半端に一部フィールドだけ活かす実装にはしない。

### 4.2 受け入れ条件

用語を先に 2 つ定義する。テストでは共通のヘルパー関数で検査し、条件ごとに書き下さないこと。

「**正常起動（共通）**」とは、復元された値が何であれ満たすべき次の 2 つを指す:

- (a) `#message` の文字列が空（エラー文言が出ていない）
- (b) `pageerror` が 1 件も発生していない

「**既定状態で正常起動**」とは、上の (a)(b) に加えて次の 3 つが成り立つことを指す:

- (c) `#lengthNumber` / `#lengthRange` の value と `#lengthValue` の表示がいずれも `16`
- (d) `#upper` / `#lower` / `#digits` / `#symbols` がすべてチェック済み
- (e) `#password` の値がちょうど 16 文字

**復元と保存**

- [ ] 文字数を変更してリロードすると、`#lengthRange` / `#lengthNumber` / `#lengthValue` のすべてに変更後の値が復元される
- [ ] 文字種チェックボックスを変更してリロードすると、変更後の ON/OFF 状態が 4 つとも復元される
- [ ] 「生成」ボタンを押さずに条件を変えただけでリロードしても復元される（条件変更時に即座に保存されている）
- [ ] 保存値が UI の状態と一致する: 条件を変更したあと `pwgen:options` を JSON として解析し、
      `length` が `#lengthNumber` の値と、`upper` / `lower` / `digits` / `symbols` が各チェックボックスの状態と一致する

**保存してはいけないものを保存していない**

- [ ] `pwgen:options` を JSON 解析した結果のキー集合が `length` / `upper` / `lower` / `digits` / `symbols` の
      **5 個ちょうど**であり、それ以外のキーを持たない
- [ ] `localStorage` に `pwgen:options` 以外のキーが 1 つも書き込まれていない
- [ ] 生成されたパスワードが保存されていない。**リロード直前の表示値だけを検査しても不十分**である
      （条件変更「前」のパスワードを保存してから新しいものを生成する誤実装が素通りするため）。
      条件を 3 回以上変更しながら、その過程で `#password` に現れたパスワードを毎回控え、
      **そのすべて**について `localStorage` 全体のダンプに部分文字列として現れないことを検査する

**壊れた保存値・異常な保存値（fixture 表）**

以下の各行を独立したテストにする。期待結果は 4.1 のアルゴリズムから一意に決まる。
値は「既定値と異なる `length: 32`」を混ぜてあり、誤実装（部分復元・truthy 変換・型検査漏れ）が
既定値と区別できる形にしてある。

| # | `pwgen:options` の内容 | 期待結果 |
|---|---|---|
| F1 | キー自体が存在しない | 既定状態で正常起動 |
| F2 | `{壊れた`（不正 JSON） | 既定状態で正常起動 |
| F3 | `"文字列"` | 既定状態で正常起動 |
| F4 | `123` | 既定状態で正常起動 |
| F5 | `null` | 既定状態で正常起動 |
| F6 | `[]` | 既定状態で正常起動 |
| F7 | `{}` | 既定状態で正常起動 |
| F8 | `{"length":32}`（文字種すべて欠損） | 既定状態で正常起動（`length` が 32 にならないこと） |
| F9 | `{"upper":false,"lower":true,"digits":true,"symbols":true}`（`length` 欠損） | 既定状態で正常起動（`#upper` が OFF にならないこと） |
| F10 | `{"length":32,"lower":true,"digits":true,"symbols":true}`（`upper` だけ欠落） | 既定状態で正常起動（`length` が 32 にならないこと） |
| F11 | `{"length":32,"upper":"false","lower":true,"digits":true,"symbols":true}` | 既定状態で正常起動。`"false"` は truthy なので、型検査を怠ると `length` 32・`#upper` ON になり区別できる |
| F12 | `{"length":32,"upper":"","lower":true,"digits":true,"symbols":true}` | 既定状態で正常起動。`""` は falsy なので、型検査を怠ると `length` 32・`#upper` OFF になり区別できる |
| F13 | `{"length":32,"upper":0,"lower":true,"digits":true,"symbols":true}` | 既定状態で正常起動 |
| F14 | `{"length":0,` 文字種すべて `true}` | **正常起動（共通）**を満たし、`length` が 8 にクランプされ、3 箇所すべて 8 で一致、生成されるパスワードが 8 文字、文字種は全 ON |
| F15 | `{"length":999,` 文字種すべて `true}` | **正常起動（共通）**を満たし、`length` が 64 にクランプされ、3 箇所すべて 64 で一致、生成されるパスワードが 64 文字、文字種は全 ON |
| F16 | `{"length":"abc",` 文字種すべて `true}` | 既定状態で正常起動 |
| F17 | `{"length":null,` 文字種すべて `true}` | 既定状態で正常起動 |
| F18 | `{"length":"NaN",` 文字種すべて `true}` | 既定状態で正常起動 |
| F19 | `{"length":32,` 文字種すべて `false}` | 既定状態で正常起動（`length` が 32 にならないこと） |
| F20 | `{"length":32,"upper":true,"lower":false,"digits":true,"symbols":false}` | 正常系。**正常起動（共通）**を満たし、`length` 32・`#upper` ON・`#lower` OFF・`#digits` ON・`#symbols` OFF が復元され、生成されるパスワードが 32 文字で小文字と記号を含まない |

注: `NaN` は JSON で表現できないため fixture に生の `NaN` は置かない。F18 は文字列 `"NaN"` を使う。

**localStorage が使えない環境（Issue の「読み書き不能」に対応）**

読み出し失敗と書き込み失敗は別経路であり、読み出し失敗も getter と `getItem` で経路が異なる。3 つとも別テストにする。

- [ ] **`localStorage` の getter 自体が例外を投げる場合**（`Object.defineProperty(window, "localStorage", { get() { throw ... } })`）:
      「既定状態で正常起動」し、そのうえで文字数と文字種を変更しても
      (a) `pageerror` が発生せず、(b) パスワードが変更後の条件どおりに再生成され、(c) `#message` にエラー文言が出ず、
      (d) コピーボタンでクリップボードに `#password` の値が入る
- [ ] **`getItem` が例外を投げる場合**: 上と同じ 4 点を満たす
- [ ] **`setItem` が例外を投げる場合**（`QuotaExceededError`）: 「既定状態で正常起動」し、
      そのうえで条件を変更しても上と同じ 4 点を満たす
      （`setItem` が常に失敗するなら何も保存されないため、起動時は必ず既定状態になる）

**回帰**

- [ ] Round 1 の特性テストが全件通ったまま（既存の生成・コピー挙動を壊していない）
- [ ] `scripts/run-tests.mjs` の `MIN_TESTS` を Round 2 のテスト数に合わせて引き上げてある（**25 以上**）
- [ ] `npm run verify` が通る

### 4.3 実装方針

- 復元は 4.1 のアルゴリズムをそのまま実装する。判定順序を変えない
- `length` の検証には既存の `clampLength()` を再利用する。新たにクランプ処理を書き足さない
- 文字種は `typeof v === "boolean"` で型を検査する。truthy 判定だけで済ませると、
  保存値が文字列 `"false"` だったときに ON と誤解釈される
- 保存は条件変更の単一経路に置く。`refreshPassword()` は文字数・文字種のすべての変更イベントから呼ばれているため、
  ここに保存を挟めば「生成ボタンを押さずに変えただけ」でも保存される
- 読み出しと書き込みを**それぞれ独立に** `try/catch` で囲む。片方の失敗がもう片方を巻き添えにしてはいけない。
  `localStorage` はプロパティアクセス自体が例外を投げうる（プライベートブラウズ、ストレージ無効化、`file://`）ため、
  `typeof localStorage` の確認だけでは不十分。`localStorage` に触れる箇所すべてが対象
- 保存するのは 5 値のみ。`#password` の値を書き込む経路を作らない

### 4.4 スコープ外（触らないもの）

`scripts/verify.mjs`、`README.md`、`AGENTS.md`、`wrangler.jsonc`、`public/` 配下の `index.html` 以外のファイル。
UI 要素の追加（保存ボタン・既定に戻すボタン・保存 ON/OFF トグル）は Issue の非ゴールであり、行わない。
export / import 機能、名前付きプリセットも非ゴール。

## 5. 検証

- 機械検証: `npm run verify`（静的検査 → テスト件数下限の保証 → 実 Chromium での Playwright テスト）
- **実行環境の制約**: 0 節のとおり、`npm run verify` を完走できるのは指揮者の通常シェルと
  cursor-agent 配下に限られる。codex のサンドボックス配下では Chromium が起動しないため、
  受け入れ条件を実行検証する役割を codex に割り当ててはならない
- Playwright のブラウザ本体は `~/.cache/ms-playwright` に導入済み。
  未導入の環境では `npx playwright install --with-deps chromium` が別途必要になる（`--with-deps` には root 権限が要る）
