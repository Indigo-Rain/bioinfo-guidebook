/* ==========================================================================
   微生物生物信息学 Pipeline 面板 · 应用逻辑
   --------------------------------------------------------------------------
   依赖：同页先加载的 tools/lib/model.mjs（构建时转换并内联）。
   该文件提供的全局函数：assembleRegistry / validateRegistry /
   portCompatibility / typeSatisfies / recommendAdapters / recommendUpstream /
   analyzePipeline / pickInputPort / pickOutputPort / varName /
   exportPipelineJSON / exportBash / exportPython / exportAll
   ========================================================================== */

(function () {
  'use strict';

  /* ==================== 常量 ==================== */

  var STORAGE_KEY = 'bioinfo-guidebook/pipeline/v1';
  var NODE_W = 216;
  var NODE_H = 84;
  var PORT_R = 5.5;
  var MIN_ZOOM = 0.25;
  var MAX_ZOOM = 2.4;

  var LAYER_VARS = {
    upstream: '--layer-upstream',
    core: '--layer-core',
    downstream: '--layer-downstream',
    viz: '--layer-viz',
    engine: '--layer-engine'
  };

  var SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };
  var SEVERITY_LABEL = { error: '错误', warning: '警告', info: '提示' };

  // SVG_NS 由 model.mjs 提供（全项目唯一定义处，见该文件注释）。

  /* ==================== 状态 ==================== */

  // bundle 数据在页面里以内联 JSON 形式提供
  var bundle = JSON.parse(document.getElementById('bundle-data').textContent);

  // 注册表由 model.mjs 的 buildRegistryFromBundle 统一构建，
  // 保证面板与 Node 测试对同一份数据得到完全一致的解释。
  var registry = buildRegistryFromBundle(bundle);

  var state = {
    name: '未命名流程',
    nodes: [],          // { id, moduleId, x, y }
    edges: [],          // { from, to, fromType, toType }
    selectedNode: null,
    selectedEdge: null,
    view: { x: 0, y: 0, k: 1 },
    search: '',
    onlyMature: false,
    paletteCollapsed: Object.create(null), // categoryId -> true
    hoveredModuleId: null,
    activeExport: 'bash'
  };

  var analysis = { order: [], cycles: [], issues: [], edges: [] };
  var nodeSeq = 1;
  var saveTimer = null;
  var toastTimer = null;

  /* ==================== 小工具 ==================== */

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        if (key === 'class') node.className = attrs[key];
        else if (key === 'text') node.textContent = attrs[key];
        else if (key === 'html') node.innerHTML = attrs[key];
        else if (attrs[key] != null && attrs[key] !== false) node.setAttribute(key, attrs[key]);
      }
    }
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }
  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var key in attrs) {
        if (attrs[key] != null && attrs[key] !== false) node.setAttribute(key, attrs[key]);
      }
    }
    return node;
  }
  function text(node, value) { node.textContent = value; }

  function layerVar(layerId) {
    return 'var(' + (LAYER_VARS[layerId] || '--layer-engine') + ')';
  }
  function layerColor(layerId) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(LAYER_VARS[layerId] || '--layer-engine');
    return (value || '#6b7785').trim();
  }
  function dataType(id) { return registry.dataTypeById.get(id) || { id: id, label: id, glyph: id, shape: '?' }; }
  function category(id) { return registry.categoryById.get(id) || { id: id, label: id }; }
  function layer(id) { return registry.layerById.get(id) || { id: id, label: id }; }
  function moduleOf(node) { return registry.moduleById.get(node.moduleId); }

  function debounceSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveToStorage, 380);
  }

  function toast(message, kind) {
    var box = $('toast');
    box.textContent = message;
    box.className = 'toast' + (kind ? ' toast--' + kind : '');
    box.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 3200);
  }

  /* ==================== 持久化 ==================== */

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        name: state.name,
        nodes: state.nodes,
        edges: state.edges,
        view: state.view,
        nodeSeq: nodeSeq,
        savedAt: new Date().toISOString()
      }));
    } catch (err) {
      /* 隐私模式或配额满：静默降级，不影响使用 */
    }
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.nodes)) return false;
      state.name = data.name || '未命名流程';
      state.nodes = data.nodes.filter(function (n) { return n && registry.moduleById.has(n.moduleId); });
      state.edges = (data.edges || []).filter(function (e) {
        return state.nodes.some(function (n) { return n.id === e.from; }) &&
               state.nodes.some(function (n) { return n.id === e.to; });
      });
      if (data.view) state.view = data.view;
      nodeSeq = data.nodeSeq || (state.nodes.length + 1);
      return state.nodes.length > 0;
    } catch (err) {
      return false;
    }
  }

  /* ==================== 流程操作 ==================== */

  function recalc() {
    analysis = analyzePipeline({ nodes: state.nodes, edges: state.edges }, registry);
  }

  function addNode(moduleId, x, y) {
    var mod = registry.moduleById.get(moduleId);
    if (!mod) return null;
    var node = {
      id: 'n' + (nodeSeq++),
      moduleId: moduleId,
      x: Math.round(x - NODE_W / 2),
      y: Math.round(y - NODE_H / 2)
    };
    state.nodes.push(node);
    state.selectedNode = node.id;
    state.selectedEdge = null;
    commit();
    return node;
  }

  function removeNode(nodeId) {
    state.nodes = state.nodes.filter(function (n) { return n.id !== nodeId; });
    state.edges = state.edges.filter(function (e) { return e.from !== nodeId && e.to !== nodeId; });
    if (state.selectedNode === nodeId) state.selectedNode = null;
    commit();
  }

  function connect(fromId, toId) {
    if (fromId === toId) { toast('不能把节点连到它自己', 'err'); return; }
    if (state.edges.some(function (e) { return e.from === fromId && e.to === toId; })) {
      toast('这两步之间已经有连线了');
      return;
    }
    var fromNode = state.nodes.find(function (n) { return n.id === fromId; });
    var toNode = state.nodes.find(function (n) { return n.id === toId; });
    if (!fromNode || !toNode) return;
    var fromMod = moduleOf(fromNode);
    var toMod = moduleOf(toNode);
    var outPort = fromMod.outputs[0];
    var inPort = pickInputPort(toMod, outPort ? outPort.type : 'any', registry) || toMod.inputs[0];
    var compat = portCompatibility(outPort ? outPort.type : 'any', inPort ? inPort.type : 'any', registry);

    if (compat.level === 'invalid') {
      var suggestions = recommendAdapters(outPort ? outPort.type : 'any', toMod.id, registry);
      var hint = suggestions.length
        ? '可考虑插入：' + suggestions.slice(0, 2).map(function (s) { return s.name; }).join('、')
        : '请先插入一个做格式转换的模块';
      toast('类型不匹配：' + compat.reason + '。' + hint + '（已连线并标红）', 'err');
    } else if (compat.level === 'adapter') {
      toast('已连线，需人工确认：' + compat.reason);
    }

    state.edges.push({
      from: fromId,
      to: toId,
      fromType: outPort ? outPort.type : 'any',
      toType: inPort ? inPort.type : 'any'
    });
    commit();
  }

  function clearAll() {
    if (state.nodes.length && !window.confirm('确定清空整个画布吗？此操作不可撤销。')) return;
    state.nodes = [];
    state.edges = [];
    state.selectedNode = null;
    state.selectedEdge = null;
    commit();
    toast('画布已清空');
  }

  function loadPreset(preset) {
    state.nodes = [];
    state.edges = [];
    state.name = preset.name;
    $('pipeline-name').value = preset.name;
    nodeSeq = 1;

    var idMap = {};
    preset.nodes.forEach(function (pn) {
      var id = 'n' + (nodeSeq++);
      idMap[pn.id] = id;
      state.nodes.push({ id: id, moduleId: pn.moduleId, x: pn.x, y: pn.y });
    });

    // 预设的边按节点 id 记录；载入时用模型重新判定端口，保证连到真正匹配的端口上
    (preset.edges || []).forEach(function (pe) {
      var fromId = idMap[pe.from];
      var toId = idMap[pe.to];
      if (!fromId || !toId) return;
      var fromNode = state.nodes.find(function (n) { return n.id === fromId; });
      var toNode = state.nodes.find(function (n) { return n.id === toId; });
      var fromMod = registry.moduleById.get(fromNode.moduleId);
      var toMod = registry.moduleById.get(toNode.moduleId);
      var outPort = fromMod.outputs.find(function (p) { return p.type === pe.fromType; }) || fromMod.outputs[0];
      var inPort = pickInputPort(toMod, outPort.type, registry) || toMod.inputs[0];
      state.edges.push({ from: fromId, to: toId, fromType: outPort.type, toType: inPort.type });
    });

    state.selectedNode = state.nodes.length ? state.nodes[0].id : null;
    state.selectedEdge = null;
    commit();
    fitToView();
    closePresetModal();
    toast('已载入预设「' + preset.name + '」，可自由增删');
  }

  function commit() {
    recalc();
    render();
    debounceSave();
  }

  /* ==================== 视图变换 ==================== */

  function screenToWorld(clientX, clientY) {
    var rect = $('svg').getBoundingClientRect();
    return {
      x: (clientX - rect.left - state.view.x) / state.view.k,
      y: (clientY - rect.top - state.view.y) / state.view.k
    };
  }

  function applyView() {
    $('viewport').setAttribute(
      'transform',
      'translate(' + state.view.x + ',' + state.view.y + ') scale(' + state.view.k + ')'
    );
    $('zoom-label').textContent = Math.round(state.view.k * 100) + '%';
  }

  function fitToView() {
    var rect = $('svg').getBoundingClientRect();
    if (!state.nodes.length || !rect.width) {
      state.view = { x: 0, y: 0, k: 1 };
      applyView();
      return;
    }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(function (n) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + NODE_H);
    });
    var pad = 60;
    var k = Math.min(
      (rect.width - pad * 2) / Math.max(1, maxX - minX),
      (rect.height - pad * 2) / Math.max(1, maxY - minY),
      1.35
    );
    k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));
    state.view.k = k;
    state.view.x = (rect.width - (maxX - minX) * k) / 2 - minX * k;
    state.view.y = (rect.height - (maxY - minY) * k) / 2 - minY * k;
    applyView();
  }

  function zoomAt(factor, clientX, clientY) {
    var rect = $('svg').getBoundingClientRect();
    var cx = clientX == null ? rect.width / 2 : clientX - rect.left;
    var cy = clientY == null ? rect.height / 2 : clientY - rect.top;
    var next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.view.k * factor));
    var ratio = next / state.view.k;
    state.view.x = cx - (cx - state.view.x) * ratio;
    state.view.y = cy - (cy - state.view.y) * ratio;
    state.view.k = next;
    applyView();
  }

  /* ==================== 渲染 ==================== */

  function render() {
    renderStatus();
    renderPalette();
    renderPresetList();
    renderIssues();
    renderLegend();
    renderInspector();
    renderCanvas();
    $('empty-state').hidden = state.nodes.length > 0;
  }

  function renderLegend() {
    var host = $('legend');
    if (host.dataset.built === '1') return;
    host.dataset.built = '1';

    // 分析层配色
    registry.catalog.layers.forEach(function (l) {
      var swatch = el('span', { class: 'legend__swatch' });
      swatch.style.setProperty('--layer-color', layerColor(l.id));
      host.appendChild(el('span', { class: 'legend__item' }, [swatch, el('span', { text: l.label })]));
    });

    // 连线语义配色：与 model 的三档判定一一对应
    [['direct', '类型匹配'], ['adapter', '需确认格式'], ['error', '类型不匹配']].forEach(function (pair) {
      var line = svgEl('svg', { width: 22, height: 8, viewBox: '0 0 22 8', 'aria-hidden': 'true' });
      line.appendChild(svgEl('line', {
        x1: 0, y1: 4, x2: 20, y2: 4,
        stroke: 'var(--edge-' + pair[0] + ')',
        'stroke-width': 2,
        'stroke-dasharray': pair[0] === 'direct' ? 'none' : pair[0] === 'adapter' ? '5 3' : '2 2'
      }));
      host.appendChild(el('span', { class: 'legend__item' }, [line, el('span', { text: pair[1] })]));
    });
  }

  function renderStatus() {
    var errors = analysis.issues.filter(function (i) { return i.severity === 'error'; }).length;
    var warnings = analysis.issues.filter(function (i) { return i.severity === 'warning'; }).length;
    var host = $('canvas-status');
    host.textContent = '';

    var pillClass = errors ? 'status-pill--err' : warnings ? 'status-pill--warn' : 'status-pill--ok';
    var pillText = errors ? errors + ' 个错误' : warnings ? warnings + ' 个警告' : '校验通过';

    host.appendChild(el('span', { class: 'status-pill ' + pillClass, text: pillText }));
    host.appendChild(el('span', { text: '模块 ' + state.nodes.length }));
    host.appendChild(el('span', { class: 'sep', text: '·' }));
    host.appendChild(el('span', { text: '连线 ' + state.edges.length }));
    host.appendChild(el('span', { class: 'sep', text: '·' }));
    host.appendChild(el('span', { text: '工具 ' + countTools() }));

    if (analysis.cycles.length) {
      host.appendChild(el('span', { class: 'sep', text: '·' }));
      host.appendChild(el('span', { class: 'status-pill status-pill--err', text: '存在环路' }));
    }

    var info = analysis.issues.filter(function (i) { return i.severity === 'info'; }).length;
    if (info) {
      host.appendChild(el('span', { class: 'sep', text: '·' }));
      host.appendChild(el('span', { text: info + ' 条提示' }));
    }
  }

  function countTools() {
    var seen = Object.create(null);
    var total = 0;
    state.nodes.forEach(function (n) {
      var mod = moduleOf(n);
      (mod.provides || []).forEach(function (p) {
        var key = p.tool;
        if (!seen[key]) { seen[key] = true; total += 1; }
      });
    });
    return total;
  }

  /* ---------------------- 左栏：模块库 ---------------------- */

  function moduleMatches(mod) {
    if (state.onlyMature && mod.maturity === 'legacy') return false;
    var q = state.search.trim().toLowerCase();
    if (!q) return true;
    var haystack = [
      mod.id,
      mod.name,
      mod.summary,
      (mod.provides || []).map(function (p) { return p.tool; }).join(' '),
      (mod.tags || []).join(' '),
      (mod.domains || []).join(' '),
      mod.category,
      layer(mod.layer).label
    ].join(' ').toLowerCase();
    // 支持多关键词（空格分隔）逐个匹配
    return q.split(/\s+/).every(function (token) { return haystack.indexOf(token) >= 0; });
  }

  function renderPalette() {
    var host = $('palette');
    host.textContent = '';

    var visible = registry.modules.filter(moduleMatches);
    if (!visible.length) {
      host.appendChild(el('div', {
        class: 'list-empty',
        text: '没有匹配的模块。试试更短的关键词，或取消「仅显示成熟工具」的勾选。'
      }));
      return;
    }

    var layers = registry.catalog.layers.slice().sort(function (a, b) { return a.order - b.order; });
    var categoriesByLayer = Object.create(null);
    registry.catalog.categories.forEach(function (cat) {
      var mod = visible.find(function (m) { return m.category === cat.id; });
      if (!mod) return;
      var layerId = mod.layer;
      if (!categoriesByLayer[layerId]) categoriesByLayer[layerId] = [];
      categoriesByLayer[layerId].push(cat);
    });

    layers.forEach(function (l) {
      var cats = categoriesByLayer[l.id];
      if (!cats || !cats.length) return;
      host.appendChild(el('div', { class: 'layer-head', text: l.label }));

      cats.sort(function (a, b) { return a.order - b.order; });
      cats.forEach(function (cat) {
        var mods = visible.filter(function (m) { return m.category === cat.id; });
        if (!mods.length) return;
        mods.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hans-CN'); });

        var collapsed = !!state.paletteCollapsed[cat.id] && !state.search;
        var group = el('div', { class: 'cat-group' + (collapsed ? ' is-collapsed' : '') });
        var list = el('div', { class: 'cat-group__list' });

        var head = el('button', {
          type: 'button',
          class: 'cat-group__head',
          'aria-expanded': collapsed ? 'false' : 'true'
        }, [
          el('span', { class: 'cat-group__chev', text: '▾' }),
          el('span', { text: cat.label }),
          el('span', { class: 'cat-group__count', text: String(mods.length) })
        ]);
        head.addEventListener('click', function () {
          state.paletteCollapsed[cat.id] = !state.paletteCollapsed[cat.id];
          renderPalette();
        });

        mods.forEach(function (mod) { list.appendChild(paletteItem(mod)); });

        group.appendChild(head);
        group.appendChild(list);
        host.appendChild(group);
      });
    });
  }

  function paletteItem(mod) {
    var tools = (mod.provides || []).map(function (p) { return p.tool; }).slice(0, 2).join(' · ');
    var item = el('button', {
      type: 'button',
      class: 'mod-item',
      draggable: 'true',
      title: mod.summary,
      'data-module-id': mod.id
    }, [
      el('span', { class: 'mod-item__dot', style: '--layer-color:' + layerColor(mod.layer) }),
      el('span', { class: 'mod-item__text' }, [
        el('span', { class: 'mod-item__name', text: mod.name }),
        el('span', { class: 'mod-item__tools', text: tools }),
        el('span', { class: 'mod-item__summary', text: mod.summary })
      ])
    ]);

    item.addEventListener('dragstart', function (event) {
      event.dataTransfer.setData('text/plain', mod.id);
      event.dataTransfer.effectAllowed = 'copy';
      item.classList.add('is-dragging');
    });
    item.addEventListener('dragend', function () {
      item.classList.remove('is-dragging');
      $('canvas').classList.remove('is-dropping');
    });
    // 双击直接放到画布中央，给不用鼠标拖拽的场景留一条路
    item.addEventListener('dblclick', function () {
      var rect = $('svg').getBoundingClientRect();
      var world = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      addNode(mod.id, world.x, world.y);
    });
    item.addEventListener('click', function () { showModuleDetail(mod.id); });
    return item;
  }

  /* ---------------------- 左栏：预设 ---------------------- */

  function renderPresetList() {
    var host = $('preset-list');
    host.textContent = '';
    if (!registry.presets.length) {
      host.appendChild(el('div', { class: 'list-empty', text: '尚无预设流程。' }));
      return;
    }
    registry.presets.forEach(function (preset) {
      host.appendChild(presetCard(preset, function () { loadPreset(preset); }));
    });
  }

  function presetCard(preset, onPick) {
    var card = el('button', { type: 'button', class: 'preset-card' }, [
      el('div', { class: 'preset-card__top' }, [
        el('span', { class: 'preset-card__name', text: preset.name }),
        el('span', { class: 'preset-card__diff diff-' + preset.difficulty, text: preset.difficulty })
      ]),
      el('div', { class: 'preset-card__summary', text: preset.summary }),
      el('div', { class: 'preset-card__tags' }, (preset.tags || []).map(function (t) {
        return el('span', { class: 'tag', text: t });
      })),
      el('div', {
        class: 'preset-card__stats',
        text: preset.nodes.length + ' 个步骤 · ' + (preset.expectedOutputs || []).length + ' 类预期产物'
      })
    ]);
    card.addEventListener('click', onPick);
    return card;
  }

  function openPresetModal() {
    var body = $('preset-modal-body');
    body.textContent = '';
    registry.presets.forEach(function (preset) {
      body.appendChild(presetCard(preset, function () { loadPreset(preset); }));
    });
    $('preset-modal').hidden = false;
  }
  function closePresetModal() { $('preset-modal').hidden = true; }

  /* ---------------------- 左栏：校验 ---------------------- */

  function renderIssues() {
    var host = $('issue-list');
    host.textContent = '';

    var order = analysis.order;
    var sorted = analysis.issues.slice().sort(function (a, b) {
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    });

    $('issue-tab-count').textContent = String(sorted.length);

    if (!sorted.length) {
      host.appendChild(el('div', {
        class: 'list-empty',
        text: state.nodes.length
          ? '没有发现问题：所有必需输入都已连接，连线类型也都对得上。'
          : '画布还是空的。先拖几个模块进来吧。'
      }));
      return;
    }

    sorted.forEach(function (issue) {
      var item = el('div', {
        class: 'issue issue--' + issue.severity,
        role: 'button',
        tabindex: '0',
        title: '点击定位'
      }, [
        el('div', null, [
          el('span', { class: 'issue__sev', text: SEVERITY_LABEL[issue.severity] }),
          el('span', { class: 'issue__code', text: '  ' + issue.code })
        ]),
        el('span', { class: 'issue__msg', text: issue.message })
      ]);

      if (issue.suggestions && issue.suggestions.length) {
        var chips = el('div', { class: 'chips', style: 'margin-top:6px' });
        issue.suggestions.slice(0, 3).forEach(function (s) {
          var chip = el('button', {
            type: 'button',
            class: 'chip',
            text: '+' + s.name,
            title: s.reason || ''
          });
          chip.addEventListener('click', function (event) {
            event.stopPropagation();
            insertSuggestion(issue, s.moduleId);
          });
          chips.appendChild(chip);
        });
        item.appendChild(chips);
      }

      function locate() {
        if (issue.node) {
          state.selectedNode = issue.node;
          state.selectedEdge = null;
          render();
          focusNode(issue.node);
        } else if (issue.edge) {
          state.selectedEdge = issue.edge.from + '>' + issue.edge.to;
          state.selectedNode = issue.edge.to;
          render();
          focusNode(issue.edge.to);
        }
      }
      item.addEventListener('click', locate);
      item.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); locate(); }
      });

      host.appendChild(item);
    });

    if (order.length) {
      host.appendChild(el('div', {
        class: 'layer-head',
        style: 'margin-top:14px',
        text: '执行顺序（拓扑排序）'
      }));
      order.forEach(function (nodeId, index) {
        var node = state.nodes.find(function (n) { return n.id === nodeId; });
        if (!node) return;
        var mod = moduleOf(node);
        var row = el('button', { type: 'button', class: 'issue', style: 'border-left-color:var(--accent)' }, [
          el('span', { class: 'issue__code', text: String(index + 1).padStart(2, '0') + '  ' + mod.id }),
          el('span', { class: 'issue__msg', text: mod.name })
        ]);
        row.addEventListener('click', function () {
          state.selectedNode = nodeId;
          state.selectedEdge = null;
          render();
          focusNode(nodeId);
        });
        host.appendChild(row);
      });
    }
  }

  /** 把建议的模块插到某条存在问题的连线中间。 */
  function insertSuggestion(issue, moduleId) {
    if (issue.edge) {
      var edgeIndex = state.edges.findIndex(function (e) {
        return e.from === issue.edge.from && e.to === issue.edge.to;
      });
      if (edgeIndex >= 0) {
        var edge = state.edges[edgeIndex];
        var fromNode = state.nodes.find(function (n) { return n.id === edge.from; });
        var toNode = state.nodes.find(function (n) { return n.id === edge.to; });
        var midX = (fromNode.x + toNode.x) / 2 + NODE_W / 2;
        var midY = (fromNode.y + toNode.y) / 2 + NODE_H / 2;
        var created = addNode(moduleId, midX, midY);
        if (created) {
          state.edges.splice(edgeIndex, 1);
          state.edges.push({ from: edge.from, to: created.id });
          connect(created.id, edge.to);
          toast('已插入「' + registry.moduleById.get(moduleId).name + '」，请确认它的参数');
        }
        return;
      }
    }
    if (issue.node) {
      var node = state.nodes.find(function (n) { return n.id === issue.node; });
      if (node) {
        var newbie = addNode(moduleId, node.x - NODE_W - 60, node.y);
        if (newbie) connect(newbie.id, node.id);
        return;
      }
    }
    // 兜底：直接放到视口中央
    var rect = $('svg').getBoundingClientRect();
    var world = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    addNode(moduleId, world.x, world.y);
  }

  function focusNode(nodeId) {
    var node = state.nodes.find(function (n) { return n.id === nodeId; });
    if (!node) return;
    var rect = $('svg').getBoundingClientRect();
    state.view.x = rect.width / 2 - (node.x + NODE_W / 2) * state.view.k;
    state.view.y = rect.height / 2 - (node.y + NODE_H / 2) * state.view.k;
    applyView();
  }

  /* ---------------------- 画布 ---------------------- */

  function renderCanvas() {
    var edgeLayer = $('layer-edges');
    var nodeLayer = $('layer-nodes');
    var overlay = $('layer-overlay');

    edgeLayer.textContent = '';
    nodeLayer.textContent = '';
    overlay.textContent = '';

    var nodeById = new Map(state.nodes.map(function (n) { return [n.id, n]; }));
    var issueByNode = Object.create(null);
    var errorEdges = Object.create(null);

    analysis.issues.forEach(function (issue) {
      if (issue.node) {
        if (!issueByNode[issue.node] || issue.severity === 'error') issueByNode[issue.node] = issue.severity;
      }
      if (issue.edge) {
        errorEdges[issue.edge.from + '>' + issue.edge.to] = issue.severity;
      }
    });

    // 连线
    state.edges.forEach(function (edge) {
      var fromNode = nodeById.get(edge.from);
      var toNode = nodeById.get(edge.to);
      if (!fromNode || !toNode) return;
      var key = edge.from + '>' + edge.to;
      var severity = errorEdges[key];
      var compat = portCompatibility(edge.fromType, edge.toType, registry);
      var level = severity === 'error' || compat.level === 'invalid'
        ? 'error'
        : (severity === 'warning' || compat.level === 'adapter' ? 'adapter' : 'direct');

      var geom = edgeGeometry(fromNode, toNode);
      var group = svgEl('g', { class: 'edge-group', 'data-edge-key': key });

      var cls = 'edge edge--' + level + (state.selectedEdge === key ? ' is-selected' : '');
      group.appendChild(svgEl('path', { class: cls, d: geom.d, 'marker-end': 'url(#arrow-' + level + ')' }));
      group.appendChild(svgEl('path', { class: 'edge__hit', d: geom.d }));

      var typeLabel = dataType(edge.fromType).glyph;
      var label = svgEl('text', {
        class: 'edge__label',
        x: geom.mid.x,
        y: geom.mid.y - 5,
        'text-anchor': 'middle'
      });
      label.textContent = typeLabel + (level === 'direct' ? '' : level === 'adapter' ? ' ?' : ' ✕');
      group.appendChild(label);

      group.addEventListener('click', function (event) {
        event.stopPropagation();
        state.selectedEdge = key;
        state.selectedNode = null;
        render();
      });
      group.addEventListener('dblclick', function (event) {
        event.stopPropagation();
        state.edges = state.edges.filter(function (e) { return !(e.from === edge.from && e.to === edge.to); });
        state.selectedEdge = null;
        commit();
      });
      group.addEventListener('mouseenter', function () {
        var path = group.querySelector('.edge');
        if (path) path.classList.add('is-hovered');
      });
      group.addEventListener('mouseleave', function () {
        var path = group.querySelector('.edge');
        if (path) path.classList.remove('is-hovered');
      });

      edgeLayer.appendChild(group);
    });

    // 节点
    state.nodes.forEach(function (node) {
      nodeLayer.appendChild(renderNode(node, issueByNode[node.id]));
    });

    applyView();
    renderExportPreview();
  }

  function renderNode(node, severity) {
    var mod = moduleOf(node);
    var isSelected = state.selectedNode === node.id;
    var classes = ['node'];
    if (isSelected) classes.push('is-selected');
    if (severity === 'error') classes.push('has-error');
    else if (severity === 'warning') classes.push('has-warning');

    var group = svgEl('g', {
      class: classes.join(' '),
      transform: 'translate(' + node.x + ',' + node.y + ')',
      'data-node-id': node.id,
      tabindex: '0',
      role: 'button',
      'aria-label': mod.name + '，' + mod.summary,
      style: '--layer-color:' + layerColor(mod.layer)
    });

    group.appendChild(svgEl('rect', { class: 'node__box', width: NODE_W, height: NODE_H, rx: 10, ry: 10 }));
    group.appendChild(svgEl('rect', { class: 'node__accent', x: 0, y: 0, width: 4, height: NODE_H, rx: 2, ry: 2 }));

    var title = svgEl('text', { class: 'node__title', x: 14, y: 24 });
    title.textContent = truncate(mod.name, 18);
    group.appendChild(title);

    var tool = svgEl('text', { class: 'node__tool', x: 14, y: 43 });
    tool.textContent = truncate((mod.provides || []).map(function (p) { return p.tool; }).join(' · '), 26);
    group.appendChild(tool);

    var summary = svgEl('text', { class: 'node__layer', x: 14, y: 61 });
    summary.textContent = truncate(mod.summary, 26);
    group.appendChild(summary);

    var layerTag = svgEl('text', { class: 'node__layer', x: NODE_W - 12, y: 24, 'text-anchor': 'end' });
    layerTag.textContent = layer(mod.layer).label;
    group.appendChild(layerTag);

    if (severity) {
      var badge = svgEl('text', { class: 'node__badge', x: NODE_W - 12, y: 43, 'text-anchor': 'end' });
      badge.textContent = severity === 'error' ? '!' : '?';
      group.appendChild(badge);
    }

    // 端口：左入右出
    var inPort = mod.inputs[0];
    var outPort = mod.outputs[0];
    var inY = NODE_H / 2;

    var inputGroup = svgEl('g', { class: 'node__port', 'data-port': 'in', 'data-node-id': node.id });
    inputGroup.appendChild(svgEl('line', { class: 'node__port-stub', x1: -12, y1: inY, x2: 0, y2: inY }));
    inputGroup.appendChild(svgEl('circle', { class: 'node__port-circle', cx: -12, cy: inY, r: PORT_R }));
    group.appendChild(inputGroup);

    var inLabel = svgEl('text', { class: 'node__port-label', x: 8, y: NODE_H - 8 });
    inLabel.textContent = '< ' + dataType(inPort ? inPort.type : 'any').glyph;
    group.appendChild(inLabel);

    var outputGroup = svgEl('g', { class: 'node__port', 'data-port': 'out', 'data-node-id': node.id });
    outputGroup.appendChild(svgEl('line', { class: 'node__port-stub', x1: NODE_W, y1: outY(), x2: NODE_W + 12, y2: outY() }));
    outputGroup.appendChild(svgEl('circle', { class: 'node__port-circle', cx: NODE_W + 12, cy: outY(), r: PORT_R }));
    group.appendChild(outputGroup);

    var outLabel = svgEl('text', {
      class: 'node__port-label',
      x: NODE_W - 8,
      y: NODE_H - 8,
      'text-anchor': 'end'
    });
    outLabel.textContent = dataType(outPort ? outPort.type : 'any').glyph + ' >';
    group.appendChild(outLabel);

    // 删除按钮
    var removeGroup = svgEl('g', { class: 'node__remove', 'data-remove': node.id });
    removeGroup.appendChild(svgEl('circle', { class: 'node__remove-bg', cx: NODE_W - 12, cy: 12, r: 9 }));
    removeGroup.appendChild(svgEl('line', { class: 'node__remove-x', x1: NODE_W - 16, y1: 8, x2: NODE_W - 8, y2: 16 }));
    removeGroup.appendChild(svgEl('line', { class: 'node__remove-x', x1: NODE_W - 8, y1: 8, x2: NODE_W - 16, y2: 16 }));
    group.appendChild(removeGroup);

    return group;

    function outY() { return NODE_H / 2; }
  }

  function edgeGeometry(fromNode, toNode) {
    var x1 = fromNode.x + NODE_W + 12;
    var y1 = fromNode.y + NODE_H / 2;
    var x2 = toNode.x - 12;
    var y2 = toNode.y + NODE_H / 2;
    // 目标在左侧时，用更大的弧度绕开节点，避免连线穿过模块卡片
    var dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
    if (x2 < x1) dx = Math.max(80, Math.abs(x2 - x1) * 0.35);
    var d = 'M ' + x1 + ' ' + y1 +
            ' C ' + (x1 + dx) + ' ' + y1 + ', ' +
            (x2 - dx) + ' ' + y2 + ', ' +
            x2 + ' ' + y2;
    return { d: d, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
  }

  function truncate(value, max) {
    var str = String(value || '');
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  /* ---------------------- 右栏：详情 ---------------------- */

  function renderInspector() {
    if (state.selectedNode) {
      var node = state.nodes.find(function (n) { return n.id === state.selectedNode; });
      if (node) { showModuleDetail(node.moduleId, node.id); return; }
    }
    if (!state.selectedNode && !$('inspector-detail').dataset.lastModule) {
      showWelcome();
    }
  }

  function showWelcome() {
    var host = $('inspector-detail');
    host.dataset.lastModule = '';
    host.textContent = '';
    host.appendChild(el('div', { class: 'detail__head' }, [
      el('h2', { class: 'detail__title', text: '开始搭一条流程' }),
      el('p', { class: 'detail__summary', text: '点击画布上的模块，这里会显示它的完整说明、参数取舍与常见坑。' })
    ]));
    host.appendChild(el('div', { class: 'about' }, [
      el('h3', { text: '三种搭法' }),
      el('ul', null, [
        el('li', { text: '从左侧拖模块到画布；从节点右侧圆点拖到另一个节点即可连线。' }),
        el('li', { text: '或者打开「预设流程」，载入一条完整的端到端流程再改。' }),
        el('li', { text: '双击左栏模块可把它放到画布中央。' })
      ]),
      el('h3', { text: '连线颜色的含义' }),
      el('ul', null, [
        el('li', { text: '绿色实线：上下游数据类型完全一致，可直接连接。' }),
        el('li', { text: '黄色虚线：有一方是"任意"类型或只是同类数据换了个名字，需要你确认格式。' }),
        el('li', { text: '红色点线：类型不匹配，通常要中间插一个做格式转换的模块。' })
      ]),
      el('h3', { text: '快捷键' }),
      el('ul', null, [
        el('li', null, [el('span', { class: 'kbd', text: 'Delete' }), document.createTextNode(' 删除选中的模块；')]),
        el('li', null, [el('span', { class: 'kbd', text: '方向键' }), document.createTextNode(' 微移选中模块（按住 Shift 移动更快）；')]),
        el('li', null, [el('span', { class: 'kbd', text: '滚轮' }), document.createTextNode(' 缩放；空白处拖动平移画布；')]),
        el('li', null, [el('span', { class: 'kbd', text: 'Esc' }), document.createTextNode(' 取消选中。')])
      ]),
      el('h3', { text: '导出的脚本可以直接跑吗？' }),
      el('p', { text: '不能直接投产。导出的是「结构骨架 + 参数起点」：每个步骤的命令来自对应模块的示例，'
        + '必须按你的数据路径与数据库版本改写。脚本开头会把所有需要人工确认的地方列成注释清单。' })
    ]));
  }

  function showModuleDetail(moduleId, nodeId) {
    var mod = registry.moduleById.get(moduleId);
    if (!mod) return;
    var host = $('inspector-detail');
    host.dataset.lastModule = moduleId;
    host.textContent = '';

    var isOnCanvas = !!nodeId;
    host.appendChild(el('div', { class: 'detail__head' }, [
      el('div', { class: 'detail__cat', text: layer(mod.layer).label + ' / ' + category(mod.category).label }),
      el('h2', { class: 'detail__title', text: mod.name }),
      el('p', { class: 'detail__summary', text: mod.summary }),
      el('div', { class: 'detail__badges' }, [
        badge(layer(mod.layer).label, 'layer', mod.layer),
        badge(registry.maturityById.get(mod.maturity || 'stable').label,
              mod.maturity === 'legacy' ? 'warn' : ''),
        badge(registry.kindById.get(mod.kind || 'standard').label),
        badge(mod.id)
      ])
    ]));

    if (!isOnCanvas) {
      var addBtn = el('button', { type: 'button', class: 'btn btn--primary', text: '放到画布中央' });
      addBtn.addEventListener('click', function () {
        var rect = $('svg').getBoundingClientRect();
        var world = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
        addNode(mod.id, world.x, world.y);
      });
      host.appendChild(el('div', { style: 'margin-bottom:12px' }, [addBtn]));
    }

    // 说明
    var what = Array.isArray(mod.what) ? mod.what : [mod.what];
    host.appendChild(section('这一步在做什么', what.filter(Boolean).map(function (p) {
      return el('p', { text: p });
    })));

    // 端口
    host.appendChild(section('输入 / 输出', [
      el('div', { class: 'port-list' }, []
        .concat((mod.inputs || []).map(function (p) { return portRow(p, 'in'); }))
        .concat((mod.outputs || []).map(function (p) { return portRow(p, 'out'); }))
      )
    ]));

    // 工具
    host.appendChild(section('涉及工具', [
      el('div', { class: 'tool-list' }, (mod.provides || []).map(function (p) {
        return el('div', { class: 'tool' }, [
          el('div', { class: 'tool__name', text: p.tool + ' ' + p.version }),
          el('div', {
            class: 'tool__meta',
            text: [p.access ? (registry.accessById.get(p.access) || {}).label : null,
                   p.install ? (registry.installById.get(p.install) || {}).label : null]
                  .filter(Boolean).join(' · ')
          })
        ]);
      }))
    ]));

    // 命令示例
    if (mod.usage && mod.usage.length) {
      var examples = [];
      mod.usage.forEach(function (u) {
        examples.push(el('div', { class: 'usage' }, [
          el('div', { class: 'usage__label', text: u.label || '示例' }),
          el('pre', { class: 'codeblock', text: u.code })
        ]));
      });
      host.appendChild(section('命令示例', examples));
    }

    // 参数表
    if (mod.params && mod.params.length) {
      var table = el('table', { class: 'param-table' }, [
        el('thead', null, [el('tr', null, [
          el('th', { text: '参数' }), el('th', { text: '建议值' }), el('th', { text: '说明' })
        ])]),
        el('tbody', null, mod.params.map(function (p) {
          return el('tr', null, [
            el('td', { text: p.flag || p.name }),
            el('td', { text: p.default || p.value || '—' }),
            el('td', { text: p.note || '' })
          ]);
        }))
      ]);
      host.appendChild(section('关键参数', [table]));
    }

    // 常见坑
    if (mod.pitfalls && mod.pitfalls.length) {
      host.appendChild(section('常见坑', mod.pitfalls.map(function (p) {
        return el('div', { class: 'pitfall' }, [
          el('span', { class: 'pitfall__mark', text: '!' }),
          el('span', { text: p })
        ]);
      })));
    }

    // 上下游
    var upstream = recommendUpstream(mod.id, registry, 6);
    var downstream = (mod.feeds || []).map(function (f) {
      var target = registry.moduleById.get(f.target);
      return target ? { moduleId: target.id, name: target.name, viaType: f.viaType, note: f.note } : null;
    }).filter(Boolean);

    if (upstream.length) {
      host.appendChild(section('典型上游（可接到本模块）', [
        el('div', { class: 'chips' }, upstream.map(function (u) {
          var chip = el('button', {
            type: 'button',
            class: 'chip chip--up',
            text: u.name,
            title: u.reason + (u.level === 'direct' ? '（类型直接匹配）' : '（需确认格式）')
          });
          chip.addEventListener('click', function () { showModuleDetail(u.moduleId); });
          return chip;
        }))
      ]));
    }
    if (downstream.length) {
      host.appendChild(section('典型下游（本模块的输出通常喂给）', [
        el('div', { class: 'chips' }, downstream.map(function (d) {
          var chip = el('button', {
            type: 'button',
            class: 'chip chip--down',
            text: d.name,
            title: d.note || ('经由 ' + dataType(d.viaType).label)
          });
          chip.addEventListener('click', function () { showModuleDetail(d.moduleId); });
          return chip;
        }))
      ]));
    }

    // 替代方案
    if (mod.related && mod.related.length) {
      host.appendChild(section('相关 / 可替代', [
        el('div', { class: 'chips' }, mod.related.map(function (rel) {
          var id = typeof rel === 'string' ? rel : rel.id;
          var target = registry.moduleById.get(id);
          var label = target ? target.name : id;
          var chip = el('button', { type: 'button', class: 'chip', text: label,
            title: typeof rel === 'string' ? '' : (rel.note || '') });
          if (target) chip.addEventListener('click', function () { showModuleDetail(id); });
          else chip.disabled = true;
          return chip;
        }))
      ]));
    }

    // 文档
    if (mod.docs && mod.docs.length) {
      host.appendChild(section('延伸阅读（离线段落）', [
        el('div', { class: 'doc-links' }, mod.docs.map(function (d) {
          return el('a', { href: d.path, text: d.label || d.path });
        }))
      ]));
    }
  }

  function section(title, children) {
    return el('div', { class: 'detail__section' }, [el('h3', { text: title })].concat(children));
  }

  function badge(label, kind, layerId) {
    var node = el('span', { class: 'badge' + (kind ? ' badge--' + kind : ''), text: label });
    if (kind === 'layer' && layerId) node.style.setProperty('--layer-color', layerColor(layerId));
    return node;
  }

  function portRow(port, direction) {
    var type = dataType(port.type);
    return el('div', { class: 'port' }, [
      el('span', { class: 'port__glyph', text: type.glyph }),
      el('span', null, [
        el('span', { class: 'port__name', text: port.name || type.label }),
        port.note ? el('span', { class: 'port__note', text: port.note }) : null
      ].filter(Boolean)),
      el('span', {
        class: 'port__req' + (port.required !== false && direction === 'in' ? ' port__req--required' : ''),
        text: direction === 'in'
          ? (port.required === false ? '可选' : '必需')
          : (type.ext || '')
      })
    ]);
  }

  /* ---------------------- 右栏：导出预览 ---------------------- */

  function renderExportPreview() {
    if ($('inspector-export').hidden) return;
    var pipeline = { name: state.name, nodes: state.nodes, edges: state.edges };
    var lang = state.activeExport;
    var code;
    try {
      if (lang === 'json') code = JSON.stringify(exportPipelineJSON(pipeline, registry), null, 2);
      else if (lang === 'python') code = exportPython(pipeline, registry);
      else code = exportBash(pipeline, registry);
    } catch (err) {
      code = '导出失败：' + err.message;
    }
    $('export-preview').textContent = code;
    $('export-preview-lang').textContent =
      lang === 'json' ? 'pipeline.json' : lang === 'python' ? 'pipeline.py' : 'pipeline.sh';
  }

  /* ==================== 导出 / 导入 ==================== */

  function currentPipeline() {
    return { name: state.name, nodes: state.nodes, edges: state.edges };
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function safeName() {
    return String(state.name || 'pipeline').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'pipeline';
  }

  function doExport(kind) {
    if (!state.nodes.length) { toast('画布还是空的，先拖几个模块进来', 'err'); return; }
    var pipeline = currentPipeline();
    var errors = analysis.issues.filter(function (i) { return i.severity === 'error'; });
    var base = safeName();

    if (kind === 'json') {
      download(base + '.pipeline.json', JSON.stringify(exportPipelineJSON(pipeline, registry), null, 2), 'application/json');
    } else if (kind === 'bash') {
      download(base + '.sh', exportBash(pipeline, registry), 'text/x-shellscript');
    } else if (kind === 'python') {
      download(base + '.py', exportPython(pipeline, registry), 'text/x-python');
    }

    if (errors.length) {
      toast('已导出，但流程还有 ' + errors.length + ' 个类型错误：脚本头部已把它们列成注释，请先处理', 'err');
    } else {
      toast('已导出。脚本是结构骨架，请按自己的数据路径与数据库版本改参数', 'ok');
    }
  }

  function importPipeline(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        var nodes = data.nodes || (data.pipeline && data.pipeline.nodes);
        var edges = data.edges || (data.pipeline && data.pipeline.edges);
        if (!Array.isArray(nodes)) throw new Error('文件里没有 nodes 数组');
        var keep = nodes.filter(function (n) { return n && registry.moduleById.has(n.moduleId); });
        if (!keep.length) throw new Error('没有任何模块 id 能在当前注册表中找到');
        var dropped = nodes.length - keep.length;
        state.nodes = keep.map(function (n, i) {
          return { id: n.id || 'n' + (i + 1), moduleId: n.moduleId, x: Number(n.x) || 60 + i * 40, y: Number(n.y) || 60 + i * 30 };
        });
        var ids = new Set(state.nodes.map(function (n) { return n.id; }));
        state.edges = (Array.isArray(edges) ? edges : []).filter(function (e) {
          return e && ids.has(e.from) && ids.has(e.to);
        }).map(function (e) {
          return { from: e.from, to: e.to, fromType: e.fromType, toType: e.toType };
        });
        state.name = data.name || (data.pipeline && data.pipeline.name) || '导入的流程';
        $('pipeline-name').value = state.name;
        nodeSeq = state.nodes.length + 1;
        commit();
        fitToView();
        toast('已导入 ' + state.nodes.length + ' 个模块' + (dropped ? '（' + dropped + ' 个模块 id 无法识别已跳过）' : ''));
      } catch (err) {
        toast('导入失败：' + err.message, 'err');
      }
    };
    reader.readAsText(file);
  }

  /* ==================== 交互绑定 ==================== */

  function bindCanvas() {
    var canvas = $('canvas');
    var svg = $('svg');

    // 从模块库拖入
    canvas.addEventListener('dragover', function (event) {
      if (!event.dataTransfer.types.includes('text/plain')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      canvas.classList.add('is-dropping');
    });
    canvas.addEventListener('dragleave', function (event) {
      if (event.target === canvas) canvas.classList.remove('is-dropping');
    });
    canvas.addEventListener('drop', function (event) {
      event.preventDefault();
      canvas.classList.remove('is-dropping');
      var moduleId = event.dataTransfer.getData('text/plain');
      if (!registry.moduleById.has(moduleId)) return;
      var world = screenToWorld(event.clientX, event.clientY);
      addNode(moduleId, world.x, world.y);
    });

    // 平移 / 缩放
    var panning = null;
    svg.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      if (event.target.closest('.node') || event.target.closest('.edge-group')) return;
      panning = { x: event.clientX, y: event.clientY, vx: state.view.x, vy: state.view.y };
      svg.classList.add('is-panning');
      svg.setPointerCapture(event.pointerId);
      state.selectedNode = null;
      state.selectedEdge = null;
      render();
    });
    svg.addEventListener('pointermove', function (event) {
      if (panning) {
        state.view.x = panning.vx + (event.clientX - panning.x);
        state.view.y = panning.vy + (event.clientY - panning.y);
        applyView();
      }
      if (linkDrag) updateLinkPreview(event);
    });
    svg.addEventListener('pointerup', function (event) {
      if (panning) {
        panning = null;
        svg.classList.remove('is-panning');
      }
      if (linkDrag) finishLinkDrag(event);
    });
    svg.addEventListener('pointercancel', function () {
      panning = null;
      svg.classList.remove('is-panning');
      cancelLinkDrag();
    });

    svg.addEventListener('wheel', function (event) {
      event.preventDefault();
      zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX, event.clientY);
    }, { passive: false });

    // 节点交互（事件委托，避免为每个节点单独绑定）
    $('layer-nodes').addEventListener('pointerdown', function (event) {
      var removeBtn = event.target.closest('.node__remove');
      if (removeBtn) {
        event.stopPropagation();
        removeNode(removeBtn.getAttribute('data-remove'));
        return;
      }

      var portEl = event.target.closest('.node__port');
      if (portEl && portEl.getAttribute('data-port') === 'out') {
        event.stopPropagation();
        startLinkDrag(portEl.getAttribute('data-node-id'), event);
        return;
      }

      var nodeEl = event.target.closest('.node');
      if (!nodeEl) return;
      event.stopPropagation();

      var nodeId = nodeEl.getAttribute('data-node-id');
      state.selectedNode = nodeId;
      state.selectedEdge = null;
      render();

      // 渲染会重建节点 DOM，焦点会丢失；把焦点还给新节点，
      // 否则用户点一下节点后方向键/Delete 就没反应了。
      var refreshed = $('layer-nodes').querySelector('[data-node-id="' + nodeId + '"]');
      if (refreshed) refreshed.focus();

      var node = state.nodes.find(function (n) { return n.id === nodeId; });
      if (!node) return;
      var start = screenToWorld(event.clientX, event.clientY);
      var origin = { x: node.x, y: node.y };
      var moved = false;

      function onMove(moveEvent) {
        var world = screenToWorld(moveEvent.clientX, moveEvent.clientY);
        var nx = Math.round(origin.x + (world.x - start.x));
        var ny = Math.round(origin.y + (world.y - start.y));
        if (Math.abs(nx - node.x) > 0 || Math.abs(ny - node.y) > 0) moved = true;
        node.x = nx;
        node.y = ny;
        var g = $('layer-nodes').querySelector('[data-node-id="' + nodeId + '"]');
        if (g) g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
        updateEdgesFor(nodeId);
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (moved) commit();
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    $('layer-nodes').addEventListener('keydown', function (event) {
      var nodeEl = event.target.closest('.node');
      if (!nodeEl) return;
      var node = state.nodes.find(function (n) { return n.id === nodeEl.getAttribute('data-node-id'); });
      if (!node) return;
      var step = event.shiftKey ? 16 : 4;
      var handled = true;
      if (event.key === 'ArrowLeft') node.x -= step;
      else if (event.key === 'ArrowRight') node.x += step;
      else if (event.key === 'ArrowUp') node.y -= step;
      else if (event.key === 'ArrowDown') node.y += step;
      else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeNode(node.id);
        return;
      } else handled = false;
      if (handled) {
        event.preventDefault();
        nodeEl.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
        updateEdgesFor(node.id);
        debounceSave();
      }
    });
  }

  /** 只更新与某个节点相关的连线路径，拖动时避免整树重绘。 */
  function updateEdgesFor(nodeId) {
    var nodeById = new Map(state.nodes.map(function (n) { return [n.id, n]; }));
    state.edges.forEach(function (edge) {
      if (edge.from !== nodeId && edge.to !== nodeId) return;
      var fromNode = nodeById.get(edge.from);
      var toNode = nodeById.get(edge.to);
      if (!fromNode || !toNode) return;
      var group = $('layer-edges').querySelector('[data-edge-key="' + edge.from + '>' + edge.to + '"]');
      if (!group) return;
      var geom = edgeGeometry(fromNode, toNode);
      var paths = group.querySelectorAll('path');
      for (var i = 0; i < paths.length; i += 1) paths[i].setAttribute('d', geom.d);
      var label = group.querySelector('text');
      if (label) {
        label.setAttribute('x', geom.mid.x);
        label.setAttribute('y', geom.mid.y - 5);
      }
    });
  }

  /* ---------------------- 连线拖拽 ---------------------- */

  var linkDrag = null;

  function startLinkDrag(fromNodeId, event) {
    var fromNode = state.nodes.find(function (n) { return n.id === fromNodeId; });
    if (!fromNode) return;
    var mod = moduleOf(fromNode);
    linkDrag = {
      from: fromNodeId,
      fromType: (mod.outputs[0] || {}).type || 'any',
      origin: { x: fromNode.x + NODE_W + 12, y: fromNode.y + NODE_H / 2 },
      path: svgEl('path', { class: 'edge edge--preview' })
    };
    $('layer-overlay').appendChild(linkDrag.path);
    $('svg').classList.add('is-linking');
    updateLinkPreview(event);
  }

  function updateLinkPreview(event) {
    if (!linkDrag) return;
    var world = screenToWorld(event.clientX, event.clientY);
    var x1 = linkDrag.origin.x;
    var y1 = linkDrag.origin.y;
    var dx = Math.max(40, Math.abs(world.x - x1) * 0.5);
    linkDrag.path.setAttribute(
      'd',
      'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' +
      (world.x - dx) + ' ' + world.y + ', ' + world.x + ' ' + world.y
    );

    // 高亮可能的目标节点
    var target = nodeUnder(event.clientX, event.clientY);
    Array.prototype.forEach.call($('layer-nodes').querySelectorAll('.node'), function (g) {
      var id = g.getAttribute('data-node-id');
      g.classList.toggle('is-dim', !!target && id !== target && id !== linkDrag.from);
    });
  }

  function nodeUnder(clientX, clientY) {
    var found = null;
    Array.prototype.forEach.call($('layer-nodes').querySelectorAll('.node'), function (g) {
      var rect = g.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        found = g.getAttribute('data-node-id');
      }
    });
    return found;
  }

  function finishLinkDrag(event) {
    if (!linkDrag) return;
    var fromId = linkDrag.from;
    var targetId = nodeUnder(event.clientX, event.clientY);
    cancelLinkDrag();
    if (targetId && targetId !== fromId) connect(fromId, targetId);
    else if (!targetId) toast('松手时没有落在另一个模块上，连线已取消');
  }

  function cancelLinkDrag() {
    if (linkDrag && linkDrag.path && linkDrag.path.parentNode) linkDrag.path.parentNode.removeChild(linkDrag.path);
    linkDrag = null;
    $('svg').classList.remove('is-linking');
    Array.prototype.forEach.call($('layer-nodes').querySelectorAll('.node'), function (g) {
      g.classList.remove('is-dim');
    });
  }

  /* ---------------------- 其它绑定 ---------------------- */

  function bindUI() {
    $('pipeline-name').addEventListener('input', function (event) {
      state.name = event.target.value;
      debounceSave();
    });

    $('btn-clear').addEventListener('click', clearAll);
    $('btn-fit').addEventListener('click', fitToView);
    $('btn-zoom-in').addEventListener('click', function () { zoomAt(1.18); });
    $('btn-zoom-out').addEventListener('click', function () { zoomAt(1 / 1.18); });
    $('btn-presets').addEventListener('click', openPresetModal);
    $('btn-open-presets').addEventListener('click', openPresetModal);

    // 左栏 tab 切换
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (tab) {
      tab.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (other) {
          other.classList.toggle('is-active', other === tab);
          other.setAttribute('aria-selected', String(other === tab));
        });
        ['palette', 'preset-list', 'issue-list'].forEach(function (id) {
          $(id).hidden = id !== viewToId(tab.getAttribute('data-view'));
        });
      });
    });
    function viewToId(view) {
      return view === 'presets' ? 'preset-list' : view === 'issues' ? 'issue-list' : 'palette';
    }

    // 右栏 tab 切换
    Array.prototype.forEach.call(document.querySelectorAll('[data-iview]'), function (tab) {
      tab.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('[data-iview]'), function (other) {
          other.classList.toggle('is-active', other === tab);
          other.setAttribute('aria-selected', String(other === tab));
        });
        var view = tab.getAttribute('data-iview');
        $('inspector-detail').hidden = view !== 'detail';
        $('inspector-export').hidden = view !== 'export';
        $('inspector-about').hidden = view !== 'about';
        if (view === 'export') renderExportPreview();
      });
    });

    // 搜索
    $('module-search').addEventListener('input', function (event) {
      state.search = event.target.value;
      renderPalette();
    });
    $('filter-uptodate').addEventListener('change', function (event) {
      state.onlyMature = event.target.checked;
      renderPalette();
    });

    // 导出菜单
    var exportMenu = $('export-menu');
    $('btn-export').addEventListener('click', function (event) {
      event.stopPropagation();
      var open = exportMenu.hidden;
      exportMenu.hidden = !open;
      $('btn-export').setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function () {
      exportMenu.hidden = true;
      $('btn-export').setAttribute('aria-expanded', 'false');
    });
    exportMenu.addEventListener('click', function (event) {
      var button = event.target.closest('[data-export]');
      if (!button) return;
      var kind = button.getAttribute('data-export');
      exportMenu.hidden = true;
      if (kind === 'import') { $('import-file').click(); return; }
      state.activeExport = kind;
      doExport(kind);
    });

    $('import-file').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      if (file) importPipeline(file);
      event.target.value = '';
    });

    $('btn-copy-preview').addEventListener('click', function () {
      var code = $('export-preview').textContent;
      if (!code) { toast('还没有可复制的内容'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(
          function () { toast('已复制到剪贴板', 'ok'); },
          function () { fallbackCopy(code); }
        );
      } else fallbackCopy(code);
    });
    function fallbackCopy(code) {
      var area = document.createElement('textarea');
      area.value = code;
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); toast('已复制到剪贴板', 'ok'); }
      catch (err) { toast('复制失败，请手动选中文本', 'err'); }
      area.remove();
    }

    // 模态关闭
    Array.prototype.forEach.call(document.querySelectorAll('[data-close-modal]'), function (node) {
      node.addEventListener('click', closePresetModal);
    });

    // 全局快捷键
    document.addEventListener('keydown', function (event) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if (event.key === 'Escape') {
        if (!$('preset-modal').hidden) { closePresetModal(); return; }
        state.selectedNode = null;
        state.selectedEdge = null;
        render();
        return;
      }
      if (typing) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedNode) {
        event.preventDefault();
        removeNode(state.selectedNode);
      }
      if (event.key === 'f' || event.key === 'F') fitToView();
    });

    window.addEventListener('beforeunload', saveToStorage);

    // 窗口尺寸变化时保持视图可用
    window.addEventListener('resize', debounce(function () { applyView(); }, 150));
    function debounce(fn, ms) {
      var timer = null;
      return function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, ms);
      };
    }
  }

  /* ---------------------- 关于面板 ---------------------- */

  function renderAbout() {
    var host = $('inspector-about');
    host.textContent = '';
    var tools = new Set();
    registry.modules.forEach(function (m) {
      (m.provides || []).forEach(function (p) { tools.add(p.tool); });
    });

    host.appendChild(el('div', { class: 'about' }, [
      el('h3', { text: '这个面板是什么' }),
      el('p', { text: '一个离线可用的微生物生物信息学 pipeline 拼装与知识查询工具。'
        + '它不是分析软件的替代品，也不运行任何分析——它负责把「用哪些模块、按什么顺序、数据怎么流」这件事'
        + '画清楚，并把结构导出成你能直接改的脚本。' }),
      el('h3', { text: '数据的唯一来源' }),
      el('p', { text: '面板、导出脚本和 docs/ 下的 Markdown 指南全部由同一份注册表派生：' }),
      el('ul', null, [
        el('li', null, [el('code', { text: 'data/catalog.json' }), document.createTextNode(' —— 分类、分析层与数据类型的定义')]),
        el('li', null, [el('code', { text: 'data/modules/*.json' }), document.createTextNode(' —— 模块条目（输入/输出、工具、参数、常见坑、上下游）')]),
        el('li', null, [el('code', { text: 'data/presets.json' }), document.createTextNode(' —— 端到端预设流程')])
      ]),
      el('p', { text: '改数据后运行 node tools/build.mjs 重新生成本页面，因此文档与面板不会脱节。' }),
      el('h3', { text: '规模' }),
      el('ul', null, [
        el('li', { text: registry.modules.length + ' 个模块，覆盖 ' + registry.catalog.categories.length + ' 个分类' }),
        el('li', { text: tools.size + ' 个工具 / 库' }),
        el('li', { text: registry.presets.length + ' 条预设流程' }),
        el('li', { text: registry.catalog.dataTypes.length + ' 种数据类型' })
      ]),
      el('h3', { text: '离线与隐私' }),
      el('p', { text: '页面不发起任何网络请求：没有 CDN、没有外部字体、没有遥测。'
        + '你拼的流程只保存在本机浏览器的 localStorage 里，不会离开这台机器。' }),
      el('h3', { text: '导出脚本的定位' }),
      el('p', { text: '导出的是「结构骨架 + 参数起点」，不是可直接投产的脚本。'
        + '每个步骤需按你的数据路径与数据库版本改写；流程有类型错误时，脚本头部会把它们列成注释清单。' }),
      el('h3', { text: '版本' }),
      el('p', {}, [
        el('code', { text: 'registry ' + registry.catalog.version })
      ])
    ]));
  }

  /* ==================== 启动 ==================== */

  function boot() {
    $('registry-meta').textContent = registry.modules.length + ' 模块 · '
      + registry.presets.length + ' 预设 · registry ' + registry.catalog.version;

    var restored = loadFromStorage();
    $('pipeline-name').value = state.name;

    bindUI();
    bindCanvas();
    renderAbout();
    recalc();
    render();

    if (!restored) {
      // 首次打开：自动载入一条入门预设，让用户立刻看到"拼好的流程"长什么样
      var starter = registry.presets.find(function (p) { return p.starter; })
        || registry.presets.find(function (p) { return p.tags && p.tags.indexOf('end-to-end') >= 0; })
        || registry.presets[0];
      if (starter) {
        loadPreset(starter);
        toast('已载入入门预设「' + starter.name + '」——直接改，或清空后自己拼');
      }
    } else {
      applyView();
      toast('已恢复上次未完成的流程');
    }

    if (!state.nodes.length) fitToView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
