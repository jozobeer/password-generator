import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startServer } from "./server.mjs";

const CHARSETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
};

let server;
let browser;
let baseUrl;

before(async () => {
  server = await startServer();
  baseUrl = server.url;
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

async function withPage(run, { clipboard = false } = {}) {
  const context = await browser.newContext(
    clipboard
      ? { permissions: ["clipboard-read", "clipboard-write"] }
      : undefined,
  );
  if (clipboard) {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new URL(baseUrl).origin,
    });
  }

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err));

  try {
    await page.goto(baseUrl);
    await run(page, context);
    assert.equal(
      pageErrors.length,
      0,
      `unexpected pageerror: ${pageErrors.map((e) => e.message).join("; ")}`,
    );
  } finally {
    await context.close();
  }
}

async function readLengthUi(page) {
  return page.evaluate(() => ({
    number: document.getElementById("lengthNumber").value,
    range: document.getElementById("lengthRange").value,
    label: document.getElementById("lengthValue").textContent,
    password: document.getElementById("password").value,
  }));
}

async function setLength(page, length, via = "number") {
  const selector = via === "range" ? "#lengthRange" : "#lengthNumber";
  await page.fill(selector, String(length));
  await page.dispatchEvent(selector, "input");
}

async function setCharset(page, id, checked) {
  const selector = `#${id}`;
  const isChecked = await page.isChecked(selector);
  if (isChecked !== checked) {
    await page.click(selector);
  }
}

function assertOnlyAllowedChars(password, disabledId) {
  const allowed = Object.entries(CHARSETS)
    .filter(([id]) => id !== disabledId)
    .map(([, chars]) => chars)
    .join("");
  for (const ch of password) {
    assert.ok(
      allowed.includes(ch),
      `password contains '${ch}' from disabled charset ${disabledId}: ${password}`,
    );
  }
}

test("initial display generates a 16-char password and length controls agree", async () => {
  await withPage(async (page) => {
    const ui = await readLengthUi(page);
    assert.equal(ui.number, "16");
    assert.equal(ui.range, "16");
    assert.equal(ui.label, "16");
    assert.equal(ui.password.length, 16);
  });
});

test("setting length to 8 yields an 8-character password", async () => {
  await withPage(async (page) => {
    await setLength(page, 8);
    const ui = await readLengthUi(page);
    assert.equal(ui.password.length, 8);
  });
});

test("setting length to 64 yields a 64-character password", async () => {
  await withPage(async (page) => {
    await setLength(page, 64);
    const ui = await readLengthUi(page);
    assert.equal(ui.password.length, 64);
  });
});

test("changing length keeps #lengthNumber, #lengthRange, and #lengthValue in sync", async () => {
  await withPage(async (page) => {
    await setLength(page, 24, "number");
    let ui = await readLengthUi(page);
    assert.equal(ui.number, "24");
    assert.equal(ui.range, "24");
    assert.equal(ui.label, "24");

    await setLength(page, 40, "range");
    ui = await readLengthUi(page);
    assert.equal(ui.number, "40");
    assert.equal(ui.range, "40");
    assert.equal(ui.label, "40");
  });
});

test("length above 64 is clamped to 64 across controls and password", async () => {
  await withPage(async (page) => {
    await page.evaluate(() => {
      const el = document.getElementById("lengthNumber");
      el.value = "100";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const ui = await readLengthUi(page);
    assert.equal(ui.number, "64");
    assert.equal(ui.range, "64");
    assert.equal(ui.label, "64");
    assert.equal(ui.password.length, 64);
  });
});

test("length below 8 is clamped to 8 across controls and password", async () => {
  await withPage(async (page) => {
    await page.evaluate(() => {
      const el = document.getElementById("lengthNumber");
      el.value = "3";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const ui = await readLengthUi(page);
    assert.equal(ui.number, "8");
    assert.equal(ui.range, "8");
    assert.equal(ui.label, "8");
    assert.equal(ui.password.length, 8);
  });
});

test("disabling uppercase excludes uppercase letters from the password", async () => {
  await withPage(async (page) => {
    await setCharset(page, "upper", false);
    const password = await page.inputValue("#password");
    assert.ok(password.length > 0);
    assertOnlyAllowedChars(password, "upper");
  });
});

test("disabling lowercase excludes lowercase letters from the password", async () => {
  await withPage(async (page) => {
    await setCharset(page, "lower", false);
    const password = await page.inputValue("#password");
    assert.ok(password.length > 0);
    assertOnlyAllowedChars(password, "lower");
  });
});

test("disabling digits excludes digit characters from the password", async () => {
  await withPage(async (page) => {
    await setCharset(page, "digits", false);
    const password = await page.inputValue("#password");
    assert.ok(password.length > 0);
    assertOnlyAllowedChars(password, "digits");
  });
});

test("disabling symbols excludes symbol characters from the password", async () => {
  await withPage(async (page) => {
    await setCharset(page, "symbols", false);
    const password = await page.inputValue("#password");
    assert.ok(password.length > 0);
    assertOnlyAllowedChars(password, "symbols");
  });
});

test("disabling all charsets clears the password and shows an error message", async () => {
  await withPage(async (page) => {
    for (const id of ["upper", "lower", "digits", "symbols"]) {
      await setCharset(page, id, false);
    }
    const password = await page.inputValue("#password");
    const message = await page.textContent("#message");
    assert.equal(password, "");
    assert.ok(message && message.length > 0);
    assert.match(message, /文字種/);
  });
});

test("copy button writes the generated password to the clipboard", async () => {
  await withPage(
    async (page) => {
      const password = await page.inputValue("#password");
      assert.ok(password.length > 0);
      await page.click("#copyBtn");
      const clipped = await page.evaluate(() => navigator.clipboard.readText());
      assert.equal(clipped, password);
    },
    { clipboard: true },
  );
});
