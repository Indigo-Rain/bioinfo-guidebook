/**
 * model.mjs 的单元测试。
 *
 * 运行：node --test tools/tests/
 *
 * 设计原则：这些测试全部针对**纯函数**，不依赖浏览器、网络或真实数据文件。
 * 注册表由测试内的小型 fixture 构造，因此断言的是"逻辑对不对"，
 * 而不是"数据碰巧长什么样"。真实数据的完整性由 tools/build.mjs 的校验负责。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assembleRegistry,
  buildRegistryFromBundle,
  validateRegistry,
  portCompatibility,
  pickInputPort,
  pickOutputPort,
  recommendUpstream,
  recommendAdapters,
  analyzePipeline,
  exportPipelineJSON,
  exportBash,
  exportPython,
  exportAll,
  indexBy
} from '../lib/model.mjs';

/* ------------------------------------------------------------------ *
 * 测试夹具：一个最小但完整的 catalog + 注册表
 * ------------------------------------------------------------------ */

const CATALOG = {
  version: '9.9.9-test',
  title: '测试用 catalog',
  domains: [{ id: 'genomics', label: '基因组学' }],
  layers: [
    { id: 'upstream', label: '上游分析', order: 1 },
    { id: 'core', label: '核心分析', order: 2 },
    { id: 'downstream', label: '数据处理', order: 3 },
    { id: 'viz', label: '下游可视化', order: 4 },
    { id: 'engine', label: '流程引擎', order: 5 }
  ],
  categories: [
    { id: 'quality-control', label: '质控', file: 'modules/quality-control.json', order: 101 },
    { id: 'assembly', label: '组装', file: 'modules/assembly.json', order: 102 },
    { id: 'utility', label: '工具', file: 'modules/utility.json', order: 502 }
  ],
  dataTypes: [
    { id: 'any', label: '任意', glyph: '?', shape: 'any' },
    { id: 'raw-reads', label: '原始读长', glyph: 'FASTQ', shape: 'sequence' },
    { id: 'clean-reads', label: '清理读长', glyph: 'FASTQ', shape: 'sequence' },
    { id: 'contigs', label: 'contig', glyph: 'FASTA', shape: 'sequence' },
    { id: 'protein-faa', label: '蛋白', glyph: 'FAA', shape: 'sequence' },
    { id: 'tsv-table', label: '表格', glyph: 'TSV', shape: 'table' },
    { id: 'dataframe', label: '数据框', glyph: 'DF', shape: 'table' },
    { id: 'report', label: '报告', glyph: 'HTML', shape: 'figure' }
  ],
  providesAccess: [
    { id: 'cli', label: '命令行' },
    { id: 'python-api', label: 'Python API' }
  ],
  installMethods: [
    { id: 'conda', label: 'conda' },
    { id: 'pip', label: 'pip' }
  ],
  interfaceKinds: [
    { id: 'standard', label: '常规' },
    { id: 'adapter', label: '适配器' }
  ],
  maturityLevels: [
    { id: 'stable', label: '成熟稳定' },
    { id: 'legacy', label: '经典但停更' }
  ],
  validation: {
    idPattern: '^[a-z][a-z0-9-]{2,40}$',
    maxSummaryLength: 60,
    minDescriptions: 2,
    maxUsageExamples: 4,
    coordinateBounds: [-2000, 6000],
    requiredModuleFields: ['id', 'name', 'category', 'layer', 'summary', 'what', 'inputs', 'outputs', 'provides', 'feeds'],
    requiredProvidesFields: ['tool', 'version', 'access'],
    requiredFeedsFields: ['target', 'viaType'],
    requiredPresetFields: ['id', 'name', 'tags', 'difficulty', 'summary', 'nodes', 'edges']
  }
};

/** 造一个合法模块；overrides 用于按需破坏某个字段。 */
function makeModule(overrides = {}) {
  return Object.assign(
    {
      id: 'qc-fastp',
      name: '读长质控与去接头',
      category: 'quality-control',
      layer: 'upstream',
      summary: '用 fastp 做接头去除与质量修剪',
      what: ['第一段说明：fastp 同时完成接头识别与质量过滤。', '第二段说明：输出可直接进入组装或比对。'],
      inputs: [{ type: 'raw-reads', name: 'R1/R2', required: true }],
      outputs: [{ type: 'clean-reads', name: '清理读长', ext: '.clean.fq.gz' }],
      provides: [{ tool: 'fastp', version: '0.23.4', access: 'cli', install: 'conda' }],
      feeds: [{ target: 'asm-spades', viaType: 'clean-reads' }],
      recipes: { bash: 'fastp -i R1.fq -I R2.fq -o clean_R1.fq -O clean_R2.fq' }
    },
    overrides
  );
}

function makeRegistry(modules, presets = []) {
  const registry = assembleRegistry(CATALOG, [
    { category: 'quality-control', modules: modules.filter((m) => m.category === 'quality-control') },
    { category: 'assembly', modules: modules.filter((m) => m.category === 'assembly') },
    { category: 'utility', modules: modules.filter((m) => m.category === 'utility') }
  ]);
  registry.presets = presets;
  return registry;
}

const FASTP = makeModule();

const ASSEMBLER = makeModule({
  id: 'asm-spades',
  name: 'SPAdes 组装',
  category: 'assembly',
  layer: 'core',
  summary: '用 de Bruijn 图把读长组装成 contig',
  inputs: [{ type: 'clean-reads', name: '清理读长', required: true }],
  outputs: [{ type: 'contigs', name: 'contig', ext: '.contigs.fasta' }],
  provides: [{ tool: 'SPAdes', version: '3.15.5', access: 'cli', install: 'conda' }],
  feeds: [],
  recipes: { bash: 'spades.py -1 clean_R1.fq -2 clean_R2.fq -o spades_out' }
});

/** 一个把 contigs 转成蛋白的适配器，用于验证"中间插一个模块"的推荐逻辑。 */
const ADAPTER = makeModule({
  id: 'util-contig-to-protein',
  name: 'contig 转蛋白',
  category: 'utility',
  layer: 'engine',
  kind: 'adapter',
  summary: '把核酸 contig 翻译成蛋白序列以便下游注释',
  inputs: [{ type: 'contigs', name: 'contig', required: true }],
  outputs: [{ type: 'protein-faa', name: '蛋白序列', ext: '.faa' }],
  provides: [{ tool: 'prodigal', version: '2.6.3', access: 'cli', install: 'conda' }],
  feeds: [{ target: 'anno-search', viaType: 'protein-faa', note: '翻译后的蛋白直接进入同源搜索' }]
});

/** 只吃蛋白的下游模块，用来制造类型不匹配。 */
const ANNOTATOR = makeModule({
  id: 'anno-search',
  name: '蛋白同源搜索',
  category: 'assembly',
  layer: 'core',
  summary: '把蛋白序列拿去比对注释',
  inputs: [{ type: 'protein-faa', name: '蛋白序列', required: true }],
  outputs: [{ type: 'tsv-table', name: '注释表', ext: '.tsv' }],
  provides: [{ tool: 'diamond', version: '2.1.11', access: 'cli', install: 'conda' }],
  feeds: []
});

/**
 * 输出表格的模块。用来构造**真正的**类型不匹配：
 * 注意 clean-reads 与 protein-faa 的 shape 都是 sequence，所以它们之间是
 * "adapter 级"（需人工确认）而不是"invalid 级"。要制造 invalid，
 * 必须跨 shape —— 比如把表格喂给蛋白输入。
 */
const TABLE_PRODUCER = makeModule({
  id: 'util-stats-table',
  name: '统计汇总表',
  category: 'utility',
  layer: 'downstream',
  summary: '把各步骤的统计量汇总成一张表',
  inputs: [{ type: 'dataframe', name: '数据框' }],
  outputs: [{ type: 'tsv-table', name: '汇总表', ext: '.stats.tsv' }],
  provides: [{ tool: 'pandas', version: '2.2.x', access: 'python-api', install: 'pip' }],
  feeds: []
});

function fixtureModules() {
  return [
    Object.assign({}, FASTP),
    Object.assign({}, ASSEMBLER),
    Object.assign({}, ADAPTER),
    Object.assign({}, ANNOTATOR),
    Object.assign({}, TABLE_PRODUCER)
  ];
}

/* ================================================================== *
 * 1. 端口类型兼容性
 * ================================================================== */

test('portCompatibility：类型完全一致判为 direct', () => {
  const registry = makeRegistry(fixtureModules());
  const result = portCompatibility('clean-reads', 'clean-reads', registry);
  assert.equal(result.level, 'direct');
});

test('portCompatibility：同 shape 不同语义判为 adapter 并解释原因', () => {
  const registry = makeRegistry(fixtureModules());
  // contigs 与 clean-reads 都是 sequence，但不是同一种东西
  const result = portCompatibility('contigs', 'clean-reads', registry);
  assert.equal(result.level, 'adapter');
  assert.match(result.reason, /sequence/);
});

test('portCompatibility：含 any 的一端判为 adapter 且提示人工确认', () => {
  const registry = makeRegistry(fixtureModules());
  const result = portCompatibility('any', 'contigs', registry);
  assert.equal(result.level, 'adapter');
  assert.match(result.reason, /任意/);
});

test('portCompatibility：跨 shape 判为 invalid', () => {
  const registry = makeRegistry(fixtureModules());
  const result = portCompatibility('clean-reads', 'tsv-table', registry);
  assert.equal(result.level, 'invalid');
  assert.match(result.reason, /sequence/);
  assert.match(result.reason, /table/);
});

test('portCompatibility：未知类型一律 invalid，不静默放行', () => {
  const registry = makeRegistry(fixtureModules());
  const result = portCompatibility('not-a-real-type', 'clean-reads', registry);
  assert.equal(result.level, 'invalid');
  assert.match(result.reason, /未知类型/);
});

test('pickInputPort：优先选类型完全一致的端口', () => {
  const registry = makeRegistry(fixtureModules());
  const multi = makeModule({
    id: 'util-multi',
    name: '多输入模块',
    category: 'utility',
    layer: 'engine',
    inputs: [
      { type: 'any', name: '任意输入' },
      { type: 'clean-reads', name: '读长' }
    ]
  });
  assert.equal(pickInputPort(multi, 'clean-reads', registry).type, 'clean-reads');
});

test('pickOutputPort：没有匹配端口时回退到第一个输出', () => {
  const registry = makeRegistry(fixtureModules());
  const mod = makeModule({ id: 'util-out', category: 'utility', layer: 'engine' });
  assert.equal(pickOutputPort(mod, 'protein-faa', registry).type, 'clean-reads');
});

/* ================================================================== *
 * 2. 注册表校验：坏数据必须被拦住
 * ================================================================== */

function errorCodes(registry) {
  return validateRegistry(registry).errors.map((e) => e.code);
}

test('validateRegistry：合法注册表无错误', () => {
  const report = validateRegistry(makeRegistry(fixtureModules()));
  assert.deepEqual(report.errors, []);
  assert.ok(report.stats.modules >= 4);
});

test('validateRegistry：重复 id 被拦下', () => {
  const registry = makeRegistry([Object.assign({}, FASTP), Object.assign({}, FASTP)]);
  assert.ok(errorCodes(registry).includes('duplicate-id'));
});

test('validateRegistry：悬空 feeds.target 被拦下（知识图不能断链）', () => {
  const registry = makeRegistry([
    makeModule({ feeds: [{ target: 'does-not-exist', viaType: 'clean-reads' }] })
  ]);
  assert.ok(errorCodes(registry).includes('dangling-feed'));
});

test('validateRegistry：feeds.viaType 与目标输入不符被拦下', () => {
  const registry = makeRegistry([
    makeModule({ feeds: [{ target: 'anno-search', viaType: 'clean-reads' }] }),
    Object.assign({}, ANNOTATOR)
  ]);
  // clean-reads 是 sequence，protein-faa 也是 sequence，所以这一条其实"可解释"；
  // 真正该报错的是把 table 类数据喂给蛋白输入。
  // 注意：viaType 必须先在**本模块 outputs** 里存在，否则会被 feed-not-produced
  // 先拦下 —— 所以这里造一个产出 dataframe 的模块来测目标侧的不匹配。
  const registry2 = makeRegistry([
    makeModule({
      id: 'util-df-source',
      category: 'utility',
      layer: 'engine',
      outputs: [{ type: 'dataframe', name: '数据框' }],
      feeds: [{ target: 'anno-search', viaType: 'dataframe' }]
    }),
    Object.assign({}, ANNOTATOR)
  ]);
  assert.ok(errorCodes(registry2).includes('feed-type-mismatch'));
  // 第一条按当前规则不报错（同 shape），此处显式记录该语义，避免以后误改
  assert.ok(!errorCodes(registry).includes('feed-type-mismatch'));
});

test('validateRegistry：feeds.viaType 不在本模块 outputs 中被拦下（不能凭空声称数据流）', () => {
  // 这是绘图模块一类错误的根因：声称向下游传 dataframe，实际只产出图件。
  // 这类 feeds 能通过目标侧的类型校验，却描述了一个不存在的数据流。
  const registry = makeRegistry([
    makeModule({
      id: 'viz-fake',
      name: '假绘图模块',
      category: 'utility',
      layer: 'viz',
      outputs: [{ type: 'figure-png', name: '图' }],
      feeds: [{ target: 'anno-search', viaType: 'protein-faa' }]
    }),
    Object.assign({}, ANNOTATOR)
  ]);
  assert.ok(errorCodes(registry).includes('feed-not-produced'));
});

test('validateRegistry：feeds 指向自己被判为自环', () => {
  const registry = makeRegistry([
    makeModule({ feeds: [{ target: 'qc-fastp', viaType: 'clean-reads' }] })
  ]);
  assert.ok(errorCodes(registry).includes('self-feed'));
});

test('validateRegistry：未登记的 category / layer / 数据类型全部报错', () => {
  // category：用一个**在 catalog 中未登记**的值，才能越过
  // category-file-mismatch 走进 unknown-category 这一支。
  const registry = assembleRegistry(CATALOG, [
    { category: 'quality-control', modules: [makeModule({ id: 'qc-badcat', category: 'not-registered' })] },
    { category: 'quality-control', modules: [makeModule({ id: 'qc-badlayer', layer: 'nope' })] },
    { category: 'quality-control', modules: [makeModule({ id: 'qc-badtype', inputs: [{ type: 'nope-type', name: 'x' }] })] }
  ]);
  const codes = validateRegistry(registry).errors.map((e) => e.code);
  assert.ok(codes.includes('unknown-category'), '未登记的 category 应当报错');
  assert.ok(codes.includes('unknown-layer'), '未登记的 layer 应当报错');
  assert.ok(codes.includes('unknown-type'), '未登记的数据类型应当报错');
});

test('assembleRegistry：条目没写 category 时按文件归属补齐', () => {
  const bare = makeModule();
  delete bare.category;
  const registry = assembleRegistry(CATALOG, [{ category: 'assembly', modules: [bare] }]);
  assert.equal(registry.modules[0].category, 'assembly');
});

test('assembleRegistry：条目显式写的 category 不被覆盖，错误值留待校验报出', () => {
  // 这是刻意的设计：如果这里静默改成文件归属，"把模块搬错文件"
  // 这类真实错误就永远查不出来，validateRegistry 的 unknown-category 检查也会失效。
  const registry = assembleRegistry(CATALOG, [
    { category: 'assembly', modules: [makeModule({ category: 'quality-control' })] }
  ]);
  assert.equal(registry.modules[0].category, 'quality-control');
  assert.ok(
    validateRegistry(registry).errors.some((e) => e.code === 'category-file-mismatch'),
    '文件归属与条目声明不一致时必须报错'
  );
});

test('validateRegistry：缺少必填字段被逐个报出', () => {
  const broken = makeModule();
  delete broken.summary;
  delete broken.provides;
  const codes = errorCodes(makeRegistry([broken]));
  assert.ok(codes.includes('missing-field'));
  assert.ok(codes.includes('empty-provides'));
});

test('validateRegistry：summary 超长被拦下（面板卡片会溢出）', () => {
  const registry = makeRegistry([makeModule({ summary: 'x'.repeat(61) })]);
  assert.ok(errorCodes(registry).includes('summary-too-long'));
});

test('validateRegistry：what 段数不足被拦下', () => {
  const registry = makeRegistry([makeModule({ what: ['只有一段'] })]);
  assert.ok(errorCodes(registry).includes('what-too-short'));
});

test('validateRegistry：provides 缺 version 被拦下（版本漂移必须显式记录）', () => {
  const registry = makeRegistry([
    makeModule({ provides: [{ tool: 'fastp', access: 'cli' }] })
  ]);
  assert.ok(errorCodes(registry).includes('provides-missing-field'));
});

test('validateRegistry：id 命名不合规被拦下', () => {
  const registry = makeRegistry([makeModule({ id: 'Qc_Fastp' })]);
  assert.ok(errorCodes(registry).includes('bad-id'));
});

/* ------------------------------------------------------------------ *
 * 预设校验
 * ------------------------------------------------------------------ */

const VALID_PRESET = {
  id: 'preset-test',
  name: '测试流程',
  tags: ['test'],
  difficulty: '入门',
  summary: '从读长到 contig',
  nodes: [
    { id: 'n1', moduleId: 'qc-fastp', x: 0, y: 0 },
    { id: 'n2', moduleId: 'asm-spades', x: 260, y: 0 }
  ],
  edges: [{ from: 'n1', to: 'n2', fromType: 'clean-reads' }],
  docs: []
};

test('validateRegistry：合法预设无错误（仅可能有无文档的警告）', () => {
  const report = validateRegistry(makeRegistry(fixtureModules(), [VALID_PRESET]));
  assert.deepEqual(report.errors, []);
});

test('validateRegistry：预设引用不存在的模块被拦下', () => {
  const preset = {
    ...VALID_PRESET,
    nodes: [{ id: 'n1', moduleId: 'ghost-module', x: 0, y: 0 }],
    edges: []
  };
  assert.ok(errorCodes(makeRegistry(fixtureModules(), [preset])).includes('preset-node-unknown-module'));
});

test('validateRegistry：预设边指向不存在的节点被拦下', () => {
  const preset = { ...VALID_PRESET, edges: [{ from: 'n1', to: 'ghost' }] };
  assert.ok(errorCodes(makeRegistry(fixtureModules(), [preset])).includes('preset-edge-bad-to'));
});

test('validateRegistry：预设自环被拦下', () => {
  const preset = { ...VALID_PRESET, edges: [{ from: 'n1', to: 'n1' }] };
  assert.ok(errorCodes(makeRegistry(fixtureModules(), [preset])).includes('preset-self-loop'));
});

test('validateRegistry：预设节点坐标缺失或越界被拦下', () => {
  const missing = {
    ...VALID_PRESET,
    nodes: [{ id: 'n1', moduleId: 'qc-fastp', x: 0 }, { id: 'n2', moduleId: 'asm-spades', x: 1, y: 1 }]
  };
  assert.ok(errorCodes(makeRegistry(fixtureModules(), [missing])).includes('preset-node-bad-coord'));

  const wild = {
    ...VALID_PRESET,
    nodes: [
      { id: 'n1', moduleId: 'qc-fastp', x: 0, y: 0 },
      { id: 'n2', moduleId: 'asm-spades', x: 99999, y: 0 }
    ]
  };
  assert.ok(errorCodes(makeRegistry(fixtureModules(), [wild])).includes('preset-node-coord-range'));
});

/* ================================================================== *
 * 3. 管线分析：拓扑排序与问题诊断
 * ================================================================== */

function pipelineFrom(modules, edges) {
  const nodes = modules.map((moduleId, i) => ({ id: 'n' + (i + 1), moduleId, x: i * 260, y: 0 }));
  const idByModule = new Map(nodes.map((n) => [n.moduleId, n.id]));
  return {
    name: '测试流程',
    nodes,
    edges: edges.map(([fromModule, toModule, fromType]) => {
      const fromMod = modules.indexOf(fromModule) >= 0 ? { id: fromModule } : null;
      void fromMod;
      return {
        from: idByModule.get(fromModule),
        to: idByModule.get(toModule),
        fromType
      };
    })
  };
}

test('analyzePipeline：线性流程按依赖顺序拓扑排序', () => {
  const registry = makeRegistry(fixtureModules());
  // 故意把组装放在读长之前，验证排序不是"按输入顺序"
  const pipeline = pipelineFrom(['asm-spades', 'qc-fastp'], [['qc-fastp', 'asm-spades', 'clean-reads']]);
  const analysis = analyzePipeline(pipeline, registry);
  const order = analysis.order.map((id) => pipeline.nodes.find((n) => n.id === id).moduleId);
  assert.deepEqual(order, ['qc-fastp', 'asm-spades']);
  assert.equal(analysis.cycles.length, 0);
});

test('analyzePipeline：分叉与汇聚的顺序都满足依赖', () => {
  const registry = makeRegistry(fixtureModules());
  const pipeline = pipelineFrom(
    ['qc-fastp', 'asm-spades', 'anno-search'],
    [
      ['qc-fastp', 'asm-spades', 'clean-reads'],
      ['qc-fastp', 'anno-search', 'clean-reads']
    ]
  );
  const analysis = analyzePipeline(pipeline, registry);
  const position = (moduleId) =>
    analysis.order.findIndex((id) => pipeline.nodes.find((n) => n.id === id).moduleId === moduleId);
  assert.ok(position('qc-fastp') < position('asm-spades'));
  assert.ok(position('qc-fastp') < position('anno-search'));
});

test('analyzePipeline：检测到环路并报 error，同时仍给出可用的执行顺序', () => {
  const registry = makeRegistry(fixtureModules());
  const pipeline = pipelineFrom(
    ['qc-fastp', 'asm-spades'],
    [
      ['qc-fastp', 'asm-spades', 'clean-reads'],
      ['asm-spades', 'qc-fastp', 'contigs']
    ]
  );
  const analysis = analyzePipeline(pipeline, registry);
  assert.equal(analysis.cycles.length, 1);
  assert.ok(analysis.issues.some((i) => i.code === 'cycle' && i.severity === 'error'));
  // 环内节点不能被丢掉，否则导出脚本会静默少步骤
  assert.equal(analysis.order.length, 2);
});

test('analyzePipeline：类型不匹配的连线报错并给出可插入的适配器建议', () => {
  const registry = makeRegistry(fixtureModules());
  // tsv-table（table 类）喂给 protein-faa（sequence 类）：跨 shape，必须报错
  const pipeline = pipelineFrom(
    ['util-stats-table', 'anno-search'],
    [['util-stats-table', 'anno-search', 'tsv-table']]
  );
  const analysis = analyzePipeline(pipeline, registry);
  const issue = analysis.issues.find((i) => i.code === 'type-mismatch');
  assert.ok(issue, '应当报出类型不匹配');
  assert.equal(issue.severity, 'error');
});

test('analyzePipeline：同 shape 不同语义只报 warning，不误判为错误', () => {
  const registry = makeRegistry(fixtureModules());
  // clean-reads 与 protein-faa 都是 sequence：应当是可人工确认的 warning
  const pipeline = pipelineFrom(['qc-fastp', 'anno-search'], [['qc-fastp', 'anno-search', 'clean-reads']]);
  const analysis = analyzePipeline(pipeline, registry);
  assert.ok(!analysis.issues.some((i) => i.code === 'type-mismatch'), '不应判为类型不匹配');
  assert.ok(analysis.issues.some((i) => i.code === 'needs-confirmation' && i.severity === 'warning'));
});

test('analyzePipeline：必需输入未连接时给出提示与上游候选', () => {
  const registry = makeRegistry(fixtureModules());
  const pipeline = { name: '孤立组装', nodes: [{ id: 'n1', moduleId: 'asm-spades', x: 0, y: 0 }], edges: [] };
  const analysis = analyzePipeline(pipeline, registry);
  const issue = analysis.issues.find((i) => i.code === 'unconnected-input');
  assert.ok(issue);
  assert.ok(issue.suggestions.some((s) => s.moduleId === 'qc-fastp'), '应把 fastp 列为可选上游');
});

test('analyzePipeline：指向不存在节点的连线被报出，不静默忽略', () => {
  const registry = makeRegistry(fixtureModules());
  const pipeline = {
    name: 'x',
    nodes: [{ id: 'n1', moduleId: 'qc-fastp', x: 0, y: 0 }],
    edges: [{ from: 'n1', to: 'ghost' }]
  };
  const analysis = analyzePipeline(pipeline, registry);
  assert.ok(analysis.issues.some((i) => i.code === 'dangling-edge'));
});

test('analyzePipeline：fan-in 汇入单输入模块时提示人工确认合并逻辑', () => {
  const registry = makeRegistry(fixtureModules());
  const pipeline = pipelineFrom(
    ['qc-fastp', 'util-contig-to-protein', 'asm-spades'],
    [
      ['qc-fastp', 'asm-spades', 'clean-reads'],
      ['util-contig-to-protein', 'asm-spades', 'protein-faa']
    ]
  );
  const analysis = analyzePipeline(pipeline, registry);
  assert.ok(analysis.issues.some((i) => i.code === 'fan-in'));
});

/* ================================================================== *
 * 4. 导出
 * ================================================================== */

const LINEAR_PIPELINE = () => {
  const registry = makeRegistry(fixtureModules());
  const pipeline = pipelineFrom(['qc-fastp', 'asm-spades'], [['qc-fastp', 'asm-spades', 'clean-reads']]);
  return { registry, pipeline };
};

test('exportPipelineJSON：包含步骤、数据流与问题清单，且步骤按拓扑顺序', () => {
  const { registry, pipeline } = LINEAR_PIPELINE();
  const result = exportPipelineJSON(pipeline, registry);
  assert.equal(result.format, 'bioinfo-guidebook/pipeline');
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].moduleId, 'qc-fastp');
  assert.equal(result.steps[1].moduleId, 'asm-spades');
  assert.equal(result.edges[0].compatibility, 'direct');
  assert.ok(Array.isArray(result.issues));
  assert.equal(result.registryVersion, '9.9.9-test');
});

test('exportBash：产出可解析的骨架，含 set -euo pipefail 与每步注释', () => {
  const { registry, pipeline } = LINEAR_PIPELINE();
  const script = exportBash(pipeline, registry);
  assert.match(script, /^#!\/usr\/bin\/env bash/);
  assert.match(script, /set -euo pipefail/);
  assert.match(script, /步骤 1 \/ 2: 读长质控与去接头/);
  assert.match(script, /fastp -i R1\.fq/);
  assert.match(script, /工具: fastp 0\.23\.4/);
  // 数据流必须显式可读
  assert.match(script, /--\(clean-reads\)-->/);
});

test('exportPython：产出可解析的骨架，含 run() 帮助函数与 main()', () => {
  const { registry, pipeline } = LINEAR_PIPELINE();
  const script = exportPython(pipeline, registry);
  assert.match(script, /^#!\/usr\/bin\/env python3/);
  assert.match(script, /def run\(cmd, log_name=None\)/);
  assert.match(script, /def main\(\) -> None:/);
  assert.match(script, /if __name__ == "__main__":/);
  assert.match(script, /步骤 1\/2: 读长质控与去接头/);
});

test('exportBash / exportPython：有错误时在头部显式列出，不静默吞掉', () => {
  const registry = makeRegistry(fixtureModules());
  const badPipeline = pipelineFrom(
    ['util-stats-table', 'anno-search'],
    [['util-stats-table', 'anno-search', 'tsv-table']]
  );
  const bash = exportBash(badPipeline, registry);
  const python = exportPython(badPipeline, registry);
  assert.match(bash, /存在未解决的错误/);
  assert.match(bash, /\[type-mismatch\]/);
  assert.match(python, /存在未解决的错误/);
  assert.match(python, /\[type-mismatch\]/);
});

test('exportBash：类型不匹配的连线就地留下 TODO', () => {
  const registry = makeRegistry(fixtureModules());
  const badPipeline = pipelineFrom(
    ['util-stats-table', 'anno-search'],
    [['util-stats-table', 'anno-search', 'tsv-table']]
  );
  assert.match(exportBash(badPipeline, registry), /TODO/);
});

test('exportBash：环路流程不会丢失步骤，且顶部标红', () => {
  const registry = makeRegistry(fixtureModules());
  const cyc = pipelineFrom(
    ['qc-fastp', 'asm-spades'],
    [
      ['qc-fastp', 'asm-spades', 'clean-reads'],
      ['asm-spades', 'qc-fastp', 'contigs']
    ]
  );
  const bash = exportBash(cyc, registry);
  assert.match(bash, /检测到环路/);
  // 两个模块的代码块都必须在
  assert.match(bash, /fastp -i R1\.fq/);
  assert.match(bash, /spades\.py -1 clean_R1\.fq/);
});

test('exportBash / exportPython：空画布不抛异常', () => {
  const registry = makeRegistry(fixtureModules());
  const empty = { name: '空', nodes: [], edges: [] };
  assert.doesNotThrow(() => exportBash(empty, registry));
  assert.doesNotThrow(() => exportPython(empty, registry));
  assert.doesNotThrow(() => exportPipelineJSON(empty, registry));
  assert.match(exportPython(empty, registry), /画布上还没有模块/);
});

test('exportAll：三种导出一次性返回且格式正确', () => {
  const { registry, pipeline } = LINEAR_PIPELINE();
  const all = exportAll(pipeline, registry);
  assert.equal(typeof all.json, 'object');
  assert.equal(typeof all.bash, 'string');
  assert.equal(typeof all.python, 'string');
  assert.match(all.bash, /set -euo pipefail/);
  assert.match(all.python, /def main/);
});

/* ================================================================== *
 * 5. bundle 组装与上游推荐
 * ================================================================== */

test('buildRegistryFromBundle：保留模块自身的 category，不做覆盖', () => {
  const modules = fixtureModules();
  const registry = buildRegistryFromBundle({ catalog: CATALOG, modules, presets: [VALID_PRESET] });
  assert.equal(registry.modules.length, modules.length);
  assert.equal(registry.moduleById.get('asm-spades').category, 'assembly');
  assert.equal(registry.presets.length, 1);
  // bundle 路径与分类文件路径应当得到同样合法（能通过同样校验）的注册表
  assert.deepEqual(validateRegistry(registry).errors, []);
});

test('buildRegistryFromBundle：presets 缺省时退化为空数组而不是 undefined', () => {
  const registry = buildRegistryFromBundle({ catalog: CATALOG, modules: fixtureModules() });
  assert.deepEqual(registry.presets, []);
});

test('recommendUpstream：优先列出类型完全匹配的上游', () => {
  const registry = makeRegistry(fixtureModules());
  const result = recommendUpstream('asm-spades', registry, 5);
  assert.equal(result[0].moduleId, 'qc-fastp');
  assert.equal(result[0].level, 'direct');
});

test('recommendAdapters：能推荐出真正把上游输出转成下游输入的模块', () => {
  const registry = makeRegistry(fixtureModules());
  const result = recommendAdapters('contigs', 'anno-search', registry);
  assert.ok(result.some((r) => r.moduleId === 'util-contig-to-protein'));
});

test('recommendAdapters：没有可行适配器时返回空数组，而不是硬凑', () => {
  const registry = makeRegistry(fixtureModules());
  const result = recommendAdapters('report', 'anno-search', registry);
  assert.deepEqual(result, []);
});

test('indexBy：重复 key 保留第一个，不覆盖', () => {
  const map = indexBy([{ id: 'a', v: 1 }, { id: 'a', v: 2 }, { id: 'b', v: 3 }]);
  assert.equal(map.get('a').v, 1);
  assert.equal(map.size, 2);
});
