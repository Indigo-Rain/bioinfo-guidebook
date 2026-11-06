#!/usr/bin/env node
/**
 * gen-reference.mjs —— 从 data/ 生成 docs/reference/ 下的参考文档。
 *
 * 为什么需要这个脚本：docs/reference/tool-index.md 是一张 150+ 行的长表，
 * 手抄必然与 data/modules/*.json 漂移。凡是"可以机械核对"的内容就不该由人维护。
 *
 * 用法：
 *   node tools/gen-reference.mjs tool-index      # 生成 docs/reference/tool-index.md（覆盖写入）
 *   node tools/gen-reference.mjs params-dump     # 生成参数清单草稿，供人工整理成 param-cheatsheet.md
 *   node tools/gen-reference.mjs pitfalls-dump   # 生成 pitfalls 清单草稿，供人工整理成 troubleshooting.md
 *   node tools/gen-reference.mjs verify          # 校验 docs/ 里的模块 id 引用与文档链接
 *   node tools/gen-reference.mjs stat            # 只打印统计，不写文件
 *
 * 三个 dump 子命令写到 .scratch/ 而不是 docs/：它们是**草稿**，
 * param-cheatsheet.md 与 troubleshooting.md 需要人工按"读者的问题"重新组织，
 * 不能被脚本覆盖。
 *
 * 关于 verify：tools/build.mjs 的文档引用检查用的正则是 `` `([a-z][a-z0-9-]{2,40})` ``，
 * 字符类里没有下划线，而全部模块 id 都含下划线——也就是说那条检查事实上永远不会命中模块 id。
 * verify 子命令按真实的前缀规则做这件事，作为独立的第二道核对。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const DOCS = path.join(ROOT, 'docs');
const SCRATCH = path.join(ROOT, '.scratch');

/** 读 JSON，容忍 BOM（与 tools/build.mjs 保持一致的宽容度） */
function readJSON(abs) {
  let text = readFileSync(abs, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

/** 按 catalog 顺序加载全部模块，并标注所属分类 */
function loadAll() {
  const catalog = readJSON(path.join(DATA, 'catalog.json'));
  const categories = [];
  for (const category of catalog.categories) {
    const parsed = readJSON(path.join(DATA, category.file));
    const modules = Array.isArray(parsed) ? parsed : parsed.modules;
    categories.push({ ...category, modules });
  }
  const modules = categories.flatMap((c) =>
    c.modules.map((m) => ({ ...m, _categoryLabel: c.label, _categoryId: c.id }))
  );
  return { catalog, categories, modules };
}

/** Markdown 表格单元里的竖线与换行必须转义，否则表格会散架 */
const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** 把 provides 渲染成 "工具 版本" 的列表（保留官方大小写） */
function toolList(provides) {
  return (provides || [])
    .map((p) => `${p.tool} ${p.version}`)
    .join('<br>');
}

/* ------------------------------------------------------------------ *
 * tool-index：完全由数据生成，不手工维护
 * ------------------------------------------------------------------ */

function renderToolIndex() {
  const { catalog, categories, modules } = loadAll();

  const provideCount = modules.reduce((n, m) => n + (m.provides || []).length, 0);
  const tools = new Map(); // tool 名 -> { versions:Set, modules:[] }
  for (const m of modules) {
    for (const p of m.provides || []) {
      if (!tools.has(p.tool)) tools.set(p.tool, { versions: new Set(), modules: [] });
      const entry = tools.get(p.tool);
      entry.versions.add(p.version);
      entry.modules.push(m.id);
    }
  }

  const out = [];
  out.push('# 工具索引（tool index）');
  out.push('');
  out.push('> **本文件由数据生成，如需更新请重新运行生成脚本，不要手工编辑。**');
  out.push('>');
  out.push('> 生成命令（在仓库根目录执行）：');
  out.push('>');
  out.push('> ```bash');
  out.push('> node tools/gen-reference.mjs tool-index');
  out.push('> ```');
  out.push('>');
  out.push('> 数据源：`data/catalog.json`（分类顺序）+ `data/modules/*.json`（模块与 `provides`）。');
  out.push('> 表中的模块 id 直接取自数据，因此天然存在；如需核对 docs/ 全部章节里的模块 id 引用与文档链接，运行：');
  out.push('>');
  out.push('> ```bash');
  out.push('> node tools/gen-reference.mjs verify');
  out.push('> ```');
  out.push('');
  out.push('## 索引概览');
  out.push('');
  out.push('| 指标 | 数量 |');
  out.push('|---|---|');
  out.push(`| 分类 | ${categories.length} |`);
  out.push(`| 模块 | ${modules.length} |`);
  out.push(`| 工具声明（provides 条目，按「模块 × 工具」计） | ${provideCount} |`);
  out.push(`| 去重后的工具名 | ${tools.size} |`);
  out.push(`| 分类文件 | ${categories.length} |`);
  out.push('');
  out.push('「工具声明」与「工具名」的区别值得说清楚：同一个工具常出现在多个模块里（`samtools` 既在质控去宿主、也在变异检测与格式转换中出现），');
  out.push('因此声明数（每条都带自己的版本与用途上下文）远多于工具名数。**统计工具总数时要说清用的是哪个口径**。');
  out.push('');
  out.push('版本号写法遵循 `docs/reference/module-schema.md` 的约定：写「主.次」加 `x`（如 `0.23.x`），');
  out.push('用来表达「这个模块验证过的版本区间」，而不是某个精确的构建号。精确版本由使用者在自己的环境里核对。');
  out.push('');
  out.push('## 按分类索引');
  out.push('');
  out.push('分类顺序与 `data/catalog.json` 的 `categories[].order` 一致（上游 → 核心 → 下游 → 引擎）。');
  out.push('');

  for (const category of categories) {
    const catModules = category.modules;
    const catProvides = catModules.reduce((n, m) => n + (m.provides || []).length, 0);
    out.push(`### ${category.label}（\`${category.id}\`）`);
    out.push('');
    out.push(`层：${layerLabel(catalog, catModules[0]?.layer)}　|　模块：${catModules.length}　|　工具声明：${catProvides}`);
    out.push('');
    if (!catModules.length) {
      out.push('_该分类下暂无模块。_');
      out.push('');
      continue;
    }
    out.push('| 模块 id | 中文名称 | 类型 | 工具（版本） |');
    out.push('|---|---|---|---|');
    for (const m of catModules) {
      out.push(
        `| \`${m.id}\` | ${cell(m.name)} | ${kindLabel(catalog, m.kind)} | ${cell(toolList(m.provides))} |`
      );
    }
    out.push('');
  }

  out.push('## 按工具名索引');
  out.push('');
  out.push('下面这张表按工具名排序，用来回答「某个工具在这个知识系统里出现在哪些模块」。');
  out.push('当你想知道「我手上的 samtools 还能用在哪」时，从这张表进比从分类进更快。');
  out.push('');
  out.push('| 工具 | 版本 | 出现于模块 |');
  out.push('|---|---|---|');
  const sortedTools = [...tools.entries()].sort((a, b) =>
    a[0].toLowerCase().localeCompare(b[0].toLowerCase(), 'en')
  );
  for (const [tool, entry] of sortedTools) {
    const versions = [...entry.versions].join(' / ');
    const ids = [...new Set(entry.modules)].sort().map((id) => `\`${id}\``).join('、');
    out.push(`| ${cell(tool)} | ${cell(versions)} | ${ids} |`);
  }
  out.push('');

  return out.join('\n');
}

function layerLabel(catalog, id) {
  const layer = (catalog.layers || []).find((l) => l.id === id);
  return layer ? `${layer.label}（\`${layer.id}\`）` : (id ?? '—');
}

function kindLabel(catalog, id) {
  const kind = (catalog.interfaceKinds || []).find((k) => k.id === (id || 'standard'));
  return kind ? kind.label : (id || '常规');
}

/* ------------------------------------------------------------------ *
 * params-dump / pitfalls-dump：给人工整理用的草稿
 * ------------------------------------------------------------------ */

/** 参数速查表的分组：把 catalog 分类映射到读者提问时的八个入口 */
const PARAM_GROUPS = [
  { title: '质控', categories: ['quality-control', 'assembly-qc'] },
  { title: '组装', categories: ['assembly'] },
  { title: '注释', categories: ['annotation-functional', 'annotation-resistance', 'annotation-phage'] },
  { title: '分类与分型', categories: ['taxonomy', 'variant-calling'] },
  { title: '宏基因组与扩增子', categories: ['metagenome', 'amplicon'] },
  { title: '转录组', categories: ['transcriptome'] },
  { title: '建树与比较基因组', categories: ['phylogeny', 'pangenome', 'comparative'] },
  { title: '通用（数据、绘图、流程、格式）', categories: ['downstream-python', 'downstream-r', 'visualization', 'workflow', 'utility', 'io-formats'] }
];

function renderParamsDump() {
  const { categories } = loadAll();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out = [];
  out.push('# 参数清单草稿（由 tools/gen-reference.mjs params-dump 生成）');
  out.push('');
  out.push('这是**草稿**，不是交付文档。人工整理进 `docs/reference/param-cheatsheet.md` 时要做三件事：');
  out.push('把「参数 — 常用值 — 什么情况下该改」压缩成一行、合并重复项、按读者的问题而不是按工具分组。');
  out.push('');
  for (const group of PARAM_GROUPS) {
    out.push(`## ${group.title}`);
    out.push('');
    for (const catId of group.categories) {
      const category = byId.get(catId);
      if (!category) continue;
      for (const m of category.modules) {
        if (!(m.params || []).length) continue;
        out.push(`### ${m.id} — ${m.name}`);
        out.push('');
        out.push('| 参数 | 默认 | 说明 |');
        out.push('|---|---|---|');
        for (const p of m.params) out.push(`| ${cell(p.flag)} | ${cell(p.default)} | ${cell(p.note)} |`);
        out.push('');
      }
    }
  }
  return out.join('\n');
}

function renderPitfallsDump() {
  const { categories } = loadAll();
  const out = [];
  out.push('# pitfalls 清单草稿（由 tools/gen-reference.mjs pitfalls-dump 生成）');
  out.push('');
  out.push('这是**草稿**。`docs/reference/troubleshooting.md` 的价值在于按「问题现象」重新组织，');
  out.push('而下面的清单是按工具组织的原始素材——现象那一层必须由人来写。');
  out.push('');
  for (const category of categories) {
    out.push(`## ${category.label}（\`${category.id}\`）`);
    out.push('');
    for (const m of category.modules) {
      out.push(`### ${m.id} — ${m.name}`);
      out.push('');
      for (const p of m.pitfalls || []) out.push(`- ${p}`);
      out.push('');
    }
  }
  return out.join('\n');
}

/* ------------------------------------------------------------------ *
 * verify：校验 docs/ 里的模块 id 引用与相对链接
 * ------------------------------------------------------------------ */

/** 模块 id 的前缀集合（比 build.mjs 的正则更贴近实际命名） */
const MODULE_ID = /^(qc|asm|asmqc|anno|tax|pange|comp|amplicon|meta|tran|phy|py|r|viz|wf|util|io|res|phage|var)_[a-z0-9_]+$/;

function collectMarkdown(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectMarkdown(abs));
    else if (entry.name.endsWith('.md')) out.push(abs);
  }
  return out;
}

function verify() {
  const { modules } = loadAll();
  const ids = new Set(modules.map((m) => m.id));
  const docsDir = path.join(ROOT, 'docs');
  const files = collectMarkdown(docsDir);

  const missingIds = [];
  const missingLinks = [];
  let tokenCount = 0;
  let linkCount = 0;

  for (const abs of files) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    const text = readFileSync(abs, 'utf8');

    const tokens = new Set();
    for (const match of text.matchAll(/`([a-z][a-z0-9_-]{2,40})`/g)) tokens.add(match[1]);
    for (const token of tokens) {
      if (!MODULE_ID.test(token)) continue;
      tokenCount += 1;
      if (!ids.has(token)) missingIds.push(`${rel}: \`${token}\``);
    }

    const base = path.dirname(abs);
    const links = new Set();
    for (const match of text.matchAll(/\]\(([^)\s#]+\.md)/g)) links.add(match[1]);
    for (const link of links) {
      linkCount += 1;
      if (!existsSync(path.resolve(base, link))) missingLinks.push(`${rel}: ${link}`);
    }
  }

  // tool-index 必须覆盖全部模块
  const indexText = readFileSync(path.join(DOCS, 'reference', 'tool-index.md'), 'utf8');
  const notIndexed = [...ids].filter((id) => !indexText.includes('`' + id + '`'));

  console.log(`扫描 ${files.length} 个 markdown 文件`);
  console.log(`模块 id 引用 ${tokenCount} 处，无效 ${missingIds.length}`);
  missingIds.forEach((m) => console.log(`  x ${m}`));
  console.log(`相对 .md 链接 ${linkCount} 处，失效 ${missingLinks.length}`);
  missingLinks.forEach((m) => console.log(`  x ${m}`));
  console.log(`tool-index 未覆盖的模块 ${notIndexed.length} 个`);
  notIndexed.forEach((m) => console.log(`  x ${m}`));

  const failed = missingIds.length + missingLinks.length + notIndexed.length;
  if (failed) {
    console.log(`\nVERIFY FAILED —— ${failed} 个问题`);
    process.exit(1);
  }
  console.log('\nVERIFY OK');
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

function main() {
  const command = process.argv[2] || 'stat';
  const { modules, categories } = loadAll();
  const provideCount = modules.reduce((n, m) => n + (m.provides || []).length, 0);
  const toolNames = new Set(modules.flatMap((m) => (m.provides || []).map((p) => p.tool)));

  if (command === 'verify') {
    verify();
    return;
  }

  if (command === 'stat') {
    console.log(`分类 ${categories.length} 个`);
    console.log(`模块 ${modules.length} 个`);
    console.log(`工具声明 ${provideCount} 条`);
    console.log(`去重工具名 ${toolNames.size} 个`);
    for (const c of categories) {
      const n = c.modules.reduce((k, m) => k + (m.provides || []).length, 0);
      console.log(`  ${c.order}  ${c.id.padEnd(24)} 模块 ${String(c.modules.length).padStart(3)}  工具声明 ${String(n).padStart(3)}`);
    }
    return;
  }

  if (command === 'tool-index') {
    const target = path.join(DOCS, 'reference', 'tool-index.md');
    mkdirSync(path.dirname(target), { recursive: true });
    const text = renderToolIndex();
    writeFileSync(target, text, 'utf8');
    const lines = text.split('\n').length;
    console.log(`写入 ${path.relative(ROOT, target)}（${lines} 行，${modules.length} 个模块，${provideCount} 条工具声明，${toolNames.size} 个工具名）`);
    return;
  }

  if (command === 'params-dump' || command === 'pitfalls-dump') {
    if (!existsSync(SCRATCH)) mkdirSync(SCRATCH, { recursive: true });
    const name = command === 'params-dump' ? 'params-dump.md' : 'pitfalls-dump.md';
    const target = path.join(SCRATCH, name);
    const text = command === 'params-dump' ? renderParamsDump() : renderPitfallsDump();
    writeFileSync(target, text, 'utf8');
    console.log(`写入 ${path.relative(ROOT, target)}（${text.split('\n').length} 行）`);
    return;
  }

  console.error(`未知子命令：${command}`);
  console.error('可用：tool-index | params-dump | pitfalls-dump | verify | stat');
  process.exit(1);
}

main();
