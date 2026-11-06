# 系统架构

本文件说明这套知识系统的设计：数据模型、构建流程、以及几个关键取舍的理由。想新增模块请看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 1. 核心思想：单一数据源

```
data/modules/*.json  (唯一数据源)
        │
        ├── tools/build.mjs ──► index.html          (交互式面板，自包含)
        │                  ──► data/bundle.json     (合并数据，供程序化消费)
        │
        └── docs/reference/tool-index.md            (由数据生成的工具索引)
```

面板里每个模块的说明、参数、常见坑、上下游关系，以及指南里引用的模块 id，全部来自 `data/modules/*.json`。因此**改了数据重新构建，面板与文档一起更新**，不存在两处维护导致的脱节。

数据由四部分组成：

| 文件 | 职责 |
|---|---|
| `data/catalog.json` | 分类、分析层、数据类型的**定义**（枚举值登记处） |
| `data/module-manifest.json` | 模块 id 的**权威清单**（`feeds` 的事前契约） |
| `data/modules/*.json` | 20 个分类文件，160 个模块条目 |
| `data/presets.json` | 12 条端到端预设流程 |

## 2. 数据模型

### 2.1 模块条目

一个模块 = 一个「分析步骤」，可能涉及一个或多个工具。字段分三类：

**结构类**（决定它在图上怎么连）
- `inputs[]` / `outputs[]`：端口，每个端口有一个 `type`（指向 `catalog.dataTypes`）
- `feeds[]`：显式声明「本模块的输出通常喂给谁」，`target` 必须是真实模块 id，`viaType` 必须能被目标的输入接受
- `layer` / `category`：决定它在面板左栏与图层配色中的归属

**内容类**（决定它讲什么）
- `summary` / `what` / `params` / `pitfalls` / `usage` / `recipes`
- `pitfalls` 是这批数据里最有价值的部分：具体、可验证、能指导决策的经验

**元信息类**
- `provides[]`：涉及的工具、版本、获取方式（`version` 是必填，因为版本漂移是复现性的主要杀手）
- `kind` / `maturity` / `domains` / `tags` / `related` / `docs`

完整契约见 [module-schema.md](reference/module-schema.md)。

### 2.2 显式 `feeds` —— 本系统最关键的设计决定

自动推断「工具 A 通常在 B 上游」是不可靠的，基于工具名的启发式规则会产生大量错误连接。因此改为**由每个模块显式声明它的典型下游**，并由构建强制校验：

- `feeds[].target` 不存在 → **构建失败**（知识图不能断链）
- `feeds[].viaType` 喂不进目标的输入端口 → **构建失败**（接口不能凭空假设）

代价是写模块时要多想一步；收益是图上的每条边都有依据，且增删模块会立刻暴露断链。

### 2.3 数据类型与三档连线判定

连线是否合法由 `type` 经 `catalog.dataTypes[].shape` 判定，**不看名字**：

| 判定 | 条件 | 面板呈现 |
|---|---|---|
| `direct` | 两个 type 完全一致 | 🟢 绿色实线 |
| `adapter` | 有一方是 `any`，或同 `shape` 不同 `type` | 🟡 黄色虚线 |
| `invalid` | 跨 `shape` | 🔴 红色点线 |

`shape` 取值：`any`、`sequence`、`sequence-set`、`table`、`alignment`、`tree`、`figure`、`list`、`code`。

设计上有意选择**结构判定而非语义推断**：宁可标黄让人确认，也不假装自动兼容。红色连线不会被阻止——分析流程有时确实需要非常规转换，工具不该替人决定，但必须让问题可见。

### 2.4 多输出模块的端口选择

一个模块常有多个输出（注释模块同时给 GFF、蛋白序列、汇总表）。如果一条连边只记 `from`/`to` 而不记类型，默认取 `outputs[0]` 会产生**假性的类型错误**：明明蛋白序列正好是下游要的，却因为默认挑了 GFF 而被标红。

因此 `chooseEdgeTypes()`（在 `tools/lib/model.mjs`）按优先级选配对：

1. 双方**显式声明**的类型（尊重用户意图）
2. `direct` 级配对
3. `adapter` 级配对
4. 回退到第一对

面板的连线操作、预设加载与 `analyzePipeline` 都走这一个函数，因此三者对同一条边的判定永远一致。

### 2.5 参考数据库是配置，不是数据流

消费方（Kraken2、GTDB-Tk 等）**不把数据库转换为自己的输出**——库是它们运行的配置，不是输入数据。把数据库画成数据流还会暗示「换库要重跑上游」这种错误依赖。

因此约定：数据库与索引通过 `params` / `pitfalls` / `notes` 说明，**不设端口**。`util_download_ref` 的价值在于提醒你记录数据库版本，而不是在图上连一条线。

## 3. 构建与校验

`node tools/build.mjs` 的执行顺序：

1. 按 `catalog.categories[].file` **白名单加载**分类文件（漏登记的文件会立刻暴露）
2. 强校验：id 唯一性与命名、category/layer/type 是否已登记、`feeds` 的 target 存在性与类型兼容、preset 节点与边的引用完整性、summary 长度、what 段数
3. manifest 双向核对：登记未实现（进度）、实现未登记（**错误**）
4. 文档引用核对：`docs/` 中形如 `qc_fastp` 的模块引用必须真实存在；preset 引用的文档路径必须存在
5. `--strict` 额外核对指南章节与参考文档是否齐全
6. 合并写 `data/bundle.json`
7. 渲染 `index.html`
8. **自包含检查**：产物中不得出现任何外部 http(s) 链接、外链资源、`fetch()`、`XMLHttpRequest`、远程字体

任一步失败即非零退出。产物先落盘再检查，因此失败时仍可排查。

### 自包含是怎么被证明的

「离线可用」不靠承诺，靠机器核对：构建扫描产物的**活代码**（剥离 HTML 注释与内联 JSON 数据），搜索网络依赖。唯一的例外是 SVG 命名空间标识符——它必须原样出现一次，且只允许在 `tools/lib/model.mjs` 的 `SVG_NS` 声明处出现（构建会核对该行包含 `SVG_NS` 标识符，且全文件只出现一次）。

因此你可以用最朴素的方式验证离线可用性：在 `index.html` 里搜索 `http`，唯一命中的就是那一行命名空间常量。

## 4. 代码组织与「一份实现」

```
tools/lib/model.mjs      纯函数核心（零依赖，无 import）
        │
        ├── import ──────► tools/tests/model.test.mjs       (Node 测试)
        └── 剥离 export ─► index.html 内联                  (浏览器面板)
```

`model.mjs` 里没有任何 Node 专属 API（无 `fs`/`path`/`url`），因此可以被原样复用。构建时 `browserVariantOfModel()` 只做两件事：去掉声明前的 `export` 关键字、去掉 `export {}` 汇总语句。

**为什么这样做**：如果测试与浏览器各有一份校验实现，两者会随时间漂移，最终「构建期校验通过但运行期行为不同」。共用一份源码从机制上排除了这种可能。

## 5. 验证分层

| 层 | 工具 | 覆盖什么 | 本沙箱能否运行 |
|---|---|---|---|
| 单元测试 | `node --test tools/tests/` | 类型判定三分支、环检测、拓扑排序、三种导出的结构、校验器对坏数据的反应 | ✅ |
| 导出链路 | `node tools/verify-exports.mjs` | 用真实数据跑通 12 条预设的三种导出，检查不丢步骤、无渲染破绽 | ✅ |
| 预设连线 | `node tools/diagnose-preset-edges.mjs` | 列出被判为类型错误的连线（应为 0） | ✅ |
| 构建校验 | `node tools/build.mjs --strict` | 结构、类型、feeds、manifest、文档完整性、自包含 | ✅ |
| 产物静态检查 | `node tools/smoke-edge.mjs` | 内联脚本语法、DOM id 契约、内联 JSON 合法性 | ✅ |
| 浏览器渲染 | 同上（Edge 无头） | 真实渲染 + 运行时错误探针 | ❌ 受限沙箱下跳过 |

**关于跳过要诚实**：`smoke-edge.mjs` 在检测到沙箱禁止 Chromium 使用命名管道（`mojo ... platform_channel.cc: Access is denied`）时，会以**退出码 2** 明确报告「有跳过项，结果不完整」，而不是谎报通过。若浏览器以其它方式崩溃（例如 `SIGTRAP` 且 stderr 为空），脚本会以非零码报告**失败**并要求人工排查——同样不会谎报通过。静态部分（4 项）仍全部执行。

## 6. 已知取舍

**面板不运行分析。** 它是建模与代码生成工具，不替代分析软件，也不替代工具官方文档。

**版本号是系列近似。** 各模块的 `version` 写成「主.次.x」，未联网逐个核对；使用前需对照官方文档确认。

**浏览器渲染未在本环境验证。** 见上表。面板的导出逻辑已被 12 条真实预设覆盖，但 DOM 交互（拖拽、连线、缩放）未经自动化测试。

**类型体系是「够用」而非完备。** 例如 rRNA 序列复用 `cds-fasta` 承载（catalog 无专门类型），共用型模块用 `any` 输出。这类借用都在端口 `note` 里写明了，但没有从类型层面消除。

**不做语义正确性检查。** 构建能保证「这条边类型对得上」，不能保证「这条边在生物学上合理」。后者依赖写模块时的判断与评审。
