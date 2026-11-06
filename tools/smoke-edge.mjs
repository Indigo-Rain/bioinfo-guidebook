#!/usr/bin/env node
/**
 * smoke-edge.mjs —— 面板产物的三层验证。
 *
 *   1. 静态：抽取 index.html 内联的 <script>，用 `node --check` 验证语法；
 *      并核对面板脚本引用的 DOM id 是否都存在于模板（无浏览器时最重要的替代验证）。
 *   2. 渲染：用真实 Microsoft Edge 无头模式 --dump-dom，断言关键结构由 JS 生成。
 *   3. 运行时：注入探针收集 window.onerror / unhandledrejection / console.error，
 *      任何一条即失败。
 *
 * 用法：node tools/smoke-edge.mjs [--keep]
 * 退出码：0 = 全部通过；1 = 有失败；2 = 有跳过（结果不完整，不能当作通过）。
 *
 * 沙箱注意事项（重要）：
 *   - 子进程输出必须重定向到真实文件描述符。DSH 文件沙箱禁止子进程通过管道
 *     通信，用 stdio: 'pipe' 会 EPERM。
 *   - Chromium 自身的多进程 IPC 也依赖命名管道，因此在 DSH 沙箱内**根本起不来**：
 *     实测报 `FATAL:mojo/.../platform_channel.cc Check failed: Access is denied`。
 *     这种情况按"跳过"处理并返回退出码 2，绝不谎报通过。
 */

import { readFile, writeFile, rm, mkdtemp, open, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const HTML = path.join(ROOT, 'index.html');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/microsoft-edge',
  '/usr/bin/microsoft-edge-stable',
  '/usr/bin/google-chrome'
];

const KEEP = process.argv.includes('--keep');

const tally = { checks: 0, failures: 0, skipped: 0 };

function ok(label, extra) {
  tally.checks += 1;
  console.log(`  OK   ${label}${extra ? '  —— ' + extra : ''}`);
}
function bad(label, detail) {
  tally.checks += 1;
  tally.failures += 1;
  console.log(`  FAIL ${label}`);
  if (detail) console.log(`       ${detail}`);
}
function skip(label, lines) {
  tally.skipped += 1;
  console.log(`  SKIP ${label}`);
  for (const line of lines || []) console.log('       ' + line);
}

function summary() {
  console.log('');
  if (tally.failures) {
    console.log(`SMOKE FAILED —— ${tally.checks - tally.failures}/${tally.checks} 项通过，${tally.failures} 项失败`);
    process.exit(1);
  }
  if (tally.skipped) {
    console.log(
      `SMOKE INCOMPLETE —— 静态检查 ${tally.checks} 项全部通过，但有 ${tally.skipped} 项被跳过；` +
        '结果不完整，不能视为通过'
    );
    process.exit(2);
  }
  console.log(`SMOKE OK —— ${tally.checks}/${tally.checks} 项通过`);
  process.exit(0);
}

/** 把本地路径转成 file:// URL，供浏览器加载（跨平台）。 */
function toFileUrl(absPath) {
  return pathToFileURL(absPath).href;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/* ================================================================== *
 * 第 1 层：静态检查
 * ================================================================== */

async function staticChecks(html) {
  console.log('== 1. 静态检查 ==');

  const scriptBlocks = [];
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(html)) !== null) {
    const attrs = match[1] || '';
    const body = match[2];
    if (/\bsrc\s*=/i.test(attrs)) {
      bad('存在外链 <script src>', attrs.trim());
      continue;
    }
    if (/type\s*=\s*["']application\/json["']/i.test(attrs)) {
      try {
        JSON.parse(body);
        ok('内联数据块是合法 JSON', `${(body.length / 1024).toFixed(1)} KB`);
      } catch (err) {
        bad('内联数据块不是合法 JSON', err.message);
      }
      continue;
    }
    scriptBlocks.push(body);
  }

  if (!scriptBlocks.length) bad('没有找到任何内联脚本');

  // DOM 契约：panel.js 引用的元素 id 必须在模板里存在。
  // 这类拼写错误在浏览器里是"运行到那行才崩"，没有浏览器就查不出来，
  // 因此静态兜住它 —— 这是本环境（无可用浏览器）最重要的替代验证。
  const templatePath = path.join(ROOT, 'assets', 'templates', 'panel.html');
  const panelPath = path.join(ROOT, 'assets', 'js', 'panel.js');
  if (existsSync(templatePath) && existsSync(panelPath)) {
    const template = await readFile(templatePath, 'utf8');
    const panelSrc = await readFile(panelPath, 'utf8');

    const declaredIds = new Set();
    for (const m of template.matchAll(/\bid\s*=\s*"([^"]+)"/g)) declaredIds.add(m[1]);

    const referencedIds = new Set();
    for (const m of panelSrc.matchAll(/\$\(\s*'([^']+)'\s*\)/g)) referencedIds.add(m[1]);
    for (const m of panelSrc.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) referencedIds.add(m[1]);

    const missing = [...referencedIds].filter((id) => !declaredIds.has(id));
    if (missing.length) {
      bad(
        'panel.js 引用了模板中不存在的元素 id',
        missing.map((id) => `#${id}`).join('、') + ' —— 运行到那里会拿到 null 并抛错'
      );
    } else {
      ok('面板引用的 DOM id 全部存在于模板', `${referencedIds.size} 个 id 已核对`);
    }
  } else {
    skip('DOM 契约检查（模板或面板脚本缺失）');
  }

  // 每个内联脚本都要能被 Node 解析
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bioinfo-smoke-'));
  try {
    for (let i = 0; i < scriptBlocks.length; i += 1) {
      const file = path.join(tmpDir, `block-${i}.cjs`);
      await writeFile(file, scriptBlocks[i], 'utf8');
      try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'ignore' });
        ok(`内联脚本 #${i + 1} 语法正确`, `${(scriptBlocks[i].length / 1024).toFixed(1)} KB`);
      } catch (err) {
        bad(`内联脚本 #${i + 1} 语法错误`, String(err.message).split('\n').slice(0, 4).join(' | '));
      }
    }
  } finally {
    if (!KEEP) await rm(tmpDir, { recursive: true, force: true });
    else console.log(`       （--keep）临时目录：${tmpDir}`);
  }
}

/* ================================================================== *
 * 第 2 + 3 层：浏览器渲染与运行时探针
 * ================================================================== */

/** 注入错误收集探针，必须早于面板脚本执行。 */
function withProbe(html) {
  const probe = `<script>
window.__SMOKE_ERRORS__ = [];
window.addEventListener("error", function (e) {
  window.__SMOKE_ERRORS__.push("error: " + (e.message || e.type) + " @" + (e.filename || "") + ":" + (e.lineno || 0));
});
window.addEventListener("unhandledrejection", function (e) {
  window.__SMOKE_ERRORS__.push("rejection: " + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
});
(function () {
  var origError = console.error, origWarn = console.warn;
  console.error = function () {
    window.__SMOKE_ERRORS__.push("console.error: " + Array.prototype.map.call(arguments, String).join(" "));
    return origError.apply(console, arguments);
  };
  console.warn = function () {
    window.__SMOKE_ERRORS__.push("console.warn: " + Array.prototype.map.call(arguments, String).join(" "));
    return origWarn.apply(console, arguments);
  };
})();
</script>`;
  return html.replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n' + probe);
}

/** 渲染稳定后把统计结果写回 DOM，便于从 --dump-dom 里读出来。 */
function withReporter(html) {
  const reporter = `<script>
window.addEventListener("load", function () {
  setTimeout(function () {
    var host = document.getElementById("smoke-report");
    if (!host) { host = document.createElement("div"); host.id = "smoke-report"; document.body.appendChild(host); }
    var text = function (id) { var n = document.getElementById(id); return n ? n.textContent : ""; };
    var count = function (sel) { return document.querySelectorAll(sel).length; };
    host.setAttribute("data-smoke", JSON.stringify({
      errors: window.__SMOKE_ERRORS__ || [],
      nodes: count(".node"),
      edges: count(".edge-group"),
      paletteItems: count(".mod-item"),
      presetCards: count(".preset-card"),
      legendItems: count(".legend__item"),
      issueItems: count("#issue-list .issue"),
      registryMeta: text("registry-meta"),
      statusText: text("canvas-status"),
      emptyHidden: document.getElementById("empty-state") ? document.getElementById("empty-state").hidden : null,
      svgTransform: (document.getElementById("viewport") || {}).getAttribute
        ? document.getElementById("viewport").getAttribute("transform") : null,
      firstNodeTitle: (document.querySelector("#layer-nodes .node__title") || {}).textContent || ""
    }));
  }, 900);
});
</script>`;
  return html.replace('</body>', reporter + '\n</body>');
}

/**
 * 判断浏览器启动失败是否由 DSH 文件沙箱造成。
 *
 * 实测证据：Chromium 多进程架构用命名管道做 mojo IPC，沙箱禁止子进程使用管道，
 * 渲染进程在 platform_channel.cc 处 FATAL，stderr 形如
 *   FATAL:mojo/public/cpp/platform/platform_channel.cc:187] Check failed: . : Access is denied. (0x5)
 * 同时 crashpad 报 OpenProcess: Access is denied。这类失败与页面无关。
 */
function detectSandboxBlock(stderrText) {
  if (!stderrText) return null;
  const patterns = [
    { re: /platform_channel\.cc[\s\S]{0,150}Access is denied/i, why: 'Chromium mojo IPC 无法创建命名管道（Access is denied）' },
    { re: /crashpad_client_win\.cc[\s\S]{0,150}Access is denied/i, why: 'Chromium crashpad 无法访问进程（Access is denied）' },
    { re: /OpenProcess: Access is denied/i, why: 'Chromium 无法打开进程句柄（Access is denied）' }
  ];
  for (const { re, why } of patterns) {
    if (re.test(stderrText)) return why;
  }
  return null;
}

function assertReport(report) {
  console.log('== 3. 运行时与结构断言 ==');
  console.log(
    `       渲染统计：节点 ${report.nodes} / 连线 ${report.edges} / 模块库 ${report.paletteItems} / 图例 ${report.legendItems}`
  );

  if (report.errors.length) {
    report.errors.forEach((message) => bad('页面运行时报错', message));
  } else {
    ok('页面无运行时错误，也无 console.error / console.warn');
  }

  if (report.registryMeta && /模块/.test(report.registryMeta)) {
    ok('注册表元信息已渲染', report.registryMeta.trim());
  } else {
    bad('注册表元信息未渲染', JSON.stringify(report.registryMeta));
  }

  if (report.paletteItems > 0) ok('模块库已渲染', report.paletteItems + ' 个条目');
  else bad('模块库为空（左栏没有渲染出任何模块）');

  if (report.legendItems >= 5) ok('图例已渲染', report.legendItems + ' 项');
  else bad('图例未渲染', '期望至少 5 项，实际 ' + report.legendItems);

  if (report.statusText) ok('状态栏已渲染', report.statusText.trim().slice(0, 90));
  else bad('状态栏为空');

  if (report.presetCards > 0) {
    ok('预设卡片已渲染', report.presetCards + ' 条');
    if (report.nodes > 0) {
      ok('起点预设已自动载入画布', report.nodes + ' 个节点，首个：' + report.firstNodeTitle);
    } else {
      bad('预设存在，但画布上没有自动载入起点流程');
    }
    if (report.edges > 0) ok('预设连线已渲染', report.edges + ' 条');
    else bad('预设节点存在但没有渲染出任何连线');
    if (report.emptyHidden) ok('空状态遮罩已正确隐藏');
    else bad('画布有节点，但空状态遮罩仍显示');
    if (report.svgTransform) ok('画布视图变换已应用', report.svgTransform);
    else bad('画布缺少视图变换，fitToView 可能未执行');
  } else {
    skip('起点载入断言（当前注册表尚无预设）');
  }
}

async function browserChecks(html) {
  console.log('');
  console.log('== 2. 浏览器渲染 ==');

  const browser = EDGE_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!browser) {
    skip('浏览器渲染检查（未找到 Edge / Chromium）', [
      '在装有 Edge / Chromium 的环境重跑本脚本即可获得渲染结论。',
      '本次运行不构成通过。'
    ]);
    return;
  }
  console.log(`       使用 ${browser}`);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bioinfo-edge-'));
  try {
    const probeFile = path.join(tmpDir, 'probed.html');
    const reportFile = path.join(tmpDir, 'reported.html');
    const domFile = path.join(tmpDir, 'dom.html');
    const stderrFile = path.join(tmpDir, 'stderr.txt');
    const profileDir = path.join(tmpDir, 'profile');

    await writeFile(probeFile, withProbe(html), 'utf8');
    await writeFile(reportFile, withReporter(await readFile(probeFile, 'utf8')), 'utf8');

    let domHandle = null;
    let errHandle = null;
    let domBytes = 0;
    try {
      domHandle = await open(domFile, 'w');
      errHandle = await open(stderrFile, 'w');
      const result = spawnSync(
        browser,
        [
          '--headless=new',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-sync',
          '--user-data-dir=' + profileDir,
          '--virtual-time-budget=5000',
          '--dump-dom',
          toFileUrl(reportFile)
        ],
        { stdio: ['ignore', domHandle.fd, errHandle.fd], timeout: 120000, windowsHide: true }
      );
      if (result.error) {
        bad('无法启动浏览器', String(result.error.message));
      } else if (result.signal || result.status !== 0) {
        // 浏览器常以非 0 退出但仍产出正确 DOM，因此只提示；真正判据是 DOM 内容。
        console.log(`       注意：浏览器退出异常（status=${result.status} signal=${result.signal}）`);
      }
    } finally {
      if (domHandle) {
        await domHandle.close();
        domBytes = (await stat(domFile).catch(() => ({ size: 0 }))).size;
      }
      if (errHandle) await errHandle.close();
    }

    if (!domBytes) {
      const stderrText = await readFile(stderrFile, 'utf8').catch(() => '');
      const reason = detectSandboxBlock(stderrText);
      if (reason) {
        skip('浏览器渲染检查（本沙箱不允许运行 Chromium）', [
          '原因：' + reason,
          'Chromium 的多进程 IPC 依赖命名管道，而 DSH 文件沙箱按设计禁止子进程使用管道。',
          '这不代表渲染有问题，但也**不构成通过**：请在沙箱外重跑本脚本以获得结论。'
        ]);
      } else {
        bad('浏览器未产出 DOM', '且未识别为沙箱限制，需要人工排查（见临时目录里的 stderr）');
      }
      return;
    }

    const dom = await readFile(domFile, 'utf8');
    const reportMatch = dom.match(/data-smoke="([^"]*)"/);
    if (!reportMatch) {
      bad('探针未在 DOM 中留下报告', '页面脚本可能没执行到 load 之后，或被 --virtual-time-budget 截断');
      return;
    }
    assertReport(JSON.parse(decodeHtmlEntities(reportMatch[1])));
  } finally {
    if (!KEEP) await rm(tmpDir, { recursive: true, force: true });
    else console.log(`       （--keep）临时目录：${tmpDir}`);
  }
}

/* ================================================================== *
 * 入口
 * ================================================================== */

if (!existsSync(HTML)) {
  console.error('index.html 不存在，请先运行 node tools/build.mjs');
  process.exit(1);
}

const html = await readFile(HTML, 'utf8');
await staticChecks(html);
await browserChecks(html);
summary();
