# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] — 2026-11-06

首个公开版本。

### 中文

**新增**

- 交互式 pipeline 拼装面板（单个自包含 `index.html`，离线可用）：拖拽模块、按数据类型判定连线、实时校验、适配器推荐。
- 160 个分析模块、20 个分类、33 种数据类型、5 个分析层。
- 12 条端到端预设流程，覆盖 16S、宏基因组、MAG、细菌基因组、耐药/毒力、泛基因组、菌株传播、真菌 ITS、病毒组与 RNA-seq。
- 12 章指南（约 6,400 行）与 5 份参考文档（模块规范、工具索引、参数速查、故障排查、质量审查）。
- 三种导出：管线 JSON（可回导）、Bash、Python。
- 单一数据源构建链：`data/modules/*.json` → `index.html`、`data/bundle.json` 与工具索引。
- 构建期强制校验：`feeds` 目标存在性、端口兼容性与「来源模块确实产出该类型」；自包含扫描；确定性构建。
- 48 项单元测试、12 条预设 × 3 种导出验证、CI（Node 18/20/22）。
- 中英文 README、双语贡献指南、Issue/PR 模板、引用元数据与许可证（代码 MIT，文档与数据 CC BY 4.0）。

**已知限制**

- 版本号为「主.次.x」系列近似；17 个工具的版本写法跨模块不一致，10 条 version 字段不是版本号。
- 面板不执行分析；导出脚本是结构骨架与参数起点。
- 拖拽/连线/缩放等 DOM 交互尚未纳入自动化测试。

### English

**Added**

- Interactive pipeline builder (a single self-contained `index.html`, fully offline): drag-and-drop modules, data-type-driven edge validation, live issue reporting and adapter suggestions.
- 160 analysis modules, 20 categories, 33 data types and 5 analysis layers.
- 12 end-to-end workflows covering 16S, metagenomes, MAG binning, bacterial genomes, resistance/virulence, pangenomes, strain transmission, fungal ITS, viromes and RNA-seq.
- A 12-chapter guide (~6,400 lines) and 5 reference documents (module schema, tool index, parameter cheatsheet, troubleshooting, quality review).
- Three exports: pipeline JSON (re-importable), Bash and Python.
- A single-source build pipeline: `data/modules/*.json` → `index.html`, `data/bundle.json` and the tool index.
- Build-enforced validation: `feeds` target existence, port compatibility and "the source module actually produces this type"; self-containment scan; deterministic builds.
- 48 unit tests, 12 workflows × 3 export checks, CI on Node 18/20/22.
- Bilingual README, bilingual contributing guides, issue/PR templates, citation metadata and licensing (MIT for code, CC BY 4.0 for docs and data).

**Known limitations**

- Versions are series approximations of the form `major.minor.x`; 17 tools are written inconsistently across modules and 10 version fields are not version numbers.
- The panel does not run analyses; exported scripts are structural skeletons with parameter starting points.
- DOM interactions (drag, connect, zoom) are not yet covered by automated tests.

[Unreleased]: https://github.com/Indigo-Rain/bioinfo-guidebook/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Indigo-Rain/bioinfo-guidebook/releases/tag/v1.0.0
