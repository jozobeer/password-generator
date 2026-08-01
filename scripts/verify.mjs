import { readFileSync, statSync } from "node:fs";

const HUB_LINK_RE = /<a[^>]+href=["']https:\/\/apps\.jozo\.beer\/?["']/i;

const errors = [];

function requireFile(path, message) {
  try {
    statSync(path);
  } catch {
    errors.push(message);
  }
}

try {
  const html = readFileSync("public/index.html", "utf-8");
  if (html.trim().length < 100) errors.push("public/index.html が小さすぎます");
  if (html.includes("{{")) errors.push("未置換のプレースホルダが残っています");
  if (html.includes("builder がこのファイルを実装で置き換えます")) {
    errors.push("public/index.html がテンプレートのまま実装されていません");
  }
  if (!/<link[^>]+rel=["']?[^"'>]*icon/i.test(html)) {
    errors.push('faviconがありません（<link rel="icon" href="data:..."> をインラインで入れる）');
  }
  if (!HUB_LINK_RE.test(html)) {
    errors.push('apps.jozo.beer へのフッターリンクがありません（<a href="https://apps.jozo.beer">）');
  }
} catch {
  errors.push("public/index.html がありません");
}

requireFile("PLAN.md", "PLAN.md がありません（plannerが未実行）");
requireFile("README.md", "README.md がありません（テンプレートから削除しないこと）");
requireFile("wrangler.jsonc", "wrangler.jsonc がありません");

if (errors.length > 0) {
  console.error("verify失敗:\n" + errors.map((e) => `- ${e}`).join("\n"));
  process.exit(1);
}
console.log("verify OK");
