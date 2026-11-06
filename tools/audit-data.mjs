#!/usr/bin/env node
/**
 * audit-data.mjs —— 数据一致性审计（只读，不修改任何文件）。
 *
 * `tools/build.mjs --check` 已经能拦住结构错误（类型不匹配、dangling feed、
 * summary 超长等）。这个脚本查的是**它查不出来的那一类**：
 * 字段格式与用词的一致性——同一条信息在 160 个模块里写法不一致，
 * 会让 tool-index 之类的派生文档出现重复条目，也会让「同一版本」这件事说不清。
 *
 * 用法：
 *   node tools/audit-data.mjs
 *
 * 输出分为 A–H 段，每段都是「待人工判断」的清单，而不是构建失败：
 *
 *   A  version 字段不是版本号（违反 module-schema.md「主.次 加 x」的约定）
 *   B  工具名不是单一工具（含斜杠/中文），会污染按工具名建立的索引
 *   C  同一工具在不同模块里版本写法不一致
 *   D  工具名仅大小写或空格不同（同一工具的两种拼法）
 *   E  feeds[].viaType 不在该模块自身的 outputs 里
 *      —— 注意：构建只校验目标能收下这个类型，不校验来源真的产出它
 *   F  presets 边的 fromType/toType 与模块端口不符
 *   G  缺少可选字段的模块
 *   H  docs 指向的章节与模块分类不一致（人工复核清单，多数是正常的跨章引用）
 *
 * 退出码始终为 0：这些都是需要人来判断的取舍，不是机器能定的对错。
 */

import { readFileSync } from 'node:fs';

const cat = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const mods = [];
const byId = new Map();
for (const c of cat.categories) {
  const p = JSON.parse(readFileSync('data/' + c.file, 'utf8'));
  for (const m of Array.isArray(p) ? p : p.modules) {
    mods.push({ ...m, _cat: c.id });
    byId.set(m.id, m);
  }
}
const declares = mods.reduce((n, m) => n + (m.provides || []).length, 0);
const names = new Set(mods.flatMap((m) => (m.provides || []).map((p) => p.tool)));
console.log(`模块 ${mods.length}｜工具声明 ${declares}｜去重工具名 ${names.size}`);

console.log('\n== A. version 字段不是版本号 ==');
for (const m of mods) for (const p of m.provides || []) {
  if (!/^\d/.test(p.version)) console.log(`  ${m.id} :: ${p.tool} = "${p.version}"  (access=${p.access} install=${p.install ?? '-'})`);
}

console.log('\n== B. 工具名不是单一工具（含空格/斜杠/中文）==');
for (const n of [...names].sort()) if (/[\/]| /.test(n) && !/^[A-Za-z0-9 .+()_-]+$/.test(n)) console.log(`  "${n}"`);

console.log('\n== C. 同一工具跨模块版本不一致 ==');
const t = new Map();
for (const m of mods) for (const p of m.provides || []) {
  if (!t.has(p.tool)) t.set(p.tool, new Map());
  const v = t.get(p.tool);
  if (!v.has(p.version)) v.set(p.version, []);
  v.get(p.version).push(m.id);
}
let cCount = 0;
for (const [tool, v] of [...t.entries()].sort()) {
  if (v.size < 2) continue;
  cCount += 1;
  console.log(`  ${tool}: ${[...v.entries()].map(([ver, ids]) => `${ver} <- ${ids.join(',')}`).join('  ||  ')}`);
}
console.log(`  （共 ${cCount} 个工具存在多版本写法）`);

console.log('\n== D. 工具名仅大小写/空格不同 ==');
const g = new Map();
for (const n of names) {
  const k = n.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!g.has(k)) g.set(k, []);
  g.get(k).push(n);
}
for (const v of g.values()) if (v.length > 1) console.log(`  ${v.join('  |  ')}`);

console.log('\n== E. feeds[].viaType 不在该模块自身的 outputs 里 ==');
let eCount = 0;
for (const m of mods) for (const f of m.feeds || []) {
  if (!(m.outputs || []).some((o) => o.type === f.viaType)) {
    eCount += 1;
    console.log(`  ${m.id} -> ${f.target}  viaType=${f.viaType}`);
  }
}
console.log(`  （共 ${eCount} 条）`);

console.log('\n== F. presets 边的 fromType/toType 与模块端口不符 ==');
const pre = JSON.parse(readFileSync('data/presets.json', 'utf8'));
const pl = Array.isArray(pre) ? pre : pre.presets;
let fCount = 0;
for (const p of pl) {
  const nodeById = new Map((p.nodes || []).map((x) => [x.id, x]));
  for (const e of p.edges || []) {
    const a = nodeById.get(e.from), b = nodeById.get(e.to);
    if (!a || !b) continue;
    const ma = byId.get(a.moduleId), mb = byId.get(b.moduleId);
    if (!ma || !mb) continue;
    if (e.fromType && !(ma.outputs || []).some((o) => o.type === e.fromType)) {
      fCount += 1;
      console.log(`  [${p.id}] ${a.moduleId}.outputs 无 ${e.fromType}（实际 ${(ma.outputs || []).map((o) => o.type).join(',')}）`);
    }
    if (e.toType && !(mb.inputs || []).some((o) => o.type === e.toType || o.type === 'any')) {
      fCount += 1;
      console.log(`  [${p.id}] ${b.moduleId}.inputs 不收 ${e.toType}（实际 ${(mb.inputs || []).map((o) => o.type).join(',')}）`);
    }
  }
}
console.log(`  （共 ${fCount} 处）`);

console.log('\n== G. 缺可选字段的模块 ==');
for (const m of mods) {
  const lack = [];
  if (!m.maturity) lack.push('maturity');
  if (!m.kind) lack.push('kind');
  if (!m.pitfalls?.length) lack.push('pitfalls');
  if (!m.usage?.length) lack.push('usage');
  if (!m.docs?.length) lack.push('docs');
  if (lack.length) console.log(`  ${m.id}: 缺 ${lack.join(', ')}`);
}

console.log('\n== H. docs 指向的章节与模块分类不符（人工可复核清单）==');
for (const m of mods) {
  const paths = (m.docs || []).map((d) => d.path).join(' ');
  if (!paths.includes('10-downstream') && !paths.includes('11-workflow') &&
      ['downstream-python', 'downstream-r', 'visualization', 'workflow', 'utility', 'io-formats'].includes(m._cat)) {
    console.log(`  ${m.id}（${m._cat}）docs = ${paths}`);
  }
}
console.log('\n审计结束');
