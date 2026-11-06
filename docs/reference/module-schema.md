# 模块条目规范（module schema）

本文件是 `data/modules/*.json` 中每个模块条目的**权威契约**。写模块前先读它；
写完后用 `node tools/build.mjs --check` 自检。

## 1. 文件组织

- 一个分类一个文件，文件名由 `data/catalog.json` 的 `categories[].file` 指定。
- 文件内容是一个 JSON 数组 `[ {...}, {...} ]`（也接受 `{ "modules": [...] }` 包装）。
- 空分类也要保留文件并写 `[]`——构建会检查 catalog 登记的文件是否存在。
- **不要**手写 BOM；构建虽然容忍 BOM，但保持 UTF-8 无 BOM 更干净。

## 2. 模块 id

- 正则：`^[a-z][a-z0-9-]{2,40}$`（小写字母开头，只含 `a-z`、`0-9`、`-`）。
- 前缀按分类固定，见 `data/module-manifest.json` 的 `naming.prefixes`。
- **id 必须先登记在 `data/module-manifest.json`**，否则构建报"已实现但未登记"。

## 3. 字段清单

### 必填

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 见上 |
| `name` | string | 中文名称，可含工具名，如 `读长质控与去接头 (fastp)` |
| `category` | string | 必须等于所在文件的分类 id |
| `layer` | string | `upstream` / `core` / `downstream` / `viz` / `engine` |
| `summary` | string | 一句话说明，**≤ 60 字符**（超长会导致面板卡片溢出） |
| `what` | string[] | **至少 2 段**：第一段"这一步在做什么"，第二段"为什么/注意什么" |
| `inputs` | Port[] | 至少 1 个 |
| `outputs` | Port[] | 至少 1 个 |
| `provides` | Provide[] | 至少 1 个 |
| `feeds` | Feed[] | **必须显式声明**，无典型下游写 `[]` |

### 可选（建议尽量补全，面板会展示）

| 字段 | 类型 | 说明 |
|---|---|---|
| `kind` | string | `standard`（默认）/ `template` / `adapter` / `database` / `reference-data` |
| `maturity` | string | `stable`（默认）/ `active` / `legacy` / `emerging` |
| `domains` | string[] | `genomics` / `metagenomics` / `transcriptomics` / `phylogenetics` |
| `tags` | string[] | 检索关键词 |
| `usage` | Usage[] | 命令示例，最多 4 条 |
| `recipes` | object | `{ "bash": "...", "python": "...", "r": "..." }`，导出脚本会取这里 |
| `params` | Param[] | 关键参数取舍 |
| `pitfalls` | string[] | 常见坑（**这是本知识系统最有价值的部分，请写得具体**） |
| `related` | `(string \| {id,note})[]` | 相关/可替代模块 |
| `docs` | `{label, path}[]` | 指向 `docs/` 下章节 |

### 子结构

```jsonc
// Port
{ "type": "clean-reads", "name": "清理后双端读长", "required": true, "note": "R1/R2 配对" }
//   type 必须是 catalog.dataTypes 里登记的 id；required 省略时视为必填

// Provide
{ "tool": "fastp", "version": "0.23.x", "access": "cli", "install": "conda", "note": "..." }
//   tool/version/access 必填；access ∈ catalog.providesAccess；install ∈ catalog.installMethods
//   version 必须写：版本漂移是生信复现性的主要杀手，这里强制显式记录

// Feed —— 声明"本模块的输出通常喂给谁"
{ "target": "asm_spades", "viaType": "clean-reads", "note": "清理后的读长直接进入组装" }
//   target 必须存在于 manifest/注册表；viaType 必须能被 target 的 inputs 接受，否则构建失败

// Usage
{ "label": "基本用法", "lang": "bash", "code": "fastp -i R1.fq.gz -I R2.fq.gz -o R1.clean.fq.gz -O R2.clean.fq.gz" }

// Param
{ "flag": "-q", "default": "15", "note": "低质量碱基阈值；低于此值的碱基会被修剪" }
```

## 4. 数据类型：连线的硬约束

连线合不合法由 `type`（经 `catalog.dataTypes[].shape`）判定，不看名字。
`shape` 取值：`any`、`sequence`、`sequence-set`、`table`、`alignment`、`tree`、`figure`、`list`、`code`。

- **同 type** → `direct`（绿，可直接连）
- **任一端是 `any`，或同 shape 不同 type** → `adapter`（黄，需人工确认格式）
- **跨 shape** → `invalid`（红，必须插入转换模块）

> 因此**不要**为了"能连上"而滥用 `any`。`any` 会把红线降级成黄线，代价是失去类型安全。
> 只有在模块真的对输入格式没有任何要求时才用 `any`。

## 5. `feeds` 怎么填

`feeds` 是这套知识系统的关键：它让"上下游关系"变成可校验的数据，而不是文档里的散文。

- 只写**真实存在**的典型下游，2–5 条即可，不要把所有可能的组合都列上。
- 判断依据：这个模块的主要产物，通常由谁来消费？
- 找不到合适下游就写 `[]`——**不要**为了凑数而连到语义不符的模块。
- `viaType` 要写你实际产出的那个类型（通常是 `outputs` 里最核心的那个）。

### 关于「参考数据库」：它是配置，不是数据流

一个常见的建模冲动是：让 `util_download_ref` 产出的数据库连到 `meta_kraken2`、`tax_gtdbtk` 这类消费方的 DB 输入端口，好像在图上表达「这个工具用哪个库」。

**本知识系统刻意不这样做。** 原因是语义上的：

- 消费方**不把数据库转换为自己的输出**。Kraken2 读一个库、输出物种组成；库本身不是它的输入数据，而是它运行的**配置**。
- 数据库的类型差异极大（k-mer 哈希表目录、BLAST 序列库、HMM 模型集），用一个通用类型承载会掩盖真实差异，而具体到每种类型的端口又会让图变得嘈杂。
- 把数据库画成数据流还暗示了一种错误的依赖：好像换了库就要重跑上游。实际上数据库只影响消费方自己。

**因此约定：参考数据库与索引通过模块的 `params` / `pitfalls` / `notes` 说明，不设端口。** `util_download_ref` 的价值在于**提醒你记录数据库版本**（版本信息是结果可比的前提），而不是在图上连一条线。

如果将来确实需要在图上表达「哪个库」，正确的做法是：先在 `catalog.dataTypes` 里登记一个语义准确的新类型（例如 `kmer-database`，而不是复用 `sqlite-db`），再给消费方加可选端口，并在端口 note 里写清版本要求。

## 5.1 端口类型选择的常见判断

写完模块后自查这几个容易搞混的取舍：

| 情形 | 该怎么选 |
|---|---|
| 通用结果表（未做统计） | `tsv-table` |
| 做过统计检验、含 p 值/q 值 | `stats-result` |
| 物种/功能 × 样本的丰度矩阵 | `abundance-table` |
| 特征 × 样本的整数计数 | `count-matrix` |
| 距离矩阵或分群结果 | `cluster-dist` |
| 只提供参考序列、不产出计算结果 | `reference-data` 的 `kind` + 序列类 type |
| 工具日志、版本信息、运行报告 | `log-report` |
| 面向人阅读的 HTML/PDF 报告 | `report` |

**不要为了「能连上」而滥用 `any`。** `any` 会把红线降级成黄线，代价是失去类型安全。只有在模块真的对输入格式没有任何要求时才用（典型例子：`wf_flexible_join` 这类适配器、以及需要人工确认目录组织方式的场景）。

## 6. 写作要求

- **正文中文，术语与代码英文**。工具名保留官方大小写（`Bakta`、`GTDB-Tk`、`fastANI`）。
- `pitfalls` 写**具体可验证**的经验，避免空话：
  - 好：`k-mer 选择错误会导致重复区塌缩；153 个以上 reads 时 SPAdes 会跳过 k=21`
  - 差：`注意参数选择`
- `params` 给**建议值 + 为什么**，而不是抄手册。
- 版本号写 `主.次` 加 `x`（如 `0.23.x`）更稳，避免频繁失效；确切的版本由使用者核对。
- 不要编造不存在的参数或输出文件名；不确定的地方写"以官方文档为准"并在 `docs` 里给出处。

## 7. 自检清单

写完一个文件后：

```bash
node tools/build.mjs --check     # 结构 / 类型 / feeds / manifest 全部核对
```

常见报错对照：

| 报错 code | 含义 | 怎么改 |
|---|---|---|
| `unknown-type` | 用了未登记的数据类型 | 改 type，或在 `catalog.dataTypes` 里登记新类型 |
| `dangling-feed` | `feeds.target` 不存在 | 改成 manifest 里的真实 id |
| `feed-type-mismatch` | 输出类型喂不进目标输入 | 改 `viaType`，或改 target 的 inputs |
| `category-file-mismatch` | 条目 category 与所在文件不符 | 移动条目或改 category |
| `summary-too-long` | summary 超 60 字符 | 精简 |
| `what-too-short` | `what` 少于 2 段 | 补第 2 段 |
| `duplicate-id` | id 撞车 | 改 id |
