import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startServer } from "./server.mjs";

const STORAGE_KEY = "pwgen:options";
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

async function withPage(run, { clipboard = false, beforeGoto } = {}) {
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
    if (beforeGoto) await beforeGoto(page);
    await page.goto(baseUrl);
    await run(page, pageErrors);
    assert.equal(
      pageErrors.length,
      0,
      `unexpected pageerror: ${pageErrors.map((e) => e.message).join("; ")}`,
    );
  } finally {
    await context.close();
  }
}

async function seedOptions(page, raw) {
  await page.addInitScript(
    ({ key, value, mode }) => {
      if (mode === "absent") {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, value);
    },
    { key: STORAGE_KEY, value: raw, mode: raw === undefined ? "absent" : "set" },
  );
}

async function readUi(page) {
  return page.evaluate(() => ({
    number: document.getElementById("lengthNumber").value,
    range: document.getElementById("lengthRange").value,
    label: document.getElementById("lengthValue").textContent,
    password: document.getElementById("password").value,
    message: document.getElementById("message").textContent,
    upper: document.getElementById("upper").checked,
    lower: document.getElementById("lower").checked,
    digits: document.getElementById("digits").checked,
    symbols: document.getElementById("symbols").checked,
  }));
}

async function setLength(page, length) {
  // Single input event only. page.fill already fires input; an extra
  // dispatchEvent would regenerate the password twice and hide intermediates.
  await page.fill("#lengthNumber", String(length));
}

async function setCharset(page, id, checked) {
  const selector = `#${id}`;
  if ((await page.isChecked(selector)) !== checked) {
    await page.click(selector);
  }
}

function assertHealthyBoot(ui, pageErrors) {
  assert.equal(ui.message, "");
  assert.equal(pageErrors.length, 0);
}

function assertDefaultHealthyBoot(ui, pageErrors) {
  assertHealthyBoot(ui, pageErrors);
  assert.equal(ui.number, "16");
  assert.equal(ui.range, "16");
  assert.equal(ui.label, "16");
  assert.equal(ui.upper, true);
  assert.equal(ui.lower, true);
  assert.equal(ui.digits, true);
  assert.equal(ui.symbols, true);
  assert.equal(ui.password.length, 16);
}

async function assertStillUsableAfterBoot(page) {
  await setLength(page, 32);
  await setCharset(page, "symbols", false);
  const ui = await readUi(page);
  assert.equal(ui.message, "");
  assert.equal(ui.password.length, 32);
  for (const ch of ui.password) {
    assert.ok(
      !CHARSETS.symbols.includes(ch),
      `password still contains symbol '${ch}'`,
    );
  }
  await page.click("#copyBtn");
  const clipped = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clipped, ui.password);
}

// --- restore & save ---

test("changing length and reloading restores length controls", async () => {
  await withPage(async (page) => {
    await setLength(page, 28);
    await page.reload();
    const ui = await readUi(page);
    assert.equal(ui.number, "28");
    assert.equal(ui.range, "28");
    assert.equal(ui.label, "28");
    assert.equal(ui.password.length, 28);
  });
});

test("changing charsets and reloading restores checkbox states", async () => {
  await withPage(async (page) => {
    await setCharset(page, "upper", false);
    await setCharset(page, "symbols", false);
    await page.reload();
    const ui = await readUi(page);
    assert.equal(ui.upper, false);
    assert.equal(ui.lower, true);
    assert.equal(ui.digits, true);
    assert.equal(ui.symbols, false);
  });
});

test("options are restored after reload without pressing generate", async () => {
  await withPage(async (page) => {
    await setLength(page, 22);
    await setCharset(page, "digits", false);
    // deliberately do not click #generateBtn
    await page.reload();
    const ui = await readUi(page);
    assert.equal(ui.number, "22");
    assert.equal(ui.range, "22");
    assert.equal(ui.label, "22");
    assert.equal(ui.digits, false);
    assert.equal(ui.upper, true);
    assert.equal(ui.lower, true);
    assert.equal(ui.symbols, true);
  });
});

test("saved pwgen:options matches the current UI conditions", async () => {
  await withPage(async (page) => {
    await setLength(page, 30);
    await setCharset(page, "lower", false);
    const stored = await page.evaluate((key) => {
      return JSON.parse(localStorage.getItem(key));
    }, STORAGE_KEY);
    const ui = await readUi(page);
    assert.equal(stored.length, Number(ui.number));
    assert.equal(stored.upper, ui.upper);
    assert.equal(stored.lower, ui.lower);
    assert.equal(stored.digits, ui.digits);
    assert.equal(stored.symbols, ui.symbols);
  });
});

// --- must not save forbidden data ---

test("pwgen:options has exactly the five allowed keys", async () => {
  await withPage(async (page) => {
    await setLength(page, 18);
    const keys = await page.evaluate((key) => {
      return Object.keys(JSON.parse(localStorage.getItem(key))).sort();
    }, STORAGE_KEY);
    assert.deepEqual(keys, ["digits", "length", "lower", "symbols", "upper"]);
  });
});

test("localStorage has no keys other than pwgen:options", async () => {
  await withPage(async (page) => {
    await setLength(page, 20);
    await setCharset(page, "upper", false);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert.deepEqual(keys, [STORAGE_KEY]);
  });
});

test("generated passwords never appear in localStorage", async () => {
  await withPage(async (page) => {
    const seen = [];
    const recordPassword = async () => {
      const password = await page.inputValue("#password");
      assert.ok(password.length > 0);
      seen.push(password);
    };

    await recordPassword(); // initial display
    await setLength(page, 20);
    await recordPassword();
    await setLength(page, 24);
    await recordPassword();
    await setCharset(page, "symbols", false);
    await recordPassword();
    await setLength(page, 28);
    await recordPassword();

    assert.ok(seen.length >= 4);
    const dump = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        out[k] = localStorage.getItem(k);
      }
      return JSON.stringify(out);
    });
    for (const password of seen) {
      assert.ok(
        !dump.includes(password),
        `password leaked into localStorage: ${password}`,
      );
    }
  });
});

// --- fixture table F1–F20 ---

const DEFAULT_FIXTURES = [
  { id: "F1", raw: undefined },
  { id: "F2", raw: "{壊れた" },
  { id: "F3", raw: '"文字列"' },
  { id: "F4", raw: "123" },
  { id: "F5", raw: "null" },
  { id: "F6", raw: "[]" },
  { id: "F7", raw: "{}" },
  { id: "F8", raw: '{"length":32}' },
  {
    id: "F9",
    raw: '{"upper":false,"lower":true,"digits":true,"symbols":true}',
  },
  {
    id: "F10",
    raw: '{"length":32,"lower":true,"digits":true,"symbols":true}',
  },
  {
    id: "F11",
    raw: '{"length":32,"upper":"false","lower":true,"digits":true,"symbols":true}',
  },
  {
    id: "F12",
    raw: '{"length":32,"upper":"","lower":true,"digits":true,"symbols":true}',
  },
  {
    id: "F13",
    raw: '{"length":32,"upper":0,"lower":true,"digits":true,"symbols":true}',
  },
  {
    id: "F16",
    raw: '{"length":"abc","upper":true,"lower":true,"digits":true,"symbols":true}',
  },
  {
    id: "F17",
    raw: '{"length":null,"upper":true,"lower":true,"digits":true,"symbols":true}',
  },
  {
    id: "F18",
    raw: '{"length":"NaN","upper":true,"lower":true,"digits":true,"symbols":true}',
  },
  {
    id: "F19",
    raw: '{"length":32,"upper":false,"lower":false,"digits":false,"symbols":false}',
  },
];

for (const fixture of DEFAULT_FIXTURES) {
  test(`${fixture.id} falls back to default healthy boot`, async () => {
    await withPage(
      async (page, pageErrors) => {
        const ui = await readUi(page);
        assertDefaultHealthyBoot(ui, pageErrors);
      },
      { beforeGoto: (page) => seedOptions(page, fixture.raw) },
    );
  });
}

test("F14 clamps length 0 to 8 with all charsets on", async () => {
  await withPage(
    async (page, pageErrors) => {
      const ui = await readUi(page);
      assertHealthyBoot(ui, pageErrors);
      assert.equal(ui.number, "8");
      assert.equal(ui.range, "8");
      assert.equal(ui.label, "8");
      assert.equal(ui.password.length, 8);
      assert.equal(ui.upper, true);
      assert.equal(ui.lower, true);
      assert.equal(ui.digits, true);
      assert.equal(ui.symbols, true);
    },
    {
      beforeGoto: (page) =>
        seedOptions(
          page,
          '{"length":0,"upper":true,"lower":true,"digits":true,"symbols":true}',
        ),
    },
  );
});

test("F15 clamps length 999 to 64 with all charsets on", async () => {
  await withPage(
    async (page, pageErrors) => {
      const ui = await readUi(page);
      assertHealthyBoot(ui, pageErrors);
      assert.equal(ui.number, "64");
      assert.equal(ui.range, "64");
      assert.equal(ui.label, "64");
      assert.equal(ui.password.length, 64);
      assert.equal(ui.upper, true);
      assert.equal(ui.lower, true);
      assert.equal(ui.digits, true);
      assert.equal(ui.symbols, true);
    },
    {
      beforeGoto: (page) =>
        seedOptions(
          page,
          '{"length":999,"upper":true,"lower":true,"digits":true,"symbols":true}',
        ),
    },
  );
});

test("F20 restores mixed charset options and length 32", async () => {
  await withPage(
    async (page, pageErrors) => {
      const ui = await readUi(page);
      assertHealthyBoot(ui, pageErrors);
      assert.equal(ui.number, "32");
      assert.equal(ui.range, "32");
      assert.equal(ui.label, "32");
      assert.equal(ui.upper, true);
      assert.equal(ui.lower, false);
      assert.equal(ui.digits, true);
      assert.equal(ui.symbols, false);
      assert.equal(ui.password.length, 32);
      for (const ch of ui.password) {
        assert.ok(!CHARSETS.lower.includes(ch), `found lower '${ch}'`);
        assert.ok(!CHARSETS.symbols.includes(ch), `found symbol '${ch}'`);
      }
    },
    {
      beforeGoto: (page) =>
        seedOptions(
          page,
          '{"length":32,"upper":true,"lower":false,"digits":true,"symbols":false}',
        ),
    },
  );
});

// --- localStorage unavailable ---

test("localStorage getter throw still boots default and remains usable", async () => {
  await withPage(
    async (page, pageErrors) => {
      const ui = await readUi(page);
      assertDefaultHealthyBoot(ui, pageErrors);
      await assertStillUsableAfterBoot(page);
    },
    {
      clipboard: true,
      beforeGoto: async (page) => {
        await page.addInitScript(() => {
          Object.defineProperty(window, "localStorage", {
            configurable: true,
            get() {
              throw new DOMException(
                "Access is denied for this document.",
                "SecurityError",
              );
            },
          });
        });
      },
    },
  );
});

test("localStorage getItem throw still boots default and remains usable", async () => {
  await withPage(
    async (page, pageErrors) => {
      const ui = await readUi(page);
      assertDefaultHealthyBoot(ui, pageErrors);
      await assertStillUsableAfterBoot(page);
    },
    {
      clipboard: true,
      beforeGoto: async (page) => {
        await page.addInitScript(() => {
          Storage.prototype.getItem = function getItem() {
            throw new DOMException("getItem failed", "SecurityError");
          };
        });
      },
    },
  );
});

test("localStorage setItem throw still boots default and remains usable", async () => {
  await withPage(
    async (page, pageErrors) => {
      const ui = await readUi(page);
      assertDefaultHealthyBoot(ui, pageErrors);
      await assertStillUsableAfterBoot(page);
    },
    {
      clipboard: true,
      beforeGoto: async (page) => {
        await page.addInitScript(() => {
          Storage.prototype.setItem = function setItem() {
            throw new DOMException("QuotaExceededError", "QuotaExceededError");
          };
        });
      },
    },
  );
});
