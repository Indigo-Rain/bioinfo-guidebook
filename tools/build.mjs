#!/usr/bin/env node
/**
 * build.mjs —— 单一构建入口。
 *
 * 职责：
 *   1. 读取 data/catalog.json 与 catalog 登记的全部分类文件（白名单加载，防漏文件）
 *   2. 用 tools/lib/model.mjs 的纯函数做**强校验**，任一 error 即非零退出
 *   3. 生成 data/bundle.json 与自包含的 index.html
 *
 * 用法：
 *   node tools/build.mjs            校验 + 生成产物
 *   node tools/build.mjs --check    只校验，不写任何文件（CI 用）
 *   node tools/build.mjs --quiet    仅输出错误与最终一行摘要
 *
 * 退出码：0 成功（warnings 不影响），1 校验失败或构建错误。
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { assembleRegistry, validateRegistry } from './lib/model.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const QUIET = argv.includes('--quiet');
/**
 * --strict 把"进度类"差异（manifest 里已登记但还没写的模块）升级为构建失败。
 * 数据填充过程中这两者必然不一致，非严格模式下只报告数量；
 * 交付/CI 时用 --strict 确认覆盖完整。至于"已实现却没登记"始终是错误，
 * 因为它会让清单失去权威性——那种不一致任何时候都不该存在。
 */
const STRICT = argv.includes('--strict');

/* ------------------------------------------------------------------ *
 * 输出helpers：统一在这里控制安静模式
 * ------------------------------------------------------------------ */
const say = (...args) => {
  if (!QUIET) console.log(...args);
};
let warningCount = 0;
function warn(msg) {
  warningCount += 1;
  console.log(`  ! 警告  ${msg}`);
}
function fail(msg) {
  console.log(`  x 错误  ${msg}`);
}

async function readJSON(absPath) {
  let text = await readFile(absPath, 'utf8');
  // 容忍 UTF-8 BOM：Windows 编辑器（记事本 / VS Code 另存为）默认会写入 BOM，
  // 而 JSON.parse 会把 BOM 当非法字符直接抛错。这里统一剥掉，避免踩坑。
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`解析 JSON 失败：${path.relative(ROOT, absPath)}\n  ${err.message}`);
  }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

async function loadRegistry() {
  const catalogPath = path.join(DATA, 'catalog.json');
  if (!existsSync(catalogPath)) throw new Error('缺少 data/catalog.json');
  const catalog = await readJSON(catalogPath);

  // 白名单加载：只认 catalog 里登记过的分类文件，这样新增文件忘了登记会立刻暴露
  const categoryFiles = [];
  const missingFiles = [];
  for (const category of catalog.categories) {
    const abs = path.join(DATA, category.file);
    if (!existsSync(abs)) {
      missingFiles.push(category.file);
      continue;
    }
    const parsed = await readJSON(abs);
    const modules = normalizeCategoryFile(parsed, abs);
    checkCategoryFileShape(modules, category, abs);
    categoryFiles.push({ category: category.id, modules });
  }

  const registry = assembleRegistry(catalog, categoryFiles);

  const presetsPath = path.join(DATA, 'presets.json');
  if (existsSync(presetsPath)) {
    registry.presets = await readJSON(presetsPath);
  } else {
    warn('缺少 data/presets.json，预设流程将为空');
  }

  // 把"文件不存在"变成显式错误而不是静默跳过
  for (const file of missingFiles) {
    registry.errors.push({
      code: 'missing-category-file',
      message: `catalog 登记了 "${file}"，但该文件不存在（空分类也必须保留文件并写 []）`
    });
  }

  // 记录数据文件清单，供自包含检查与文档使用
  registry.dataFiles = categoryFiles.map((c) => c.category);
  return registry;
}

/** 分类文件的形状归一化：接受裸数组，或 { "modules": [...] } 包装 */
function normalizeCategoryFile(parsed, abs) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.modules)) return parsed.modules;
  throw new Error(
    `分类文件 ${path.relative(ROOT, abs)} 必须是模块数组，或形如 { "modules": [...] } 的对象`
  );
}

function checkCategoryFileShape(modules, category, abs) {
  for (const mod of modules) {
    if (!mod || typeof mod !== 'object' || Array.isArray(mod)) {
      throw new Error(`分类文件 ${path.relative(ROOT, abs)} 的 ${category.id} 中存在非对象条目`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 产物自包含检查：这是"离线可用"的硬保证
 * ------------------------------------------------------------------ */

const FORBIDDEN_IN_HTML = [
  { pattern: /\bfetch\s*\(/, label: 'fetch() 网络请求' },
  { pattern: /XMLHttpRequest/, label: 'XMLHttpRequest 网络请求' },
  { pattern: /@import\s+url/i, label: 'CSS @import 远程资源' },
  { pattern: /<script\b[^>]*\bsrc\s*=/i, label: '外链 <script src>' },
  { pattern: /<link\b[^>]*\bhref\s*=\s*["']?(?!data:|#)/i, label: '外链 <link href>' },
  { pattern: /<img\b[^>]*\bsrc\s*=\s*["'](?!data:)/i, label: '外链 <img src>' },
  { pattern: /@font-face[\s\S]{0,200}?https?:/i, label: '远程字体' },
  { pattern: /https?:\/\//i, label: '外部 http(s) 链接' }
];

/**
 * 检查 HTML 是否完全自包含。
 *
 * 做法：先剥掉 HTML 注释与内联 JSON 数据（数据里的 URL 只是文档链接文本，
 * 不会发起请求），然后在剩下的"活代码"里搜索网络依赖。
 *
 * 唯一的例外是 SVG 命名空间标识符：它必须原样出现一次（见 model.mjs 的 SVG_NS
 * 注释），且只允许出现在**那一行声明语句**上——行内必须同时包含 SVG_NS 这一
 * 标识符名。这样"整份产物里只有一个 URL 字面量、且它只是一个命名空间常量"
 * 这件事可以被机械验证，而不是靠人记住哪里可以例外。
 */
function checkSelfContained(html) {
  const live = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>[\s\S]*?<\/script>/gi, '');

  const problems = [];
  const lines = live.split('\n');
  const exempted = [];

  lines.forEach((line, index) => {
    const isNamespaceDeclaration = /SVG_NS/.test(line);
    for (const { pattern, label } of FORBIDDEN_IN_HTML) {
      const match = line.match(pattern);
      if (!match) continue;
      if (isNamespaceDeclaration && label === '外部 http(s) 链接') {
        exempted.push(index + 1);
        continue;
      }
      problems.push(`${label}（第 ${index + 1} 行，片段：${JSON.stringify(match[0])}）`);
    }
  });

  if (exempted.length > 1) {
    problems.push(
      `SVG 命名空间被声明了 ${exempted.length} 次（第 ${exempted.join('、')} 行）：` +
        '全项目只允许在 model.mjs 中定义一次 SVG_NS'
    );
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * manifest 一致性检查
 *
 * data/module-manifest.json 是模块 id 的权威清单，作用有两个：
 *   1. 给 feeds.target 一个"可以引用哪些 id"的事前契约（写新模块时不必等别人先写好）
 *   2. 让覆盖范围可被机器核对，而不是靠人记
 * 因此这里做双向核对：清单里有但没实现的（未完成）、实现了但没登记的（漏登记）。
 * ------------------------------------------------------------------ */

async function checkManifestSync(registry) {
  const problems = [];
  const warnings = [];
  const manifestPath = path.join(DATA, 'module-manifest.json');
  if (!existsSync(manifestPath)) {
    warnings.push('缺少 data/module-manifest.json，跳过 id 清单核对');
    return { problems, warnings };
  }

  const manifest = await readJSON(manifestPath);
  const declared = new Map(); // id -> category
  for (const [categoryId, entries] of Object.entries(manifest.byCategory || {})) {
    for (const entry of entries) {
      if (!entry || !entry.id) {
        problems.push(`manifest 的 ${categoryId} 中存在缺少 id 的条目`);
        continue;
      }
      if (declared.has(entry.id)) {
        problems.push(`manifest 中 id "${entry.id}" 重复登记`);
        continue;
      }
      declared.set(entry.id, categoryId);
      if (!registry.categoryById.has(categoryId)) {
        problems.push(`manifest 的 "$categoryId" 不是 catalog 中登记的分类（id: ${categoryId}）`);
      }
    }
  }

  const implemented = new Map(registry.modules.map((m) => [m.id, m]));

  const missing = [...declared.keys()].filter((id) => !implemented.has(id));
  const extra = [...implemented.keys()].filter((id) => !declared.has(id));

  // "实现了却没登记"永远算错误：它会让清单失去权威性，feeds 也就失去了事前契约。
  for (const id of extra) {
    problems.push(`模块 "${id}" 已实现但未登记在 data/module-manifest.json，请补登记`);
  }
  // "登记了还没写"只是进度，交给调用方决定是警告还是错误。
  for (const id of missing) {
    warnings.push(`manifest 已登记但尚未实现：${id}`);
  }

  // 分类归属核对：manifest 说它属于哪个分类，实际就得在哪个分类
  for (const [id, categoryId] of declared) {
    const mod = implemented.get(id);
    if (mod && mod.category !== categoryId) {
      problems.push(`模块 "${id}" 在 manifest 中属于 "${categoryId}"，实际却是 "${mod.category}"，请统一`);
    }
  }

  return { problems, warnings, missing, extra, declared: declared.size, implemented: implemented.size };
}

/* ------------------------------------------------------------------ *
 * 文档完整性检查（--strict 时生效）
 *
 * 现有的 docs 引用检查只覆盖「预设显式引用的文档」。但如果某一章既没被
 * 预设引用、模块的 docs 又恰好漏了它，那一章就会**静默缺失**而构建依然通过。
 * 交付前的 --strict 模式下，我们对照指南的实际约定核对章节文件是否齐全。
 * ------------------------------------------------------------------ */

const REQUIRED_GUIDEBOOK_CHAPTERS = [
  '00-overview-and-learning-path.md',
  '01-environment-and-conventions.md',
  '02-upstream-qc.md',
  '03-genome-assembly.md',
  '04-assembly-qc.md',
  '05-taxonomy-identification.md',
  '06-annotation-resistance-virulence.md',
  '07-comparative-pangenome.md',
  '08-metagenome-microbiome.md',
  '09-transcriptome-differential-expression.md',
  '10-downstream-analysis-visualization.md',
  '11-workflow-reproducibility.md'
];

const REQUIRED_REFERENCE_DOCS = [
  'module-schema.md',
  'tool-index.md',
  'param-cheatsheet.md',
  'troubleshooting.md'
];

function checkDocsCompleteness() {
  const missing = [];
  for (const name of REQUIRED_GUIDEBOOK_CHAPTERS) {
    if (!existsSync(path.join(ROOT, 'docs', 'guidebook', name))) {
      missing.push(`docs/guidebook/${name}`);
    }
  }
  for (const name of REQUIRED_REFERENCE_DOCS) {
    if (!existsSync(path.join(ROOT, 'docs', 'reference', name))) {
      missing.push(`docs/reference/${name}`);
    }
  }
  for (const name of ['README.md', 'docs/ARCHITECTURE.md', 'docs/CONTRIBUTING.md']) {
    if (!existsSync(path.join(ROOT, name))) missing.push(name);
  }
  return missing;
}

/* ------------------------------------------------------------------ *
 * 文档一致性检查：docs 里引用的模块 id 必须真实存在
 * ------------------------------------------------------------------ */

async function checkDocsReferences(registry) {
  const problems = [];
  const docsDir = path.join(ROOT, 'docs');
  if (!existsSync(docsDir)) return problems;

  const files = await collectMarkdown(docsDir);
  // 只检查形如 `module_id` 的显式引用：约定写在反引号里。
  // 字符类必须含下划线 —— 模块 id 的形式是 `前缀_名称`，不含下划线的字符类
  // 永远匹配不到任何真实 id，会让这条检查形同虚设（曾经如此，现已修正）。
  for (const abs of files) {
    const text = await readFile(abs, 'utf8');
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    const tokens = new Set();
    for (const match of text.matchAll(/`([A-Za-z][A-Za-z0-9_-]{2,60})`/g)) tokens.add(match[1]);
    for (const token of tokens) {
      // 只校验"看起来像模块 id"的 token：已知前缀 + 下划线 + 小写名称
      const looksLikeModuleId = /^(qc|asmqc|asm|anno|res|phage|tax|pange|comp|amplicon|meta|tran|phy|py|r|viz|wf|util|io)_[a-z0-9_]+$/.test(
        token
      );
      if (!looksLikeModuleId) continue;
      if (!registry.moduleById.has(token)) {
        problems.push(`${rel} 引用了不存在的模块 id \`${token}\``);
      }
    }
  }

  // 预设引用的 docs 文件必须存在
  for (const preset of registry.presets || []) {
    for (const doc of preset.docs || []) {
      const target = doc.split('#')[0];
      if (!existsSync(path.join(ROOT, target))) {
        problems.push(`预设 "${preset.id}" 引用了不存在的文档 ${doc}`);
      }
    }
  }

  // 模块条目自己声明的 docs 路径也必须存在。
  // 缺了这条检查，模块级的失效链接就抓不到 —— 而模块的 docs 链接是读者从
  // 面板跳到指南的入口，失效了不会报错、只会让人找不到东西。
  for (const mod of registry.modules) {
    for (const doc of mod.docs || []) {
      const rel = typeof doc === 'string' ? doc : doc && doc.path;
      if (!rel) continue;
      const target = rel.split('#')[0];
      if (!existsSync(path.join(ROOT, target))) {
        problems.push(`模块 "${mod.id}" 引用了不存在的文档 ${rel}`);
      }
    }
  }

  return problems;
}

async function collectMarkdown(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectMarkdown(abs)));
    else if (entry.name.endsWith('.md')) out.push(abs);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 主入口
 * ------------------------------------------------------------------ */

async function main() {
  say('== 微生物生物信息学 Pipeline 知识系统 · 构建 ==');
  say(`   模式：${CHECK_ONLY ? '仅校验 (--check)' : '校验 + 生成'}`);

  const registry = await loadRegistry();
  say(`   载入：${registry.dataFiles.length} 个分类文件 / ${registry.modules.length} 个模块 / ${(registry.presets || []).length} 条预设`);

  const { errors, warnings, stats } = validateRegistry(registry);

  say('');
  say('-- 注册表校验 --');
  if (errors.length) {
    for (const e of errors) fail(`${e.message}  [${e.code}]`);
  } else {
    say(`   OK  无错误`);
  }
  for (const w of warnings) warn(w.message);

  // manifest 与实现的双向核对
  say('');
  say('-- 模块清单核对 --');
  const manifestReport = await checkManifestSync(registry);
  if (manifestReport.problems.length) {
    for (const p of manifestReport.problems) fail(p);
    errors.push(...manifestReport.problems.map((message) => ({ code: 'manifest-sync', message })));
  } else if (!manifestReport.warnings.length) {
    say(`   OK  ${manifestReport.declared} 个登记 id 与 ${manifestReport.implemented} 个已实现模块完全一致`);
  } else {
    // 进度类差异：默认只报告数量，--strict 才当作失败
    const done = manifestReport.declared - manifestReport.warnings.length;
    const message =
      `覆盖进度 ${done}/${manifestReport.declared}（尚有 ${manifestReport.warnings.length} 个已登记 id 未实现）`;
    if (STRICT) {
      fail(message + '—— --strict 模式下视为未完成');
      errors.push({ code: 'manifest-incomplete', message });
      for (const w of manifestReport.warnings.slice(0, 40)) fail(w);
    } else {
      say('   ' + message);
      say('   （交付前请用 --strict 确认覆盖完整）');
    }
  }

  // 文档引用一致性
  say('');
  say('-- 文档引用一致性 --');
  const docProblems = await checkDocsReferences(registry);
  if (docProblems.length) {
    for (const p of docProblems) fail(p);
    errors.push(...docProblems.map((message) => ({ code: 'docs-reference', message })));
  } else {
    say('   OK  文档中的模块引用与预设文档链接均有效');
  }

  // 文档完整性（仅 --strict）
  if (STRICT) {
    say('');
    say('-- 文档完整性（--strict）--');
    const missingDocs = checkDocsCompleteness();
    if (missingDocs.length) {
      for (const p of missingDocs) fail(`缺少必需文档：${p}`);
      errors.push(...missingDocs.map((message) => ({ code: 'docs-missing', message })));
    } else {
      say('   OK  指南章节与参考文档齐全');
    }
  }

  // 统计概览
  say('');
  say('-- 覆盖统计 --');
  for (const layer of registry.catalog.layers) {
    const count = stats.byLayer[layer.id] || 0;
    say(`   ${layer.label.padEnd(8, '　')} ${String(count).padStart(3)} 个模块`);
  }
  say(`   工具声明合计：${stats.tools} 条`);

  if (errors.length) {
    console.log('');
    console.log(`BUILD FAILED —— ${errors.length} 个错误，${warnings.length} 个警告`);
    process.exit(1);
  }

  // ---- 生成产物 ----
  const bundle = {
    format: 'bioinfo-guidebook/bundle',
    version: 1,
    catalog: registry.catalog,
    moduleCount: registry.modules.length,
    modules: registry.modules,
    presets: registry.presets || [],
    stats
  };

  if (CHECK_ONLY) {
    say('');
    say('-- 自包含检查（对现有 index.html）--');
    const htmlPath = path.join(ROOT, 'index.html');
    if (!existsSync(htmlPath)) {
      warn('index.html 尚不存在，跳过自包含检查（首次构建时会生成）');
    } else {
      const problems = checkSelfContained(await readFile(htmlPath, 'utf8'));
      if (problems.length) {
        for (const p of problems) fail(`index.html 不是完全自包含：${p}`);
        console.log('');
        console.log('CHECK FAILED —— index.html 存在外部依赖');
        process.exit(1);
      }
      say('   OK  index.html 无任何外部依赖（无 CDN、无外链、无 fetch）');
    }
    say('');
    console.log(`CHECK OK —— 0 个错误，${warnings.length} 个警告`);
    return;
  }

  await writeFile(path.join(DATA, 'bundle.json'), JSON.stringify(bundle, null, 2) + '\n', 'utf8');
  say('');
  say('   写入 data/bundle.json');

  // 先落盘再校验：这样自包含检查失败时，产物仍在磁盘上可供排查，
  // 而失败的退出码与醒目报错保证不会有人把不合格产物当成通过。
  const html = await renderHTML(bundle);
  await writeFile(path.join(ROOT, 'index.html'), html, 'utf8');
  say(`   写入 index.html（${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB）`);

  const problems = checkSelfContained(html);
  if (problems.length) {
    for (const p of problems) fail(`index.html 不是完全自包含：${p}`);
    console.log('');
    console.log('BUILD FAILED —— HTML 存在外部依赖（已写出产物供排查）');
    process.exit(1);
  }
  say('   自包含检查通过：无 CDN、无外链、无 fetch');

  console.log('');
  console.log(`BUILD OK —— ${registry.modules.length} 个模块，${(registry.presets || []).length} 条预设，${warnings.length} 个警告`);
}

/* ------------------------------------------------------------------ *
 * HTML 渲染：把 CSS / JS / 数据全部内联成一个文件
 * ------------------------------------------------------------------ */

const DATA_PLACEHOLDER = '/*__BUNDLE_JSON__*/';

async function renderHTML(bundle) {
  const templatePath = path.join(ROOT, 'assets', 'templates', 'panel.html');
  const cssPath = path.join(ROOT, 'assets', 'css', 'panel.css');
  const modelPath = path.join(ROOT, 'tools', 'lib', 'model.mjs');
  const panelPath = path.join(ROOT, 'assets', 'js', 'panel.js');

  for (const abs of [templatePath, cssPath, modelPath, panelPath]) {
    if (!existsSync(abs)) throw new Error(`缺少资源文件：${path.relative(ROOT, abs)}`);
  }

  const template = await readFile(templatePath, 'utf8');
  const css = await readFile(cssPath, 'utf8');
  const modelSrc = browserVariantOfModel(await readFile(modelPath, 'utf8'));
  const panelSrc = await readFile(panelPath, 'utf8');

  // 数据以 JSON 形式内联；把 </script> 序列转义，避免提前闭合脚本标签
  const dataJSON = JSON.stringify(bundle)
    .replace(/</g, '\\u003c')
    .replace(/-->/g, '--\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  let html = template;
  html = html.replace('/*__PANEL_CSS__*/', () => css);
  html = html.replace('/*__PANEL_MODEL__*/', () => modelSrc);
  html = html.replace(DATA_PLACEHOLDER, () => dataJSON);
  html = html.replace('/*__PANEL_APP__*/', () => panelSrc);

  const leftover = html.match(/\/\*__PANEL_[A-Z_]+__\*\//);
  if (leftover) throw new Error(`模板占位符未被替换：${leftover[0]}`);

  return html;
}

/**
 * 把 tools/lib/model.mjs 转换成浏览器可直接运行的经典脚本。
 *
 * 为什么这么做：model.mjs 是唯一实现，被 Node 测试 import，也被面板复用。
 * 浏览器里面板要调用它的函数，而经典 <script> 不能 import。这里的转换只做
 * 两件事：去掉声明前的 `export ` 关键字，去掉 `export { ... }` 汇总语句。
 * 因为 model.mjs 的函数均为顶层声明（不依赖 ESM 的模块作用域隔离），
 * 去掉 export 后它们就成为全局函数，面板可直接调用，语义完全不变。
 */
function browserVariantOfModel(source) {
  const converted = source
    .replace(/^export\s+\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^(\s*)export\s+(async\s+function|function|class|const|let|var)\b/gm, '$1$2');

  if (/^export\b/m.test(converted)) {
    throw new Error(
      'model.mjs 中存在本转换不支持的 export 形式（仅支持 export function/class/const/let/var 与 export { ... }），' +
        '请改用受支持的形式或在 tools/build.mjs 中扩展 browserVariantOfModel。'
    );
  }
  if (/^\s*import\b/m.test(converted)) {
    throw new Error('model.mjs 不得包含 import 语句：它必须保持零依赖，才能被内联进浏览器。');
  }
  return `/* 由 tools/lib/model.mjs 自动转换生成，请勿直接编辑此段 */\n${converted}`;
}

main().catch((err) => {
  console.error('');
  console.error('BUILD ERROR:', err.message);
  if (process.env.DEBUG_BUILD) console.error(err.stack);
  process.exit(1);
});
