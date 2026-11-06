/**
 * 诊断：列出每条预设中被判定为类型错误的连线。
 * 这些连线在面板上会显示为红色，属于需要修正的设计问题。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assembleRegistry, analyzePipeline } from './lib/model.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJSON(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8').replace(/^\uFEFF/, ''));
}

const catalog = readJSON('data/catalog.json');
const categoryFiles = catalog.categories.map((category) => {
  const parsed = JSON.parse(
    readFileSync(path.join(ROOT, 'data', 'modules', path.basename(category.file)), 'utf8').replace(/^\uFEFF/, '')
  );
  return { category: category.id, modules: Array.isArray(parsed) ? parsed : parsed.modules || [] };
});

const registry = assembleRegistry(catalog, categoryFiles);
registry.presets = readJSON('data/presets.json');

let total = 0;
for (const preset of registry.presets) {
  const analysis = analyzePipeline({ nodes: preset.nodes, edges: preset.edges }, registry);
  const errors = analysis.issues.filter((i) => i.severity === 'error');
  if (!errors.length) continue;

  console.log(`\n### ${preset.id}`);
  for (const issue of errors) {
    total += 1;
    console.log(`  [${issue.code}] ${issue.message}`);
    if (issue.edge) {
      const fromNode = preset.nodes.find((n) => n.id === issue.edge.from);
      const toNode = preset.nodes.find((n) => n.id === issue.edge.to);
      const fromMod = registry.moduleById.get(fromNode.moduleId);
      const toMod = registry.moduleById.get(toNode.moduleId);
      const edge = preset.edges.find((e) => e.from === issue.edge.from && e.to === issue.edge.to);
      console.log(`      from: ${fromMod.id}  outputs[${(fromMod.outputs || []).map((p) => p.type).join('|')}]`);
      console.log(`      edge fromType: ${edge && edge.fromType}`);
      console.log(`      to:   ${toMod.id}  inputs[${(toMod.inputs || []).map((p) => p.type).join('|')}]`);
    }
  }
}

console.log(`\n合计 ${total} 条被判为类型错误的连线。`);
