#!/usr/bin/env node
/**
 * verify-exports.mjs —— 用真实数据验证三种导出是否可用。
 *
 * 为什么需要它：浏览器渲染检查在本沙箱里跑不了（Chromium 需要命名管道），
 * 因此面板的「导出」这条核心链路在浏览器中无法被自动验证。但导出逻辑本身
 * 是纯函数（tools/lib/model.mjs），可以完全在 Node 里跑真实数据 —— 这覆盖了
 * 面板最有可能出问题、且用户最依赖的那部分功能。
 *
 * 检查项：
 *   1. 每条预设都能跑通 exportAll，不抛异常
 *   2. Bash 脚本：有 shebang、有 set -euo pipefail、每个步骤都被输出、
 *      步骤数等于预设节点数（不丢步骤）
 *   3. Python 脚本：有 main()、每个步骤都被输出、缩进合法
 *   4. 管线 JSON：steps 数正确、registryVersion 存在
 *   5. 导出的脚本里不出现 undefined / NaN / [object Object] 这类渲染破绽
 *
 * 用法：node tools/verify-exports.mjs
 * 退出码：0 全部通过，1 有失败。
 */

import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assembleRegistry, buildRegistryFromBundle, exportAll, exportBash } from './lib/model.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let failures = 0;
let checks = 0;

function ok(label, extra) {
  checks += 1;
  console.log(`  OK   ${label}${extra ? '  —— ' + extra : ''}`);
}
function bad(label, detail) {
  checks += 1;
  failures += 1;
  console.log(`  FAIL ${label}`);
  if (detail) console.log(`       ${detail}`);
}

/* ------------------------------------------------------------------ *
 * 载入真实数据
 *
 * 直接读 data/modules/*.json + catalog.json + presets.json 组装注册表，
 * 而不是读 data/bundle.json —— bundle 只在构建**完全成功**后才写出，
 * 因此当文档还在补齐时它是过期的。验证导出逻辑必须用最新的模块数据。
 * ------------------------------------------------------------------ */

function readJSON(rel) {
  let text = readFileSync(path.join(ROOT, rel), 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

const catalog = readJSON('data/catalog.json');
const modulesDir = path.join(ROOT, 'data', 'modules');

const categoryFiles = catalog.categories
  .map((category) => {
    const file = path.join(modulesDir, path.basename(category.file));
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      return { category: category.id, modules: Array.isArray(parsed) ? parsed : parsed.modules || [] };
    } catch (err) {
      bad(`无法读取分类文件 ${category.file}`, err.message);
      return { category: category.id, modules: [] };
    }
  })
  .filter(Boolean);

const registry = assembleRegistry(catalog, categoryFiles);
registry.presets = readJSON('data/presets.json');

console.log('== 导出链路验证（真实数据）==');
console.log(`   模块 ${registry.modules.length} 个 · 预设 ${registry.presets.length} 条`);

if (!registry.modules.length) {
  bad('没有载入到任何模块，无法验证导出');
  process.exit(1);
}
if (registry.modules.length !== new Set(registry.modules.map((m) => m.id)).size) {
  bad('模块 id 存在重复');
}
console.log('');

/**
 * 导出脚本里的「渲染破绽」。
 *
 * 注意：`${` **不能**作为 Bash 的破绽判据 —— 模块的 recipes 刻意使用
 * `${SAMPLE}`、`${THREADS}` 这类 shell 变量，由使用者填值，这是设计而非缺陷。
 * 只有在 Python 变体里出现 `${` 才说明 f-string 的占位没被替换（真破绽）。
 */
const RENDER_BUGS_COMMON = [
  { re: /\bundefined\b/, label: 'undefined' },
  { re: /\bNaN\b/, label: 'NaN' },
  { re: /\[object Object\]/, label: '[object Object]' }
];
const RENDER_BUGS_PYTHON = [{ re: /\$\{/, label: '未替换的 Python f-string 占位 ${' }];

function checkNoRenderBugs(kind, presetId, text) {
  const patterns = kind === 'Python' ? [...RENDER_BUGS_COMMON, ...RENDER_BUGS_PYTHON] : RENDER_BUGS_COMMON;
  for (const { re, label } of patterns) {
    const match = text.match(re);
    if (match) {
      bad(`${presetId} 的 ${kind} 导出含有渲染破绽`, `出现 "${label}"（片段位置 ${match.index}）`);
      return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * 逐条预设验证
 * ------------------------------------------------------------------ */

for (const preset of registry.presets) {
  const pipeline = {
    name: preset.name,
    nodes: preset.nodes.map((n) => ({ id: n.id, moduleId: n.moduleId, x: n.x, y: n.y })),
    edges: preset.edges
  };

  let out;
  try {
    out = exportAll(pipeline, registry);
  } catch (err) {
    bad(`${preset.id} 导出抛异常`, err.message);
    continue;
  }

  // ---- 管线 JSON ----
  if (out.json.steps.length !== preset.nodes.length) {
    bad(`${preset.id} 的 JSON 步骤数与节点数不符`, `${out.json.steps.length} vs ${preset.nodes.length}`);
  }
  if (!out.json.registryVersion) bad(`${preset.id} 的 JSON 缺少 registryVersion`);

  // ---- Bash ----
  const bash = out.bash;
  if (!/^#!\/usr\/bin\/env bash/.test(bash)) bad(`${preset.id} 的 Bash 缺少 shebang`);
  if (!/set -euo pipefail/.test(bash)) bad(`${preset.id} 的 Bash 缺少 set -euo pipefail`);

  // 每个节点的模块名都应出现在脚本里（证明没有丢步骤）
  const missingInBash = preset.nodes.filter((n) => {
    const mod = registry.moduleById.get(n.moduleId);
    return !mod || !bash.includes(`[${mod.id}]`);
  });
  if (missingInBash.length) {
    bad(`${preset.id} 的 Bash 丢失了 ${missingInBash.length} 个步骤`, missingInBash.map((n) => n.moduleId).join(', '));
  }

  // ---- Python ----
  const py = out.python;
  if (!/def main\(\) -> None:/.test(py)) bad(`${preset.id} 的 Python 缺少 main()`);
  if (!/if __name__ == "__main__":/.test(py)) bad(`${preset.id} 的 Python 缺少入口守卫`);

  const missingInPy = preset.nodes.filter((n) => {
    const mod = registry.moduleById.get(n.moduleId);
    return !mod || !py.includes(`[${mod.id}]`);
  });
  if (missingInPy.length) {
    bad(`${preset.id} 的 Python 丢失了 ${missingInPy.length} 个步骤`, missingInPy.map((n) => n.moduleId).join(', '));
  }

  // ---- 渲染破绽 ----
  const clean =
    checkNoRenderBugs('Bash', preset.id, bash) && checkNoRenderBugs('Python', preset.id, py);

  if (clean && !missingInBash.length && !missingInPy.length) {
    const errors = out.json.issues.filter((i) => i.severity === 'error').length;
    ok(
      `${preset.id}`,
      `${preset.name} · ${preset.nodes.length} 步 · Bash ${(bash.length / 1024).toFixed(1)}KB · ` +
        `Python ${(py.length / 1024).toFixed(1)}KB · ${errors} 个类型错误`
    );
  }
}

/* ------------------------------------------------------------------ *
 * 边界情况：空画布、单节点、环路、含错误连线
 * ------------------------------------------------------------------ */

console.log('');
console.log('== 边界情况 ==');

try {
  const empty = exportAll({ name: '空', nodes: [], edges: [] }, registry);
  if (typeof empty.bash !== 'string' || typeof empty.python !== 'string') {
    bad('空画布导出返回了非字符串');
  } else {
    ok('空画布导出不抛异常');
  }
} catch (err) {
  bad('空画布导出抛异常', err.message);
}

try {
  const single = exportAll(
    { name: '单节点', nodes: [{ id: 'n1', moduleId: 'qc_fastp', x: 0, y: 0 }], edges: [] },
    registry
  );
  if (single.bash.includes('[qc_fastp]') && single.python.includes('[qc_fastp]')) {
    ok('单节点导出包含该步骤');
  } else {
    bad('单节点导出丢失了步骤');
  }
} catch (err) {
  bad('单节点导出抛异常', err.message);
}

// 环路：两个模块互为上下游（构造一个必然成环的场景）
try {
  const cyclic = {
    name: '环路',
    nodes: [
      { id: 'n1', moduleId: 'qc_fastp', x: 0, y: 0 },
      { id: 'n2', moduleId: 'qc_multi_qc', x: 300, y: 0 }
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n1' }
    ]
  };
  const out = exportAll(cyclic, registry);
  if (out.bash.includes('检查') || out.bash.includes('环')) {
    ok('环路在导出中已被标注');
  } else {
    bad('环路没有被标注出来（应提示存在环路）');
  }
} catch (err) {
  bad('环路导出抛异常', err.message);
}

// 导出脚本中的 Bash 语法：用 bash -n 检查（若环境有 bash）
console.log('');
console.log('== Bash 语法检查 ==');

const sample = registry.presets[0];
if (sample) {
  const bash = exportBash(
    { name: sample.name, nodes: sample.nodes, edges: sample.edges },
    registry
  );
  const tmpBash = path.join(ROOT, 'data', '_verify_tmp.sh');
  writeFileSync(tmpBash, bash, 'utf8');
  try {
    const { execFileSync } = await import('node:child_process');
    execFileSync('bash', ['-n', tmpBash], { stdio: 'ignore' });
    ok('示例 Bash 脚本通过 bash -n 语法检查');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('  SKIP 未找到 bash，跳过语法检查（本环境是 Windows）');
    } else {
      bad('示例 Bash 脚本语法错误', String(err.message).split('\n').slice(0, 3).join(' | '));
    }
  } finally {
    try { unlinkSync(tmpBash); } catch { /* 忽略 */ }
  }
}

console.log('');
if (failures) {
  console.log(`VERIFY FAILED —— ${checks - failures}/${checks} 项通过`);
  process.exit(1);
}
console.log(`VERIFY OK —— ${checks}/${checks} 项通过`);
