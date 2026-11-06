# 第 2 章 上游数据质控

## 2.1 这一层要回答什么问题

质控要回答的不是「数据质量好不好」，而是三个更具体的问题：

1. **这批数据能不能用来回答我的问题？** —— 覆盖度是否足够、是否混入了不该有的物种、宿主污染占比多高。
2. **哪些读长应该被丢掉？** —— 接头、低质量末端、PCR 重复、宿主序列。
3. **某个样本是不是异常？** —— 在批量项目里，单看一个样本的报告几乎看不出问题；把几十个样本的指标并排放在一起，离群样本会立刻显形。

第二点的顺序很重要：**先修剪，再去宿主，最后再确认污染**。顺序反了会得到虚假的好指标（未修剪的低质量碱基会造成大量假比对，让去宿主的比对率虚高）。

## 2.2 输入、输出与中间文件长什么样

```
00_raw/S01_R1.fq.gz                  ← 原始双端读长（只读）
00_raw/S01_R2.fq.gz
        ↓ 修剪
01_clean/S01_R1.fq.gz                ← 清理后读长（后续所有分析的输入）
01_clean/S01_R2.fq.gz
        ↓ 去宿主（仅宿主污染样本需要）
01_clean/S01_R1.nohost.fq.gz
01_clean/S01_R2.nohost.fq.gz
        ↓ 汇总
10_logs/S01.fastp.json               ← 机器可读指标（MultiQC 读这个）
10_logs/S01.fastp.html               ← 人工阅读
10_logs/multiqc/project_qc.html      ← 项目级总览
```

需要记住的一条约定：**HTML 报告是给人看的，不要让下游脚本依赖它**。需要程序化处理时一律用 JSON 或文本输出。

## 2.3 工具拼装思路

### 选择决策树

```
你的读长类型是什么？
├── 短读长（Illumina）
│   ├── 只想跑通、参数少 → fastp（一次完成接头+修剪+报告）
│   └── 需要精确复现既有流程 / 需要按接头文件精确匹配
│                          → FastQC + Trimmomatic + FastQC（两步法）
└── 长读长（Nanopore / PacBio）
    └── 只能用 NanoFilt 或 Filtlong
        ⚠️ 不要用 fastp / Trimmomatic 处理长读长

样本含宿主（临床、组织、呼吸道、肠道）？
└── 是 → 修剪之后加一步去宿主（Bowtie2 / minimap2）

是纯培养物？
└── 是 → 组装前做一次污染筛查（Kraken2），成本极低而收益很高

扩增子（16S / ITS）？
└── 是 → 不要做 PCR 去重（重复读长就是丰度信号）
```

### 两条主流路线

**路线 A：fastp + MultiQC（现代、步骤少）**

```bash
fastp -i 00_raw/S01_R1.fq.gz -I 00_raw/S01_R2.fq.gz \
      -o 01_clean/S01_R1.fq.gz -O 01_clean/S01_R2.fq.gz \
      -w 8 -j 10_logs/S01.fastp.json -h 10_logs/S01.fastp.html

multiqc 10_logs -o 10_logs/multiqc
```

优点：一次运行完成接头识别、质量修剪、polyG 修剪与报告；参数少；速度快。
代价：报告能力弱一些，参数控制的细粒度不如 Trimmomatic。

**路线 B：FastQC + Trimmomatic + FastQC（经典、控制细）**

```bash
fastqc -t 4 -o qc/fastqc 00_raw/S01_R1.fq.gz

trimmomatic PE -threads 8 -phred33 \
  00_raw/S01_R1.fq.gz 00_raw/S01_R2.fq.gz \
  01_clean/S01_R1.paired.fq.gz 01_clean/S01_R1.unpaired.fq.gz \
  01_clean/S01_R2.paired.fq.gz 01_clean/S01_R2.unpaired.fq.gz \
  ILLUMINACLIP:TruSeq3-PE.fa:2:30:10 \
  LEADING:3 TRAILING:3 SLIDINGWINDOW:4:20 MINLEN:50

fastqc -t 4 -o qc/fastqc 01_clean/S01_R1.paired.fq.gz
```

优点：每个操作可单独调参、行为可预测、大量已发表流程在用。
代价：**修剪后必须再跑一次 FastQC**，否则你其实不知道参数做了什么。少了这一步就是盲改参数。

**两条路线都合理。** 不要串行跑两个修剪工具——过度修剪会让读长变短、比对率下降，而且难以判断是谁造成的。

### 去宿主

```bash
# 建索引一次，长期复用（人类基因组建索引约需几十 GB 内存、数十分钟）
bowtie2-build host.fna host_index/host

# 比对，取未比对的读长
bowtie2 -x host_index/host -1 01_clean/S01_R1.fq.gz -2 01_clean/S01_R2.fq.gz \
        -p 8 --very-sensitive 2> 10_logs/S01.host.log | \
  samtools sort -@ 8 -o 10_logs/S01.host.bam -

samtools view -b -f 4 10_logs/S01.host.bam | \
  samtools fastq -1 01_clean/S01_R1.nohost.fq.gz -2 01_clean/S01_R2.nohost.fq.gz -
```

`-f 4` 表示只取**未比对**的读长。写成 `-F 4` 含义正好相反（只保留宿主读长）——这个错误从读长数量上不容易立刻发现，导完 FASTQ 后务必核实数量趋势符合预期。

长读长用 minimap2（不需要单独建索引）：

```bash
minimap2 -ax map-ont -t 8 host.fna clean.fq.gz 2> host.log | \
  samtools view -b -f 4 - | samtools fastq - > nohost.fq.gz
```

### 污染筛查

```bash
kraken2 --db $KRAKEN_DB --threads 8 --use-names \
  --report 10_logs/S01.kraken.report \
  --output 10_logs/S01.kraken.out \
  01_clean/S01_R1.fq.gz 01_clean/S01_R2.fq.gz | head -30

head -30 10_logs/S01.kraken.report
```

报告列的含义：百分比 / 该节点读长数 / 直接命中数 / 分类层级 / 分类单元 id / 名称。看三件事：目标物种占比、有没有出现不相关的物种、unclassified 比例。

## 2.4 关键参数取舍

### fastp

| 参数 | 默认 | 什么时候该改 |
|---|---|---|
| `-w` | **3** | **always**。默认只有 3 线程，批量运行时 CPU 会大量闲置 |
| `-q` | 15 | 高覆盖度时提到 20–30 更严格；不要在只想「清理明显垃圾」时调高 |
| `-u` | 40 | 允许的低质量碱基比例上限；严格模式可到 10–15 |
| `-l` | 15 | **组装建议提到 50**，否则容易产生碎片 contig |
| `-n` | 5 | 允许的 N 碱基上限 |
| `--cut_tail` | 关 | 3' 端质量下降明显的批次开启 |
| `--detect_adapter_for_pe` | 自动 | **低覆盖度或长插入片段样本必开**，否则可能漏检接头 |
| `--adapter_sequence` | 自动推断 | 自动检测失效时显式指定（TruSeq 常见 `AGATCGGAAGAGC`） |

### Trimmomatic

| 参数 | 默认 | 取舍 |
|---|---|---|
| `ILLUMINACLIP:file:seed:pal:simple` | `2:30:10` | seed 越小匹配越宽松；调小容易误切真实序列 |
| `SLIDINGWINDOW:4:20` | — | **最影响最终读长的参数**；窗口平均质量低于阈值就切掉其后所有碱基 |
| `LEADING:3 / TRAILING:3` | — | 切两端低质量碱基；对 5' 端质量差的批次有效 |
| `MINLEN:50` | 36 | 组装建议 50 |
| `-phred33` | 自动 | 现代 Illumina 一律 33；老数据可能不同，写错会让整批质量判断错误 |

**操作顺序即语义。** `MINLEN` 放在最后和放在最前面结果完全不同——这是最容易出错也最难察觉的一点。

### 长读长

| 参数 | 常用值 | 取舍 |
|---|---|---|
| `NanoFilt -l` / `Filtlong --min_length` | 1000 | 低于 1000 bp 对组装贡献很小，但**不要设太高**以免丢掉跨越重复区的长尾 |
| `NanoFilt -q` | 10 | Q10 ≈ 90% 准确率，是常用下限 |
| `NanoFilt --headcrop/--tailcrop` | 各 50 | Nanopore 两端质量常明显偏低 |
| `Filtlong --keep_percent` | 90 | **数据过剩时用它削减**，比按长度截断保留更多有用信息 |
| `Filtlong --target_bases` | 按覆盖度算 | 比 `--keep_percent` 更直观 |

## 2.5 常见坑

### 修剪相关的系统性问题

**把 fastp 和 Trimmomatic 串起来用。** 两个修剪工具做同一件事会过度修剪。读长变短、比对率下降之后，你无法判断是哪一个工具、哪个参数造成的。

**修剪后不回看读长分布。** 如果 clean 数据的平均长度从 150 bp 掉到 110 bp 以下，说明阈值过严。正确做法是先放宽 `-q` 再比较组装结果，而不是接受一个看起来"更干净"的结果。

**在修剪过的数据上跑 FastQC 就以为验证了修剪合理。** per-base quality 必然变漂亮——因为你已经把坏的碱基删掉了。这是同义反复，不能用来证明参数合理。

**fastp 默认只开 3 个线程。** 这是最常见的性能坑：批量运行时如果不显式给 `-w`，看着 CPU 大量闲置却以为流程已经很快。

### 去宿主相关的系统性问题

**先粗后精的顺序反了。** 未修剪的低质量碱基会造成大量假比对，让比对率虚高。正确顺序是**修剪 → 去宿主**。

**`-f 4` 与 `-F 4` 写反。** 这个错误不会报错，只会保留宿主、丢掉真实数据。

**宿主参考基因组版本没记录。** 同一物种不同版本有数万个位点差异，换版本会让去宿主比例明显变化，结果无法复现。

**去得太狠。** 与宿主存在同源区的微生物基因（保守 rRNA、管家基因）会被一起丢掉，导致下游某些功能基因系统性缺失。用去宿主**前后**的分类结果对比来确认损失可接受。

**建索引每个样本重建一次。** 人类基因组建索引需几十分钟，应该在共享目录复用。

### 污染筛查相关的系统性问题

**换了 Kraken 数据库却没意识到结果不可比。** 标准库、plusPF、自定义库给出的物种占比明显不同。数据库版本必须和结果一起记录。

**把"出现非目标物种"直接当成污染。** 数据库覆盖不全时读长会被「就近分配」到别的物种。判断污染要看该物种是否有稳定、成比例的支持（例如覆盖多个保守基因，而不是集中在少数区域）。

**unclassified 比例高就认为数据差。** 缺参考基因组的环境样本、病毒或新物种占比高的样本，unclassified 高是正常的。

**用 FastQ Screen 的结果直接下结论。** 它是「像谁」的比例表，用于定位来源；确认污染还需要看具体比对区域与基因组覆盖度。

### 跨步骤的系统性问题

**质控指标正常 ≠ 数据可用。** 宏基因组样本里宿主污染和 rRNA 占比高，会让 fastp 报告显得"质量很好"，却解决不了真正的问题。质控指标只反映读长本身的碱基质量，不反映样本组成的合理性。

**只做单样本质控，不做项目级汇总。** FastQC 全绿检测不出批次效应、样本串扰这类"单样本正常、整体比较才有问题"的缺陷。样本一多必须靠 MultiQC 汇总。

**把去掉的读长数量当作质控好坏的判据。** 去重会让读长数明显下降，但那不代表数据变差了。要配合去重前后的覆盖度与比对率一起看。

### 不该在质控阶段做的事

**对宏基因组数据做 PCR 去重。** 序列完全相同不代表来自同一个基因组；去重会抹掉真实丰度信号，还可能删掉低丰度物种的全部证据。

**对扩增子（16S/ITS）数据去重。** 重复读长**就是**丰度。去重等于把定量结果废掉。ASV 去噪是另一回事，由 DADA2 / Deblur 负责。

**用 fastp / Trimmomatic 处理长读长。** 它们按短读长模型修剪，会破坏长读长的长度优势，得到的"干净数据"组装起来更差。

## 2.6 与面板模块 id 的对应

| 模块 id | 说明 |
|---|---|
| `qc_fastp` | 读长质控与去接头（一站式，含 JSON 与 HTML 报告） |
| `qc_fastqc` | 原始读长质量报告（逐碱基质量分布与污染初筛） |
| `qc_trimmomatic` | 读长修剪（参数可精细控制的经典工具） |
| `qc_multi_qc` | 多步骤质控汇总（把各工具日志聚合成项目级总览） |
| `qc_remove_host` | 去除宿主污染序列（Bowtie2 / minimap2） |
| `qc_dedup_reads` | 读长去重与格式精简（seqkit / clumpify） |
| `qc_quality_trim_long` | 长读长质量控制（NanoFilt / Filtlong） |
| `qc_contamination_screen` | 原始数据污染筛查（Kraken 2 / FastQ Screen） |

在面板里，`qc_fastp` 的输出端可以直接连到 `asm_spades`、`meta_kraken2`、`tran_hisat_align` 等；`qc_multi_qc` 是几乎所有上游模块的共同下游（收集日志）。连线时注意 `qc_multi_qc` 只接受 `report` 与 `log-report` 类型，而不是读长。

## 2.7 延伸阅读

- 面板预设「质控指标汇总与项目报告」（`preset-qc-metrics-report`）：从 FastQC / fastp 到项目级报告与溯源记录
- 第 3 章讲组装，其中「覆盖度是否足够」的判断直接依赖本章的质控指标
- 第 4 章的污染评估（CheckM2 / GUNC）比本章的读长级筛查更严格，两者互补
