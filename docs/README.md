# 文档索引

本目录是这套知识系统的**论述层**：面板负责「把流程画清楚」，文档负责「把取舍讲清楚」。两者共用同一份模块数据（`data/modules/*.json`）。

> 文档正文为中文，工具名、代码、模块 id 与文件名保留英文。英文入口见仓库根目录的 [README.en.md](../README.en.md)。

---

## 从哪里开始

| 你的目标 | 从这里开始 |
|---|---|
| 第一次接触这个项目 | [第 0 章 · 总览与学习路径](guidebook/00-overview-and-learning-path.md) |
| 想先看看面板长什么样 | [在线面板](https://indigo-rain.github.io/bioinfo-guidebook/) |
| 要新增或修改模块 | [模块条目规范](reference/module-schema.md) → [参与贡献](CONTRIBUTING.md) |
| 构建/测试报错 | [错误与故障排查](reference/troubleshooting.md) |
| 想知道哪些数据仍需核对 | [数据质量审查](reference/quality-review.md) |
| 想了解系统设计 | [系统架构](ARCHITECTURE.md) |

## 指南（12 章）

指南按「上游 → 核心 → 下游」组织，与面板的分析层一致。每章结构固定：这一层要回答什么问题、输入输出与中间文件、工具拼装思路、关键参数取舍、常见坑、与面板模块 id 的对应。

| 章节 | 主题 |
|---|---|
| [00](guidebook/00-overview-and-learning-path.md) | 总览与学习路径 |
| [01](guidebook/01-environment-and-conventions.md) | 环境与工程规范 |
| [02](guidebook/02-upstream-qc.md) | 上游数据质控 |
| [03](guidebook/03-genome-assembly.md) | 基因组组装 |
| [04](guidebook/04-assembly-qc.md) | 组装质量与污染评估 |
| [05](guidebook/05-taxonomy-identification.md) | 分类鉴定与物种注释 |
| [06](guidebook/06-annotation-resistance-virulence.md) | 功能注释、耐药与毒力 |
| [07](guidebook/07-comparative-pangenome.md) | 比较基因组与泛基因组 |
| [08](guidebook/08-metagenome-microbiome.md) | 宏基因组与微生物组 |
| [09](guidebook/09-transcriptome-differential-expression.md) | 转录组与差异表达 |
| [10](guidebook/10-downstream-analysis-visualization.md) | 下游分析与可视化 |
| [11](guidebook/11-workflow-reproducibility.md) | 工作流引擎与可重复性 |

## 参考文档

| 文档 | 回答什么问题 | 维护方式 |
|---|---|---|
| [模块条目规范](reference/module-schema.md) | 一个模块条目有哪些必填字段、子结构与写作要求？ | 手工维护，是权威契约 |
| [工具索引](reference/tool-index.md) | 本库收录了哪些工具、版本与获取方式？ | 由数据生成，勿手工编辑 |
| [参数速查表](reference/param-cheatsheet.md) | 这个参数在什么情况下该改？ | 手工维护 |
| [错误与故障排查](reference/troubleshooting.md) | 出现某个现象时该查哪里？ | 按「问题现象」索引 |
| [数据质量审查](reference/quality-review.md) | 哪些问题已修、哪些仍待联网核对？ | 审查记录，保留历史证据 |

## 系统与协作

| 文档 | 内容 |
|---|---|
| [系统架构](ARCHITECTURE.md) | 数据模型、构建流程、关键取舍与验证分层 |
| [参与贡献](CONTRIBUTING.md) | 新增模块 / 预设 / 数据类型 / 面板改动的完整步骤 |
| [Contributing (English)](CONTRIBUTING.en.md) | 英文贡献入口，详细规则以中文版为准 |
| [更新日志](../CHANGELOG.md) | 版本变更记录 |
| [许可证说明](../LICENSE-docs) | 文档与数据的 CC BY 4.0 授权范围 |

## 写作与维护约定

- **模块 id 是契约。** 文档中用反引号引用的模块 id（如 `qc_fastp`）会在构建时核对是否真实存在；不要写一个「看起来像」的 id。
- **版本号写「主.次.x」。** 确切版本由使用者核对；不写版本号等于放弃复现性。
- **不确定就写「以官方文档为准」。** 不编造参数名、默认值或输出文件名。
- **写判断依据，不写工具清单。** 「什么时候用 A 而不是 B」比「A 有哪些功能」有用。
- **`pitfalls` 要具体可验证。** 好的例子：「k-mer 选择错误会导致重复区塌缩；153 个以上 reads 时 SPAdes 会跳过 k=21」。差的例子：「注意参数选择」。
- **改完跑构建。** `node tools/build.mjs --check` 会核对文档中的模块引用与预设文档链接；提交前再跑 `--strict`。

完整的提交前检查清单见 [CONTRIBUTING.md 第 9 节](CONTRIBUTING.md#9-提交前检查清单)。

---

<p align="center">
  <a href="../README.md">← 返回仓库首页</a>
</p>
