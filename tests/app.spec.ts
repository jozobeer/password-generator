import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

// 静的アプリなのでサーバ不要。kojo の visualGate と同じ file:// 方式で開く
const APP_URL = pathToFileURL("public/index.html").href;

const CHARSETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
} as const;

test("ページがロードできページエラーが出ない", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(APP_URL);
  await expect(page.locator("body")).toBeVisible();
  expect(errors).toEqual([]);
});

// このスモークは削除しないこと。機能テストは PLAN.md の受け入れ条件ごとに追記する

async function openApp(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(APP_URL);
  return errors;
}

async function setLength(page: Page, length: number, via: "number" | "range" = "number") {
  const selector = via === "range" ? "#lengthRange" : "#lengthNumber";
  await page.locator(selector).fill(String(length));
  await page.locator(selector).dispatchEvent("input");
}

async function setCharset(page: Page, id: keyof typeof CHARSETS, checked: boolean) {
  const box = page.locator(`#${id}`);
  if ((await box.isChecked()) !== checked) {
    await box.click();
  }
}

function assertNoDisabledChars(password: string, disabledId: keyof typeof CHARSETS) {
  const disabled = CHARSETS[disabledId];
  for (const ch of password) {
    expect(disabled.includes(ch), `disabled charset ${disabledId} char '${ch}' in ${password}`).toBe(
      false,
    );
  }
}

test("初期表示で16文字のパスワードが生成され文字数UIが一致する", async ({ page }) => {
  const errors = await openApp(page);

  await expect(page.locator("#lengthNumber")).toHaveValue("16");
  await expect(page.locator("#lengthRange")).toHaveValue("16");
  await expect(page.locator("#lengthValue")).toHaveText("16");
  const initial = await page.locator("#password").inputValue();
  expect(initial.length).toBe(16);
  expect(errors).toEqual([]);
});

test("文字数を変更すると指定長さちょうどのパスワードが生成されUIが同期する", async ({ page }) => {
  const errors = await openApp(page);

  await setLength(page, 8, "number");
  expect((await page.locator("#password").inputValue()).length).toBe(8);
  await expect(page.locator("#lengthNumber")).toHaveValue("8");
  await expect(page.locator("#lengthRange")).toHaveValue("8");
  await expect(page.locator("#lengthValue")).toHaveText("8");

  await setLength(page, 64, "range");
  expect((await page.locator("#password").inputValue()).length).toBe(64);
  await expect(page.locator("#lengthNumber")).toHaveValue("64");
  await expect(page.locator("#lengthRange")).toHaveValue("64");
  await expect(page.locator("#lengthValue")).toHaveText("64");

  expect(errors).toEqual([]);
});

test("英大文字チェックをオフにすると生成結果に英大文字が含まれない", async ({ page }) => {
  const errors = await openApp(page);
  await setCharset(page, "upper", false);
  const password = await page.locator("#password").inputValue();
  expect(password.length).toBeGreaterThan(0);
  assertNoDisabledChars(password, "upper");
  expect(errors).toEqual([]);
});

test("英小文字チェックをオフにすると生成結果に英小文字が含まれない", async ({ page }) => {
  const errors = await openApp(page);
  await setCharset(page, "lower", false);
  const password = await page.locator("#password").inputValue();
  expect(password.length).toBeGreaterThan(0);
  assertNoDisabledChars(password, "lower");
  expect(errors).toEqual([]);
});

test("数字チェックをオフにすると生成結果に数字が含まれない", async ({ page }) => {
  const errors = await openApp(page);
  await setCharset(page, "digits", false);
  const password = await page.locator("#password").inputValue();
  expect(password.length).toBeGreaterThan(0);
  assertNoDisabledChars(password, "digits");
  expect(errors).toEqual([]);
});

test("記号チェックをオフにすると生成結果に記号が含まれない", async ({ page }) => {
  const errors = await openApp(page);
  await setCharset(page, "symbols", false);
  const password = await page.locator("#password").inputValue();
  expect(password.length).toBeGreaterThan(0);
  assertNoDisabledChars(password, "symbols");
  expect(errors).toEqual([]);
});

test("文字種を全てオフにするとパスワードが空になりエラーメッセージが出る", async ({ page }) => {
  const errors = await openApp(page);
  for (const id of Object.keys(CHARSETS) as (keyof typeof CHARSETS)[]) {
    await setCharset(page, id, false);
  }
  await expect(page.locator("#password")).toHaveValue("");
  await expect(page.locator("#message")).toContainText("文字種");
  expect(errors).toEqual([]);
});

test("生成ボタンを押すとパスワードが再生成される", async ({ page }) => {
  const errors = await openApp(page);
  // 衝突を避けるため長め＋複数回試行
  await setLength(page, 32);
  const before = await page.locator("#password").inputValue();
  let changed = false;
  for (let i = 0; i < 5; i++) {
    await page.locator("#generateBtn").click();
    const after = await page.locator("#password").inputValue();
    expect(after.length).toBe(32);
    if (after !== before) {
      changed = true;
      break;
    }
  }
  expect(changed).toBe(true);
  expect(errors).toEqual([]);
});

test("コピーボタンを押すと生成パスワードがクリップボードへ渡される", async ({ page }) => {
  const errors = await openApp(page);

  // file:// では clipboard 権限が使えないため writeText をスパイする
  await page.evaluate(() => {
    const w = window as unknown as { __copied: string | null };
    w.__copied = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          w.__copied = text;
        },
      },
    });
  });

  const password = await page.locator("#password").inputValue();
  expect(password.length).toBeGreaterThan(0);
  await page.locator("#copyBtn").click();
  await expect(page.locator("#message")).toContainText("クリップボード");
  const copied = await page.evaluate(
    () => (window as unknown as { __copied: string | null }).__copied,
  );
  expect(copied).toBe(password);
  expect(errors).toEqual([]);
});

test("フッターに apps.jozo.beer へのリンクがある", async ({ page }) => {
  const errors = await openApp(page);
  const link = page.locator('footer a[href="https://apps.jozo.beer"]');
  await expect(link).toHaveText("apps.jozo.beer");
  expect(errors).toEqual([]);
});
