/**
 * model.mjs —— 知识系统的纯函数核心。
 *
 * 设计约束（重要）：
 *   1. 本文件不得 import 任何 Node 专属模块（fs/path/url 等）。它同时被
 *      tools/tests/model.test.mjs 以 ESM 方式 import，并被 tools/build.mjs
 *      原样内联进 index.html 供浏览器使用。两份消费者共用同一份实现，
 *      杜绝"校验逻辑在构建期与运行期漂移"。
 *   2. 所有函数必须是纯函数：输入同一份 (registry, pipeline)，
 *      输出完全一致，不读写全局状态、不依赖当前时间。
 *
 * 因此文件读写、JSON.parse、进程退出等副作用一律留在 tools/build.mjs。
 */

/* ------------------------------------------------------------------ *
 * 0. 便捷访问器
 * ------------------------------------------------------------------ */

/**
 * SVG 命名空间标识符 —— 全项目唯一定义处。
 *
 * 它是 XML 命名空间**标识符**，不会被浏览器请求，不是网络依赖；
 * 但为了能用最朴素的方式证明 index.html 完全离线（直接搜 http(s)://），
 * 我们把它集中在这一处，并让 tools/build.mjs 的自包含检查只豁免这一个声明点。
 * 其余任何位置出现 URL 都会导致构建失败。
 */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/** 把数组转成 Map，便于按 id 查找。重复 id 时保留第一个。 */
export function indexBy(items, key = 'id') {
  const map = new Map();
  for (const item of items || []) {
    if (item && item[key] != null && !map.has(item[key])) map.set(item[key], item);
  }
  return map;
}

/** 生成以 ".code" 为前缀的错误对象，便于统一格式化输出。 */
function diag(code, message, extra = {}) {
  return { code, message, ...extra };
}

/** 把单值或数组统一成数组。 */
function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/* ------------------------------------------------------------------ *
 * 1. 注册表组装与校验
 * ------------------------------------------------------------------ */

/**
 * 把 catalog 与各分类文件里读到的模块数组合并成一个注册表对象。
 * @param {object} catalog            data/catalog.json 的内容
 * @param {Array<{category:string, modules:Array}>} categoryFiles
 *        每个分类文件读进来后的 { 分类 id, 模块数组 }
 */
export function assembleRegistry(catalog, categoryFiles) {
  const modules = [];
  const errors = [];
  const seen = new Map();

  for (const entry of categoryFiles || []) {
    const categoryId = entry.category;
    for (const mod of entry.modules || []) {
      if (mod && mod.id != null) {
        if (seen.has(mod.id)) {
          errors.push(
            diag('duplicate-id', `模块 id "${mod.id}" 重复定义（已在 ${seen.get(mod.id)} 中出现，又出现在 ${categoryId}）`)
          );
          continue;
        }
        seen.set(mod.id, categoryId);
      }

      // 分类文件是"归属"的权威来源：条目没写 category 时补上。
      // 但**不覆盖**条目已显式声明的值 —— 否则 validateRegistry 里那条
      // "category 未登记"检查永远不可达，把模块搬错文件这种真实错误
      // 会被静默纠正而不是报出来。两者不一致时交由校验报 category-file-mismatch，
      // 由人决定是改文件还是改条目。
      if (mod && mod.category == null) {
        modules.push({ ...mod, category: categoryId });
      } else if (mod) {
        // 用不可枚举属性记录来源文件归属，避免污染 JSON 输出与 equal 比较，
        // 但它必须随注册表一路传到 validateRegistry 才能比对。
        Object.defineProperty(mod, '__sourceCategory', {
          value: categoryId,
          enumerable: false,
          configurable: true
        });
        modules.push(mod);
      } else {
        modules.push(mod);
      }
    }
  }

  return {
    catalog,
    modules,
    presets: [],
    moduleById: indexBy(modules),
    categoryById: indexBy(catalog.categories),
    layerById: indexBy(catalog.layers),
    dataTypeById: indexBy(catalog.dataTypes),
    domainById: indexBy(catalog.domains || []),
    accessById: indexBy(catalog.providesAccess || []),
    installById: indexBy(catalog.installMethods || []),
    kindById: indexBy(catalog.interfaceKinds || []),
    maturityById: indexBy(catalog.maturityLevels || []),
    errors
  };
}

/**
 * 为某个模块收集"可能的上游提供者"。
 * 用于面板里点击节点时展示上游可选清单，判定完全基于端口类型兼容性。
 * 标注 direct 的排前面，因为那是不需要任何转换就能连上的组合。
 */
export function recommendUpstream(moduleId, registry, limit = 6) {
  const target = registry.moduleById.get(moduleId);
  if (!target) return [];
  const results = [];
  for (const mod of registry.modules) {
    if (mod.id === moduleId) continue;
    const scored = [];
    for (const out of mod.outputs || []) {
      for (const inp of target.inputs || []) {
        const compat = portCompatibility(out.type, inp.type, registry);
        if (compat.level !== 'invalid') {
          scored.push({ outType: out.type, inType: inp.type, level: compat.level });
        }
      }
    }
    if (!scored.length) continue;
    const best = scored.some((s) => s.level === 'direct') ? 'direct' : 'adapter';
    const pick = scored.find((s) => s.level === best) || scored[0];
    const explicit = (mod.feeds || []).some((f) => f.target === moduleId);
    results.push({ moduleId: mod.id, name: mod.name, level: best, viaType: pick.outType, explicit, reason: mod.summary });
  }
  results.sort(
    (a, b) =>
      Number(b.explicit) - Number(a.explicit) ||
      (a.level === b.level ? 0 : a.level === 'direct' ? -1 : 1) ||
      a.moduleId.localeCompare(b.moduleId)
  );
  return results.slice(0, limit);
}

/**
 * 用已构建好的 bundle 对象直接组装注册表（浏览器面板与测试共用）。
 *
 * 为什么需要它：assembleRegistry 的职责是从"分类文件"合并模块，它会用传入的
 * categoryId 覆盖模块自身的 category（防止文件名与条目不匹配）。而 bundle 里的
 * 模块已经携带了正确的 category，不需要这层覆盖。以前在面板里手动改回
 * registry.modules 再重建 index，属于绕过 API 的补丁；这里把它变成有名字、
 * 有测试覆盖的正规入口。
 */
export function buildRegistryFromBundle(bundle) {
  const catalog = bundle.catalog;
  const modules = Array.isArray(bundle.modules) ? bundle.modules : [];
  return {
    catalog,
    modules,
    presets: Array.isArray(bundle.presets) ? bundle.presets : [],
    moduleById: indexBy(modules),
    categoryById: indexBy(catalog.categories),
    layerById: indexBy(catalog.layers),
    dataTypeById: indexBy(catalog.dataTypes),
    domainById: indexBy(catalog.domains || []),
    accessById: indexBy(catalog.providesAccess || []),
    installById: indexBy(catalog.installMethods || []),
    kindById: indexBy(catalog.interfaceKinds || []),
    maturityById: indexBy(catalog.maturityLevels || []),
    errors: []
  };
}

/**
 * 校验整个注册表。返回 { errors, warnings, stats }。
 * errors 非空即视为构建失败；warnings 只提示不阻断。
 */
export function validateRegistry(registry) {
  const { catalog, modules, presets, moduleById, categoryById, layerById, dataTypeById } = registry;
  const rules = catalog.validation || {};
  const idPattern = new RegExp(rules.idPattern || '^[a-z][a-z0-9-]{2,40}$');
  const bounds = rules.coordinateBounds || [-2000, 6000];
  const errors = [...(registry.errors || [])];
  const warnings = [];
  const stats = { modules: modules.length, byLayer: {}, byCategory: {}, byDomain: {}, tools: 0, presets: presets.length };

  const validType = (t) => dataTypeById.has(t);

  for (const mod of modules) {
    const at = `模块 "${mod.id}"`;

    // --- 必填字段 ---
    // 注意：空数组**不算**缺失。`feeds: []` 是"本模块没有典型下游"的合法显式声明，
    // 与"忘了写 feeds"是两回事——前者表达意图，后者是遗漏。因此只把
    // null / undefined / 空字符串判为缺失，数组交给各自的专项检查去管
    // （例如 outputs 为空会报 empty-ports，provides 为空会报 empty-provides）。
    for (const field of rules.requiredModuleFields || []) {
      const value = mod[field];
      if (value == null || value === '') {
        errors.push(diag('missing-field', `${at} 缺少必填字段 "${field}"`));
      }
    }
    if (!mod.id) continue;

    if (!idPattern.test(mod.id)) {
      errors.push(diag('bad-id', `${at} 不符合 id 命名规则 ${idPattern}（小写字母开头，仅含 a-z 0-9 _ -）`));
    }
    if (!mod.name) errors.push(diag('missing-name', `${at} 缺少中文名称 "name"`));

    const summary = mod.summary || '';
    if (summary.length > (rules.maxSummaryLength || 60)) {
      errors.push(
        diag('summary-too-long', `${at} 的 summary 长度 ${summary.length} 超过上限 ${rules.maxSummaryLength}，面板卡片会溢出`)
      );
    }

    const descCount = Array.isArray(mod.what) ? mod.what.length : mod.what ? 1 : 0;
    if (descCount < (rules.minDescriptions || 2)) {
      errors.push(diag('what-too-short', `${at} 的 what 至少需要 ${rules.minDescriptions} 段说明，当前 ${descCount} 段`));
    }

    // --- 分类 / 层 / 领域 ---
    if (mod.category && !categoryById.has(mod.category)) {
      errors.push(diag('unknown-category', `${at} 的 category "${mod.category}" 未在 catalog.categories 中登记`));
    }
    // 条目声明的 category 与它所在的分类文件不一致：报错而不是静默纠正，
    // 否则"模块搬错文件"会变成一个看不出来的隐患。
    const source = mod.__sourceCategory;
    if (source && mod.category && source !== mod.category) {
      errors.push(
        diag(
          'category-file-mismatch',
          `${at} 声明 category="${mod.category}"，但位于分类文件 "${source}" 中；` +
            `请把条目移到 ${mod.category} 对应的文件，或改正 category 字段`
        )
      );
    }
    if (mod.layer && !layerById.has(mod.layer)) {
      errors.push(diag('unknown-layer', `${at} 的 layer "${mod.layer}" 未在 catalog.layers 中登记`));
    }
    for (const domain of toArray(mod.domains)) {
      if (!registry.domainById.has(domain)) {
        errors.push(diag('unknown-domain', `${at} 的 domain "${domain}" 未在 catalog.domains 中登记`));
      } else {
        stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1;
      }
    }

    // --- 接口种类 / 成熟度 ---
    const kind = mod.kind || 'standard';
    if (!registry.kindById.has(kind)) {
      errors.push(diag('unknown-kind', `${at} 的 kind "${kind}" 未在 catalog.interfaceKinds 中登记`));
    }
    const maturity = mod.maturity || 'stable';
    if (!registry.maturityById.has(maturity)) {
      errors.push(diag('unknown-maturity', `${at} 的 maturity "${maturity}" 未在 catalog.maturityLevels 中登记`));
    }

    // --- 输入 / 输出端口 ---
    for (const [direction, ports] of [['inputs', mod.inputs || []], ['outputs', mod.outputs || []]]) {
      if (!Array.isArray(ports) || ports.length === 0) {
        errors.push(diag('empty-ports', `${at} 的 ${direction} 为空数组，无法参与连线`));
        continue;
      }
      for (const port of ports) {
        if (!port || !port.type) {
          errors.push(diag('port-missing-type', `${at} 的 ${direction} 中存在未声明 type 的端口`));
          continue;
        }
        if (!validType(port.type)) {
          errors.push(
            diag('unknown-type', `${at} 的 ${direction} 端口 type "${port.type}" 未在 catalog.dataTypes 中登记`)
          );
        }
        if (!port.name) {
          warnings.push(diag('port-missing-name', `${at} 的 ${direction} 端口 "${port.type}" 缺少 name，面板上只显示类型`));
        }
      }
    }

    // --- provides（工具声明）---
    if (!Array.isArray(mod.provides) || mod.provides.length === 0) {
      errors.push(diag('empty-provides', `${at} 的 provides 为空，至少需声明一个工具`));
    } else {
      for (const p of mod.provides) {
        for (const field of rules.requiredProvidesFields || []) {
          if (!p || p[field] == null || p[field] === '') {
            errors.push(diag('provides-missing-field', `${at} 的 provides 条目缺少字段 "${field}"`));
          }
        }
        if (p && p.access && !registry.accessById.has(p.access)) {
          errors.push(diag('unknown-access', `${at} 的工具 "${p.tool}" 的 access "${p.access}" 未登记`));
        }
        if (p && p.install && !registry.installById.has(p.install)) {
          errors.push(diag('unknown-install', `${at} 的工具 "${p.tool}" 的 install "${p.install}" 未登记`));
        }
        stats.tools += 1;
      }
    }

    // --- feeds（下游消费者，硬约束）---
    if (!Array.isArray(mod.feeds)) {
      errors.push(diag('missing-feeds', `${at} 缺少 feeds 数组（可为空数组，但必须显式声明）`));
    } else {
      const ownOutputTypes = (mod.outputs || []).map((p) => p.type);
      for (const feed of mod.feeds) {
        for (const field of rules.requiredFeedsFields || []) {
          if (!feed || feed[field] == null) {
            errors.push(diag('feed-missing-field', `${at} 的 feeds 条目缺少字段 "${field}"`));
          }
        }
        if (!feed || !feed.target) continue;

        // viaType 必须是**本模块**真实产出的类型。
        // 只校验「目标能否接受」是不够的：绘图模块声称向下游传 data.frame、
        // 质控模块声称传读长，这两类都会通过目标侧校验，却描述了一个不存在的
        // 数据流，并在面板里引导用户连出无意义的边。
        if (validType(feed.viaType) && !ownOutputTypes.includes(feed.viaType)) {
          errors.push(
            diag(
              'feed-not-produced',
              `${at} 的 feeds 声称经由 "${feed.viaType}" 传给 ${feed.target}，` +
                `但它自己的输出是 [${ownOutputTypes.join(', ')}] —— viaType 必须在本模块 outputs 中`
            )
          );
          continue;
        }

        const target = moduleById.get(feed.target);
        if (!target) {
          errors.push(
            diag('dangling-feed', `${at} 的 feeds.target "${feed.target}" 在注册表中不存在（悬空引用会使知识图断链）`)
          );
          continue;
        }
        if (feed.target === mod.id) {
          errors.push(diag('self-feed', `${at} 的 feeds 指向了自己`));
        }
        if (!validType(feed.viaType)) {
          errors.push(diag('unknown-type', `${at} 的 feeds.viaType "${feed.viaType}" 未登记`));
        } else if (!typeSatisfies(feed.viaType, target, registry)) {
          const accepts = (target.inputs || []).map((p) => p.type).join(', ');
          errors.push(
            diag(
              'feed-type-mismatch',
              `${at} --(${feed.viaType})--> ${feed.target} 类型不匹配：${feed.target} 只接受 [${accepts}]`
            )
          );
        }
      }
    }

    // --- 使用示例数量 ---
    if (Array.isArray(mod.usage) && mod.usage.length > (rules.maxUsageExamples || 4)) {
      warnings.push(diag('too-many-usage', `${at} 声明了 ${mod.usage.length} 条 usage，建议不超过 ${rules.maxUsageExamples} 条`));
    }

    // --- 统计 ---
    stats.byLayer[mod.layer] = (stats.byLayer[mod.layer] || 0) + 1;
    stats.byCategory[mod.category] = (stats.byCategory[mod.category] || 0) + 1;
  }

  // --- 预设流程校验 ---
  const presetIds = new Set();
  for (const preset of presets || []) {
    const pat = `预设 "${preset.id}"`;
    for (const field of rules.requiredPresetFields || []) {
      const v = preset[field];
      if (v == null || (Array.isArray(v) && v.length === 0)) {
        errors.push(diag('preset-missing-field', `${pat} 缺少必填字段 "${field}"`));
      }
    }
    if (presetIds.has(preset.id)) errors.push(diag('duplicate-preset', `${pat} id 重复`));
    presetIds.add(preset.id);

    const nodeIds = new Set();
    for (const node of preset.nodes || []) {
      if (!node.id) {
        errors.push(diag('preset-node-no-id', `${pat} 中存在缺少 id 的节点`));
        continue;
      }
      if (nodeIds.has(node.id)) errors.push(diag('preset-node-dup', `${pat} 中节点 id "${node.id}" 重复`));
      nodeIds.add(node.id);
      if (!moduleById.has(node.moduleId)) {
        errors.push(diag('preset-node-unknown-module', `${pat} 的节点 "${node.id}" 引用了不存在的模块 "${node.moduleId}"`));
      }
      for (const axis of ['x', 'y']) {
        const value = node[axis];
        if (typeof value !== 'number' || Number.isNaN(value)) {
          errors.push(diag('preset-node-bad-coord', `${pat} 的节点 "${node.id}" 缺少合法坐标 ${axis}`));
        } else if (value < bounds[0] || value > bounds[1]) {
          errors.push(diag('preset-node-coord-range', `${pat} 的节点 "${node.id}" 的 ${axis}=${value} 超出允许范围 [${bounds[0]}, ${bounds[1]}]`));
        }
      }
    }

    for (const edge of preset.edges || []) {
      if (!nodeIds.has(edge.from)) errors.push(diag('preset-edge-bad-from', `${pat} 的边 from "${edge.from}" 不是本预设的节点`));
      if (!nodeIds.has(edge.to)) errors.push(diag('preset-edge-bad-to', `${pat} 的边 to "${edge.to}" 不是本预设的节点`));
      if (edge.from === edge.to) errors.push(diag('preset-self-loop', `${pat} 的节点 "${edge.from}" 存在自环`));
    }

    if ((preset.nodes || []).length < 2) {
      warnings.push(diag('preset-too-small', `${pat} 只含 ${(preset.nodes || []).length} 个节点，通常不足以构成流程`));
    }
    if (!preset.docs || !preset.docs.length) {
      warnings.push(diag('preset-no-docs', `${pat} 未关联任何 docs 章节`));
    }
  }

  return { errors, warnings, stats };
}

/* ------------------------------------------------------------------ *
 * 2. 端口类型兼容性
 * ------------------------------------------------------------------ */

/**
 * 判断一个输出类型是否能喂给某个模块的输入。
 *
 * 三档判定：
 *   'direct'  —— 类型完全匹配，可直接连线
 *   'adapter' —— 有一方是 'any'，需要人工确认格式（黄线）
 *   'invalid' —— 不兼容，必须插入适配器模块（红线）
 *
 * 注意：这里刻意做"结构判定"而非"魔法推断"。判断依据只有 catalog 里
 * 登记的 shape 与显式的 any，不做任何基于命名的猜测——宁可提示用户
 * 插一个显式适配器模块，也不假装自动兼容。
 */
export function portCompatibility(outTypeId, inTypeId, registry) {
  if (outTypeId === inTypeId) return { level: 'direct', reason: '类型完全一致' };

  const out = registry.dataTypeById.get(outTypeId);
  const inp = registry.dataTypeById.get(inTypeId);
  if (!out || !inp) {
    return { level: 'invalid', reason: `未知类型（${!out ? outTypeId : inTypeId}）` };
  }

  if (out.id === 'any' || inp.id === 'any') {
    return {
      level: 'adapter',
      reason: `${outTypeId === 'any' ? '上游' : '下游'}声明为"任意"，需人工确认格式是否真的对得上`
    };
  }

  if (out.shape === inp.shape) {
    // 同 shape 但不同 typeId：例如 contigs -> genome-fasta，属于语义差异
    return {
      level: 'adapter',
      reason: `同为 ${out.shape} 类数据但语义不同（${outTypeId} → ${inTypeId}），通常只需重命名/转换容器格式`
    };
  }

  return { level: 'invalid', reason: `${outTypeId}（${out.shape}）不是 ${inTypeId}（${inp.shape}）` };
}

/**
 * 从模块的输出端口里挑出最匹配某个已连接输入类型的那一个。
 * 优先"完全一致"，其次"兼容"，再次第一个输出端口。
 */
export function pickOutputPort(module, inType, registry) {
  const outputs = module.outputs || [];
  if (!outputs.length) return null;
  const same = outputs.find((p) => p.type === inType);
  if (same) return same;
  const compat = outputs.find((p) => portCompatibility(p.type, inType, registry).level !== 'invalid');
  return compat || outputs[0];
}

/**
 * 从模块的输入端口里挑出最匹配某个上游输出类型的那一个，并给出匹配等级。
 * 面板与导出脚本共用它来回答"这条线插到哪个端口上"。
 */
export function pickInputPort(module, outType, registry) {
  const inputs = module.inputs || [];
  if (!inputs.length) return null;
  const same = inputs.find((p) => p.type === outType);
  if (same) return same;
  const compat = inputs.find((p) => portCompatibility(outType, p.type, registry).level !== 'invalid');
  return compat || inputs[0];
}

/**
 * 为两个模块之间的一条连线选出最合适的「输出端口类型 → 输入端口类型」配对。
 *
 * 为什么需要它：一个模块常有多个输出（例如注释模块同时给 GFF、蛋白序列、汇总表），
 * `outputs[0]` 未必是下游要的那个。如果连边只记 from/to 而不记类型，
 * 默认取 outputs[0] 会产生大量**假性的类型错误** —— 明明可以连（蛋白序列正好
 * 是下游要的），却因为默认挑了 GFF 而被标红。这会让预设流程看起来到处是红线，
 * 掩盖真正的问题。
 *
 * 选择优先级：
 *   1. 双方显式声明的类型（连边自带 fromType/toType）—— 尊重用户的明确意图
 *   2. direct 级配对（类型完全一致）
 *   3. adapter 级配对（同 shape 或任一端为 any）
 *   4. 回退到第一对
 */
export function chooseEdgeTypes(fromModule, toModule, registry, explicit = {}) {
  const outputs = fromModule.outputs || [];
  const inputs = toModule.inputs || [];
  const fallback = {
    fromType: explicit.fromType || (outputs[0] || {}).type || 'any',
    toType: explicit.toType || pickInputPort(toModule, explicit.fromType || (outputs[0] || {}).type || 'any', registry)?.type || (inputs[0] || {}).type || 'any'
  };

  // 显式声明：只要双方都能接受就照用，不覆盖用户意图
  if (explicit.fromType || explicit.toType) {
    const level = portCompatibility(fallback.fromType, fallback.toType, registry).level;
    return { ...fallback, level };
  }

  const pairs = [];
  for (const out of outputs) {
    for (const inp of inputs) {
      const compat = portCompatibility(out.type, inp.type, registry);
      if (compat.level !== 'invalid') {
        pairs.push({ fromType: out.type, toType: inp.type, level: compat.level, reason: compat.reason });
      }
    }
  }
  if (!pairs.length) return fallback;

  // direct 优先；同为 direct 时按输出端口顺序（即模块作者声明的优先级）
  const direct = pairs.filter((p) => p.level === 'direct');
  return direct[0] || pairs[0];
}

/**
 * 模块的所有输入是否都能被某个输出类型满足。
 */
export function typeSatisfies(outTypeId, targetModule, registry) {
  const inputs = targetModule.inputs || [];
  if (!inputs.length) return false;
  return inputs.some((p) => portCompatibility(outTypeId, p.type, registry).level !== 'invalid');
}

/**
 * 给定一个"上游输出类型 → 下游模块"，推荐可以插在中间的适配器模块。
 * 推荐依据是数据流可行性（适配器的输出能进下游），而非名字相似度。
 */
export function recommendAdapters(outTypeId, targetModuleId, registry) {
  const target = registry.moduleById.get(targetModuleId);
  if (!target) return [];
  const results = [];
  for (const mod of registry.modules) {
    if (mod.id === targetModuleId) continue;
    if ((mod.kind || 'standard') !== 'adapter' && mod.kind !== 'standard') continue;
    const acceptsUpstream = (mod.inputs || []).some(
      (p) => portCompatibility(outTypeId, p.type, registry).level !== 'invalid'
    );
    if (!acceptsUpstream) continue;
    const feedsTarget = (mod.outputs || []).some((out) =>
      (target.inputs || []).some((p) => portCompatibility(out.type, p.type, registry).level !== 'invalid')
    );
    if (!feedsTarget) continue;
    // 优先推荐专门为此设计的模块（feeds 里显式声明了目标）
    const explicit = (mod.feeds || []).some((f) => f.target === targetModuleId);
    results.push({ moduleId: mod.id, name: mod.name, explicit, reason: mod.summary });
  }
  results.sort((a, b) => Number(b.explicit) - Number(a.explicit) || a.moduleId.localeCompare(b.moduleId));
  return results.slice(0, 5);
}

/* ------------------------------------------------------------------ *
 * 3. 管线图分析
 * ------------------------------------------------------------------ */

/**
 * 分析管线图：拓扑排序 + 各类问题诊断。
 * @param {{nodes:Array, edges:Array}} pipeline
 * @returns {{order:Array<string>, cycles:Array<Array<string>>, issues:Array}}
 */
export function analyzePipeline(pipeline, registry) {
  const nodes = pipeline.nodes || [];
  const edges = pipeline.edges || [];
  const nodeById = indexBy(nodes);
  const issues = [];

  // --- 边的引用完整性与端口兼容性 ---
  const validEdges = [];
  for (const edge of edges) {
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (!fromNode || !toNode) {
      issues.push({ severity: 'error', code: 'dangling-edge', message: `连线 ${edge.from} → ${edge.to} 指向不存在的节点` });
      continue;
    }
    if (edge.from === edge.to) {
      issues.push({ severity: 'error', code: 'self-loop', message: `节点 ${edge.from} 连到了自己` });
      continue;
    }
    const fromMod = registry.moduleById.get(fromNode.moduleId);
    const toMod = registry.moduleById.get(toNode.moduleId);
    if (!fromMod || !toMod) {
      issues.push({ severity: 'error', code: 'unknown-module', message: `节点引用了未知模块` });
      continue;
    }
    const outType = edge.fromType || (fromMod.outputs[0] || {}).type;
    const inType = edge.toType || (toMod.inputs[0] || {}).type;

    // 连边声明的类型必须真的属于源模块的输出 / 目标模块的输入。
    // 缺了这条检查会放过一类很隐蔽的错误：fromType 写成了「目标接受、但源根本
    // 不产出」的类型，此时端口兼容性判定会通过、面板显示绿色直连，看上去完全
    // 合法，却不对应真实数据流。因此必须单独校验"这个类型是否真的由该模块产出"。
    const declaredOutputs = (fromMod.outputs || []).map((p) => p.type);
    const declaredInputs = (toMod.inputs || []).map((p) => p.type);
    if (edge.fromType && !declaredOutputs.includes(edge.fromType)) {
      issues.push({
        severity: 'error',
        code: 'edge-output-not-declared',
        edge: { from: edge.from, to: edge.to },
        message:
          `${fromMod.name} 并不产出 ${edge.fromType}（它的输出是 [${declaredOutputs.join(', ')}]），` +
          '但这条连线声明用了该类型。请改连线类型或核对模块 outputs。'
      });
    }
    if (edge.toType && !declaredInputs.includes(edge.toType)) {
      issues.push({
        severity: 'error',
        code: 'edge-input-not-declared',
        edge: { from: edge.from, to: edge.to },
        message:
          `${toMod.name} 并不接受 ${edge.toType} 作为输入（它的输入是 [${declaredInputs.join(', ')}]）。` +
          '请改连线类型或核对模块 inputs。'
      });
    }

    // 连边没写类型时，用 chooseEdgeTypes 找出**实际可行**的端口配对，
    // 而不是默认 outputs[0] —— 否则多输出模块会被误判成类型不匹配。
    const chosen = chooseEdgeTypes(fromMod, toMod, registry, {
      fromType: edge.fromType,
      toType: edge.toType
    });
    const compatible = portCompatibility(chosen.fromType, chosen.toType, registry);
    const compat = edge.fromType || edge.toType ? compatible : { level: chosen.level || compatible.level, reason: chosen.reason || compatible.reason };
    if (compat.level === 'invalid') {
      issues.push({
        severity: 'error',
        code: 'type-mismatch',
        edge: { from: edge.from, to: edge.to },
        message: `${fromMod.name} → ${toMod.name}：${compat.reason}，需要中间插入适配模块`,
        suggestions: recommendAdapters(chosen.fromType, toMod.id, registry)
      });
    } else if (compat.level === 'adapter') {
      issues.push({
        severity: 'warning',
        code: 'needs-confirmation',
        edge: { from: edge.from, to: edge.to },
        message: `${fromMod.name} → ${toMod.name}：${compat.reason}`,
        suggestions: recommendAdapters(chosen.fromType, toMod.id, registry)
      });
    }
    validEdges.push({ ...edge, fromType: chosen.fromType, toType: chosen.toType, compat });
  }

  // --- 未连接的必需输入 ---
  const incoming = new Map();
  for (const edge of validEdges) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    incoming.get(edge.to).push(edge);
  }
  for (const node of nodes) {
    const mod = registry.moduleById.get(node.moduleId);
    if (!mod) continue;
    const satisfied = new Set((incoming.get(node.id) || []).map((e) => e.toType));
    for (const port of mod.inputs || []) {
      if (port.required === false) continue;
      if (port.type === 'any') continue;
      const ok = [...satisfied].some((t) => portCompatibility(t, port.type, registry).level !== 'invalid');
      if (!ok) {
        issues.push({
          severity: 'warning',
          code: 'unconnected-input',
          node: node.id,
          message: `${mod.name} 的必需输入「${port.name || port.type}」尚未连接`,
          suggestions: registry.modules
            .filter((m) =>
              (m.outputs || []).some((o) => portCompatibility(o.type, port.type, registry).level !== 'invalid')
            )
            .slice(0, 6)
            .map((m) => ({ moduleId: m.id, name: m.name, reason: m.summary }))
        });
      }
    }
  }

  // --- 孤立节点 ---
  const touched = new Set();
  for (const edge of validEdges) {
    touched.add(edge.from);
    touched.add(edge.to);
  }
  for (const node of nodes) {
    if (!touched.has(node.id) && nodes.length > 1) {
      const mod = registry.moduleById.get(node.moduleId);
      issues.push({
        severity: 'info',
        code: 'isolated-node',
        node: node.id,
        message: `${mod ? mod.name : node.moduleId} 还没有和任何模块连接`
      });
    }
  }

  // --- fan-in：多上游接同一输入（合并逻辑必须人工确认）---
  for (const [nodeId, list] of incoming) {
    const mod = registry.moduleById.get((nodeById.get(nodeId) || {}).moduleId);
    if (list.length > 1 && mod && (mod.inputs || []).length === 1) {
      issues.push({
        severity: 'warning',
        code: 'fan-in',
        node: nodeId,
        message: `${mod.name} 有 ${list.length} 条上游连线汇入，合并/拼接逻辑需人工确认（导出脚本中已标记）`
      });
    }
  }

  // --- 环检测（Kahn 拓扑排序）---
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const adjacency = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of validEdges) {
    if (!indeg.has(edge.to) || !adjacency.has(edge.from)) continue;
    indeg.set(edge.to, indeg.get(edge.to) + 1);
    adjacency.get(edge.from).push(edge.to);
  }
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of adjacency.get(id) || []) {
      indeg.set(next, indeg.get(next) - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  const cycles = [];
  if (order.length !== nodes.length) {
    const leftover = nodes.filter((n) => !order.includes(n.id)).map((n) => n.id);
    cycles.push(leftover);
    issues.push({
      severity: 'error',
      code: 'cycle',
      message: `流程存在环路（涉及节点：${leftover.join(' → ')}），无法确定执行顺序`
    });
    // 把环内节点追加到末尾，保证导出脚本不丢步骤，但已在顶部标红注释
    order.push(...leftover);
  }

  return { order, cycles, issues, edges: validEdges };
}

/* ------------------------------------------------------------------ *
 * 4. 导出：管线 JSON / Bash / Python
 * ------------------------------------------------------------------ */

/** 安全变量名：把节点 id 与模块 id 合成 shell/python 标识符。 */
export function varName(node, module) {
  return `${String(node.id).replace(/[^A-Za-z0-9_]/g, '_')}_${String(module ? module.id : 'mod').replace(/[^A-Za-z0-9_]/g, '_')}`;
}

/** 取模块的第一条 bash 示例，去掉注释行，保留为可执行骨架。 */
function primaryRecipe(module, lang) {
  const recipes = module.recipes || {};
  const raw = recipes[lang];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  const usage = (module.usage || []).find((u) => (u.lang || 'bash') === lang);
  if (usage && usage.code) return String(usage.code).trim();
  return '';
}

/**
 * 导出为归一化的管线 JSON（面板"导出 JSON"与文档示例共用）。
 */
export function exportPipelineJSON(pipeline, registry) {
  const analysis = analyzePipeline(pipeline, registry);
  const nodeById = indexBy(pipeline.nodes);
  return {
    format: 'bioinfo-guidebook/pipeline',
    version: 1,
    registryVersion: registry.catalog.version,
    name: pipeline.name || '未命名流程',
    generatedBy: 'tools/build.mjs 的模型导出（离线生成，无网络请求）',
    steps: analysis.order.map((nodeId, i) => {
      const node = nodeById.get(nodeId);
      const mod = registry.moduleById.get(node.moduleId);
      return {
        step: i + 1,
        nodeId,
        moduleId: node.moduleId,
        name: mod ? mod.name : node.moduleId,
        layer: mod ? mod.layer : null,
        tools: mod ? (mod.provides || []).map((p) => `${p.tool} ${p.version}`) : [],
        inputs: mod ? mod.inputs : [],
        outputs: mod ? mod.outputs : []
      };
    }),
    edges: analysis.edges.map((e) => ({
      from: e.from,
      to: e.to,
      fromType: e.fromType,
      toType: e.toType,
      compatibility: e.compat ? e.compat.level : 'unknown'
    })),
    issues: analysis.issues
  };
}

/**
 * 导出可读的 Bash 脚本。
 *
 * 生成策略（重要，对应计划 §9 的边界情况处理）：
 *   - 按拓扑顺序逐个模块输出一段注释 + 该模块的首条 bash 示例；
 *   - 出现的每条连线显式写成 shell 变量赋值，让"数据从哪来"在脚本里可见；
 *   - 有 error 级问题时在文件头用醒目注释列出，不静默吞掉；
 *   - fan-in 与 adapter 级问题就地插入 TODO 注释。
 */
export function exportBash(pipeline, registry) {
  const analysis = analyzePipeline(pipeline, registry);
  const nodeById = indexBy(pipeline.nodes);
  const errors = analysis.issues.filter((i) => i.severity === 'error');
  const warnings = analysis.issues.filter((i) => i.severity === 'warning');
  const lines = [];

  lines.push('#!/usr/bin/env bash');
  lines.push('# ============================================================');
  lines.push(`# ${pipeline.name || '未命名流程'}`);
  lines.push('#');
  lines.push('# 由 microbial-bioinformatics-guidebook 的交互面板生成。');
  lines.push('# 这是「结构骨架 + 参数起点」，不是可直接投产的脚本：');
  lines.push('#   1. 每个步骤的命令取自对应模块的示例，务必按你的数据/数据库路径改写；');
  lines.push('#   2. 使用前请核对工具版本与数据库版本（见每步的 # 工具 行）；');
  lines.push(`#   3. 注册表版本：${registry.catalog.version}`);
  lines.push('# ============================================================');
  lines.push('');
  lines.push('set -euo pipefail');
  lines.push('');
  lines.push('# --- 目录约定（按需修改）---');
  lines.push('RAW_DIR=00_raw');
  lines.push('QC_DIR=01_clean');
  lines.push('ASM_DIR=02_assembly');
  lines.push('ANNO_DIR=03_annotation');
  lines.push('RES_DIR=09_results');
  lines.push('LOG_DIR=10_logs');
  lines.push('THREADS=${THREADS:-8}');
  lines.push('mkdir -p "$QC_DIR" "$ASM_DIR" "$ANNO_DIR" "$RES_DIR" "$LOG_DIR"');
  lines.push('');

  if (errors.length) {
    lines.push('# !!! 注意：此流程存在未解决的错误，运行前必须处理 !!!');
    for (const issue of errors) lines.push(`#   [${issue.code}] ${issue.message}`);
    if (analysis.cycles.length) lines.push(`#   检测到环路：${analysis.cycles[0].join(' -> ')}`);
    lines.push('');
  }
  if (warnings.length) {
    lines.push('# 需要人工确认的警告：');
    for (const issue of warnings) lines.push(`#   [${issue.code}] ${issue.message}`);
    lines.push('');
  }

  lines.push('# ------------------------------------------------------------');
  lines.push('# 数据流（每条连线在下方对应一次变量赋值）');
  lines.push('# ------------------------------------------------------------');
  if (!analysis.edges.length) {
    lines.push('# （画布上还没有连线）');
  }
  for (const edge of analysis.edges) {
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    const fromMod = registry.moduleById.get(fromNode.moduleId);
    const toMod = registry.moduleById.get(toNode.moduleId);
    lines.push(`# ${fromMod.name} --(${edge.fromType})--> ${toMod.name}  [${edge.compat.level}]`);
    if (edge.compat.level !== 'direct') lines.push(`#   ^ ${edge.compat.reason}：请确认中间格式转换`);
  }
  lines.push('');

  analysis.order.forEach((nodeId, index) => {
    const node = nodeById.get(nodeId);
    if (!node) return;
    const mod = registry.moduleById.get(node.moduleId);
    if (!mod) return;

    lines.push(`# ------------------------------------------------------------`);
    lines.push(`# 步骤 ${index + 1} / ${analysis.order.length}: ${mod.name}  [${mod.id}]`);
    if (mod.summary) lines.push(`# ${mod.summary}`);
    for (const p of mod.provides || []) {
      lines.push(`# 工具: ${p.tool} ${p.version}${p.install ? `  (安装: ${p.install})` : ''}`);
    }
    lines.push(`# 输入: ${(mod.inputs || []).map((p) => `${p.name || p.type}<${p.type}>`).join(', ') || '无'}`);
    lines.push(`# 输出: ${(mod.outputs || []).map((p) => `${p.name || p.type}<${p.type}>`).join(', ') || '无'}`);

    for (const issue of analysis.issues) {
      if (issue.node === nodeId) lines.push(`# ${issue.severity === 'error' ? '!!!' : 'TODO'}: ${issue.message}`);
      if (issue.edge && issue.edge.to === nodeId) lines.push(`# TODO: ${issue.message}`);
    }

    const incoming = analysis.edges.filter((e) => e.to === nodeId);
    if (incoming.length > 1) {
      lines.push('# TODO: 本步骤有多个上游输入，下面是逐个列出；如需合并/拼接请补一行命令。');
    }
    for (const edge of incoming) {
      const fromNode = nodeById.get(edge.from);
      const fromMod = registry.moduleById.get(fromNode.moduleId);
      const outPort = (fromMod.outputs || []).find((p) => p.type === edge.fromType) || {};
      const inPort = pickInputPort(mod, edge.fromType, registry);
      lines.push(
        `# 上游输入: ${varName(fromNode, fromMod)}${outPort.ext || ''}` +
          ` (${edge.fromType}) -> 本步骤的 «${inPort ? inPort.name || inPort.type : edge.toType}»` +
          `${edge.compat.level === 'direct' ? '' : '  [需确认格式]'}`
      );
    }
    lines.push('');

    const code = primaryRecipe(mod, 'bash');
    if (code) {
      lines.push(code);
    } else {
      lines.push(`# TODO: 该模块尚未提供 bash 示例，请补写 ${mod.id} 的首条命令`);
    }
    lines.push('');
  });

  lines.push('# ------------------------------------------------------------');
  lines.push('# 完成。建议后续接一个 QC 汇总步骤，确认中间产物是否合理。');
  lines.push('# ------------------------------------------------------------');
  return lines.join('\n');
}

/**
 * 导出可读的 Python 脚本。
 * 与 Bash 版同样保留步骤边界与数据流注释，便于改成 Snakemake / 自己封装。
 */
export function exportPython(pipeline, registry) {
  const analysis = analyzePipeline(pipeline, registry);
  const nodeById = indexBy(pipeline.nodes);
  const errors = analysis.issues.filter((i) => i.severity === 'error');
  const warnings = analysis.issues.filter((i) => i.severity === 'warning');
  const lines = [];

  lines.push('#!/usr/bin/env python3');
  lines.push('"""');
  lines.push(`${pipeline.name || '未命名流程'}`);
  lines.push('');
  lines.push('由 microbial-bioinformatics-guidebook 的交互面板生成。');
  lines.push('该脚本用 Python 编排外部工具（subprocess）并在需要时做数据整理；');
  lines.push('每个步骤都是一次独立调用，便于改写成 Snakemake rule 或 Nextflow process。');
  lines.push(`注册表版本：${registry.catalog.version}`);
  lines.push('"""');
  lines.push('');
  lines.push('from __future__ import annotations');
  lines.push('');
  lines.push('import os');
  lines.push('import subprocess');
  lines.push('import sys');
  lines.push('from pathlib import Path');
  lines.push('');
  lines.push('RAW_DIR = Path("00_raw")');
  lines.push('QC_DIR = Path("01_clean")');
  lines.push('ASM_DIR = Path("02_assembly")');
  lines.push('ANNO_DIR = Path("03_annotation")');
  lines.push('RES_DIR = Path("09_results")');
  lines.push('LOG_DIR = Path("10_logs")');
  lines.push('THREADS = int(os.environ.get("THREADS", "8"))');
  lines.push('');
  lines.push('for _d in (QC_DIR, ASM_DIR, ANNO_DIR, RES_DIR, LOG_DIR):');
  lines.push('    _d.mkdir(parents=True, exist_ok=True)');
  lines.push('');
  lines.push('');
  lines.push('def run(cmd, log_name=None):');
  lines.push('    """执行一条外部命令；失败即抛出，避免错误被静默吞掉。"""');
  lines.push('    printable = cmd if isinstance(cmd, str) else " ".join(map(str, cmd))');
  lines.push('    print(f"[run] {printable}", file=sys.stderr)');
  lines.push('    if log_name:');
  lines.push('        with open(LOG_DIR / log_name, "a", encoding="utf-8") as fh:');
  lines.push('            subprocess.run(cmd, shell=isinstance(cmd, str), check=True, stdout=fh, stderr=subprocess.STDOUT)');
  lines.push('    else:');
  lines.push('        subprocess.run(cmd, shell=isinstance(cmd, str), check=True)');
  lines.push('');
  lines.push('');

  if (errors.length) {
    lines.push('# !!! 此流程存在未解决的错误，运行前必须处理 !!!');
    for (const issue of errors) lines.push(`#   [${issue.code}] ${issue.message}`);
    lines.push('');
  }
  if (warnings.length) {
    lines.push('# 需要人工确认的警告：');
    for (const issue of warnings) lines.push(`#   [${issue.code}] ${issue.message}`);
    lines.push('');
  }

  lines.push('def main() -> None:');
  if (!analysis.order.length) {
    lines.push('    raise SystemExit("画布上还没有模块")');
  }
  lines.push('    # 数据流：上游产物 -> 下游输入的显式传递');
  for (const edge of analysis.edges) {
    const fromMod = registry.moduleById.get(nodeById.get(edge.from).moduleId);
    const toMod = registry.moduleById.get(nodeById.get(edge.to).moduleId);
    lines.push(`    # ${fromMod.name} --(${edge.fromType})--> ${toMod.name} [${edge.compat.level}]`);
    if (edge.compat.level !== 'direct') lines.push(`    #   TODO: ${edge.compat.reason}`);
  }
  lines.push('');

  analysis.order.forEach((nodeId, index) => {
    const node = nodeById.get(nodeId);
    if (!node) return;
    const mod = registry.moduleById.get(node.moduleId);
    if (!mod) return;
    const v = varName(node, mod);
    lines.push(`    # ---- 步骤 ${index + 1}/${analysis.order.length}: ${mod.name} [${mod.id}] ----`);
    if (mod.summary) lines.push(`    # ${mod.summary}`);
    lines.push(`    # 工具: ${(mod.provides || []).map((p) => `${p.tool} ${p.version}`).join(' | ')}`);
    if (!(mod.inputs || []).length || (mod.inputs || []).every((p) => p.type === 'any')) {
      lines.push(`    # 输入: 无外部文件依赖，或由本步骤内部生成`);
    }
    for (const issue of analysis.issues) {
      if (issue.node === nodeId) lines.push(`    # ${issue.severity === 'error' ? '!!!' : 'TODO'}: ${issue.message}`);
      if (issue.edge && issue.edge.to === nodeId) lines.push(`    # TODO: ${issue.message}`);
    }

    const code = primaryRecipe(mod, 'python');
    if (code) {
      const indented = code
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n');
      lines.push(indented);
    } else {
      // 没有 python 示例时，退化成 shell 调用，保持脚本可读可改
      const bash = primaryRecipe(mod, 'bash');
      if (bash) {
        lines.push(`    run("""${bash.split('\n')[0].replace(/"/g, '\\"')}""")  # TODO: 该模块暂无 Python 示例，此处为占位`);
      } else {
        lines.push(`    # TODO: 该模块尚未提供 python/bash 示例`);
      }
    }
    const first = (mod.outputs || [])[0];
    if (first) {
      lines.push(`    ${v} = RES_DIR / "${(first.ext || 'output').replace(/^\\./, '')}"  # 请改成真实输出路径`);
    }
    lines.push('');
  });
  lines.push('    print("完成。请检查 RES_DIR 与 LOG_DIR。", file=sys.stderr)');
  lines.push('');
  lines.push('');
  lines.push('if __name__ == "__main__":');
  lines.push('    main()');
  return lines.join('\n');
}

/** 一次性拿到三种导出结果，供面板按钮与测试共用。 */
export function exportAll(pipeline, registry) {
  return {
    json: exportPipelineJSON(pipeline, registry),
    bash: exportBash(pipeline, registry),
    python: exportPython(pipeline, registry)
  };
}
