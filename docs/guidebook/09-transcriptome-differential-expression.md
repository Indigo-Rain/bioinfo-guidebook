# 第 9 章 转录组与差异表达

> 细菌 RNA-seq 的软件生态几乎全部继承自真核（HISAT2、DESeq2、edgeR、Salmon 都诞生于真核问题），
> 但细菌数据有两处根本不同：**mRNA 没有 poly(A) 尾**，以及**基因密度高、操纵子与重叠基因普遍**。
> 前者让文库构建的路线完全改变，后者让「这条读长算谁的」变成一个必须显式决定的问题。
> 本章的重点就是这两处差异如何在参数、文件和统计假设上落地。

## 9.1 这一层要回答什么问题

细菌转录组分析通常在回答三类问题，它们对设计的要求不同：

| 问题类型 | 需要什么设计 | 主要难点 |
|---|---|---|
| 两种条件下哪些基因差异表达 | 每组 ≥ 3 个**生物学**重复 | 归一化假设、低表达过滤、重复数 |
| 操纵子/调控元件的边界与共表达 | 同上，但对深度要求更高 | 操纵子内的基因计数高度相关，不是独立证据 |
| 时间序列 / 剂量响应 | 多时间点 + 生物学重复 | 设计矩阵、连续变量建模，不是「两两比较拼起来」 |

### 9.1.1 细菌 RNA-seq 与真核的五个关键差异

这一节是整章的地基。把差异记住，后面的参数选择基本都是它的推论。

| | 真核 | 细菌 | 后果 |
|---|---|---|---|
| **mRNA 富集方式** | oligo(dT) 富集 poly(A) 尾 | **绝大多数 mRNA 没有 poly(A) 尾** | 照搬 oligo(dT) 会得到**几乎空的文库**；必须用 rRNA 去除（rRNA 消耗）建库 |
| **rRNA 占比** | poly(A) 富集后残留较低 | 常占 **90% 以上**（rRNA 本身最丰度、操纵子高拷贝） | **rRNA 去除是整套流程的成败关键**，值得单独作为一步来评估 |
| **基因结构与密度** | 外显子/内含子，剪接普遍，基因间距大 | 无内含子，基因密度极高，**操纵子与重叠基因普遍** | 剪接感知的比对器无优势；一条读长常能同样好地匹配多个基因 → ambiguous |
| **参考注释** | 每个基因常有多个转录本 | 通常**一个基因一条转录本** | 转录本水平定量的收益有限；isoform 分配能力用不上 |
| **注释来源** | Ensembl/RefSeq 规范统一 | Prokka / Bakta / NCBI 的 GFF 特性类型与属性名各不相同 | 计数阶段 `-t` / `-g` 必须按实际注释改，写错会导致计数为 0 |

**从这五条推出的三条硬结论**：

1. **rRNA 去除不是可选项，而是整套流程的分水岭。** 它做不好，后面会得到「比对率很高但差异表达几乎什么都没有」的结果（残留 rRNA 读长能 100% 比对到参考基因组的 rRNA 操纵子，把整体比对率抬得很高）。
2. **不要照搬真核的比对参数。** `--dta`、`--rna-strandness` 这类为真核转录组设计的选项在细菌上没有额外价值；真正要小心的是多重比对与链特异性。
3. **每组 3 个生物学重复是底线，不是理想值。** 这一条在本章反复出现，因为它是唯一无法用分析技巧弥补的设计问题（见 9.5.6）。

### 9.1.2 「生物学重复」这四个字的严格含义

在往下读之前先把这件事定死，因为细菌转录组里最常见的伪重复就藏在这里：

- **同一个 RNA 提取物分 3 个管去建库测序** → 这是**技术重复**。它能减少测序噪声，但完全不能估计生物学变异。用它当 n=3 会让离散度被严重低估，p 值被系统性放大。
- **同一瓶培养物分 3 次取样提取 RNA** → 仍然不是独立重复，它只反映提取与操作的变异，不反映培养之间的变异。
- **3 次独立的培养（不同克隆、不同起始接种量、不同时间点单独起瓶）** → 这才是生物学重复。差异表达的所有推断都建立在它的变异之上。

实验记录里必须能回答「这 3 个重复之间除了编号，还有什么不同」。如果答案是「没有」，那不是 n=3。

## 9.2 输入、输出与中间文件长什么样

### 9.2.1 输入

| 输入 | 形式 | 关键要求 |
|---|---|---|
| 测序读长 | `*_R1.fastq.gz` / `*_R2.fastq.gz` | rRNA 去除**之前**的质控报告与之后必须分开保存，不要混在一张表里 |
| 参考基因组 | 单株（或同种）高质量完成图 FASTA | 与注释**同版本、同坐标**；记录 accession 与下载日期 |
| 注释 | GFF3/GTF | 必须先看第三列（feature 类型）与第九列（属性名）：细菌常见 `CDS` + `locus_tag`，或 `gene` + `ID` |
| 样本元数据 | TSV | 必须有：样本名、分组、**批次**、（时间序列）时间点；用于配对设计的 `pair` 列 |
| 建库信息 | 链特异性方法（如 dUTP）、是否去 rRNA、重复类型 | **链方向设置不能靠猜**；写错不会报错，只会让某一链方向计数系统偏高 |

**建库信息是这一步最容易缺的输入。** 具体要记三件事：用的哪种 rRNA 去除方法、是否链特异性建库（哪种）、每个样本的重复类型（生物学 / 技术）。第三项尤其重要——它决定了后面能不能把「重复」当作独立观测。

### 9.2.2 中间文件

```
00_raw/            R1.fastq.gz / R2.fastq.gz
01_clean/          *.clean.fq.gz                         # fastp 之后
02_rrna/
  ├── *.nonrrna.fq.gz                                    # rRNA 去除后（必须是 FASTQ，不能是 FASTA）
  ├── rrna_stats.tsv                                     # 每样本：去除前/后 rRNA 占比、剩余读长数
  └── rrna_ref_versions.txt                              # 参考库/模型版本
03_align/
  ├── reference/ref.fa, ref.fa.{bt2,ht2l}, ref.gff       # 参考与索引放共享目录，注明版本
  └── *.sorted.bam, *.sorted.bam.bai                     # 按坐标排序并建索引
04_counts/
  ├── counts.txt, counts.txt.summary                     # featureCounts 矩阵 + 分配汇总
  └── salmon/{sample}/quant.sf                           # 转录本（或基因）水平估计计数与 TPM
05_de/
  ├── dds.rds, results_<contrast>.csv                    # DESeq2 对象与结果表
  ├── edger_ql_results.csv                               # edgeR QL 结果（做一致性对比）
  ├── sizeFactors.tsv / normFactors.tsv                  # 归一化因子（诊断用，别丢）
  └── diagnostics/                                       # PCA、样本聚类、p 值直方图、MA 图
06_enrich/         go_bp.csv, go_cc.csv, go_mf.csv, kegg.csv
09_results/        volcano.pdf, ma.pdf, heatmap.pdf
10_logs/           版本、命令、比对率与分配率汇总
```

### 9.2.3 三类文件的内容要点

**① `counts.txt.summary`（featureCounts 分配汇总）——最被忽略、信息量最大的文件**

它逐样本列出每类分配结果。要看的不是 `Assigned` 有多大，而是**未分配的部分由什么构成**：

| 行 | 含义 | 偏大说明什么 |
|---|---|---|
| `Assigned` | 成功分到基因 | 比例本身不说明质量，要看下面几行 |
| `Unassigned_NoFeatures` | 比对上了但不在注释内 | **rRNA 残留**、UTR、操纵子间区、未注释的小 RNA，或注释缺失/坐标错位 |
| `Unassigned_Ambiguity` | 落在多个基因上（重叠基因/操纵子） | 细菌里天然偏高；偏得异常说明注释有问题 |
| `Unassigned_MultiMapping` | 多重比对且超过 `-M` 门槛 | 旁系同源基因、可移动元件、rRNA 残余拷贝 |
| `Unassigned_Unmapped` / `Unassigned_MappingQuality` | 未比对上 / 比对质量低于门槛 | 参考不匹配、去宿主残留、`-M` 设得过高 |

**这一份文件直接告诉你上游哪一步有问题**，比看差异表达结果表有效得多。

**② 计数矩阵的硬性要求**

- **必须是整数计数。** 不要把 TPM/FPKM 送进 DESeq2/edgeR：这两个模型依赖原始计数的方差结构，输入已归一化的连续值会让离散度估计失效，得到的 p 值不可信。
- **列必须按样本名对齐，不能按位置。** featureCounts 按命令行里 BAM 的顺序排列列，一旦顺序错位，所有下游结论都会错，而且不会有任何报错。给 featureCounts 一次传入所有 BAM 比逐样本计数再合并更安全。
- 如果用了 `--fraction`，计数会变成小数。DESeq2 可以接受（tximport 路线也是估计计数），但**必须在方法里说明**。

**③ 结果表的最小列集合**

DESeq2/edgeR 的结果表至少应包含：`baseMean`、`log2FoldChange`（或 `logFC`）、`lfcSE`、`pvalue`、`padj`。同时必须能回答两个问题：**对比的是谁减谁**（contrast）、**设计公式是什么**（design）。缺了这两条，结果表在三个月后连你自己都看不懂。

`pvalue` 主要用于排序与诊断（p 值直方图是判断模型是否合理最快的手段）；`padj` 才是判断显著性的依据。

### 9.2.4 每一步的校验点

| 步骤 | 要看的量 | 合理区间 / 异常信号 |
|---|---|---|
| 质控 | 每样本 clean 读长数 | 同批样本之间不应差一个数量级 |
| **rRNA 去除** | **去除前后 rRNA 占比 + 剩余读长总数（两个都要看）** | 残留应降到个位数百分比；剩余读长数骤降说明把 mRNA 一起丢了 |
| 比对 | 比对率、**落在 rRNA 区域的读长比例** | 高比对率不等于数据可用；rRNA 区比例必须单独统计 |
| 比对 | 多重比对比例 | 细菌里天然偏高；异常高说明参考里有大量近缘重复序列 |
| 计数 | `Assigned` + 三类 `Unassigned` 的相对大小 | 见上表；`Unassigned_NoFeatures` 偏高先怀疑 rRNA 残留 |
| 计数 | `-s` 链方向 | 用两种设置各计数一次，**正确设置下 `Assigned` 比例明显更高** |
| 归一化 | `sizeFactors` / `normFactors` 在样本间的分散度 | 某个样本偏离其余样本很多 → 先查该样本的 rRNA 残留与总读长，而不是直接信它 |
| 建模前 | 样本 PCA / 层次聚类 | 样本按分组聚类而不是按批次聚类；有明显离群样本要先处理 |
| 结果 | p 值直方图、MA 图 | 直方图接近均匀分布 + 没有显著基因 → 通常是效能不足或分组不分离，不是「没有差异」 |
| 结果 | 两套方法（DESeq2 / edgeR）的交集 | 不一致集中在低表达基因；如果结论对工具敏感，报告交集而不是挑一个 |

---

## 9.3 工具拼装思路（含选择决策树）

### 9.3.1 总决策树

```
文库是怎么建的？
├── 用了 oligo(dT) / poly(A) 富集 ──→ 停下来。细菌 mRNA 大多没有 poly(A) 尾，
│                                     这条文库基本是空的，先确认建库方案
└── 用了 rRNA 去除 ──→ 继续
         ↓
     rRNA 去除效果核查（见 9.5.1）——不通过就回到这一步，不要往下走
         ↓
     计数路线 还是 定量路线？
     ├── 计数路线：tran_hisat_align / Bowtie2 → tran_featurecounts → tran_deseq2 / tran_edger
     │      适合：有高质量参考基因组与注释；需要基因水平结果；需要能追溯到读长
     └── 定量路线：tran_salmon_quant → tximport → tran_deseq2 / tran_edger
            适合：想避开生成/排序 BAM 的开销；关心多映射的概率分摊
            ⚠ 细菌「一基因一转录本」让 isoform 分配的优势用不上，
              这条路线的主要价值是「快 + 显式的多映射分摊」
         ↓
     设计里有批次 / 配对 / 时间点吗？
     ├── 有 ──→ 把协变量写进 design（推荐），或先做矩阵校正（只用于可视化）
     └── 没有 ──→ 直接建模
         ↓
     低表达基因过滤（必须在建模前，规则先定）→ 归一化 → 离散度 → 检验
         ↓
     诊断（PCA、p 值直方图、MA 图）→ 用第二套方法做一致性对比
         ↓
     富集分析（用同一套注释自建 TERM2GENE 表，背景 = 过滤后剩下的基因）
```

对应面板预设 `preset-rnaseq-deseq2`（8 个节点）：

```
qc_fastp → tran_rrna_remove → tran_hisat_align → tran_featurecounts → tran_deseq2
                                                                  ├→ tran_go_enrich
                                                                  ├→ viz_volcano_ma
                                                                  └→ viz_heatmap
```

注意这个预设的默认顺序里有两个可替换点：`tran_hisat_align` 在细菌上并不是最优选择（见 9.3.3），`tran_featurecounts` 也可以换成 `tran_salmon_quant`。预设给的是**能跑通的骨架**，不是「唯一正确路线」。

### 9.3.2 rRNA 去除：三条实现路线

| 路线 | 判据 | 强项 | 弱项 |
|---|---|---|---|
| 比对到 rRNA 参考库（SortMeRNA） | 序列相似性 | 快、结果可解释、命中即丢弃 | **依赖参考库覆盖度**；非模式菌、新属的 rRNA 可能没收录，命中率偏低 |
| 模型判定（RiboDetector） | 训练模型打分 | 不依赖参考库；对非模式菌更稳 | 需要正确的读长参数；模型有适用域 |
| 比对到自建参考（Bowtie2 / minimap2） | 序列相似性 | 完全可控，可用本株基因组提取的 rRNA 建库 | 要自己做；阈值需要自己定 |

**怎么选**：模式菌（大肠杆菌、枯草杆菌、金葡等）用任一条都行；**非模式菌或新属优先用 RiboDetector**，因为参考库覆盖度是第一种路线的硬上限。遇到「SILVA 里只有近缘种条目、命中率明显偏低」的情况，换模型判定或从本株基因组提取 rRNA 自建参考，通常比反复调阈值有效。

**三条不能违反的纪律**：

1. **不要串联两种方法做「双重去除」。** 两者判据不同，串联会累积假阳性、系统性丢掉真实 mRNA，而且出了问题无法归因。正确做法是选一种方法，再用**独立手段**核查残留（例如把保留的读长再比一次 rRNA 参考，或用 Kraken 2 看物种组成里 rRNA 相关类群的比例）。
2. **`SortMeRNA` 必须加 `--fastx`。** 不加时输出是 FASTA，**质量值会全部丢失**，而文件仍能正常打开、下游也照样能跑——因此这个错误极难察觉。需要质量信息的场合只能回到原始数据重做。
3. **去 rRNA 之后不要复用之前的质控结论。** 读长组成已经变了（GC 分布与过度代表序列都会明显不同）；把去 rRNA 前后的报告混在一张表里比较，会得出与事实相反的结论。

**`--paired_in` 的取舍**：任一端命中 rRNA 就丢弃整对，比只丢命中端更保守；代价是可能连带丢掉真实的 mRNA 对。低深度样本上这个代价不可忽略。

### 9.3.3 比对：HISAT2 的剪接感知在细菌上「无用武之地」

这是一个需要诚实说清楚的结论：

> **HISAT2 的核心卖点是剪接感知（splice-aware）**——它会用已知剪接位点与链方向建模，允许一条读长跨越内含子。
> **细菌基因几乎没有内含子。** 因此在细菌数据上，这项能力不产生额外价值：`--dta`、`--rna-strandness` 这类为真核转录组设计的选项不会改善结果。
> 而 Bowtie2 更小更快、参数语义更透明；BWA-MEM 在细菌里同样是常见选择。

那细菌上真正要小心的是什么？是**另一半**：

- **基因密度极高、操纵子与重叠基因普遍**，一条读长常常能同样好地匹配到多个基因上。比对器只能在参考序列层面报告多个同等最优的比对及相应比对质量；至于「这条读长算谁的」，是**计数阶段必须显式做的决定**。
- 因此本步骤的输出必须**保留比对质量与多重比对信息**，不要在比对阶段就用质量阈值把低质量比对记录整批丢掉——那等于把分配决策交给比对质量的具体实现，而且丢掉了后面做敏感性分析的可能。

**参考与注释必须配套**：FASTA 与 GFF 必须来自同一次提交、同一套坐标。用 A 版本的 FASTA 配 B 版本的 GFF，比对能跑完、计数也能出结果，但基因坐标是错的——**这是最难发现的一类错误**。

**索引不要每个样本重建一次**：细菌基因组索引几分钟就能建好，但批量运行时反复重建会浪费大量机时。把索引放共享目录，并在目录名或 README 里写清参考版本。

### 9.3.4 计数还是定量：featureCounts vs Salmon

这是本章第二个真正的路线分歧。**判断依据不是「哪个更准」，而是你的参考与问题形态**：

| | featureCounts（计数路线） | Salmon / kallisto（定量路线） |
|---|---|---|
| 输入 | 排序后的 BAM + GFF/GTF | 读长 + 转录本核酸 FASTA（细菌通常用 CDS） |
| 输出 | **整数**计数矩阵 + 分配汇总 | 估计计数（`numReads`，可能非整数）+ TPM |
| 多映射处理 | **显式参数**决定（默认丢弃 ambiguous） | EM 算法按概率分摊（显式建模） |
| 速度 | 慢（要先比对、排序） | 快（省掉 BAM 的生成与排序） |
| 可追溯性 | 强：能从计数回到具体读长与坐标 | 弱：只有概率分摊结果 |
| 主要风险 | ambiguous 读长被系统性丢弃 → 相关基因计数被压低 | CDS-only 参考丢掉 UTR/间区读长；同源基因家族互相「分摊」 |
| 适合 | 需要基因水平结果、需要溯源、注释质量好 | 想要快、关心多映射的显式处理、样本量大 |

**为什么细菌走 Salmon 路线要重新评估收益**：Salmon/kallisto 在真核里的头号价值是**isoform 分配**。细菌注释通常**一个基因一条转录本**，这项能力用不上，于是这条路线的价值缩水成「快 + 对多映射的概率分摊」。这是个合理的理由，但**不是「因为工具更新就换」的理由**。

**Salmon 路线在细菌上的两个特有前提**：

1. **参考必须是转录本核酸序列而不是基因组。** 一般来自注释产物的 CDS 文件。
2. **CDS-only 参考会系统性丢掉 UTR 与基因间区读长。** 细菌 mRNA 有 5' UTR、操纵子间隔区与大量小 RNA，这些读长在参考里没有位置，表现为**匹配率天然偏低**。这不是数据质量问题；应与 featureCounts 的 `Unassigned_NoFeatures` 对照来看，而不是直接判定测序失败。

**最实用的建议：两条路线都跑，然后对比。** 差异特别大的基因通常正是重叠或多映射的那些——而这些基因往往恰好是研究对象，值得单独检查。

**为什么 `numReads` 和 TPM 都不能直接喂给 DESeq2/edgeR**：

- `numReads` 是估计值，应通过 `tximport` / `tximeta` **连同平均转录本长度一起**交给模型，让长度偏倚作为偏移量（offset）处理。`tximport` 的 `type=` 必须与定量工具一致（`salmon` / `kallisto`），写错会让长度偏移与计数都对不上，而 R 不会报错。
- TPM 已经同时做了长度与深度归一化，把它当计数送进去会让**高表达的短基因被系统性高估**。这个做法在文献里很常见，但它仍然是错的。

### 9.3.5 差异表达：DESeq2 与 edgeR 怎么选

两者同属负二项家族，多数数据集上给出一致的显著基因集合。选择依据是**你的设计有多复杂、以及你更担心哪一类错误**：

| | DESeq2 | edgeR |
|---|---|---|
| 默认归一化 | median-of-ratios（RLE 思路） | **TMM** |
| 检验框架 | Wald / LRT（负二项 GLM） | `exactTest`（两组无协变量）/ `glmQLFit` + `glmQLFTest`（拟似然） |
| 小样本、担心假阳性 | 可用，但离散度估计依赖先验 | **QL 框架**额外引入基因级方差膨胀因子，对假阳性的控制通常更好 |
| 复杂设计（连续变量、多因素、交互） | 默认流程更省事 | 需要手写设计矩阵与 contrast |
| 效应量收缩 | `lfcShrink`（apeglm / normal）用于排序与可视化 | 无同类默认流程 |

**在细菌数据上，TMM 常被优先选择**，原因是它对「少数基因极端高表达」的抵抗力更强——而细菌 RNA-seq 恰好容易出现这种情况（rRNA 残留、高表达操纵子）。TMM 先指定参考样本，按 M 值（表达量比值对数）与 A 值（平均表达量）做双端修剪，再用剩余基因计算缩放因子。

**选择建议**：

- 简单两组比较、样本量很小、最担心假阳性 → edgeR 的 QL 框架。
- 需要连续变量、多因素设计、或想用收缩后的 log2FC 排序与可视化 → DESeq2 的默认流程。
- **两者不一致时不要挑一个更好看的。** 不一致的部分通常集中在低表达基因与离散度估计困难的地方；正确做法是两套都做、报告交集，并说明差异部分。

**`exactTest` 不支持协变量**：把批次、时间点写进设计后必须换用 `glmQLFit`/`glmLRT`，否则你会在「已经校正了批次」的错觉下得到混杂的结果。

### 9.3.6 批次校正：选一种，不要叠加

`tran_batch_correct` 提供两条路，它们的**位置不同、后果也不同**：

| 做法 | 位置 | 输出能用在哪 |
|---|---|---|
| 把 `batch` 写进 `design`（如 `~ batch + condition`） | 建模内部 | 可以继续做检验（**推荐**） |
| 矩阵校正（`comBat_seq` / `removeBatchEffect`） | 建模之前 | `comBat_seq` 的输出是计数，可继续建模；**`removeBatchEffect` 的输出不是计数，只能用于可视化** |

三条纪律：

1. **不要校正两次。** 先校正矩阵、再把 `batch` 写进设计公式，等于批次方差被重复扣除，真实差异会被压缩。要么写进设计，要么先校正再跑不含批次项的分析，**两者不要叠加**。
2. **`removeBatchEffect` 绝不能拿去跑 DESeq2/edgeR。** 它改变了数据的分布与方差结构。把它当作「已校正的表达矩阵」继续做统计检验是常见的严重误用。
3. **批次与分组完全混杂时，统计上无解。** 每个批次只有一种处理时，任何校正方法都会给出看起来正常的矩阵，但生物学效应与批次效应在数学上不可分离——这不是调参能解决的，只能回到实验设计或补做样本。部分混杂时校正后检验效能会下降，需要在方法里说明。

**判断校正是否过头**：校正后样本应当按**分组**而不是按批次聚类，同时组间差异不能一起消失。如果校正后所有组都混在一起，很可能是校正过头了。

批次编号必须与真实来源对应并留档（测序批次、建库日期、lane、操作者）。只留一个 `batch 1/2/3` 的数字，事后既无法判断批次是否与某个已知技术因素重合，也无法在审稿人提问时解释。

### 9.3.7 富集分析：接在差异表达之后，但背景要自己定

富集分析的位置在流程末尾，但它最容易出错的地方在**输入的定义**：

- **背景（universe）不是全基因组，而是「经过表达过滤、本来有机会进入差异分析的所有基因」。** 用全基因组当背景是细菌富集分析里最常见也最严重的错误，会让 p 值系统性偏小、显著条目数量虚高。
- **细菌没有现成的物种注释包。** 把真核的注释包套在细菌基因 ID 上，得到的「富集」没有任何生物学意义；必须用 `anno_eggnog` / `anno_kofamscan` / `anno_interpro` 的注释产物**自建 TERM2GENE 表**。
- **只送显著基因做 ORA 会丢掉效应量信息**，而且结果强烈依赖阈值：把 `|log2FC|` 从 1 改到 0.5，富集结果可能完全变样。显著基因数少于几十个时，优先用 GSEA 并报告排序依据（用全部基因、按统计量排序，不能先筛显著基因）。
- **GO 的三个分支（BP/CC/MF）应分别分析**，混做会让条目数膨胀、显著性被稀释。GO 条目之间高度冗余，应做冗余削减或用相似度聚类后报告代表性条目。
- **注释版本必须记录**：GO 本体与 eggNOG/KEGG 数据库都在持续更新，同一基因集在不同版本下富集结果会变化。

**预筛选会让 p 值不再具有标称性质**：你用 padj < 0.05 与 `|log2FC| > 1` 筛出基因列表再去做富集，这个 p 值已经不能按标称意义解释。阈值必须与富集结果一起报告。

### 9.3.8 拼装骨架

```bash
#!/usr/bin/env bash
set -euo pipefail
mkdir -p 10_logs
{ uname -a; conda list; } > 10_logs/env.txt 2>&1
# ← 参考基因组与注释的 accession、版本、下载日期写进 10_logs/ref-versions.txt

# 1) 质控
fastp -i R1.fq.gz -I R2.fq.gz -o 01_clean/R1.clean.fq.gz -O 01_clean/R2.clean.fq.gz \
      -j 10_logs/fastp.json -h 10_logs/fastp.html

# 2) rRNA 去除（细菌流程的分水岭）
# 路线 A：比对到 rRNA 参考库
sortmerna --ref silva_rrna.fasta --reads 01_clean/R1.clean.fq.gz \
          --fastx --paired_in --out2 --other 02_rrna/R1.nonrrna.fq.gz
# ← 必须加 --fastx，否则输出 FASTA、质量值全丢
# 路线 B：模型判定（非模式菌优先）
ribodetector_cpu -t 16 -l 150 -e norrna \
  -i 01_clean/R1.clean.fq.gz 01_clean/R2.clean.fq.gz \
  -o 02_rrna/R1.nonrrna.fq.gz 02_rrna/R2.nonrrna.fq.gz
# ← -l 必须与实际读长接近；-e 的取值先在小样本上确认，写反会得到相反结果
# 然后必须核查：去除前后 rRNA 占比 + 剩余读长总数（见 9.5.1）

# 3) 比对（细菌：剪接感知无优势，Bowtie2 同样合适）
bowtie2-build 03_align/reference/ref.fa 03_align/reference/ref.fa
bowtie2 -x 03_align/reference/ref.fa -1 02_rrna/R1.nonrrna.fq.gz -2 02_rrna/R2.nonrrna.fq.gz \
        --no-mixed --no-discordant -p 16 \
  | samtools sort -@ 8 -m 2G -o 03_align/sample.sorted.bam
samtools index 03_align/sample.sorted.bam
# ← 索引放共享目录，不要每样本重建

# 4) 计数（一次传入所有 BAM，保证注释与参数完全一致）
featureCounts -T 16 -p --countReadPairs -t CDS -g locus_tag -s 2 \
  -a 03_align/reference/ref.gff \
  -o 04_counts/counts.txt 03_align/*.sorted.bam
# ← -t/-g 必须按实际 GFF 改；-s 必须与建库方法对应（dUTP 通常为 2）
# ← 核对 Assigned 与三类 Unassigned 的相对大小

# 5) 差异表达
Rscript -e '
library(DESeq2)
cts  <- read.delim("04_counts/counts.txt", skip = 1, row.names = 1)
cts  <- cts[, 6:ncol(cts)]                      # 去掉前 5 列注释信息
meta <- read.delim("metadata.tsv", row.names = 1)
stopifnot(identical(colnames(cts), rownames(meta)))   # 顺序校验，不能省

# 低表达过滤（规则必须在看结果之前定好）
keep <- rowSums(cts >= 10) >= 3
cts  <- cts[keep, ]

dds <- DESeqDataSetFromMatrix(cts, meta, design = ~ batch + condition)
dds <- DESeq(dds)
# ← 检查 sizeFactors 在样本间是否异常分散
res <- results(dds, contrast = c("condition", "treat", "control"), alpha = 0.05)
write.csv(as.data.frame(res), "05_de/results_treat_vs_control.csv")
'
# ← 再用 edgeR 的 QL 框架跑一遍，比较两次的显著基因交集

# 6) 诊断图（不要跳过）
Rscript diagnostics.R   # PCA、样本聚类、p 值直方图、MA 图、sizeFactors 分布

# 7) 富集分析（背景 = 过滤后剩下的基因，注释自建）
Rscript enrich.R        # universe = rownames(cts)；TERM2GENE 来自 eggNOG/KofamScan
```

### 9.3.9 参数敏感性分析

对本章这些「改了就改变结论」的选择，正确做法是证明结论不敏感：

1. **固定主分析**（事先定好的参数）。
2. **扰动关键选择**：rRNA 去除方法（SortMeRNA vs RiboDetector）、`-s` 链方向（正确设置 vs 写反作为对照）、计数路线（featureCounts vs Salmon）、归一化（median-of-ratios vs TMM）、过滤阈值（`rowSums(cts >= 10) >= 3` vs 更松/更严）。
3. **比较结论层面的一致性**：显著基因的**重叠率**、log2FC 的**方向一致性**、富集结果里关键通路的保留情况。
4. **把敏感性结果写进补充材料**，并在正文说明哪些结论是稳健的。
5. **结论对某个选择高度敏感时，明说。** 这通常意味着数据本身不足以支撑强结论。

---

## 9.4 关键参数取舍

### 9.4.1 rRNA 去除

| 参数 | 建议起点 | 改了会怎样 |
|---|---|---|
| `SortMeRNA --fastx` | **必须开启** | 不加时输出 FASTA，**质量值全部丢失**，而下游照样能跑，因此极难察觉 |
| `SortMeRNA --paired_in` | 视深度决定 | 任一端命中即丢整对，更保守；代价是可能连带丢掉真实 mRNA 对 |
| `RiboDetector -l` | 与实际读长一致（如 150） | 模型按长度处理输入，偏差过大时准确率下降 |
| `RiboDetector -e` | `norrna` | **写反会得到完全相反的结果**；先在小样本上确认取值（以官方文档为准） |
| `RiboDetector --dna` | 仅用于 DNA 读长 | 对 RNA 数据误加会降低准确率 |
| `Bowtie2 -f 4`（取未比对读长） | — | 写成 `-F 4` 会反过来只保留 rRNA，**而且从读长数量上不容易立刻发现** |

### 9.4.2 比对与计数

| 参数 | 建议起点 | 改了会怎样 |
|---|---|---|
| `bowtie2 --very-sensitive` | 视需求开启 | 细菌基因组小、索引小，通常承受得起；代价是多重比对比例升高 |
| `--no-mixed / --no-discordant` | 建议开启 | RNA-seq 中这类记录多来自残留 rRNA 或重复序列，过滤后计数更干净 |
| `featureCounts -t / -g` | 按实际 GFF（细菌常见 `CDS` + `locus_tag`） | **用错会导致计数为 0 或只统计到部分基因**（例如只统计到 RNA 类基因而漏掉 CDS） |
| `featureCounts -s` | dUTP 建库通常为 `2` | 写错不会报错，但计数会系统偏向一侧。**核查方式：两种设置各计数一次，正确设置下 `Assigned` 比例明显更高** |
| `featureCounts -p / --countReadPairs` | 双端必须加 `-p` | 「按 read 还是按 fragment 计数」由 `--countReadPairs` 控制，不同版本默认行为不同，**全项目必须统一** |
| `featureCounts -O / --fraction` | 默认关闭 | 开启允许一读多基因，`--fraction` 用分数避免重复计数偏倚；计数变成小数（DESeq2 可接受），**但必须在方法里说明** |
| `featureCounts -M / --minMQS` | 默认 0 | 提高会丢掉多重比对读长，**等于在计数阶段隐式做分配决策**。先看清多重比对占多少再决定 |
| `salmon index -k` | 31 | 必须小于最短转录本长度；短基因（< 100 bp）较多时要调小，否则这些基因无法被定量 |
| `salmon quant -l` | `A`（自动检测） | **小数据量下会判错**，后果是定量结果整体偏低而不是报错。跑完必须核对文库类型统计 |
| `salmon quant --gcBias / --seqBias` | 默认关闭 | 开启明显增加时间与内存；**同一次比较里所有样本必须一致** |
| `kallisto quant -b` | 0 | 只有需要下游不确定性估计时才用；计数路线设 0 即可 |

### 9.4.3 差异表达

| 参数 | 建议起点 | 改了会怎样 |
|---|---|---|
| `design` | `~ batch + condition` | 把批次等协变量写进公式；**批次与分组完全混杂时模型矩阵不满秩，DESeq2 会报错**——这是设计问题而非参数问题 |
| 低表达过滤 | 建模前定好（如 `rowSums(cts >= 10) >= 3`） | **这是本章影响最大的一步**。不做过滤则结果表里几乎什么都没有；看完结果再调阈值属于 p-hacking |
| `estimateSizeFactors type` | `ratio`（median-of-ratios） | 在细菌上**假设容易破裂**（见 9.5.5）；必要时用 `poscounts` / `iterate`，或 `controlGenes` 指定一组管家基因 |
| `results(independentFiltering)` | `TRUE`（默认） | 它按平均表达量自动优化检验效能，**但不能替代你主动做的低表达过滤** |
| `results(alpha)` | `0.05` | 它同时影响独立过滤保留多少基因，改动它会改变被过滤掉的基因集合。**注意 DESeq2 的 `results()` 默认是 0.1**，与你论文里写的 0.05 不一致时会出现「方法里写 0.05、表里却按 0.1 过滤」的错误 |
| `lfcShrink type` | `normal`；要更准用 `apeglm` | **收缩后的 log2FC 不能用于假设检验**；p 值仍来自未收缩的模型。报告里两个数必须写清来源 |
| `minReplicatesForReplace` | 7 | 每组只有 3 个重复时**该功能不生效**，离群样本必须靠 `sizeFactors` 与样本聚类自己发现 |
| `filterByExpr`（edgeR） | 无默认 | 保留集合取决于设计矩阵；**正确顺序是定设计 → 过滤 → 归一化 → 估计离散度 → 检验** |
| `calcNormFactors method` | `TMM` | 可用 `TMMwsp` 或 RLE 做敏感性对比；TMM 与 DESeq2 的 size factor 会给出不同缩放因子，**这不是 bug** |
| `estimateDisp robust` | `FALSE` | 开启可降低离群基因影响；样本数很少时效果有限 |
| `glmTreat lfc` | 0 | 检验「效应量大于某阈值」而不是「不等于 0」；想滤掉微小但显著的差异时很有用 |
| `comBat_seq group` | 必须传 | 不传会让**生物学差异一起被扣除** |
| `comBat_seq full_mod` | `TRUE` | 设为 `FALSE` 时只做批次校正，更容易抹掉真实差异 |
| `removeBatchEffect` 的 `design` | 必须显式给出（如 `~ condition`） | 不给会把生物学效应一并扣除；**且结果只能用于可视化** |

### 9.4.4 富集分析

| 参数 | 建议起点 | 改了会怎样 |
|---|---|---|
| `universe` | **过滤后剩下的全部基因** | 用全基因组当背景是细菌富集分析里最常见也最严重的错误，p 值会系统性偏小 |
| `pAdjustMethod` | `BH` | 富集结果必须报告 padj 而不是原始 p 值 |
| `minGSSize / maxGSSize` | 10 / 500 | 过小的条目几乎必然显著却不可解释；过大的条目缺乏特异性 |
| `ont` | BP / CC / MF **分别做** | 混做会让条目数膨胀、显著性被稀释 |
| GSEA 的 `geneList` | 全部基因、按统计量排序 | 用 log2FC 时注意低表达基因的 LFC 波动很大，可改用 Wald 统计量排序 |
| `enrichKEGG organism` | 物种三字母代码 | 没有对应代码时用 `"ko"`（KO 层面）；**用错物种代码会得到完全无关的通路** |

### 9.4.5 只影响速度与资源的参数

`-p`（线程数）在比对与计数阶段几乎总该设置，否则会白等很久；`samtools sort` 的 `-@` 与 `-m` 不设时，BAM 较大容易触发磁盘临时文件，速度骤降；`salmon quant --gcBias` 明显增加时间与内存。这些参数不影响结论，但规划不当会让长任务失败或耗时翻倍。

---

## 9.5 常见坑

### 9.5.1 「去掉了 90% 的读长」既可能是好事也可能是灾难

**这是细菌 RNA-seq 里最需要讲清的一个判断。**

后接的步骤会告诉你「比对率很高、计数矩阵也非空」，但它不会告诉你**丢掉的是不是 mRNA**。唯一的可靠判据是两个指标一起看：

| 指标 | 怎么看 | 异常时的含义 |
|---|---|---|
| **① 去除前后的 rRNA 占比** | 去除前后各取一部分读长做分类（Kraken 2 的物种组成，或把保留的读长再比一次 rRNA 参考） | 残留仍在几十个百分点 → 参考库缺该物种的 rRNA（非模式菌、新属）、模型与数据不匹配，或阈值过松 |
| **② 剩余读长总数** | 与本批次其他样本、与去除前的读长数对比 | 如果本样本剩余读长比同批次其他样本低一大截 → **优先怀疑参考库覆盖度或阈值太严**，而不是认定样本里真的没有 mRNA |

**只报第一个指标是不够的**：参数过松会连带丢掉与 rRNA 有局部相似的 mRNA，表现为有效读长总数骤降、覆盖到的基因数明显变少——此时 rRNA 占比看起来很漂亮，但你把真实信号一起丢了。**只报第二个指标也不够**：残留 rRNA 会让「剩余读长数」很好看，但这些读长全部落在 rRNA 操纵子上。

**期望的结果**：残留 rRNA 降到个位数百分比，同时剩余读长数处在本批次样本的正常范围内。

**还有两个容易漏的点**：

- **「去掉了 90% 的读长」本身不是目标。** 在富培养基里的指数期培养物，rRNA 占比极高，去掉 90% 以上是正常的；低生物量样本、细胞内感染样本的 rRNA 占比天然更低。**不能用同一套阈值判断所有样本。**
- **rRNA 去除与去宿主应该串联，且顺序会影响两者的残留比例**（宿主的 rRNA 也会被一并去掉），因此两个步骤都要用同一套方法核查效果。

**一个诊断信号**：如果最终结果是「比对率很高但差异表达几乎什么都没有」，第一件事就是回去查残留 rRNA 比例，而不是去调 DESeq2 的参数。

### 9.5.2 ambiguous 读长的两种取舍：默认丢弃 vs 一读多基因

**症状**

一批基因的计数极低甚至全零，而它们在别的样本里表达正常；`counts.txt.summary` 里 `Unassigned_Ambiguity` 占比很高。

**机制**

细菌基因密度极高、操纵子与重叠基因普遍，一条读长可能同时落在两个甚至更多基因上。`featureCounts` 的**默认行为是把这类读长记为 ambiguous 而不计入任何基因**，结果是相关基因的计数被系统性压低，严重时直接低到被后续过滤掉。

**两种取舍，各有代价**：

| 选择 | 得到什么 | 失去什么 |
|---|---|---|
| **默认丢弃**（不开 `-O`） | 各基因计数之间保持近似独立 | 重叠/操纵子区域基因的计数被系统性压低，可能整批被过滤掉 |
| **允许一读多基因**（`-O`，可配 `--fraction`） | 挽回这部分计数 | **同一个 read 被数进多个基因，破坏了差异分析所依赖的「各基因计数近似独立」这一假设** |

**第二条为什么是真问题**：DESeq2/edgeR 的离散度估计与 p 值都建立在「基因之间（近似）独立」之上。把一个读长同时计入两个基因，会让这两个基因的计数人为地产生正相关，模型会把这种相关误当成生物学共表达，从而**低估离散度、抬高显著性**。操纵子内的基因本来就高度相关，所以这个问题在细菌里尤其集中。

**怎么办**

1. **先量化，再决定。** 看 `Unassigned_Ambiguity` 占多少。占比很低（例如 < 5%）时两种选择的差别可以忽略；占比很高时必须在方法里说明取舍。
2. **无论选哪种，都要写进方法。** 「是否允许一读多基因」不能默默使用——它直接改变结论强度。
3. **对关键基因做交叉验证。** 用另一条路线（Salmon 的 EM 分摊）复核那些计数差异大的基因；差异大的基因通常正是重叠或多映射的那些。
4. **不要用 `-M` 把多重比对「解决」掉。** 提高最小比对质量会丢掉多重比对读长，等于在计数阶段隐式做了分配决策，而且丢得无声无息。
5. **操纵子内的基因不要当成独立证据。** 同一个操纵子里的 5 个基因全部「显著上调」，这在统计上接近 1 条证据，不是 5 条。报告时应指明操纵子结构。

### 9.5.3 链特异性写反：最隐蔽的错误之一

**症状**：流程能跑完、矩阵也非空、差异分析也有结果。没有任何报错。

**机制**：dUTP 等链特异性建库方法决定了计数阶段该用哪种链方向设置（`-s 1` / `-s 2`）。写错时不会报错，只会让某一链方向的计数被系统性高估——如果基因组上基因分布不对称（细菌里基因在两条链上的分布通常接近均匀，但高表达区域不是），这会引入系统性偏差。

**核查方式**：**用两种设置各跑一次 featureCounts，看哪种的 `Assigned` 比例明显更高。** 这是唯一可靠的判断方法，而且成本很低。链特异性设置必须与建库方法对上，不能靠猜。

**同理适用于 Salmon**：`-l A` 自动检测在小数据量下可能判错，后果是定量结果整体偏低（大量读长被当成不符合预期链型的噪声），而不是报错。跑完必须核对文库类型统计，并与预期的链型比例对照。

### 9.5.4 低表达基因过滤必须先于建模

**症状**：结果表里几乎什么都没有；或者有几千个「显著」基因，但几乎全是低表达基因。

**机制**

- 一个基因如果所有样本加起来只有十几个计数，它几乎不可能在多重校正后显著，**却会占用检验名额、拉低整体的校正后 p 值分布**。多重校正的分母被无信息的基因撑大，真正有信号的基因反而被埋掉。
- 反过来，低计数基因的检验统计量离散、p 值分布平坦；如果离散度估计被这些基因带偏，也可能制造一批假阳性。

**怎么办**

1. **建模前过滤，规则先定。** 常用形式是「至少在若干个样本中 CPM 超过阈值」或「总计数达到下限」，例如 `rowSums(cts >= 10) >= 3`（至少 3 个样本计数 ≥ 10）。edgeR 的 `filterByExpr` 按设计矩阵与样本量自动判断，比手工阈值更有依据。
2. **规则必须在看结果之前定好并写进方法。** 看完结果再调阈值属于 p-hacking。
3. **`filterByExpr` 的保留集合取决于设计矩阵。** 先过滤、后改设计（例如合并两个组）会让过滤标准失效。**正确顺序是：定设计 → 过滤 → 归一化 → 估计离散度 → 检验。**
4. **不要用 `independentFiltering` 替代主动过滤。** DESeq2 的独立过滤是按平均表达量自动优化效能，它是有用的补充，但它发生在建模之后，不能解决「低表达基因参与离散度估计」的问题。
5. **全零基因要过滤掉，但不要把「所有样本里都为零」当成「处理后下调」。** 这类基因在数据里没有任何信息，把它们算进差异基因列表是最常见的定量错误之一。
6. **`padj` 为 NA 的行不要当「不显著」删掉。** NA 来自独立过滤，含义是「该特征的信息量不足以做出可比判断」，与「检验后不显著」不是一回事。

### 9.5.5 median-of-ratios 归一化在细菌数据上的假设破裂

这是本章最重要的统计陷阱，值得慢慢读。

**归一化在做什么**

DESeq2 的 `estimateSizeFactors(type = "ratio")` 就是 median-of-ratios（中位数比值法）。它的逻辑是：

> 对每个基因，算出它在各样本间的比值；取每个样本所有基因比值的**中位数**作为该样本的缩放因子。
> **这个做法的隐含前提是：大多数基因在样本之间不做差异表达。**

为什么要取中位数？因为在「大多数基因不变」的前提下，中位数反映的是**测序深度与文库组成的差异**，而不是生物学差异。前提成立时它非常稳健；前提破裂时，它会把生物学差异**当成**技术差异扣掉。

**细菌数据上这个前提为什么会破**

1. **基因数少。** 细菌基因组只有几千个基因（真核有两万个以上）。中位数是「多数」的代表，样本量越小越容易被少数极端值带偏。
2. **成片的差异表达是常态，不是例外。** 细菌的调控是**操纵子级别**的：一个前噬菌体被诱导、一个毒力岛被激活、一个代谢通路整体开启，会让**几十到几百个基因同时大幅变化**。这在真核里属于「少数基因变化」的情形，在细菌里可能占到基因数的可观比例。
3. **少数基因会占据大部分读长。** rRNA 残留、高表达操纵子（如核糖体蛋白、延伸因子）会让少数基因的计数比中位数高几个数量级。这些基因在中位数计算里权重不大（中位数本身抗离群值），但它们**会挤占总读长**，从而改变其他所有基因的相对比例——也就是组成性效应（见[第 8 章](08-metagenome-microbiome.md) 8.5.1，同样的机制在 RNA-seq 上同样成立）。
4. **如果某个处理组里有一个「全局上调」的调控子被激活**（例如严谨反应、热休克），那么「大多数基因不变」直接不成立，中位数比值会把这些基因的变化系统性地归一化掉。

**症状（怎么发现假设破裂）**

- `sizeFactors` 在样本之间的分散度异常：某一个或某几个样本的 size factor 明显偏离其余样本（例如偏离 2 倍以上）。这时先别急着接受——**先查这个样本的 rRNA 残留比例与总读长**，如果两者都正常，才考虑是真实的文库组成差异。
- 归一化后样本的 PCA 或表达分布出现「整体平移」：所有基因看起来都上调或都下调。
- 用不同归一化方法（median-of-ratios vs TMM vs `poscounts`）跑出来的显著基因集合差异很大。

**怎么办（四种应对，按推荐度）**

| 应对 | 做法 | 适用与代价 |
|---|---|---|
| **换归一化方法做敏感性对比** | edgeR 的 `TMM`（对少数极端高表达基因更稳健）、DESeq2 的 `poscounts` 或 `iterate` | 最省事的第一步；报告时应说明用了哪种，以及结论是否一致 |
| **指定管家基因** | DESeq2 `estimateSizeFactors(controlGenes = ...)` 用一组你确信不差异表达的基因估计因子 | 需要先验知识（如看家基因、spike-in）；选错会引入新的偏差 |
| **加内标（spike-in）** | 加入已知量的外源 RNA，用内标估计缩放因子 | 最可靠（也是唯一能做**绝对定量**的方法）；代价是实验阶段就要做，事后无法补 |
| **改变解读方式** | 只报告组内比较与效应量，不声称「全局上调/下调」 | 不能解决问题，但能避免过度解读 |

**关键提醒**：**不同归一化方法给出不同的缩放因子，同一份数据在两套流程下的显著基因集合因此不完全相同。这不是 bug。** 重要的是在同一篇分析里保持一致，说明为什么选它，并做一次交叉验证。如果结论对归一化方法敏感，那这个结论本身就不稳健。

**顺带说清一个常见误解**：中位数比值法与组成性问题是同一个硬币的两面。归一化**假设**「多数不变」来推断深度差异；当真的存在全局变化时，这两种解释在数学上不可区分——**这是 RNA-seq 相对定量的固有局限，不是软件缺陷**。想突破它必须靠外部信息（spike-in、qPCR、已知不变基因）。

### 9.5.6 n=3 是底线，不是理想值

**这是唯一无法用分析技巧弥补的设计问题。**

**症状**：3 vs 3 的比较做出了结果，显著基因列表看起来很合理。但重复一次实验，或者换一组重复，显著清单大幅变化。

**机制**

- **n=2 不算「做了两个重复」。** 离散度是所有后续推断的基础，n=2 时组内变异只有极少信息，离散度基本由先验撑着，**只有效应量极大的基因能显著**。结论不可靠。
- **n=1 时分析根本不该开始**：无法估计组内变异。
- **n=3 是能跑出可信结果的下限**，不是理想值。想检测 2 倍以内的变化、或希望结果在另一个实验室可重复，应当从设计阶段就安排 **4–6 个重复**（这也是转录组重复数 benchmark 的常见结论方向），而不是事后用统计技巧弥补。

**还有一个和 n 无关的陷阱**：`minReplicatesForReplace` 的默认值是 7，作用是自动识别并替换离群样本。**每组只有 3 个重复时这个功能不生效**——也就是说，你最需要它的时候它不在。离群样本必须靠 `sizeFactors` 与样本聚类自己发现，并在方法里说明如何处理（通常是剔除该样本并说明，而不是静默保留）。

**怎么办**

1. **把重复数当作实验设计问题**，在提取 RNA 之前定好。技术重复不能冒充生物学重复（见 9.1.2）。
2. **n=3 时明确写出局限**：「每组 3 个生物学重复，这是能进行差异表达分析的下限；结果应视为需要独立验证的候选」。
3. **报告效应量与置信区间**（`log2FoldChange` + `lfcSE`），不只报 `padj`。
4. **做两套方法的一致性对比**（DESeq2 与 edgeR），报告交集。
5. **不要用「趋势」讲故事。** padj = 0.06 写成「有上调趋势」是常见的过度解读；检验效能不足时，这个「趋势」多半是噪声。
6. **独立验证**：关键基因用 qRT-PCR 或另一批独立样本验证。这是小样本转录组研究唯一能提高可信度的做法。

### 9.5.7 样本表的三类错误：都不报错，但都让结果失去意义

这三类错误在本指南里反复出现，因为它们**静默**：

| 错误 | 后果 | 怎么防 |
|---|---|---|
| **分组用数字编码且不记录含义** | 三个月后（或合作者）无法判断 `1` 是对照还是处理，`log2FC` 的方向可能整体反了 | 用有意义的字符串（`control` / `treat`）并显式 `relevel()` 指定对照水平 |
| **样本名顺序与矩阵列不一致** | DESeq2/edgeR/limma 都**按位置对齐**，错配后所有样本标签都错，结果看起来合理但完全错误 | 建模前 `stopifnot(identical(colnames(cts), rownames(meta)))`；每个进入统计的矩阵都要校验 |
| **矩阵里混入重复样本** | 同一个样本被算两次，人为降低组内变异、抬高显著性 | 建模前 `anyDuplicated()` 检查行名与列名 |

**还有两个同类问题**：

- **用 `inner_join` 合并元数据而不检查行数**：会静默丢样本。一个「组间差异显著」的结论可能只是因为某个组被丢掉了大半。连接后一律用 `anti_join` / `setdiff` 检查未匹配项。
- **`read.table(..., stringsAsFactors = TRUE)` 的老习惯**：会把所有文本列变成因子，因子参与合并时按内部整数编码匹配，产生完全错误的结果而不报错。用 `readr` 或显式 `stringsAsFactors = FALSE`。

### 9.5.8 结果解读：显著基因列表不是结论

**症状**：论文里写「处理组有 312 个基因显著上调，说明该处理显著激活了 X 通路」。

**问题**

1. **`padj < 0.05` 只说明「在给定模型下不易由噪声产生」。** 它不说明效应大小，不说明重复间一致，也不说明生物学重要性。**效应大小、重复间一致性与独立实验验证才决定这个基因值不值得追。**
2. **从「312 个基因上调」跳到「通路被激活」需要富集分析**，而且富集分析有自己的陷阱（背景、阈值、冗余）。
3. **收缩后的 log2FC 不能用于假设检验。** `lfcShrink` 改变的是效应量估计，p 值仍来自未收缩的模型；报告里两个数必须写清来源。
4. **只看结果表不看诊断图。** PCA 上分组根本不分离、或 p 值直方图接近均匀分布时，任何「显著」列表都更可能是噪声。诊断图是判断模型是否合理最快的手段。
5. **不要只报 log2FC 不报 `padj`，也不要只报 `padj` 不报 log2FC。** 筛选阈值应同时考虑两者并说明理由：统计学显著的微小变化在生物学上可能毫无意义。

**一个实用的报告模板**（把该说的一次说完）：

> 每组 n = 3 个生物学重复。使用 DESeq2（v1.x，median-of-ratios 归一化，设计公式 `~ batch + condition`）；建模前按「至少 3 个样本计数 ≥ 10」过滤，保留 N 个基因。`sizeFactors` 在样本间的范围为 a–b（见补充图）。差异基因判定标准为 padj < 0.05 且 |log2FC| > 1，共得到 M 个基因；用 edgeR（TMM + QL 框架）重复分析，两套结果的重叠率为 X%。通路富集以过滤后保留的 N 个基因为背景（universe），GO BP/CC/MF 分别分析，注释来自 eggNOG-mapper vX。

### 9.5.9 交付前的自检清单

- [ ] 建库方式已确认（rRNA 去除方法、是否链特异性、哪种链特异性）
- [ ] **重复类型已确认**：每个 n 都是独立培养/独立生物学样本，不是技术重复
- [ ] rRNA 去除效果用**两个指标**核查过（残留占比 + 剩余读长数），并把表格落盘
- [ ] 参考基因组与注释**同版本同坐标**，accession 与下载日期已记录
- [ ] `featureCounts -t/-g` 按实际 GFF 核对过；`-s` 用两种设置对比过
- [ ] `Assigned` 与三类 `Unassigned` 的相对大小已检查，异常已解释
- [ ] 计数矩阵是全整数；样本列顺序与元数据行顺序做过 `identical()` 校验
- [ ] 低表达过滤规则**在看结果之前**定好，并写进方法
- [ ] 检查过 `sizeFactors` / `normFactors` 的样本间分散度；异常样本已解释
- [ ] 批次写进 design；**没有**同时做矩阵校正（避免校正两次）
- [ ] 做过样本 PCA / 层次聚类，确认按分组而不是按批次聚类
- [ ] 用两套方法（DESeq2 / edgeR）跑过并报告了交集
- [ ] 报告了效应量（log2FC + lfcSE），不只有 padj；收缩前后的来源写清
- [ ] p 值直方图与 MA 图已生成并检查
- [ ] 富集分析的背景是过滤后的基因集，注释是自建的细菌注释（不是真核注释包）
- [ ] n = 3 或更少时，局限已明确写出，关键基因有独立验证计划

---

## 9.6 与面板模块 id 的对应

### 9.6.1 转录组主干（`transcriptome` 分类，8 个）

| 模块 id | 一句话说明 |
|---|---|
| `tran_rrna_remove` | 用比对或模型判定并剔除 rRNA 读长，评估富集效果；**细菌流程的成败关键** |
| `tran_hisat_align` | 把 mRNA 读长比对到参考基因组并输出排序 BAM；剪接感知在细菌上无优势 |
| `tran_featurecounts` | 把比对记录汇总成基因水平的**整数**计数矩阵 + 分配汇总 |
| `tran_salmon_quant` | 不依赖比对的转录本定量，输出估计计数与 TPM；多映射按概率分摊 |
| `tran_deseq2` | 负二项 GLM 差异表达分析，含离散度收缩与 LFC 收缩 |
| `tran_edger` | 负二项与拟似然（QL）框架的差异表达分析工具包 |
| `tran_batch_correct` | 在计数矩阵层面校正批次效应（ComBat-seq / limma），并验证校正效果 |
| `tran_go_enrich` | 用自定义注释做 GO/KEGG 富集，并控制背景偏差 |

### 9.6.2 配套模块（跨分类）

| 模块 id | 一句话说明 |
|---|---|
| `qc_fastp` | 读长质控与去接头；rRNA 去除之前的入口 |
| `qc_multi_qc` | 多样本质控指标汇总，用于发现深度异常样本 |
| `qc_remove_host` | 去宿主；细菌感染模型（细胞内细菌、组织样本）常需要 |
| `anno_prokka` | 细菌基因组注释；GFF 的 feature 类型与属性名决定计数参数 |
| `anno_bakta` | 细菌基因组注释（更完整的标准合规输出），同样影响 `-t/-g` 的选择 |
| `anno_eggnog` | eggNOG 功能注释；细菌富集分析自建 TERM2GENE 表的主要来源 |
| `anno_kofamscan` | K number 分配，用于 KEGG 通路层面的富集 |
| `anno_interpro` | 蛋白结构域/家族注释，用于 GO 层面的补充 |
| `util_samtools` | BAM 排序、索引与统计；比对与计数之间的必需工具 |
| `util_seqkit` | FASTA/FASTQ 统计与筛选，用于检查 rRNA 去除前后的读长组成 |
| `io_bam_to_bed` | BAM 转 BED，用于覆盖度可视化与区域统计 |
| `io_gff_convert` | GFF/GTF 格式互转；计数前统一注释格式 |
| `r_read_import` | 把计数矩阵与结果表读进 R 并显式声明列类型 |
| `r_tidyverse` | 长宽表转换与合并；`left_join` + `anti_join` 检查，避免静默丢样本 |
| `r_deseq2_object` | DESeq2 对象与差异表；`design`、`relevel`、`vst` 的用法来源 |
| `r_limma_stats` | 线性模型差异分析（limma / voom）；只在有归一化表达值而非计数时使用 |
| `r_export_table` | 把结果导出为可交付的表与文档表格 |
| `py_pysam` | 在 Python 里按坐标访问 BAM，用于自定义区域统计（如 rRNA 区读长比例） |
| `py_pandas_io` | 把 featureCounts / Salmon 的结果读成 DataFrame |
| `py_scipy_stats` | 统计检验与多重校正；`multipletests` 用 `'fdr_bh'` |
| `viz_volcano_ma` | 差异表达火山图与 MA 图；**必须用校正后 p 值** |
| `viz_heatmap` | 差异基因热图；必须说明按行标准化还是原始水平 |
| `viz_ggplot2` | 差异表达结果的自定义统计图 |
| `viz_seaborn` | Python 侧的样本分布/箱线图，用于快速诊断 |
| `viz_plotly` | 交互式图表，适合探索成千上万个基因的结果表 |
| `viz_pub_style` | 出版级图规范：字号、配色、误差线含义必须写清 |
| `wf_batch_loop` | 批量执行比对与定量（多样本必需） |
| `wf_snakemake` | 把比对→计数→差异表达串成可重跑的任务图 |
| `wf_reproducibility` | 版本、校验和与命令留档；RNA-seq 的分析链长，这一步收益最大 |

### 9.6.3 相关预设

| 预设 id | 适用场景 | 对应本章小节 |
|---|---|---|
| `preset-rnaseq-deseq2` | 细菌转录组差异表达（质控 → rRNA 去除 → 比对 → 计数 → DESeq2 → 富集/出图） | 9.3.1、9.5.1、9.5.2、9.5.5、9.5.6 |

载入预设后请特别检查三处默认连接是否符合你的数据：`tran_hisat_align` 是否换成 Bowtie2 路线（9.3.3）、`tran_featurecounts` 是否换成 `tran_salmon_quant`（9.3.4）、以及 `tran_go_enrich` 的背景基因集是否已按 9.3.7 设定。

---

## 9.7 延伸阅读

### 方法学基础（先读这几篇，参数就有依据了）

- Love MI, Huber W, Anders S. **Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2.** *Genome Biol* 2014;15:550. —— 离散度收缩、Wald 检验与 `results()` 的语义。
- Anders S, Huber W. **Differential expression analysis for sequence count data.** *Genome Biol* 2010;11:R106. —— median-of-ratios（size factor）的原始方法；9.5.5 的前提就写在这里。
- Robinson MD, McCarthy DJ, Smyth GK. **edgeR: a Bioconductor package for differential expression analysis of digital gene expression data.** *Bioinformatics* 2010;26:139–140.
- McCarthy DJ, Chen Y, Smyth GK. **Differential expression analysis of multifactor RNA-Seq experiments with respect to biological variation.** *Nucleic Acids Res* 2012;40:4288–4297. —— 拟似然（QL）框架；9.3.5 里「小样本更稳」的依据。
- Robinson MD, Oshlack A. **A scaling normalization method for differential expression analysis of RNA-seq data.** *Genome Biol* 2010;11:R25. —— TMM 的原始方法。
- Ritchie ME, 等. **limma powers differential expression analyses for RNA-sequencing and microarray studies.** *Nucleic Acids Res* 2015;43:e47. —— voom 与线性模型路线；注意它适用于归一化表达值，不是计数。
- Zhu A, Ibrahim JG, Love MI. **Heavy-tailed prior distributions for sequence count data: removing the noise and preserving large differences.** *Bioinformatics* 2019;35:2084–2092. —— apeglm 收缩；也解释了为什么收缩后的 log2FC 不能用于检验。

### 实验设计与重复数

- Schurch NJ, 等. **How many biological replicates are needed in an RNA-seq experiment and which differential expression tool should you use?** *RNA* 2016;22:839–851. [PubMed](https://pubmed.ncbi.nlm.nih.gov/27022035/) —— 重复数与工具选择的系统性评估；9.5.6 引用的主要依据。
- Conesa A, 等. **A survey of best practices for RNA-seq data analysis.** *Genome Biol* 2016;17:13. —— 从实验设计到下游分析的checklist 式综述。
- Love MI, Anders S, Kim V, Huber W. **RNA-Seq workflow: gene-level exploratory analysis and differential expression.** *F1000Res* 2015;4:1070. —— DESeq2 官方工作流的思路，含诊断图该看什么。

### 细菌特有的两步

- Kopylova E, Noé L, Touzet H. **SortMeRNA: fast and accurate filtering of ribosomal RNAs in metatranscriptomic data.** *Bioinformatics* 2012;28:3211–3217. —— 比对路线；注意 `--fastx` 与 `--paired_in` 的语义。
- Deng ZL, 等. **RiboDetector: detecting highly accurate and fast rRNA contamination in ribo-seq and RNA-seq.** *NAR Genom Bioinform* 2022;4:lqac022. —— 模型路线；非模式菌的优先选择。
- Langmead B, Salzberg SL. **Fast gapped-read alignment with Bowtie 2.** *Nat Methods* 2012;9:357–359.
- Kim D, 等. **Graph-based genome alignment and genotyping with HISAT2 and HISAT-genotype.** *Nat Biotechnol* 2019;37:907–915. —— 读它的目的是理解剪接感知的适用场景，从而确认它不适用于细菌。

### 计数与定量

- Liao Y, Smyth GK, Shi W. **featureCounts: an efficient general purpose program for assigning sequence reads to genomic features.** *Bioinformatics* 2014;30:923–930. —— `-t/-g/-s/-O/-M` 的语义与汇总文件各行的含义。
- Patro R, 等. **Salmon provides fast and bias-aware quantification of transcript expression.** *Nat Methods* 2017;14:417–419.
- Bray NL, 等. **Near-optimal probabilistic RNA-seq quantification.** *Nat Biotechnol* 2016;34:525–527. —— kallisto 的伪比对 + EM。
- Soneson C, Love MI, Robinson MD. **Differential analyses for RNA-seq: transcript-level estimates improve gene-level inferences.** *F1000Res* 2015;4:1521. —— `tximport`；为什么 `numReads` 要连同平均转录本长度一起导入。

### 批次与富集

- Zhang Y, Parmigiani G, Johnson WE. **ComBat-seq: batch effect adjustment for RNA-seq count data.** *NAR Genom Bioinform* 2020;2:lqaa078. —— 计数层面的批次校正；注意 `group` 参数必须传。
- Wu T, 等. **clusterProfiler 4.0: A universal enrichment tool for interpreting omics data.** *The Innovation* 2021;2:100141. —— ORA 与 GSEA 的实现；`universe` 参数的含义在这里。
- Subramanian A, 等. **Gene set enrichment analysis: a knowledge-based approach for interpreting genome-wide expression profiles.** *PNAS* 2005;102:15545–15550. —— GSEA 的原始方法；理解「为什么用全部基因排序」。

> 与[第 8 章](08-metagenome-microbiome.md)一样：引用指向方法学原文而非教程。转录组领域的教程往往默认真核场景（poly(A) 富集、有内含子、多转录本），照抄会导致本章 9.1.1 列出的五个差异全部踩中。

---

**下一步**

- 跑通一条细菌转录组流程：在面板载入 `preset-rnaseq-deseq2`，对照 9.3.1 的决策树逐节点核对，再用 9.5.9 的清单自检。
- 不确定 rRNA 去除是否有效：回到 9.5.1，把两个指标做成表再决定要不要往下走。
- 结果表里「什么都没有」：按 9.5.1（rRNA 残留）→ 9.5.4（低表达过滤）→ 9.5.5（归一化假设）的顺序排查，而不是先去调 DESeq2 参数。
- 需要功能层面的结论：看[第 6 章 功能注释与耐药毒力](06-annotation-resistance-virulence.md)，细菌的 GO/KEGG 注释必须自建，真核注释包不能用。
- 想让整条链可重复：看[第 11 章 流程与可重复性](11-workflow-reproducibility.md)——RNA-seq 的分析链长、参数多，收益最大。
