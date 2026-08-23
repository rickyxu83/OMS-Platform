#!/usr/bin/env node
/**
 * 复用铁律硬检查（宪法第一条的烟雾报警器）
 *
 * 规则：
 *  1. 禁止在 frontend-admin/src/lib/format.ts 之外定义 format 家族函数
 *     （formatDate/formatDateTime/formatDateRange/formatFileSize 等）
 *  2. 禁止在 frontend-admin/src/services/api.ts 之外直接调用 fetch(
 *
 * 存量问题采用"基线只减不增"策略：scripts/reuse-baseline.json 记录当前已知的
 * 违例文件与次数；新增违例（新文件或同文件次数变多）→ 报错退出；收敛减少 → 通过。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(root, "frontend-admin", "src");
const BASELINE_PATH = join(root, "scripts", "reuse-baseline.json");

const RULES = [
  {
    id: "no-private-format-fn",
    // 定义点：function formatXxx / const formatXxx =（import 和调用不算）
    pattern: /^(?:export\s+)?(?:function|const)\s+(formatDate|formatDateTime|formatDateRange|formatDateOnly|formatFileSize)\b/m,
    allowedFile: join("lib", "format.ts"),
    desc: "format 家族函数只能定义在 lib/format.ts",
  },
  {
    id: "no-direct-fetch",
    pattern: /(?<![\w.])fetch\(/,
    allowedFile: join("services", "api.ts"),
    desc: "fetch 只能出现在 services/api.ts",
  },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const violations = [];

for (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  const content = readFileSync(file, "utf8");
  for (const rule of RULES) {
    if (rel === rule.allowedFile) continue;
    const matches = content.split("\n").filter((l) => rule.pattern.test(l));
    if (matches.length === 0) continue;
    const key = `${rule.id}:${rel}`;
    const known = baseline[key] ?? 0;
    if (matches.length > known) {
      violations.push({ rule: rule.id, file: rel, count: matches.length, known, desc: rule.desc });
    }
  }
}

if (violations.length > 0) {
  console.error("❌ 复用铁律检查未通过（宪法第一条）：\n");
  for (const v of violations) {
    console.error(`  ${v.file}: 新增 ${v.count - v.known} 处违例（共 ${v.count} 处）—— ${v.desc}`);
  }
  console.error("\n请复用现有资产（见 docs/reusable-assets.md），不要在页面里私建。存量违例请顺手收敛。");
  process.exit(1);
}
console.log("✅ 复用铁律检查通过（无新增违例）");
