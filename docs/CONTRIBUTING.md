# 参与贡献

> English: [CONTRIBUTING.en.md](CONTRIBUTING.en.md) · 英文贡献入口，详细规则以本文件为准。

本知识系统是数据驱动的：面板、工具索引、导出脚本都由 `data/modules/*.json` 派生。因此贡献主要是**补数据**与**补文档**，很少需要改代码。

## 快速导航

| 我想… | 看这一节 |
|---|---|
| 新增一个分析模块 | [新增模块](#2-新增一个模块) |
| 修改已有模块的说明/参数/坑 | [修改已有模块](#3-修改已有模块) |
| 新增一条端到端预设流程 | [新增预设流程](#4-新增预设流程) |
| 新增一种数据类型 | [扩展数据类型](#5-扩展数据类型) |
| 新增一个分类 | [新增分类](#6-新增分类) |
| 改面板的交互或外观 | [改动面板](#7-改动面板) |

## 1. 前置：先跑通构建

```bash
node tools/build.mjs --check        # 只校验，不写文件
node tools/build.mjs                # 校验 + 生成 index.html 与 bundle.json
```

**零第三方依赖**，不需要 `npm install`。改动数据后用 `--check` 自检，交付前用 `--strict` 确认覆盖完整：

```bash
node tools/build.mjs --strict
```

完整的验证命令列表见 [ARCHITECTURE.md 第 5 节](ARCHITECTURE.md#5-验证分层)。

## 2. 新增一个模块

这是最常见的贡献。五步：

### 第 1 步：在 manifest 里登记 id

`data/module-manifest.json` 的 `byCategory` 下加一条：

```json
"quality-control": [
  { "id": "qc_example_tool", "name": "简短中文名 (ToolName)" }
]
```

**必须先登记。** 原因有两个：

1. 构建做双向核对——「实现了却没登记」永远是错误（否则清单失去权威性）
2. `feeds.target` 需要一个事前契约：别人写模块时可以引用这个 id，而不必等你先写好

id 命名规则：`^[a-z][a-z0-9_-]{2,40}$`，前缀按分类固定（见 manifest 的 `naming.prefixes`）。

### 第 2 步：在分类文件里写条目

在对应的 `data/modules/<category>.json` 数组里加一个对象。字段契约见 [reference/module-schema.md](reference/module-schema.md)——**请完整读一遍**，那里有必填字段、子结构与写作要求。

最小可用例子：

```json
{
  "id": "qc_example_tool",
  "name": "示例质控工具 (ExampleTool)",
  "category": "quality-control",
  "layer": "upstream",
  "kind": "standard",
  "maturity": "stable",
  "domains": ["genomics"],
  "tags": ["质控", "示例"],
  "summary": "一句话说明，不超过 60 字符",
  "what": [
    "第一段：这一步在做什么，核心机制是什么。",
    "第二段：它的关键判断/局限是什么，什么情况下不该用它。"
  ],
  "inputs": [{ "type": "raw-reads", "name": "原始读长", "required": true }],
  "outputs": [{ "type": "clean-reads", "name": "清理后读长", "ext": ".clean.fq.gz" }],
  "provides": [
    { "tool": "ExampleTool", "version": "1.2.x", "access": "cli", "install": "conda" }
  ],
  "feeds": [
    { "target": "asm_spades", "viaType": "clean-reads", "note": "清理后的读长直接进入组装" }
  ],
  "params": [
    { "flag": "-q", "default": "20", "note": "质量阈值；为什么这个值合理" }
  ],
  "pitfalls": [
    "一条具体、可验证、能指导决策的经验。不要写「注意参数选择」这类空话。"
  ],
  "recipes": {
    "bash": "exampletool -i 00_raw/${SAMPLE}.fq.gz -o 01_clean/${SAMPLE}.fq.gz"
  },
  "related": [{ "id": "qc_fastp", "note": "更常用的一站式替代方案" }],
  "docs": [{ "label": "第 2 章 上游数据质控", "path": "docs/guidebook/02-upstream-qc.md" }]
}
```

### 第 3 步：写 `feeds` 时想清楚

`feeds` 是这套系统最有价值也最容易写错的部分：

- 只写**真实存在**的典型下游，2–5 条即可
- 判断依据：这个模块的主要产物通常由谁消费？
- **`viaType` 必须是你 `outputs` 里真实有的 type**，且必须能被 `target` 的某个输入接受
- 找不到合适下游就写 `[]`——不要为了凑数而连到语义不符的模块

不确定某个 id 的输入端口是什么，可以直接查：

```bash
node -e "const m=JSON.parse(require('fs').readFileSync('data/modules/assembly.json','utf8')).find(x=>x.id==='asm_spades');console.log(m.inputs)"
```

（本环境的 PowerShell 对复杂内联脚本不友好，必要时写成临时 `.mjs` 文件再运行。）

### 第 4 步：自检

```bash
node tools/build.mjs --check
```

常见报错与改法（完整对照表见 [module-schema.md](reference/module-schema.md#7-自检清单)）：

| 报错 code | 含义 | 改法 |
|---|---|---|
| `dangling-feed` | `feeds.target` 不存在 | 改成 manifest 里的真实 id |
| `feed-type-mismatch` | 输出喂不进目标的输入 | 改 `viaType`，或改 target 的 inputs |
| `unknown-type` | 用了未登记的数据类型 | 改 type，或按第 5 节登记新类型 |
| `category-file-mismatch` | 条目 `category` 与所在文件不符 | 移动条目或改字段 |
| `summary-too-long` | summary 超 60 字符 | 精简（面板卡片会溢出） |
| `what-too-short` | `what` 少于 2 段 | 补第 2 段 |

### 第 5 步：把工具登记进索引

`docs/reference/tool-index.md` 由数据生成。如果它是脚本生成的，重新运行生成脚本；如果是手工维护的，补上你的工具条目。构建的文档一致性检查会核对模块 id 引用，但不会自动更新索引内容。

## 3. 修改已有模块

直接改 JSON，然后 `node tools/build.mjs --check`。

需要注意的两点：

**改 `inputs` / `outputs` 会影响别人。** 其他模块的 `feeds` 可能指向你，而 `feeds.viaType` 必须能被你的输入接受。删掉一个输入端口会让上游模块的 `feeds` 变成 `feed-type-mismatch` 错误。**构建会拦住这个问题**，这是好事——但它意味着改端口要考虑下游影响。

**改 id 等于删旧增新。** 所有指向它的 `feeds` 与预设节点都会失效。除非确有必要，不要改 id。

## 4. 新增预设流程

在 `data/presets.json` 里加一条。字段：

```json
{
  "id": "preset-my-flow",
  "name": "中文流程名",
  "tags": ["genomics", "end-to-end"],
  "difficulty": "入门",
  "summary": "一句话说明这条流程解决什么问题",
  "starter": false,
  "steps": ["按顺序列出分析步骤"],
  "nodes": [{ "id": "n1", "moduleId": "qc_fastp", "x": 60, "y": 80 }],
  "edges": [{ "from": "n1", "to": "n2", "fromType": "clean-reads" }],
  "notes": [{ "nodeId": "n1", "text": "这一步的关键判断依据" }],
  "docs": ["docs/guidebook/02-upstream-qc.md"],
  "expectedOutputs": ["预期产出的中间文件与最终结果"]
}
```

写作要求：

- **`difficulty` 只能是** `入门` / `进阶` / `高阶`（面板的 CSS 类名依赖它）
- **`edges` 的 `fromType` 要写对。** 一条边只连 `from`/`to` 时，系统会用 `chooseEdgeTypes()` 自动挑最合适的端口配对；但你写了 `fromType` 就会按你写的判定。写错的类型会让这条边在面板上标红
- **验证连线是否都合法**（应为 0 条错误连线）：

```bash
node tools/diagnose-preset-edges.mjs
```

- **`notes` 是价值所在。** 每一步为什么这么做、什么时候该换另一个模块，都写在这里。不要写成步骤名的复述
- 预设应只用 manifest 里已实现的模块（`build.mjs --check` 会核对）

改完顺便跑一下导出验证，确认三种导出都正常且不丢步骤：

```bash
node tools/verify-exports.mjs
```

## 5. 扩展数据类型

只有当现有类型**语义上确实不匹配**时才新增。先看 `data/catalog.json` 的 `dataTypes`——已有 30 余种，涵盖序列、表格、比对、树、图与代码。

新增一个类型：

```json
{
  "id": "rrna-fasta",
  "label": "rRNA 序列",
  "labelEn": "rRNA FASTA",
  "glyph": "FASTA",
  "shape": "sequence",
  "ext": ".rrna.fna",
  "description": "核糖体 RNA 序列，用于分类鉴定而非编码区分析"
}
```

**`shape` 决定连线行为**，选错的影响远大于 `label`：

| shape | 含义 | 能与谁连 |
|---|---|---|
| `any` | 任意输入 | 与所有类型都是 `adapter` 级（黄线） |
| `sequence` | 单条序列类（FASTA/FASTQ） | 同 shape 之间为黄线，完全同 type 为绿线 |
| `sequence-set` | 序列集合（多文件，如 bins、数据库目录） | 同上 |
| `table` | 表格类 | 同上 |
| `alignment` | 长度对齐的序列集合 | 同上 |
| `tree` / `figure` / `list` / `code` | 各自独立 | 同上 |

**不要为了「能连上」而滥用 `any`。** 它会把红线降级成黄线，代价是失去类型安全。

新增类型后，把原本借用其它类型的端口改过来（例如把承载 rRNA 的 `cds-fasta` 换成新类型）。

## 6. 新增分类

1. `data/catalog.json` 的 `categories` 里加一条（`id` / `label` / `file` / `order`）
2. 创建 `data/modules/<file>`，内容为 `[]`（空分类也要保留文件——构建会核对 catalog 登记的文件是否存在）
3. 在 `data/module-manifest.json` 的 `naming.prefixes` 里登记 id 前缀，并在 `byCategory` 下加对应数组
4. 如果要归入新的分析层，还需在 `catalog.layers` 登记

## 7. 改动面板

面板源码在 `assets/`：

```
assets/templates/panel.html   HTML 骨架（占位符由构建替换）
assets/css/panel.css          样式（全部通过 CSS 自定义属性控制）
assets/js/panel.js            交互逻辑
```

构建时三份文件与 `tools/lib/model.mjs` 一起被内联进 `index.html`。

**改动后必须验证**：

```bash
node tools/build.mjs
node tools/smoke-edge.mjs
```

`smoke-edge.mjs` 会核对你引用的 DOM id 是否都存在于模板——**这类拼写错误在没有浏览器的环境里查不出来**，它是本环境最重要的替代验证。

**注意**：`panel.js` 里不要依赖 Node 的模块系统。`model.mjs` 通过剥离 `export` 关键字后作为全局脚本被复用，它**不得包含任何 import**（构建会检查）。

### 样式约定

- 颜色一律通过 CSS 自定义属性（`:root` 里的 `--*`），不要在规则里写死色值
- 分析层配色由 `--layer-upstream/core/downstream/viz/engine` 控制
- 支持 `prefers-reduced-motion`，动效不能是唯一的信息传递方式

## 8. 写作风格

这套文档的定位是**能指导决策的参考**，不是手册摘抄。请遵守：

**写判断依据，不写工具清单。** 「什么时候用 A 而不是 B」比「A 有哪些功能」有用得多。

**诚实写局限。** 每个工具都有不能做的事。写出来比包装它更有价值。

**`pitfalls` 要具体可验证。**
- ✅ 好：`k-mer 选择错误会导致重复区塌缩；153 个以上 reads 时 SPAdes 会跳过 k=21`
- ❌ 差：`注意参数选择`

**版本号写「主.次.x」。** 确切版本由使用者核对。不写版本号等于放弃复现性。

**不确定的写「以官方文档为准」。** 不要编造参数名、默认值或输出文件名。宁可留白也不误导。

**中文正文 + 英文术语/代码。** 工具名保留官方大小写（`Bakta`、`GTDB-Tk`、`fastANI`）。

## 9. 提交前检查清单

```bash
node tools/build.mjs --strict              # 结构、类型、feeds、manifest、文档、自包含
node --test tools/tests/model.test.mjs      # 48 项单元测试
node tools/verify-exports.mjs               # 12 条预设的导出链路
node tools/diagnose-preset-edges.mjs        # 应为 0 条错误连线
node tools/smoke-edge.mjs                   # 静态 + 浏览器渲染/运行时断言
```

全部通过即可提交（当前 `smoke-edge.mjs` 为 14/14）。在无法启动浏览器的环境下，它会返回 2（「有跳过项」）或以非零码报告失败；这是环境限制，不代表渲染有问题，但也**不构成通过**。
