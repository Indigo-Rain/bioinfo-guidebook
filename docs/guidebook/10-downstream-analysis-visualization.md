# 第 10 章 下游分析与可视化

## 10.1 这一层要回答什么问题

上游与核心分析产出的是**一堆表**：每个样本一份质控 JSON、每个基因组一份注释统计、一张丰度矩阵、一张差异结果表。这些东西单独看都有意义，但没人能从三十个 TSV 里读出结论。下游这一层要回答的就是三个问题：

1. **这些表怎么读进来，而且读对了？** 不是「pandas 能不能读 TSV」，而是「我有没有把工具特有的注释行、缺失值写法、id 列类型显式说出来」。
2. **表的结构对不对？** 统计检验与绘图都要求**一行一个观测**的长表（tidy 形态）。而工具输出几乎总是宽表（物种 × 样本、基因 × 样本）。这个转换是整个下游层最常需要、也最容易做错的一步。
3. **用什么统计、画什么图、按什么规范输出？** 这一步的产出是给人看的：合作者、审稿人、半年后的你自己。

这一层与前面所有层的区别在于：**它的错误几乎全是静默的**。组装参数错了，QUAST 的 N50 会变；而下游的错误不会——`merge` 丢了半个组的样本，图照画；`padj` 忘了用，火山图上会多出几百个「显著」点；`SEPT1` 被 Excel 转成日期，文件里那一格就变成了 `9/1/2024`，而程序读的时候看不出任何异常。

因此本章的重点不是工具清单，而是**判断依据**：什么情况用 Python，什么情况用 R，什么情况下必须先停下来做一致性校验。

把这一层的错误按「能不能被发现」分成三类，能帮你判断该在哪里花时间：

| 错误类型 | 例子 | 会不会被发现 |
|---|---|---|
| **会报错的错误** | `sep` 写错后数值列变字符串、文件路径不存在 | 会。运行时立刻中断，成本最低 |
| **会改变行数的错误** | `inner merge` 丢样本、`dropna()` 删掉半个组 | 不一定。只有当你去看 `shape` 时才会发现 |
| **不改变任何形状的错误** | 坐标差 1、样本顺序错位、`log2FC` 方向反了、Excel 改写基因名 | **不会**。图照画，统计照跑，只有结论是错的 |

第三类是真正危险的，也是本章反复强调「断言」与「显式声明」的原因：**唯一可靠的防线是在每一步的入口写一条可执行的校验**，而不是靠人记得检查。

### Python 与 R 的分工判断依据

这是被问得最多、也最容易被答成「哪个更好」的问题。正确的问法不是哪个语言强，而是**你这一步的主要工作是什么**。

| 判断依据 | 偏 Python | 偏 R |
|---|---|---|
| 主要工作是**流程内的自动化**（批量循环、调用外部命令、解析几十种日志格式、生成报告） | ✅ | |
| 主要工作是**统计建模**（线性模型、混合效应、负二项、生存分析、组成性数据专用方法） | | ✅ |
| 主要工作是**出版级绘图**（期刊尺寸、矢量输出、复杂分面与注释） | | ✅ |
| 需要接入的生态在新工具上（深度学习、单细胞、结构预测、最新聚类方法） | ✅ | |
| 需要接入的生态在经典统计与生态学上（vegan、phyloseq、limma、DESeq2、ape、ggtree） | | ✅ |
| 数据是**流式的大文件**（几十 GB FASTQ、上亿行 BAM 记录） | ✅ | |
| 数据是**中小规模的矩阵**（几千 × 几百） | 都可以 | 都可以 |

真实的项目**通常是两个都用**，而分工点在数据落盘的边界上：

```
工具输出 (TSV/CSV)
   │
   ├─ Python：读取、校验、整理、合并、导出整洁长表  ──┐
   │                                                  │  ← 边界：UTF-8、无行名、显式列类型的 TSV/CSV
   └─ R：统计建模、出版级绘图 ←──────────────────────┘
```

这条边界必须是**文件**，不是内存里的对象传递。理由有三条：

- **可追溯**：出错时你能回答「这个矩阵是从哪几个文件、以什么顺序合并来的」。
- **可中断**：统计与绘图是反复迭代的过程，不必每次重跑上游。
- **可复现**：跨语言的隐式传递（reticulate、rpy2）会让环境依赖变得极难固定，而文件交换没有这个问题。

### 两语言间的表格式契约

只要有一次不遵守，就会得到很难查的错。把这四条当成硬约定：

| 约定 | 具体要求 | 违反后的现象 |
|---|---|---|
| 编码 | UTF-8（无 BOM）；Windows Excel 需要时另存一份带 BOM 的副本 | 中文列名/物种名变乱码，或在 R 里读成 `NA` |
| 行名 | **不写行名**；样本/特征标识作为普通的一列 | 多出一列无名列，下次读入又多一列，逐次累积 |
| 列类型 | 显式声明：id 与样本名列一律 `str`/`character` | 基因名被猜成数值或日期，合并时全对不上 |
| 缺失值 | 全项目统一一种写法（建议空字符串或 `NA`） | 出现名叫 `-` 的分组，被当成一个真实的实验组 |

这四条本身不产生任何科学结论，但它们决定了你的结论**能不能被别人复查**。

### 数据流的正确形态：整洁长表

这是本章最需要建立的一个概念。工具输出与统计输入的形状不同：

```
宽表（工具输出）——物种 × 样本         长表（tidy）——每行一个观测
species        S1     S2     S3        sample  species       abundance  group
Escherichia    0.42   0.11   0.63      S1      Escherichia   0.42       control
Bacteroides    0.08   0.55   0.02      S1      Bacteroides   0.08       control
                                       S2      Escherichia   0.11       treat
                                       S2      Bacteroides   0.55       treat
```

为什么统计与绘图都要求长表？因为几乎所有的分析问题都可以写成「按某个变量分组，看另一个变量是否不同」——而这正是长表的列结构。分组信息（`group`）只有变成一列，才能一次性地喂给 `groupby`（pandas）、`aes(fill = group)`（ggplot2）、`hue`（seaborn）。

**宽表转长表是下游层最常需要的一步**：pandas 里是 `melt`，tidyverse 里是 `pivot_longer`。判断该不该转只需要问一句：**我要按什么分组、比较什么变量？** 如果答案是「按 group 比 abundance」，那就必须转成长表。反过来的长转宽（`pivot` / `pivot_wider`）通常只在整理给合作者看的汇总表时需要。

## 10.2 输入、输出与中间文件长什么样

### 输入：四类典型文件，四类典型麻烦

| 输入 | 常见来源 | 它带来的麻烦 |
|---|---|---|
| 工具报告表 | QUAST `transposed_report.tsv`、CheckM2、BUSCO | **注释行**。表头前面还有 `#` 开头的若干行，直接读会让整列变字符串 |
| 丰度/计数矩阵 | Kraken2 + Bracken、MetaPhlAn、featureCounts、Salmon | **方向不统一**。有的行是物种，有的行是样本；有的首列是 id，有的首列是行号 |
| 差异/统计结果表 | DESeq2、limma、`py_scipy_stats` | **缺失值与特殊值**。`padj` 为 `NA`（被独立过滤）、`p = 0`、`log2FC = Inf` |
| 距离矩阵与聚类结果 | `r_vegan_diversity`、fastANI、`py_sklearn_cluster` | **冗余与对称性**。方阵有重复信息；三角不等式在二次变换后被破坏 |

读进来的第一件事永远是三行校验，而不是开始分析：

```python
import pandas as pd

stats = pd.read_csv("03_annotation/BUSCO_summary.tsv", sep="\t",
                    comment="#", dtype={"sample": str},
                    na_values=["", "NA", "-", "N/A"])
print(stats.shape)                 # 行数列数是否与预期一致
print(stats.dtypes.value_counts()) # 数值列是不是真的数值
print(stats.isna().sum().sum())    # 缺失值有多少，是否在预期范围
```

```r
library(readr)

stats <- read_tsv("03_annotation/BUSCO_summary.tsv",
                  col_types = cols(sample = col_character(), .default = col_guess()),
                  na = c("", "NA", "-", "N/A"))
dim(stats)
sapply(stats, class)
colSums(is.na(stats))
```

**认真看 `readr` 打印的类型提示**。它是 R 侧少有的「主动告诉你它猜了什么」的机制，一行提示能省掉几小时的排查。

### 三个真实输入的读入写法

**① 带注释行的工具报告（QUAST `transposed_report.tsv`）**

```python
import pandas as pd

# QUAST 报告前面有若干 # 行，表头不在第 1 行。
# 不给 comment="#" 的话，整个数值列会变成 object 类型而不报错。
quast = pd.read_csv("03_annotation/quast/transposed_report.tsv",
                    sep="\t", comment="#", dtype={"Assembly": str})
print(quast.shape, quast.dtypes.value_counts())   # 这一步必须看
```

**② 丰度表（Bracken / MetaPhlAn 输出，首列是分类单元）**

```python
abundance = pd.read_csv("04_quant/bracken_species.tsv",
                        sep="\t", index_col=0,   # 首列是物种名，不是行号
                        dtype=str)               # 先全读字符串，禁用自动推断
for column in abundance.columns:                 # 逐列显式转数值
    abundance[column] = pd.to_numeric(abundance[column], errors="raise")
assert abundance.index.is_unique, "物种名有重复，先确认是不是分类层级混了"
```

`dtype=str` 再逐列 `to_numeric` 是刻意的：**让「哪一列不是数值」变成一个明确的报错位置**，而不是让 pandas 悄悄留下一个 object 列，等到 `groupby().mean()` 时才以奇怪的方式失败。

**③ 差异结果表（DESeq2 / limma 输出，含 `NA` 与极值）**

```r
library(readr)
res <- read_tsv("05_stats/deseq2_diff.tsv",
                col_types = cols(feature = col_character(), .default = col_guess()),
                na = c("", "NA", "NA_character_"))
cat("特征数:", nrow(res), " padj 为 NA:", sum(is.na(res$padj)),
    " log2FC 为 Inf:", sum(is.infinite(res$log2FoldChange)), "\n")
```

第三类输入里最容易被忽略的是 **`padj` 为 `NA`**。它来自独立过滤（independent filtering），含义是「该特征的信息量不足以做出可比判断」，与「检验后不显著」不是一回事。把 `NA` 行当 `ns` 删掉，方法学上就说不清了。导出时应把三类行分开标注（`filtered` / `significant` / `ns`）。

### 中间文件：每一步都落盘

下游层的中间产物不是可有可无的缓存。一个只存在于内存里的中间结果等于不可复现，而且在结果异常时无法判断是哪一步出的问题。

| 中间文件 | 建议命名 | 类型 |
|---|---|---|
| 清洗与整理后的表 | `_cleaned.tsv` / `_tidy.tsv` | 通用表格 |
| 分析用表（已连接元数据） | `_analysis.csv` | CSV |
| 距离矩阵 | `.dist.tsv` | 聚类与距离 |
| 排序/降维坐标 | `.coords.csv` | CSV |
| 统计结果 | `.stats.tsv` | 统计结果 |
| 图 | `.pdf` + `.png` | 矢量图 + 图片 |
| 溯源清单 | `run_manifest.tsv` | 日志与统计报告 |

**图的格式要成对输出**：`.pdf`（或 `.svg`）给投稿与无损缩放，`.png`（≥ 300 dpi）给汇报与网页。只出其中一种，早晚要在某个场合临时重做。

### 一个可用的目录布局

```
project/
├── 00_raw/              # 只读
├── 03_annotation/  04_quant/       # 上游产物与定量矩阵
├── 05_stats/            # 中间表：cleaned / tidy / analysis
├── 09_results/figures/  # .pdf + .png 成对
├── 09_results/tables/   # 交付汇总表（CSV 为权威版本）
└── 10_logs/             # 日志、run_manifest.tsv、checksums.sha256
```

关键纪律只有一条：**图与表全部由脚本从 `05_stats/` 里的中间表生成，绝不手工编辑**。手工改过一次图，它就不再是数据的函数了。

### 输出：三条交付线

| 交付对象 | 形态 | 硬要求 |
|---|---|---|
| 你自己 / 合作者复查 | 汇总表 CSV + 交互式 HTML（`viz_plotly`） | 表里要能看出是哪次运行产生的 |
| 论文投稿 | 矢量图 PDF/SVG + 补充材料表 CSV | 字号在最终物理尺寸下可读；配色色盲友好 |
| 长期归档 | 中间表 + 图 + `run_manifest.tsv` + `checksums.sha256` | 六个月后能回答「这些数字是怎么算出来的」 |

## 10.3 工具拼装思路（含选择决策树）

### 决策树 1：用 Python 还是 R

```
这一步的核心工作是……
├─ 批量调用外部工具、解析几十种日志、生成 HTML 报告
│     → Python（py_pandas_io → py_export_report）
├─ 统计建模：线性模型 / 负二项 / 协变量校正 / 组成性数据
│     → R（r_limma_stats、r_deseq2_object），
│       或 Python 侧通用检验（py_scipy_stats）+ 明确的局限说明
├─ 出版级绘图：期刊尺寸、复杂分面、树上注释 → R（viz_ggplot2、viz_tree_plot）
├─ 流程内自动出图的质控图（机器上没有 R） → Python（viz_seaborn）
└─ 两个都要做
      → 在「整洁长表」这个文件边界上切分，不要用 reticulate 传对象
```

### 决策树 2：图用什么画

| 你的需求 | 用什么 | 为什么 |
|---|---|---|
| 统计图形（箱线、柱状、散点、分面） | `viz_ggplot2` / `viz_seaborn` | 图层语法，同一份数据能批量产出整套图 |
| 矩阵结构（表达矩阵、存在/缺失矩阵） | `viz_heatmap` | 行列表聚类 + 注释色条；Python 侧用 `clustermap` |
| 群落差异（alpha/beta 多样性） | `viz_alpha_beta` | 必须带轴解释百分比；NMDS 必须报 stress |
| 差异结果（火山图、MA 图） | `viz_volcano_ma` | 必须用校正后 p 值；MA 图是判断可信度的诊断工具 |
| 多集合交叠（核心/附属基因、多组差异交集） | `viz_upset` | 4 个以上集合的韦恩图无法正确表达所有区域 |
| 组成（物种堆叠） | `viz_composition_bar` | Top N 与合并策略必须写进图注 |
| 跨层级流向（读长归因、门到属到种） | `viz_sankey_flow` | 只在数据满足节点守恒时使用 |
| 饱和/深度评估 | `viz_rarefaction_curve` | 判断「测的够不够」，也是发现深度失衡样本的手段 |
| 进化树 + 元数据 | `viz_tree_plot` | 支持度必须标在分支上，否则只是探索图 |
| 多轨道基因组全景 | `viz_circos` | 轨道数控制在 3~5 层 |
| 探索阶段（样本上千、需要悬停筛选） | `viz_plotly` | 交互图的主场 |
| **投稿** | `viz_pub_style` + 上面任一静态方案 | **不要用交互图**，见下文 |

### 决策树 3：什么时候需要换个存储格式

```
表的规模？
├─ 几十万行以内
│     → CSV / TSV，够用且人人能读
├─ 上百万行，或需要在 Python 与 R 之间反复往返
│     → io_interop_standard（Parquet / Arrow / Feather）
└─ 需要按坐标随机访问
      → io_compress_index（bgzip + tabix / samtools index）
        CSV 做不到这件事，不要试图用 grep 代替索引
```

### 上游接进来的四种典型拼法

**拼法 A：解析工具日志 → 项目级汇总**

```
qc_multi_qc (log-report) ──┐
asmqc_quast (report)    ──┼─→ py_pandas_io ─→ py_pandas_tidy ─→ py_export_report
asmqc_checkm2 (tsv-table)─┘                        │
                                                   └─→ viz_ggplot2 ─→ viz_pub_style
```

**拼法 B：丰度矩阵 → 统计 → 出版图（跨语言）**

```
meta_bracken (abundance-table)
   └─→ r_read_import ─→ r_tidyverse ─→ r_vegan_diversity ─→ viz_alpha_beta
```

拼法 B 的边是**类型对得上但语义要注意**的典型：`r_vegan_diversity` 接受 `abundance-table`，但它内部要求**行是样本、列是特征**，而多数工具输出的丰度表正好相反。类型检查不会拦下这个错误，只有你自己会。

**拼法 C：泛基因组 → 存在/缺失矩阵 → 集合与结构图**

```
pange_panaroo (tsv-table)
   ├─→ comp_gene_presence ─→ viz_upset      # 核心/附属/特有基因的交集
   ├─→ comp_gene_presence ─→ viz_heatmap    # 基因存在/缺失矩阵的结构
   └─→ pange_core_align ─→ phy_iqtree ─→ viz_tree_plot
```

`viz_upset` 在这里有一个语义陷阱：它展示的是**精确组合**（恰好属于这些集合、不属于其它），而不是「至少属于这些集合」。讨论核心基因组（「在 ≥ 95% 基因组中出现」）时必须改用累积统计，否则图与文字说的不是同一件事。

**拼法 D：群落表 → 多样性 + 差异丰度（必须跨语言）**

```
amplicon_phyloseq (feature-table)
   ├─→ r_vegan_diversity ─→ viz_alpha_beta     # 多样性与排序
   └─→ py_pandas_tidy ─→ （差异丰度专用方法） ─→ viz_volcano_ma
```

拼法 D 值得单独说一句：`py_scipy_stats` 能对丰度表跑出 p 值，但**相对丰度是组成性数据**，常规检验会产生大量假阳性。这条路径上真正该用的是 ANCOM-BC、ALDEx2 这类专门方法。面板允许你连上 `py_scipy_stats`，它也会算出结果——这正是需要读者自己把住的地方。

### 面板上的连线颜色在这一层意味着什么

| 颜色 | 在这一层的典型场景 | 该怎么办 |
|---|---|---|
| 🟢 绿 | `stats-result` → `viz_volcano_ma` | 直接连，语义也一致 |
| 🟡 黄 | `tsv-table` → `r_read_import`；`dataframe` → `viz_ggplot2` | **确认格式真的对得上**：分隔符、列类型、行列方向 |
| 🔴 红 | `tree` → `py_pandas_io`（跨了 shape） | 中间插转换模块（如 `io_newick_convert`） |

黄色是本层最常见的颜色，也是最需要警惕的：**它是「可能对得上」而不是「对得上」**。`dataframe` 这种内存对象类型跨语言传递时必须落盘，而落盘格式决定了下一步能不能读。

## 10.4 关键参数取舍

### 读取与整理

| 参数 | 常用值 | 什么情况下该改 |
|---|---|---|
| `sep`（pandas `read_csv` / R `read_tsv`） | `"\t"` | **必须显式给**。默认逗号会把 TSV 读成单列且不报错 |
| `dtype`（id 列） | `{"sample": str}` / `col_character()` | 永远要给。让 pandas 自己猜是基因名被转成日期的根源 |
| `na_values` | `["", "NA", "-", "N/A"]` | 补上你这个工具特有的缺失写法；不补会出现名叫 `-` 的分组 |
| `comment` | `"#"` | 工具报告有注释行时必给（QUAST、CheckM2 都有） |
| `index_col` | `0` | 首列确实是标识时给；否则会多出一个 `Unnamed: 0` |
| `usecols` | 只列需要的列 | 结果表有几十列时，省内存也省得看错列 |
| `merge(validate=)` | `"many_to_one"` / `"one_to_one"` | **最省事的防错参数**，让 pandas 主动报键重复 |
| `merge(how=)` | `"left"` | 整理阶段用 `left` 保留主表全部行，便于发现匹配失败；`inner` 会静默丢样本 |
| `melt(value_name=)` | 显式命名 | 不写会让值列叫 `value`，多张表合并时撞名 |

### 统计

| 参数 | 常用值 | 什么情况下该改 |
|---|---|---|
| 多重校正方法 | `fdr_bh`（Benjamini-Hochberg） | **不要用 `multipletests` 的默认 `hs`**（控制 FWER，几千次比较时几乎不会有显著结果） |
| 校正范围 | 全部检验的 p 值一次性校正 | 绝不能按物种/基因分批校正——分批会让每一批都有人为的显著结果 |
| `number`（limma `topTable`） | `Inf` | **默认只返回 10 行**。忘了改，后续校正只针对 10 个特征，而结果看起来完全正常 |
| `equal_var`（t 检验） | `False`（Welch） | 两组方差悬殊或样本量不等时必须改 |
| 效应量 | 与 p 值一起报 | 大样本下极小的差异也能达 `p < 0.05`；只报 p 值会把统计显著误当生物学重要 |
| `n`（每组样本数） | ≥ 3 | n = 2 时任何差异结论都不可靠，此时应报描述性统计与置信区间，而不是 p 值 |
| 组成性数据 | ANCOM-BC / ALDEx2，或先做 CLR/ILR | 相对丰度总和恒为 1，常规检验会产生大量假阳性 |

### 排序与聚类

| 参数 | 常用值 | 什么情况下该改 |
|---|---|---|
| `cmdscale(eig=)` | `TRUE` | 要算解释度就必须给；负特征值必须从分母里排除 |
| `adonis2(permutations=)` | `999` | 决定 p 值的最小可分辨值；样本少想要更小 p 需更多置换 |
| `adonis2(by=)` | `"terms"` | 多因素模型要报告各项边际效应时改 `"margin"` |
| `betadisper` | 必须做 | 与 PERMANOVA 一起报。组内离散度不等时 PERMANOVA 的显著是伪影 |
| `metaMDS(k, trymax)` | `2, 20` | k = 2 时 stress > 0.2 可试 k = 3；`set.seed` 必须固定 |
| `KMeans(random_state, n_init)` | `0, 10` | **必须固定种子**，否则每次运行分组都不同 |
| `scale()` / `StandardScaler` | 特征量纲差异大时必须做 | 不做等于隐含「方差大的特征更重要」 |
| 距离度量 | 按数据性质显式选择 | 欧氏 / Bray-Curtis / Jaccard 会给出不同分组，没有「哪个更对」 |

### 出图

| 参数 | 常用值 | 什么情况下该改 |
|---|---|---|
| `base_size`（ggplot2） | 11 是屏幕默认，**投稿图偏大** | 单栏图通常 7~9 pt；按**最终物理尺寸**输出后实测 |
| `width/height/units` | 显式给，`units = "cm"` | 期刊按厘米给尺寸；用英寸会算错字号。**每次 `ggsave` 都要给**，不指定会沿用当前设备尺寸 |
| `dpi` | 300（线条图部分期刊要 600） | 位图必须达标。矢量格式不受 dpi 限制但字号仍要检查 |
| `device = cairo_pdf` | `cairo_pdf` | 含中文标签时必须用，否则换机器打开变方框 |
| `aes(colour = )` 的位置 | 写在 `aes()` **内部** | 写在外部只是设一个固定颜色，不会按分组区分 |
| `facet_wrap(scales=)` | `"free_y"` | 多指标同图时必给，否则量纲小的指标被压成一条线 |
| 配色 | viridis / ColorBrewer | **禁彩虹色盘（rainbow/jet）、禁红绿对比** |
| `include_plotlyjs`（plotly） | `True` | 离线分发必须 `True`；`'cdn'` 在没有网络的机器上打开是空白页 |

### 导出与交付

| 参数 | 常用值 | 什么情况下该改 |
|---|---|---|
| `to_csv(index=)` / `write.csv(row.names=)` | `False` | **几乎总是要给**；不写会多出一列无名行号，下次读入又多一列 |
| `encoding` | `utf-8` | 需要 Windows Excel 直接打开时用 `utf-8-sig`（Python）/ `write_excel_csv`（R） |
| `float_format` | `'%.4g'` | 不设会让浮点结果出现十几位无意义小数，读者无法判断有效精度 |
| 表名 | 能区分 `_all` 与 `_significant` | 把未过滤结果与筛选结果混在一起交付，接收方分不清哪张是结论 |
| 交付规模 | 单表约 100 万单元格以内用 xlsx | 超过就改用 CSV——几十万行的 xlsx 文件巨大且打开极慢 |
| 报告内容 | 全部由代码从结果表生成 | **手抄数字是引入不一致的最快方式**，而且事后无法发现 |
| 报告头部 | 生成时间 + 工具版本 + 实际命令 | 只有数值的汇总表在三个月后连作者自己都看不懂 |

一份可交付的报告至少要能回答「它是哪个样本或基因组、用了什么工具与版本、参数是什么、什么时候生成的」。这四件事的成本是几行代码，收益是这个结果从「一次性输出」变成「可追溯的产物」。`py_export_report` 与 `r_export_table` 都提供了把溯源信息写进文件头部（`#` 注释行）的写法，照抄即可。

## 10.5 常见坑

### 坑 1：Excel 会静默破坏你的 CSV

这是本章最需要记住的一条，因为它发生在**程序之外**，所以任何校验脚本都看不见。用 Excel 打开一个 UTF-8 CSV 时，它会自动「帮你」转换：

| 原始值 | Excel 打开后 | 后果 |
|---|---|---|
| `SEPT1`、`MARCH1`、`DEC1` | `9/1/2024` 之类的日期 | 基因名彻底消失，且**存盘时被写回文件** |
| `1000000001`（长数字 id） | `1E+09` | 科学计数法，末几位丢失 |
| `0012` | `12` | 前导零消失 |

**因此权威版本必须是 CSV，xlsx 只作浏览用。** 结果表一律导出 CSV（`to_csv(index=False)` / `write_csv`）并当作唯一权威版本；需要给合作者「好看」的文件时另存一份 xlsx，并在文件里写明「此文件仅供浏览，权威版本见 xxx.csv」；流程必须产出 xlsx 时**同时导出一份 CSV**，不要只留 xlsx。

补充细节：Excel 打开无 BOM 的 UTF-8 CSV 时中文可能乱码，跨 Windows 交付时用 `utf-8-sig`（Python）或 `readr::write_excel_csv`（R）。

### 坑 2：合并静默丢样本

```python
merged = long.merge(meta, on="sample", how="inner")   # 少了 40% 的行，但不会报错
```

样本名不一致是这一层最常见的失败原因，形式包括：大小写差异、连字符 vs 下划线、前后空格、`.fq.gz` 后缀。整理前先做集合差集，把差异**打印出来**：

```python
missing = set(long["sample"]) - set(meta["sample"])
assert not missing, f"这些样本在元数据里找不到：{sorted(missing)[:10]}"
```

再加一道行数断言：`how="inner"` 之后行数变了、`how="left"` 之后 NaN 突然变多，都是键不匹配的明确信号，必须当场查清而不是继续往下走。

### 坑 3：统计结果全是显著

微生物组与转录组项目里，「一切都有显著差异」不是发现，而是流程出问题的症状。四个叠加原因：

1. **没做多重校正**。几千次检验，即使单次假阳性率只有 5%，也会产生数百个「显著」结果。
2. **用了 `'hs'` 而不是 `'fdr_bh'`**。`multipletests` 默认方法控制 FWER，在几千次比较时过严——症状相反，是**全不显著**。
3. **组成性数据用了常规检验**。相对丰度总和恒为 1，一个物种上升必然导致其它下降。必须用 ANCOM-BC、ALDEx2 等方法，或先做 CLR/ILR 变换。
4. **样本量太小**。每组 n = 3、做上百次比较时，结果极不稳定。先看分组样本数，再看 p 值。

**"全不显著"同样值得怀疑**：如果 p 值直方图接近均匀分布，说明几乎没有真实信号——此时任何「显著」结果都更可能是假阳性，而不是发现。

### 坑 4：图不可读

发表级图的规范不是审美问题，是可读性问题。四条硬要求：

| 要求 | 具体标准 | 常见违反 |
|---|---|---|
| **字号** | 必须在**最终物理尺寸**下可读（单栏约 8.3 cm） | 屏幕上 12~14 pt 看着舒服，缩到 8.3 cm 后不可读 |
| **配色** | 色盲友好 + 灰度可辨 | 用 rainbow/jet 表示连续量（感知不等距，造出假分界）；用红绿区分分组（约 8% 男性读者无法区分）；超过 6~7 组仍只用颜色 |
| **误差线** | 图注写明是 **SD / SEM / 95% CI** 中的哪一个，以及 **n 是多少** | 只画误差线不说明含义——三者宽度差别很大，读者无法解读 |
| **图注** | 让图能**独立读懂**：检验方法、阈值、是否校正、n | 把统计分析只写在正文；坐标轴不带单位；对数轴不标 log10 |

几条具体的操作性建议：用 `viz_pub_style` 把字号、配色、输出尺寸固化成 `theme_project()` 之类的函数，所有图调用它；**批量出图必须显式给 `width`/`height`/`units`**；箱线图**必须叠加散点**（`geom_jitter` / `stripplot`），否则会掩盖样本数（n = 3 与 n = 30 看起来一样）与分布形状；拼多指标用 `facet_wrap(scales = "free_y")`；排序图必须报**轴解释百分比**（二维合计低于 20% 时不足以代表数据结构）；NMDS 必须报 **stress**（> 0.2 时结果不可用）；从 UMAP/t-SNE 图上**不能**推断簇间距离。

### 坑 5：把探索图当投稿图

`viz_plotly` 生成的交互式图非常适合探索（样本上千时可以逐点查看、点图例筛选分组）和网页交付。但**投稿仍需静态矢量图**：期刊要求 PDF/SVG 或 ≥ 300 dpi 位图，交互功能在纸上毫无意义；浏览器渲染截图的分辨率与字体不可控；交互图的 HTML 会把数据内嵌，几万个点就有几百 MB，归档不方便。正确做法是**两者都出**——用 plotly 探索，用 ggplot2/matplotlib 重绘最终图。Explore 与 publish 用不同工具不是浪费，它们是不同的问题。

### 坑 6：热图的标准化方向没说清

同一份矩阵，按行标准化（每个基因的 Z-score）与不标准化画出的图看起来都「像热图」，但**回答的问题完全不同**：

- 按行标准化 → 「同一基因在不同样本间的相对变化」
- 不标准化 → 绝对水平，而且会被少数高表达基因主导

**图注必须写明选了哪一种。** 相关矩阵或 Z-score 热图还必须让 0 落在色标中点（`center = 0` 且 `vmin/vmax` 对称），否则视觉上会把弱相关夸大成强相关。多张热图要互相比较时，必须固定 `breaks` / `colorRamp2` 的范围——自动范围会让不同的图看起来一样。

### 坑 7：坐标与 id 的静默错位

这一类错误不报错、不改变行数、只改变含义：

- **坐标体系**：GFF/VCF 是 1-based 闭区间，BED 是 0-based 半开区间，Biopython 内部是 0-based。转换时必须显式加减 1 并写断言校验
- **矩阵方向**：`vegan` 要求行是样本、列是特征，而多数工具输出的丰度表相反。转置这一步要写进代码并加 `stopifnot`
- **样本顺序**：limma、DESeq2、`dist`、`hclust` 都按**位置**对齐，不按名字。进入这些函数前一律 `stopifnot(identical(colnames(expr), meta$sample))`
- **标识符体系**：`GCF_000001` 与 `GCF_000001.1` 做交集会人为地为空

共同的解法是**在每一步的入口加一条断言**。断言的成本是一行代码，收益是把静默错误变成显式报错。

### 坑 8：性能与内存的隐形天花板

下游层的代码通常不是算得慢，而是**在错误的地方慢**，甚至慢到让人以为「这个分析做不了」。几个高频原因：

| 症状 | 真正的原因 | 怎么改 |
|---|---|---|
| 处理几十万行的表时内存爆掉 | 用 Python 列表套列表代替 NumPy 数组（5000×5000 浮点矩阵在列表里大近一个数量级） | 用 `py_numpy_arrays`，必要时分块 |
| 逐行遍历 DataFrame 慢到不可用 | `iterrows()` 是 Python 层循环，比向量化慢一到三个数量级 | 改成列运算 / `groupby().transform()` |
| 读 CSV 花了几分钟 | 结果表有几十列而只用其中 5 列 | `usecols` 只读需要的列 |
| 跨语言反复往返 | 每一步都存 CSV 再读回来 | 用 `io_interop_standard`；只在表足够大时才值得 |
| 画图时卡住 | 几万个点用 SVG 渲染（`go.Scatter`） | 改 `go.Scattergl`，或先聚合/抽样 |

反过来的纪律同样重要：**不要为了性能牺牲可追溯性**。该落盘的中间表还是要落盘。慢几分钟和无法复现，不是同一量级的代价。

### 坑 9：手工后处理让图脱离数据

用 Illustrator 拼图、加字、调图例是常规操作，问题不是「不能用」，而是**它让图不再是数据的函数**：数据更新后手工调过的图不会自动更新；图的生成过程无法由代码复现；同一篇文章里不同图的字号与配色会漂移。判断标准很简单：**能代码化的部分必须先代码化**——拼版用 `patchwork` / `gridspec`，标注用 `geom_text` / `annotate`，尺寸统一用 `viz_pub_style` 的样式函数。Illustrator 只留给确实无法代码化的最后一步。

### 交付前自检清单

把下面这几条当成交付前的固定动作，每一条都对应本层的一个高频错误：

```
[ ] 每张输入表的 shape / dtypes / 分组样本数都打印过，且符合预期
[ ] 所有样本名在元数据里都能找到（集合差集为空）
[ ] merge 之后的行数与预期一致（inner 没丢、left 没多出 NaN 分组）
[ ] 所有 p 值都做过一次性多重校正，方法写进了方法学
[ ] p 值有对应的效应量与 n；样本量不足的组已明确标注
[ ] 权威结果表是 CSV 且已用程序读回验证（不是 xlsx）
[ ] 每张图都在最终物理尺寸下看过，字号可读
[ ] 配色色盲友好、灰度可辨；没有用彩虹色盘与红绿对比
[ ] 误差线说明了是 SD/SEM/CI；图注写了 n、检验方法、阈值与是否校正
[ ] 图与表全部由脚本生成，没有手工编辑过的产物
[ ] 报告里有生成时间、工具版本、实际命令与输入校验和
```

## 10.6 与面板模块 id 的对应

在面板里搜索下面的 id 即可定位模块。共 30 个模块，分三组。

### Python 数据处理（`downstream-python`，layer = downstream）

| 模块 id | 一句话说明 |
|---|---|
| `py_pandas_io` | 把工具产出的各种结果表读成 DataFrame，显式声明分隔符、注释行与列类型 |
| `py_pandas_tidy` | 宽表转长表、多表按唯一键合并，把数据整理成统计与绘图的标准输入 |
| `py_numpy_arrays` | 用向量化替代 Python 循环处理表达矩阵、距离矩阵与覆盖度数组 |
| `py_scipy_stats` | 组间检验与多重校正，并提醒组成性数据不能直接用常规检验 |
| `py_sklearn_cluster` | PCA/UMAP 降维与 k-means/层次聚类，距离度量必须显式选择 |
| `py_biopython` | 小规模但格式杂的序列与注释读写；坐标体系转换必须显式处理 |
| `py_pysam` | 按坐标访问 BAM/VCF 提取自定义统计量；依赖索引且需 `until_eof` 才能全量遍历 |
| `py_export_report` | 把结果收敛成交付表与 HTML 报告，并把版本与参数写进报告头部 |
| `py_snakemake_py` | 用 Snakemake rule 把 Python 处理步骤串成可重跑的任务图（模板，需按项目改写） |

### R 数据处理与统计（`downstream-r`，layer = downstream）

| 模块 id | 一句话说明 |
|---|---|
| `r_read_import` | 用 readr/readxl 读入结果表并显式声明列类型，注意类型猜测提示 |
| `r_tidyverse` | dplyr/tidyr 的筛选、分组汇总与长宽表转换，注意 `ungroup` 与 join 丢样本 |
| `r_vegan_diversity` | alpha/beta 多样性、PCoA/NMDS/CCA 与 PERMANOVA，行必须是样本、列是特征 |
| `r_matrix_stats` | base R 与 ape 的矩阵运算、距离计算、patristic 距离与拓扑比较 |
| `r_limma_stats` | 线性模型 + 经验贝叶斯收缩的差异分析，设计矩阵与对照方向是关键 |
| `r_export_table` | write_csv / openxlsx / flextable 导出，表格由代码生成而不是手抄 |
| `r_deseq2_object` | 计数数据的负二项模型差异分析，前置判断与诊断图不可省 |
| `r_survival_meta` | 效应量合并与元分析（metafor/survival）：把多个研究或队列的效应量合成一个总体估计 |

### 可视化与图表（`visualization`，layer = viz）

| 模块 id | 一句话说明 |
|---|---|
| `viz_ggplot2` | 图层语法画统计图形，同一份数据批量产出整套图并保持配色一致 |
| `viz_seaborn` | Python 侧带统计聚合的快速绘图；无头服务器必须设 `Agg` 后端 |
| `viz_heatmap` | 聚类热图展示矩阵块结构；标准化方向与色标范围必须显式说明 |
| `viz_alpha_beta` | alpha 多样性箱线图与 beta 多样性排序图；轴解释度与 stress 必须报 |
| `viz_volcano_ma` | 火山图与 MA 图；必须用校正后 p 值，MA 图用于判断低丰度端可信度 |
| `viz_plotly` | 交互式图表，用于探索与网页交付；**投稿仍需静态矢量图** |
| `viz_composition_bar` | 群落组成堆叠柱状图；Top N 与合并策略必须写进图注 |
| `viz_rarefaction_curve` | 稀释曲线与累积曲线，用来判断测序深度是否足够、泛基因组是否饱和 |
| `viz_upset` | 多集合交集可视化；展示的是精确组合而不是「至少属于这些集合」 |
| `viz_sankey_flow` | 丰度流向与桑基图，只在数据满足节点守恒时使用 |
| `viz_tree_plot` | ggtree/iTOL 把树与元数据一起画；支持度与定根是前提 |
| `viz_circos` | 基因组环形图叠加多轨道；轨道数控制在 3~5 层 |
| `viz_pub_style` | 出版级图的可执行规范：字号、配色、尺寸、dpi 与图注要求 |

### 常与本层配合的模块

`io_interop_standard`（数据量大到 CSV 不够用时，在 Python 与 R 之间传 Parquet/Arrow）、`io_compress_index`（按坐标随机访问大盘文件）、`util_rename_manifest`（统一样本命名——它是坑 2 的根治手段）、`util_args_validate`（流程开头的输入检查）、`wf_reproducibility`（生成随结果归档的溯源清单）。

## 10.7 延伸阅读

**同一套指南里相关章节**

- [第 0 章 总览与学习路径](00-overview-and-learning-path.md)——第 0.5 节的三个工程习惯（目录结构、产物非空、记录版本）在下游层同样适用
- [第 8 章 宏基因组与微生物组](08-metagenome-microbiome.md)——组成性数据与差异丰度方法的来源
- [第 9 章 转录组与差异表达](09-transcriptome-differential-expression.md)——`stats-result` 表怎么来的，决定了火山图能说什么
- [第 11 章 工作流引擎与可重复性](11-workflow-reproducibility.md)——把本章的脚本固化成可重跑的流程

**参考文档**

- [工具索引](../reference/tool-index.md)——本层 30 个模块用到的全部工具与版本
- [参数速查表](../reference/param-cheatsheet.md)——按「什么情况下该改」组织的参数清单
- [错误与故障排查](../reference/troubleshooting.md)——从现象出发：「图不可读」「统计结果全是显著」怎么查
- [模块条目规范](../reference/module-schema.md)——`params`、`pitfalls`、`docs` 字段的写法约定

**需要建立的两个习惯**：① 任何进入统计的表，先打印 `shape`、`dtypes`、分组样本数——这三行输出能拦下本章提到的绝大多数问题；② 任何交付的图，先按最终物理尺寸导出再看一遍，屏幕上好看与纸面上可读是两件事。
