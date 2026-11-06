# 第 6 章 功能注释、耐药与毒力

## 6.1 这一层要回答什么问题

注释这一层有三个递进的层次，它们的证据强度依次下降：

| 层次 | 问的问题 | 典型工具 | 结论性质 |
|---|---|---|---|
| **结构注释** | 基因在哪里？边界是什么？ | Prokka、Bakta、Prodigal、PGAP | 相对客观：这是算法在给定模型下的最优化结果 |
| **功能注释** | 这个基因是什么？属于哪个家族？ | eggNOG-mapper、KofamScan、InterProScan、DIAMOND/MMseqs2 | **推断**：基于同源性与结构域的证据转移 |
| **专项注释** | 有没有耐药 / 毒力 / 可移动元件？ | RGI、ResFinder、AMRFinderPlus、ABRicate、VFDB、mobileOG-db、geNomad | **推断 + 阈值判定**：结论强度取决于数据库覆盖与阈值 |

### 这一层最重要的一句话

> **注释是基于同源性的推断，不是实验证据。**

这句话听起来像常识，但它有非常具体的后果，而且这些后果经常被忽略：

1. **`product` 与 `EC` 号是推断值。** ABC 转运蛋白、双组分调控、外排泵这类大基因家族很容易张冠李戴。发表级结论涉及的关键基因（耐药、毒力、代谢标志基因）必须回到文献或实验核对，不能直接把 `product` 字段当结论。
2. **「有注释」与「没有注释」不对称。** 命中一个功能域只说明序列相似；没有命中只说明**当前数据库里没有相似的条目**，不说明这个基因没有功能。环境样本、新属、非模式类群里大量蛋白没有 KO 或 COG 归属是正常现象。
3. **注释结果的可靠性是分层的。** 核糖体蛋白、管家基因这类保守核心基因通常可靠；转运、调控与假定蛋白容易套错——因为**同源不等于同功能**。

### 三个必须分开的概念

在耐药与毒力部分，这是最容易出错的地方：

```
基因存在  ≠  基因表达  ≠  表型
（序列里有一段相似的 ORF）  （转录/翻译出有功能的蛋白）  （MIC 升高 / 动物实验致病）
```

- **基因存在但可能不表达**：可移动抗性基因常处于沉默状态；
- **表达但可能无功能**：截断、移码、点突变都可能让产物失活；
- **表型可能来自未收录的机制**：孔蛋白缺失、外排泵过表达、生物膜、新型耐药机制都不在「基因存在 / 缺失」的筛查范围内。

因此，本章产出的东西应当被理解成**一份需要进一步验证的假设清单**，而不是一份结论清单。发表级结论必须与 MIC / 药敏表型、或至少与转录数据放在一起看。

### 这一层还承担一个隐性的关键职责：为下游比较准备同源的输入

第 7 章的泛基因组、基因存在/缺失矩阵，直接消费本章的产物（GFF3 或蛋白序列）。**注释器在基因边界与命名策略上的差异，会变成下游的「假基因家族」。** 所以本章不仅决定「基因是什么」，还决定「跨基因组比较是否可比」——详见 6.5 坑 7。

## 6.2 输入、输出与中间文件长什么样

### 输入

| 类型 | catalog 类型 id | 说明 |
|---|---|---|
| 基因组 / 质粒 / MAG 序列 | `contigs` / `genome-fasta` | **必须是质量检验通过的版本**（第 4 章）；坐标体系与下游必须一致 |
| 可信蛋白序列（可选） | `protein-faa` | 用于「优先采用你给的注释」（Prokka `--proteins`、Bakta `--proteins`） |
| 预注释 CDS 区域（可选） | `gff` | 用于跳过基因预测、沿用既有边界 |

### 输出

```
03_annotation/
├── sample_bakta/
│   ├── sample.gff3          # 结构 + 功能注释（下游泛基因组的输入）
│   ├── sample.ffn           # CDS 核酸
│   ├── sample.faa           # CDS 蛋白（功能注释与耐药筛查的输入）
│   ├── sample.tsv           # 注释表 + 推断指标
│   ├── sample.json          # 全部内部信息（bakta_io 可再生成其它格式）
│   ├── sample.txt           # 数据库版本等运行信息（归档必须保留）
│   └── sample.png           # 环形基因组图（可直接用于展示）
├── sample.emapper.annotations       # 逐基因功能注释（表头以 # 开头）
├── sample.kofam.tsv                 # KO 分配表
├── sample.interpro.tsv              # 结构域注释
├── sample.nr.m8                     # 同源搜索结果（BLAST 兼容表格）
└── res/
    ├── sample_rgi.txt / .json       # RGI 命中（含 Cut_Off 列：strict / loose）
    ├── sample.resfinder.*           # 获得性基因 + 点突变 + 表型预测
    ├── sample.amrfinder.tsv         # AMRFinderPlus 条目表
    ├── sample.card.tab / .vfdb.tab  # ABRicate 多库命中
    ├── sample.pf/results_tab.txt    # PlasmidFinder 复制子
    └── sample.mge.m8                # mobileOG-db 可移动元件
```

### 各输出的关键字段与读法

| 输出 | 关键字段 | 怎么读 |
|---|---|---|
| GFF3 | `seqid`、`start`、`end`、`strand`、`ID` / `locus_tag`、`product`、`Dbxref` | `seqid` 可能与原始 FASTA 的序列名**不同**（注释器会重命名 contig）；坐标只有配上正确的 FASTA 才有意义 |
| Bakta `sample.txt` / `.json` | 数据库版本、库类型（full / light） | **归档必须保留**：换库等于换方法，注释率与 product 都会变 |
| eggNOG `*.annotations` | `COG_category`、`GOs`、`KEGG_ko`、`EC`、`Description` | 表头以 `#` 开头，GO/KEGG/EC 是**逗号分隔的多值**；pandas 直接读会错位，统计前要跳过注释行并拆分多值 |
| KofamScan | `ko`、`threshold`、`score` | 一条蛋白可以命中多个 KO，也可以完全无命中；**KO 不是酶活性的证明** |
| InterProScan TSV | 成员库、InterPro 条目、起止、score、E-value | 重点不是「有没有注释」，而是**命中的是哪一段、覆盖全长的多少**；只覆盖一小段或落在低复杂度区的命中可能是巧合 |
| RGI 命中表 | `Cut_Off`（strict / loose）、`ARO`、`Drug Class`、`Resistance Mechanism` | **strict 是较强证据，loose 只是候选**；把 loose 当 strict 用是耐药注释里最常见的过度解读 |
| ResFinder `pheno_table` | 物种、预测表型、命中依据 | **基于规则的推断**，对天然耐药与未收录机制常常不报或误报；不能替代 MIC |
| AMRFinderPlus TSV | `Element type`、`Element symbol`、`Class`、`Subclass`、`% Coverage` | 覆盖率明显低于 100% 的条目可能是假基因、片段或近缘基因的弱相似 |
| VFDB 命中 | 基因名、毒力类别、identity、覆盖度 | 条目粒度不一致（有的代表操纵子，有的是单基因）；按条目计数会出现假差异 |
| CheckV `quality_summary.tsv` | `completeness`、`confidence`、`contamination`、质量分级 | **高完整度不代表无污染**：质量分级只看完整度 |
| geNomad `virus_summary.tsv` | `virus_score`、`n_hallmarks`、`taxonomy`、`topology` | `taxonomy` 只能到科级且随数据库版本变化；空字段不代表分类失败 |

### 一个可执行的注释与筛查流程

```bash
S=sample; T=16

# 1) 结构 + 基础功能注释（Bakta；革兰氏类型必须显式指定）
bakta --db ${BAKTA_DB} --output 03_annotation/${S} --prefix ${S} \
      --gram - --locus-tag ${S}_ --min-contig-length 200 \
      --threads $T 02_assembly/${S}.filtered.fasta

# 2) 功能归类（三条互补的证据线，按需要选，不必全跑）
emapper.py -i 03_annotation/${S}/${S}.faa --output 03_annotation/${S}_eggnog \
      -m diamond --itype proteins --cpu $T
exec_annotation -o 03_annotation/${S}.kofam.tsv -p ${KOFAM_PROFILES} \
      -k ${KOFAM_KO_LIST} --cpu $T 03_annotation/${S}/${S}.faa
# InterProScan 慢，批量项目先估时间
interproscan.sh -i 03_annotation/${S}/${S}.faa -f TSV,GFF3 \
      -o 03_annotation/${S}.interpro -cpu $T

# 3) 耐药：先快速多库初筛，再用正式工具做判定
abricate --db card 02_assembly/${S}.filtered.fasta > res/${S}.card.tab
rgi main -i 03_annotation/${S}/${S}.faa -o res/${S}_rgi -t protein \
      --local --clean -n $T
# 需要覆盖 rRNA 等核酸层面的模型时，用核酸输入再跑一次
rgi main -i 02_assembly/${S}.filtered.fasta -o res/${S}_rgi_dna -t contig \
      --local --clean -n $T
# 获得性基因 + 点突变 + 表型预测（物种必须正确）
python -m resfinder -ifa 02_assembly/${S}.filtered.fasta \
      -o res/${S}_resfinder -s "Escherichia coli" --acquired --point
# NCBI 路线：必须指定物种，否则点突变不检测
amrfinder -n 02_assembly/${S}.filtered.fasta --organism Escherichia --plus \
      -o res/${S}.amrfinder.tsv

# 4) 毒力与可移动元件
abricate --db vfdb --minid 90 --mincov 80 02_assembly/${S}.filtered.fasta \
      > res/${S}.vfdb.tab
python -m plasmidfinder -i 02_assembly/${S}.filtered.fasta -o res/${S}_pf

# 5) 汇总的口径必须写清：哪些库、哪些阈值、strict 还是含 loose
abricate --summary res/*.tab > res/abricate_summary.tab
```

第 5 步之后一定会遇到一个问题：**多个工具给出的清单不一致，怎么办？** 这是正常现象而不是错误。处理方法见 6.5 坑 12。

## 6.3 工具拼装思路（含选择决策树）

### 先问三个问题

1. **结论用到哪里？** 内部探索 / 论文发表 / 临床或监管报告——三者对证据链的要求完全不同。
2. **需要与谁可比？** 既有流程或已发表数据集（需要沿用同一注释器与版本），还是新项目（可以选现代工具）？
3. **下游是否要做跨基因组比较？** 如果是，注释器必须在**全部基因组上统一**，这一条比选哪个注释器更重要。

### 决策树 A：结构注释（基因在哪里）

```
需要什么级别的注释？
├── 新项目，要现代、标准化、带 dbxref 的注释
│      → Bakta
│         优点：AFSI 哈希命中已知蛋白，速度快；GFF3/EMBL 符合 INSDC；
│               内置 AMRFinderPlus 与 VFDB 筛查；额外预测 sORF、ncRNA、oriC/oriV/oriT
│         边界：**只面向细菌与质粒**（作者明确的设计决定）；
│               数据库必须单独下载并锁定版本（full 库几十 GB，light 库小但参考序列少）
├── 需要与既有流程/旧论文可比，或需要 .sqn/.tbl 打包路径
│      → Prokka
│         注意：已停止积极维护，作者明确建议新项目改用 Bakta；
│               但参数语义与输出格式极其稳定，大量已发表流程仍在用
├── 要提交 NCBI / 需要最保守、最规范的注释
│      → 网页提交由 PGAP 注释（anno_ncbi_submit）
│         本地只做前置准备与校验（table2asn -validate）
│         记住：只有 NCBI 赋予的才叫「官方注释」
├── 只想要蛋白序列（做同源搜索、给 CheckM2/GUNC 用）
│      → Prodigal
│         注意：single 与 meta 两种模式差别很大；它不查任何数据库，
│               product 是占位描述（hypothetical protein）
└── 古菌 / 病毒 / 真菌
       → 不能用 Bakta（会得到大量错误或缺漏）
         用 Prokka 的 --kingdom，或专用流程
```

**Prokka / Bakta / PGAP 的三方取舍，判据如下：**

| 判据 | Prokka | Bakta | PGAP |
|---|---|---|---|
| 维护状态 | 停止积极维护（`legacy`） | 活跃维护 | NCBI 官方流程 |
| 数据库更新 | 打包快照，可能落后数年 | 单独下载、可锁定版本 | 由 NCBI 维护 |
| 适用类群 | 细菌/古菌/病毒/真菌（`--kingdom`） | **仅细菌与质粒** | 提交的各类原核基因组 |
| 输出规范性 | `.tbl`/`.sqn` 可提交 | GFF3/EMBL 符合 INSDC | 官方注释 |
| 关键代价 | 库旧、`locus_tag` 与 contig 名会被重写 | 需要几十 GB 的库（full） | **单向**：accession 一旦分配极难修改 |
| 什么时候选它 | 复现旧结果、需要 `.sqn` 路径 | 新项目默认 | 发表/提交要求 accession |

### 决策树 B：功能注释（基因是什么）

四条路线回答的是**不同的问题**，不是同一问题的不同实现：

```
你要回答的是什么问题？
├── "这条蛋白属于哪个功能同源群？给个 COG/GO/KEGG 标签"
│      → eggNOG-mapper
│         机制：DIAMOND 搜 seed ortholog，再转移该 ortholog 已有的功能标签
│         注意：--tax_scope 决定注释从哪个分类分支转移；同源不等于同功能
├── "这条蛋白对应哪个 KEGG KO？用于通路层面的比较"
│      → KofamScan
│         机制：HMMER 搜 Kofam（每个 KO 带 KEGG 训练出的自适应阈值）
│         优点：profile HMM 对远缘同源更敏感
│         注意：KO 命中不等于通路完整
├── "这条蛋白有哪些结构域？功能位点在哪？"
│      → InterProScan
│         机制：同时过十几个成员库（Pfam、PANTHER、CDD、SMART、PROSITE…），整合成 InterPro 条目
│         代价：慢（一个细菌基因组常要数小时到十几小时）
│         注意：裁剪 -appl 会改变"没有命中"的含义
└── "它像数据库里的谁？我要自己判读"
       → DIAMOND / MMseqs2 比对 nr 等大库
          注意：做功能注释要设阈值并看覆盖度与结构域；
                做**物种**归属必须用 LCA 而不是 best hit
                （best hit 会系统性偏向数据库里序列最多的类群）
```

**这四条路线不能互相替代，也不能把结果混在一张表里当「综合功能注释」。** 它们的数据库、方法与语义都不同。合理的做法是选一条作为主口径，其余作为交叉验证并在单独的表里给出。

### 决策树 C：耐药基因与突变

这是本章最容易出错的部分，因为工具众多且覆盖面差异巨大。

```
你要回答的是什么？
├── "快速看看这个样本带了什么耐药基因"（初筛、探索）
│      → ABRicate（一次跑多个库：card / resfinder / argoannot / ncbi / vfdb / plasmidfinder / megares）
│         限制必须写进结论：
│           - 不做基因预测（直接核酸比对，无 ORF 边界判断）
│           - **不检测点突变**（gyrA / parC / rpoB / 23S rRNA 一律不报）
│           - 内置数据库是打包快照，更新往往落后官方数年
│         结论：适合初筛与交叉验证，不适合作为耐药研究的唯一依据
├── "用 CARD 做正式判定，区分严格与宽松命中"
│      → RGI
│         关键：-t protein 只覆盖蛋白层面模型；
│               rRNA 点突变类模型需要核酸输入（-t contig/genome）
│         关键：strict（达到模型 curated 阈值）与 loose（仅序列相似）必须分开报告
├── "获得性耐药基因 + 物种特异点突变 + 表型预测"
│      → ResFinder / PointFinder
│         关键：PointFinder **必须用 -s 指定物种**，且只支持有限的一组物种
│               （Campylobacter、E. coli、Enterococcus、Klebsiella、M. tuberculosis、
│                N. gonorrhoeae、P. falciparum、Salmonella、S. aureus、H. pylori 等）
│         关键：--ignore_missing_species 会让点突变被静默忽略，
│               结果看起来「没有突变」，其实是「没有查」
│         关键：表型预测（pheno_table）是基于规则的推断，不能替代 MIC
└── "用 NCBI 的体系做交叉验证，尤其是染色体点突变"
       → AMRFinderPlus
          关键：**必须指定物种（--organism）**，否则点突变检测不会启用，
                会漏掉氟喹诺酮、利福平等最重要的染色体耐药机制
          关键：默认只报耐药相关条目；--plus 才包含毒力与胁迫/生物杀灭剂基因
          关键：数据库由 NCBI 持续更新，版本与运行日期必须记录

需要检测点突变耐药？
└── 必须明确选一个「能看点突变」的工具
      ABRicate 做不到；只看「基因存在/缺失」的筛查也做不到
      这是很多「基因筛查阴性却表型耐药」案例的直接原因

需要覆盖 rRNA 基因突变（如 23S rRNA）？
└── 必须用核酸输入
      只提交蛋白会漏掉这部分模型（RGI 蛋白模式 / AMRFinderPlus 蛋白输入同理）
```

**数据库覆盖范围的差异是结论差异的主因，不是工具「谁更准」：**

| 数据库 / 工具 | 侧重 | 覆盖特征 |
|---|---|---|
| CARD / RGI | 覆盖面广、模型细（protein homolog / variant / rRNA variant / overexpression 等） | 更新频繁，ARO 编号与阈值随版本变；有学术使用许可限制，不能再分发 |
| ResFinder / PointFinder | 已确证的获得性基因 + **物种特异**染色体点突变 | 点突变覆盖限于支持物种列表 |
| AMRFinderPlus（NCBI） | 获得性基因 + 物种特异点突变 + 胁迫/生物杀灭剂 | 需指定物种；每月更新 |
| ABRicate 打包库 | 快速多库核酸比对 | 快照式更新，滞后明显；不做点突变 |

**同一份样本换库会得到不同的基因清单。这不是矛盾，而是工具差异。** 结论里必须说明所用数据库与版本；跨库合并前要先映射到统一命名（如 ARO）。

### 决策树 D：毒力、可移动元件与噬菌体

```
毒力因子？
├── 研究需要与文献可比、要求严格 → VFDB **core（setA，经实验验证的毒力因子）**
├── 探索性筛查、想尽量多检出 → VFDB full（setB，含同源与推定序列）
│     注意：用 full 统计「毒力基因数量」会系统性高估
└── 无论哪一路：**毒力基因的存在不等于致病性**
      黏附素、分泌系统、铁载体在非致病菌与共生菌中广泛存在

可移动元件？
├── 病毒 / 质粒序列的识别与分类 → geNomad（本地、可批量）
│     注意：**geNomad 不做宿主预测**
│           （它给的是病毒/质粒识别、ICTV 分类与基因注释；
│            宿主范围预测需要 iPHoP、CHERRY、WIsH 等专门工具）
├── 病毒序列的完整度与质量分级 → CheckV（**不做病毒识别**，输入应当是已识别的病毒 contig）
├── 质粒复制子分型 → PlasmidFinder
│     注意：复制子存在不能推出质粒大小、拷贝数、是否完整、是否携带耐药基因
├── 可移动元件的功能分类 → mobileOG-db
│     注意：整合酶/转座酶同源性广泛存在，命中 ≠ 可移动 ≠ 发生过水平转移
├── 前噬菌体定位（重点样本的人工核对）→ PHASTER / PHASTEST（网页服务）
│     大批量必须用本地工具（geNomad + CheckV），网页服务不适合批量自动化
└── CRISPR-Cas 系统 → CRISPRCasFinder
      注意：它只覆盖 CRISPR-Cas，不代表全部噬菌体防御系统
            （限制修饰、毒素-抗毒素、CBASS 等需要 DefenseFinder 一类工具）
      开发者也明确不建议用于宏基因组
```

### 三条端到端路线的取舍

| 场景 | 路线 | 关键提醒 |
|---|---|---|
| 常规分离株的完整注释（新项目） | Bakta → eggNOG/KofamScan（按需）→ 耐药/毒力专项 | 全项目统一注释器与库类型是前提 |
| 复现旧论文的注释结果 | Prokka（沿用同样的参数与版本）→ 相同的下游工具 | 记录版本，并说明 Prokka 已停止维护 |
| 发表/提交要求 accession | 本地注释 → 提交 NCBI → PGAP 官方注释 → **用官方注释重做下游** | PGAP 会重分配 locus_tag，不能与本地注释按 ID 合并 |

## 6.4 关键参数取舍

### Prokka

| 参数 | 默认 | 建议与理由 |
|---|---|---|
| `--kingdom` | Bacteria | 古菌、病毒、真菌**必须显式改**，否则 Prodigal 的基因模型与 rRNA/tRNA 搜索都会错，结果看起来「有注释」但实际不可用 |
| `--genus` / `--usegenus` | 关闭 | 用属特异 BLAST 库提高近缘物种注释率；需要事先建库并 `prokka --setupdb`，否则会退回通用库 |
| `--locustag` | 由输出前缀派生 | **多菌株项目必须显式指定唯一前缀**，否则 locus_tag 冲突，泛基因组与合并表会报重复 ID |
| `--mincontiglen` | 200 | 短于该长度的 contig 被**静默丢弃**，既不报错也不提示。草图里的小质粒片段会整段消失，表现为「基因数比预期少」 |
| `--rfam` | 关闭 | 开启后用 Infernal/Rfam 搜索 ncRNA，注释更完整但显著变慢，且需要额外的 Rfam 库 |
| `--compliant` | 关闭 | 强制符合 GenBank 的 locus_tag 与 gene 命名规则，为提交做准备；会改变部分命名结果 |
| `--proteins` | 无 | 提供可信蛋白库，命中的基因优先采用你给的注释；适合固定几类关键基因的命名 |

### Bakta

| 参数 | 默认 | 建议与理由 |
|---|---|---|
| `--db` / `-d` | `<bakta_path>/db` 或 `$BAKTA_DB` | 数据库路径；**库类型（full/light）与版本是结果的一部分**，必须记录并归档 `.txt`/`.json` 头部 |
| `--min-contig-length` / `-m` | 1（`--compliant` 时为 200） | 默认会把极短 contig 也注释，碎片化草图会产生大量短 ORF 与 hypothetical；这个默认值差异容易被忽略，导致同一批数据在不同参数下「基因数」明显不同 |
| `--gram` | `?` | 革兰氏类型，影响信号肽与脂蛋白相关预测。**不指定时这部分判断会缺失**；不同样本指定不一致会让样本间结果不可比 |
| `--meta` | 关闭 | 只影响 CDS 预测（宏基因组模式）。MAG 与宏基因组来源应开启，否则会漏掉跨越 contig 边缘的片段基因；**对完成图乱加 `--meta` 也会让边缘预测过于保守** |
| `--locus-tag` | 自动生成 | 多菌株批量注释必须显式指定，否则跨基因组合并时 ID 不可追溯或冲突 |
| `--compliant` | 关闭 | 强制 GenBank/ENA/DDBJ 合规（命名、最小 contig 长度等），**提交前必开** |
| `--proteins` / `--hmms` | 无 | 可信蛋白或 HMM；FASTA 头可写 `min_identity` 与覆盖度阈值（不给则用 90/80/80） |

### PGAP / 提交

| 参数 / 事项 | 建议与理由 |
|---|---|
| BioSample / BioProject | 提交前必须申请，缺失会直接退回；样本元数据（来源、宿主、培养条件）与序列同等重要 |
| `table2asn -t` | 提交模板（`.sbt`）：作者、机构、联系方式等元数据；没有它无法生成可提交的 `.sqn` |
| `table2asn -validate` | 只校验并输出报告，不生成提交文件；**提交前务必先跑一遍** |
| FASTA 序列命名 | 不要带空格、非法字符或注释性描述；规则会变，必须以 NCBI 提交页面的当前说明为准，不要照抄旧教程 |
| 组装质量门槛（自定） | 提交前先过污染与完整性检查（CheckM2/GUNC/BUSCO）并记录阈值；公开一个受污染的基因组代价很高 |
| 内部编号 ↔ accession 映射表 | **必须自己维护**；一旦丢失，几个月后就无法确定哪个样本对应哪个 accession |

### 功能归类

| 工具 | 参数 | 默认 | 建议与理由 |
|---|---|---|---|
| eggNOG-mapper | `-m` | diamond | 搜索后端：diamond 最快、mmseqs 更省内存、hmmer 最敏感但极慢；**换后端会改变命中集合** |
| | `--itype` | proteins | 直接用你的蛋白；`genome`/`metagenome` 会内部预测基因、边界不可控，通常不如先跑 Prokka/Prodigal |
| | `--tax_scope` | 自动（按物种推断） | 限定注释转移的分类分支；对非模式物种先用默认值，再抽查若干基因 |
| | `--go_evidence` | 非电子推断（取值以官方文档为准） | GO 注释的证据过滤方式；不同项目用不同设置会让 GO 条目数系统性不同，**必须在方法里写明** |
| | `-e` | 0.001 | 同源搜索的 E-value 上限；放宽会明显增加错误归属，跨项目比较必须一致 |
| | `--dbmem` | 关闭 | 把整个 eggNOG 库载入内存，速度提升明显但要数十 GB 内存；内存不足会被 OOM 杀掉，日志里不一定有醒目报错 |
| | `--sensmode` | 默认档位 | 远缘同源用更敏感的档位，但运行时间成倍增加；**同一项目所有样本必须用同一档** |
| KofamScan | `-p` / `-k` | 无 | Kofam profiles 与 ko_list；**必须来自同一次下载**，混用不同日期的库会让阈值失效 |
| | `--threshold` | 1.0 | 阈值缩放因子：1.0 表示按每个 KO 训练出的自适应阈值判定。为「多检出几条」而统一放松会显著增加错误归属；**不要把它调成全局固定值** |
| | `-E` | 0.01 | E-value 上限；放宽到 1 会明显增加弱命中，跨项目比较必须一致 |
| | `--cpu` | 1 | HMM 搜索是主要开销，批量运行务必显式设置 |
| InterProScan | `-appl` | 全部成员库 | 裁剪能大幅提速，但**也会改变「没有注释」的含义**：未命中只代表这些库没命中，不能写成「该蛋白没有已知结构域」 |
| | `-f` | TSV | TSV 便于解析，GFF3 便于可视化；可组合 |
| | `-goterms` / `-pa` | 关闭 | 额外输出 GO 与通路映射；不开启时结果里没有 GO 列，别以为是没有注释 |
| | `-dp` | 关闭 | 禁用预计算的 lookup service；离线环境与需要完全本地化时必须开启（部分应用结果会不同） |
| DIAMOND | `-f` | 6 | 自定义输出列时**必须在方法里写明列顺序**；分类信息要显式加 `staxids` |
| | `--sensitive` / `--very-sensitive` | 偏快的默认档 | 远缘同源（环境样本、新属）的命中率随档位明显变化，至少做一次档位对照 |
| | `-k` | 25 | 每条查询保留的命中数；**做 LCA 需要更多命中（如 100 以上）**，只取 top1 会丢掉分类信息 |
| | `-b` / `-c` / `--block-size` | 自动 | 控制内存占用；大库 + 高线程容易 OOM，进程被杀时常常只留下不完整的输出文件 |
| | `--taxonmap` / `--taxonnodes` | 无 | 要输出 `staxids` 必须提供 NCBI 的 accession2taxid 与 nodes.dmp，否则该列是空的或直接报错 |
| dbCAN | `--tools` | 多方法组合 | 官方建议「至少两种方法支持」才算高置信；只用 HMMER 会把远缘同源大量算进来 |
| | 模式（prok/meta/protein） | 给蛋白时为 protein | 宏基因组与 MAG **必须用 meta**，否则碎片化 contig 上的基因会大量漏检 |

### 耐药与毒力

| 工具 | 参数 | 默认 | 建议与理由 |
|---|---|---|---|
| RGI | `-t / --input_type` | protein | `protein` 只覆盖蛋白层面模型；`contig`/`genome` 才能分析 rRNA 等需要核酸的耐药决定簇 |
| | `--include_loose` | 关闭 | 额外输出未达阈值的 loose 命中；用于扩展候选，**绝不能与 strict 混在一起统计** |
| | `--local` | 关闭 | 使用本地 CARD 数据库；本地库版本必须记录，联网模式则结果依赖服务端版本 |
| | `--clean` | 关闭 | 删除中间文件，避免目录被几十 GB 的中间结果撑满 |
| ABRicate | `--minid` | 80 | 降到 70 会明显增加假阳性，提到 90 以上会漏掉真实的等位变异 |
| | `--mincov` | 80 | 调低会让截断的基因片段也进入清单，需要逐条看 `%COVERAGE` 与比对区域 |
| | `--summary` | 关闭 | 把多个 `.tab` 合并成基因 × 样本矩阵，是批量比较的入口 |
| ResFinder | `-s / --species` | 无 | **点突变判定必需**；只支持有限物种，写错或缺失会让结果失真 |
| | `-t / --threshold` | 0.8 | identity 阈值（0–1）；提高会减少假阳性，也会漏掉分歧较大的等位基因 |
| | `-l / --min_cov` | 0.6 | 最小覆盖度；默认允许部分命中，「完整基因还是片段」要另看比对长度 |
| | `--acquired` / `--point` | 都要显式指定 | 只写其中一个会**静默缺少**另一部分结果 |
| | `-ifa` / `-ifq` | 无 | 组装或读长模式；两种模式对点突变的敏感度不同，关键位点建议都跑并核对 |
| | `--ignore_missing_species` | 关闭 | 物种不在支持列表时不报错，但点突变会被静默忽略；除特殊情况外不建议使用 |
| VFDB | core（setA）vs full（setB） | 按研究目的选择 | core 只含经实验验证的毒力因子；full 含同源与推定序列，**用它统计数量会系统性高估**，选择必须写进方法 |
| | `--minid` / `--mincov` | 80 / 80 | 毒力因子同源性差异大，建议把 identity 提高到 85–90 并做敏感性分析 |
| | 计数单位 | 按基因去重 | VFDB 条目粒度不一致（操纵子 vs 单基因），先定好按什么计数再比较 |
| PlasmidFinder | `-t / --threshold` | 0.8 | 放宽会增加染色体上复制子样序列的假阳性 |
| | `-l / --min_cov` | 0.6 | 低覆盖命中常来自截断的复制子片段，判读时要看所在 contig |
| | `-p / --db_path` | 无 | 不同数据库针对的类群不同（如肠杆菌科、革兰氏阳性），**用错会得到全阴性** |
| CheckV | 质量分级阈值 | 固定 | 下游按用途选择保留哪些级别并写明 |
| | 输出序列文件 | `viruses.fna` | 前病毒分析用 `proviruses.fna`（已切除宿主区）；两者混用会把宿主基因算进病毒组 |
| geNomad | `--relaxed` / `--conservative` | 默认后处理过滤 | 过滤强度直接决定「病毒数量」；**改档必须写进方法**，否则不可比 |
| mobileOG-db | `-e` / `--id` / `--query-cover` | DIAMOND 默认 | 放宽会引入宿主同源基因（重组酶、解旋酶）造成的假阳性；MGE 家族内部差异大，identity 通常设 30–40 并写明 |
| CRISPRCasFinder | evidence level | 1–4 全部输出 | **筛选依据而非可选参数**：level 1 基本是背景噪声，通常只把 level 4（或 3–4）当作候选系统 |

## 6.5 常见坑

这一节讲**跨步骤的系统性问题**。

### 坑 1：把注释字段当结论

`product`、`EC`、`gene`、`product` 里的「putative」被删掉、或基因名被自动补全——这些都是注释器的输出，不是知识。风险最高的是**基因家族密集的区域**：

- ABC 转运蛋白与其它转运蛋白（同一家族内部底物特异性差异极大）；
- 双组分调控系统（传感器激酶与响应调节因子常互相错配）；
- 外排泵（同一家族的不同蛋白底物谱完全不同）；
- 假定蛋白被「顺手指派」了一个功能。

规范做法：发表级结论涉及的关键基因，必须回到文献或实验核对。核对手段包括回检比对（看命中覆盖度与 identity）、结构域证据（`anno_interpro`）、以及在近缘参考基因组中的同源基因上下文。

### 坑 2：基因存在 ≠ 表型耐药（三段式推理）

这是耐药注释里最重要、也最常被简化的逻辑。完整的链条有三段，而数据库筛查只覆盖第一段：

| 环节 | 数据库筛查能回答 | 常见反例 |
|---|---|---|
| 基因是否存在 | 是 | 基因存在但不表达（沉默的可移动抗性基因） |
| 是否表达并产生有功能的蛋白 | 否 | 截断、移码、点突变导致失活 |
| 是否表现为耐药表型 | 否 | 孔蛋白缺失、外排泵过表达、生物膜、接种量效应、CARD 未收录的新机制 |

因此：**「检出某耐药基因」不等于「该菌株对该抗生素耐药」**。临床或发表结论必须结合药敏数据（MIC / 纸片法），或至少在报告中明确写出这是基因型推断。

### 坑 3：点突变耐药是「基因存在/缺失」筛查的盲区

这是「基因筛查阴性却表型耐药」最主要的解释。具体表现：

- **ABRicate 完全不做点突变检测**（gyrA、parC、rpoB、23S rRNA 等一律不报）；
- **AMRFinderPlus 不指定 `--organism` 时点突变检测不会启用**，结果看起来「干净」却是漏报；
- **PointFinder 只支持有限的一组物种**，且加了 `--ignore_missing_species` 之后不报错、点突变被静默忽略；
- **RGI 的蛋白模式会漏掉需要核酸的模型**（例如 rRNA 基因突变）。

可操作的检查清单：报告耐药结论前，确认三件事——(1) 至少有一个工具做了点突变检测；(2) 物种参数正确填写；(3) 需要核酸层面的模型时用了核酸输入。

### 坑 4：数据库版本决定结果，而版本常被当成附注

本章涉及的每一个数据库都在持续更新，且更新会改变结论：

| 数据库 | 变化内容 | 影响 |
|---|---|---|
| CARD / RGI | ARO 编号、bit-score 阈值、新增条目 | 同一份样本在不同版本下的 strict 命中会不同 |
| resfinder_db / pointfinder_db | 持续新增等位基因 | 基因名与数量都会变（输出 JSON 里带版本，归档要保留） |
| AMRFinderPlus 数据库 | NCBI 每月更新 | 同一样本在不同版本下可能多出或少掉条目 |
| Bakta 数据库 | full / light 库的参考序列集合不同 | 注释率与 product 都会变 |
| eggNOG | 5.0.x 与旧版 4.5 的 ortholog 分配差异明显 | 同一个基因可能拿到不同编号 |
| Kofam / KEGG | KO 编号被合并、拆分或废弃 | 不同时间点跑同一批蛋白会得到不同的 KO 清单 |
| VFDB | 更新频率低于耐药库 | 阴性结果只能说明「不在当前版本里」 |
| mobileOG-db / geNomad / CheckV | 类别定义与参考库更新 | 统计结果与分类结果都会变 |

结论：**数据库版本与软件版本必须一起记录**，并且跨项目比较前先锁定同一版本。这条要求在本指南里反复出现，因为它是注释类结果可复现性的主要杀手。

### 坑 5：阈值分层被混在一起统计

几乎所有耐药/毒力工具都有「严格 / 宽松」两档或多档判定，它们**不能混在一起统计**：

| 工具 | 分层 | 混用的后果 |
|---|---|---|
| RGI | `strict` / `loose` | 把 loose 计入「耐药基因数」会明显高估 |
| geNomad | 默认 / `--relaxed` / `--conservative` | 「病毒数量」不可比 |
| ABRicate | `--minid` / `--mincov` 的不同取值 | 同一份数据在 80/80 与 90/90 下基因清单明显不同 |
| ResFinder | `-t` / `-l` 阈值 | 跨研究比较前必须确认双方用的是同一组阈值 |
| CheckV | Complete / High / Medium / Low | 把低完整度碎片当基因组做分析会得到不完整的基因含量 |
| CRISPRCasFinder | evidence level 1–4 | 把 level 1–2 计入「CRISPR 数量」会明显高估 |

规范做法：交付表与论文里都写明用的是哪一档，并**只在该档内做统计**。

### 坑 6：计数单位不统一，导致「谁更多」的结论失真

「耐药基因数量」「毒力因子数量」「CAZyme 数量」这类汇总数字，几乎每一个都埋着计数单位的陷阱：

| 场景 | 陷阱 | 正确做法 |
|---|---|---|
| RGI 命中 | 同一 ARO 常有多条命中记录（多个片段或等位拷贝） | 统计前**按 ARO（必要时再加序列）去重** |
| VFDB | 条目粒度不一致（有的代表一个操纵子，有的是单个基因） | 先定好计数单位再比较；操纵子型条目应按操纵子计数 |
| dbCAN / CAZy | 一条蛋白常同时带催化域与 CBM | **按蛋白去重**；CBM 与催化域分开统计，AA/CE 不要混进 GH |
| KofamScan | 一条蛋白可命中多个 KO | 统计前定规则（只保留强命中，或每条基因取 score 最高者） |
| mobileOG-db | 类别是多标签结构，同一蛋白可能归入多个类别 | 先按 ORF 去重，再定「主类别归属」规则 |
| 多库合并 | 同一基因在不同库里有不同别名 | 先映射到统一命名（如 ARO），再合并 |

一个推论：**跨基因组比较「附属基因更多」之前，必须先确认两边的计数规则一致**，否则差异可能完全来自计数方式。

### 坑 7：上游基因预测决定命中集合，注释器不一致会制造「假基因家族」

这一条跨越本章与第 7 章，是本章对下游影响最大的一个坑：

- 同一菌株用 Prokka、Bakta 或 `Prodigal -p meta` 得到的**蛋白边界不同**，RGI / AMRFinderPlus 的命中与覆盖率也随之不同；
- 混用 Prokka、Bakta 与 NCBI 已提交的 GFF 时，基因边界与命名策略不同，**同一个基因可能被切成两段或合并成一段**；
- 结果是在泛基因组或存在/缺失矩阵里凭空出现大量**假家族**，表现为附属基因组虚高、核心基因组偏低——而且**不会报任何错**。

正确做法只有一条：

> 先用同一套流程重注释全部基因组，再进入跨基因组比较。注释器在**全项目内统一**这件事，比选哪个注释器更重要。

顺带一条实操细节：Prokka 的 GFF 自带 `##FASTA` 段，而只输出坐标表的注释工具没有序列；后者必须把基因组 FASTA 一起传给下游（例如 Panaroo 的 `-i`），否则提取不到基因序列，报错信息往往与真正原因相隔很远。

### 坑 8：坐标与 ID 不可跨工具合并

三个具体的断点：

1. **`seqid` 被重写。** Prokka 会把 contig 名改成 `contig00001` 之类，注释坐标不再与原始组装的名字对应。把注释结果与原始 contig 或其它工具结果合并前，必须先确认名字映射，否则坐标对错位置却看不出来。
2. **locus_tag 冲突。** `--locustag` 默认由输出前缀派生；批量注释多菌株时若前缀相同、或重复运行覆盖了输出，locus_tag 会撞车，泛基因组、合并 TSV 与后续提交都会因此失败。
3. **PGAP 会重新分配 locus_tag 并改写基因名。** 因此**不能按 locus_tag 把 PGAP 注释与本地 Prokka/Bakta 的结果直接合并**，必须通过坐标或序列比对建立映射。

### 坑 9：静默的参数影响

一批「不报错但改变结果」的参数，值得单独列出来当检查清单：

| 参数 | 静默影响 |
|---|---|
| Prokka `--mincontiglen` 200 | 短于 200 bp 的 contig 被静默丢弃，小质粒片段整段消失 |
| Bakta `--min-contig-length` 1（`--compliant` 时 200） | 极短 contig 也被注释成基因，碎片化草图产生大量短 ORF |
| Bakta `--gram` 默认 `?` | 信号肽与脂蛋白相关注释不完整；不同样本不一致则不可比 |
| Bakta `--meta` | 只改 CDS 预测；用错会漏掉（或过度保守处理）contig 边缘的片段基因 |
| Prokka `--locustag` 默认派生 | 重复运行时 ID 冲突 |
| ResFinder `--ignore_missing_species` | 点突变被静默忽略 |
| AMRFinderPlus 不填物种 | 点突变不检测 |
| KofamScan `-E` 放宽 | 弱命中大量进入结果 |
| 各工具默认线程数（如 KofamScan `--cpu 1`） | 不是错误，但会让批量流程慢到不可用 |

应对方式与第 3 章相同：**每一类「模式 / 阈值」参数都要显式给出并写进日志。**

### 坑 10：毒力基因不等于致病性

VFDB 命中最容易被过度解读，原因有两个：

1. **条目本身的性质**：黏附素、分泌系统、铁载体这类条目在非致病菌与共生菌中广泛存在；不少条目只是「与已知毒力因子同源」的功能未知蛋白。
2. **数据集的选择**：full（setB）含同源与推定序列，用它统计「毒力基因数量」会系统性高估。

**把 VFDB 命中列表当致病性证据是典型的过度解读。** 致病性结论必须有表型、动物实验或流行病学证据支持。并且注意 VFDB 的基因名与 KEGG/COG/CARD 体系不同，跨库合并前要先建立映射，否则同一基因会出现在多个功能类别里。

### 坑 11：可移动元件与水平转移的推断链太长

「检出整合酶 → 这是可移动元件 → 发生过水平转移」这条链上每一环都可能断：

- **整合酶、重组酶、解旋酶在宿主基因组里也有大量同源基因**，单凭命中不能判定可移动元件；
- **碎片化组装会切碎可移动元件**：完整元件常跨越多个 contig，检出多个标志基因不等于存在一个完整元件或一个接合质粒，宏基因组上尤其容易高估；
- **判断 MGE 边界与转移事件**需要基因组上下文（侧翼序列、tRNA 位点、GC 异常）或实验证据（接合实验、系统发育冲突、时间序列）。

同样地：**geNomad 不做宿主预测。** 这是它最常见的误用——它输出的是病毒/质粒识别、ICTV 分类与基因注释；宿主范围预测需要 iPHoP、CHERRY、WIsH 等工具，而且宿主预测本身是推断而非观测，报告时必须给出预测依据。

### 坑 12：多库结果不一致时「取并集」或「取交集」都不对

同一份样本跑 CARD/RGI、ResFinder、AMRFinderPlus、ABRicate，会得到**不完全一致的清单**。这是预期的，因为数据库覆盖范围、判定逻辑与阈值都不同。三种常见错误处理：

| 错误做法 | 问题 |
|---|---|
| 取并集当结论 | 等于把各库的假阳性全部收进来；「耐药基因数量」会被系统性抬高 |
| 取交集当结论 | 会漏掉只有单一库覆盖的真实基因（例如某库未收录的等位基因） |
| 直接相加 | 同一基因在多个库里重复计数 |

正确的处理方式：

1. **选定一个主口径**（例如 CARD/RGI 的 strict，或 ResFinder 的获得性基因）作为判定依据；
2. 其余库的结果作为**独立证据**保留，报告分歧条目；
3. 用集合交集图（`viz_upset`）展示「哪些基因同时被多个数据库检出」——这比逐个列清单更有信息量，也能暴露单库假阳性；
4. 跨库合并前先映射到统一命名。

### 坑 13：把「没有注释」当成「没有功能」

KEGG 的覆盖本身有偏好：环境样本里大量蛋白没有 KO 是正常现象。**不要用 KO 命中率给样本质量打分，也不要把它当作功能多样性的绝对指标。** 同理：

- eggNOG 没有 COG 归属，不代表这个基因在生物学上不重要；
- InterProScan 裁剪了应用集合之后，「未命中」只代表这些库没命中；
- VFDB 阴性只说明「不在当前 VFDB 版本里」。

反过来也要小心：**有注释也不代表通路完整。** 判断「能否利用某底物 / 是否存在某条通路」需要检查该通路上其它 KO 是否存在（KEGG Mapper 或自建通路覆盖度），单个 KO 不足以支撑结论。同样，eggNOG 给的是逐基因的功能标签，不回答「通路是否完整、是否表达」。

### 坑 14：注释结果被用去验证注释结果

一个隐蔽的逻辑问题：用 eggNOG 的注释去「验证」Prokka 的 product，用 InterProScan 的条目去「验证」eggNOG 的归属——如果这些工具共享同一批参考序列（例如都以 UniProt 为基础），那么「一致」并不能提供独立证据。

**独立性来自方法学与数据来源的差异**，例如：同源搜索（序列层面）+ profile HMM（家族层面）+ 结构域（结构层面）+ 基因组上下文（共线性、操纵子结构）。报告交叉验证时，应说明各个证据线是否真的独立。

## 6.6 与面板模块 id 的对应

### 结构注释与功能注释

| 模块 id | 一句话说明 |
|---|---|
| `anno_bakta` | Prokka 的现代替代；标准化且带 dbxref，内置耐药/毒力筛查，仅面向细菌与质粒 |
| `anno_prokka` | 经典一站式注释与产物打包；已停止维护但格式与参数极稳定 |
| `anno_prodigal` | 轻量 CDS 预测器；`single` 与 `meta` 两种模式结果差别很大，不查任何数据库 |
| `anno_ncbi_submit` | 提交 NCBI 由 PGAP 注释并取得 accession；单向动作，locus_tag 会被重分配 |
| `anno_eggnog` | 把蛋白映射到 eggNOG 同源群并转移 COG/GO/KEGG 标签 |
| `anno_kofamscan` | 用 Kofam HMM 库把蛋白分配到 KEGG KO；KO 不是酶活性的证明 |
| `anno_diamond_nr` | 蛋白序列同源搜索；物种归属必须用 LCA 而不是 best hit |
| `anno_interpro` | 蛋白结构域注释；关键看命中覆盖全长的哪一段 |
| `anno_dbcan` | 三路证据注释 CAZyme 家族；官方建议「两种以上方法支持」才算高置信 |
| `anno_cazy` | 基于 CAZy 官方序列的独立比对路线，用于交叉验证 dbCAN |

### 耐药、毒力与可移动元件

| 模块 id | 一句话说明 |
|---|---|
| `res_card_rgi` | 用 CARD 模型库做 strict/loose 两级耐药基因判定；两档必须分开报告 |
| `res_resfinder` | 获得性耐药基因 + 物种特异点突变 + 表型预测；物种与阈值决定结果 |
| `res_abricate` | 一次把 contig 扫过多个库；不做基因预测、不检测点突变，适合初筛 |
| `res_vfdb` | 毒力因子注释；core 与 full 的选择决定结论，命中不等于致病性 |
| `res_plasmidfinder` | 质粒复制子分型；复制子存在不能推出质粒大小与内容 |
| `res_mobilome` | 用 mobileOG-db 把蛋白归入移动元件功能类别；命中不等于可移动 |
| `var_amrfinder` | NCBI 的耐药基因与点突变检出；不指定物种会系统性漏报点突变 |
| `phage_genomad` | 从基因组或宏基因组识别病毒与质粒并做 ICTV 分类；**不做宿主预测** |
| `phage_checkv` | 评估单 contig 病毒基因组的完整度与污染；**不做病毒识别** |
| `phage_phaster` | 网页版前噬菌体鉴定；大批量应改用 geNomad + CheckV |
| `phage_crisprcas` | CRISPR 阵列与 Cas 基因鉴定；只覆盖 CRISPR-Cas，不代表全部防御系统 |

### 支撑与下游

| 模块 id | 一句话说明 |
|---|---|
| `asmqc_checkm2` | 用蛋白输入跑质量评估；注释器不同会带来小数点级别的差异，批次比较要固定流程 |
| `asmqc_gunc` | 污染与嵌合检验；同样依赖蛋白输入 |
| `pange_panaroo` | 直接消费本章的 GFF3 构建泛基因组；注释必须同源是前提 |
| `comp_gene_presence` | 把多基因组注释整合成基因存在/缺失矩阵；注释必须同源 |
| `py_pandas_io` | 整理注释表；注意 eggNOG 表头以 `#` 开头、多值字段需拆分 |
| `viz_upset` | 展示「哪些基因同时被多个数据库检出」，暴露单库假阳性 |
| `viz_heatmap` | 耐药/毒力基因存在缺失热图，展示菌株间差异 |
| `wf_reproducibility` | 工具与数据库版本、阈值与命令的记录规范 |
| `util_download_ref` | 数据库下载与版本管理；本章所有结论都依赖它 |

## 6.7 延伸阅读

**工具与数据库官方文档**

- Bakta：<https://bakta.readthedocs.io/>
- Prokka：<https://github.com/tseemann/prokka>
- Prodigal：<https://github.com/hyattpd/Prodigal>
- NCBI PGAP：<https://www.ncbi.nlm.nih.gov/genome/annotation_prok/>；`table2asn` 说明见 NCBI 提交页面
- eggNOG-mapper：<http://eggnog-mapper.embl.de/>
- KofamScan / KEGG：<https://www.genome.jp/tools/kofamkoala/>
- InterProScan：<https://interproscan-docs.readthedocs.io/>
- DIAMOND：<https://github.com/bbuchfink/diamond>；MMseqs2：<https://github.com/soedinglab/MMseqs2>
- CARD / RGI：<https://card.mcmaster.ca/>、<https://github.com/arpcard/rgi>
- ResFinder / PointFinder（CGE）：<https://cge.food.dtu.dk/services/ResFinder/>
- AMRFinderPlus：<https://github.com/ncbi/amr>
- ABRicate：<https://github.com/tseemann/abricate>
- VFDB：<http://www.mgc.ac.cn/VFs/>
- dbCAN：<https://github.com/linnabrown/run_dbcan>
- mobileOG-db：<https://mobileogdb.flsi.cloud.vt.edu/>
- geNomad：<https://github.com/genomadbio/genomad>；CheckV：<https://bitbucket.org/berkeleylab/CheckV>
- CRISPRCasFinder：<https://crisprcas.i2bc.paris-saclay.fr/>

**方法学背景文献**

- Seemann, *Bioinformatics*, 2014 —— Prokka 的设计与「快速、一致、够用」的定位。
- Schwengers et al., *Microbial Genomics*, 2021 —— Bakta 的 AFSI 哈希策略与模块化输出。
- Hyatt et al., *BMC Bioinformatics*, 2010 —— Prodigal 的基因模型训练方式（single vs meta）。
- Tatusova et al., *Nucleic Acids Research*, 2016 —— NCBI 原核基因组注释流程（PGAP）。
- Cantalapiedra et al., *Molecular Biology and Evolution*, 2021 —— eggNOG-mapper 的注释转移策略。
- Aramaki et al., *Bioinformatics*, 2020 —— KofamScan 与 Kofam 自适应阈值。
- Jones et al., *Bioinformatics*, 2014 —— InterProScan 的多库整合思路。
- Buchfink et al., *Nature Methods*, 2021 —— DIAMOND 的算法与敏感度档位。
- Alcock et al., *Nucleic Acids Research*, 2023 —— CARD 与 RGI 的模型类型（含 strict/loose 判定）。
- Bortolaia et al., *Journal of Antimicrobial Chemotherapy*, 2020 —— ResFinder 4 与 PointFinder 的物种限制。
- Feldgarden et al., *Scientific Reports*, 2021 —— AMRFinderPlus 与 `--organism` 对点突变检测的作用。
- Zheng et al., *Nucleic Acids Research*, 2023 —— dbCAN 的多方法共识策略。
- Liu et al., *Nucleic Acids Research*, 2019 —— VFDB 的 core / full 数据集。
- Camargo et al., *Nature Biotechnology*, 2024 —— geNomad 的标志基因 + 神经网络框架。
- Nayfach et al., *Nature Biotechnology*, 2021 —— CheckV 的完整度估计与质量分级。
- Couvin et al., *Nucleic Acids Research*, 2018 —— CRISPRCasFinder 与 evidence level。

**与本指南其它章节的关系**

- 上游：组装见第 3 章 `03-genome-assembly.md`；质量与污染评估见第 4 章 `04-assembly-qc.md`；物种确认见第 5 章 `05-taxonomy-identification.md`。
- 下游：注释产物如何进入比较与泛基因组见第 7 章 `07-comparative-pangenome.md`。
- 旁支：病毒组与宏基因组层面的功能分析见第 8 章 `08-metagenome-microbiome.md`；转录证据如何补上「是否表达」这一环见第 9 章 `09-transcriptome-differential-expression.md`。

> 文献条目只给出作者、期刊与年份，便于定位；卷期页码请在期刊页面核对。CARD 等数据库有学术使用许可限制，正式项目请按官方要求获取与引用。工具与数据库版本请以你实际使用的为准——本章反复强调的一点是，**这些版本本身就是结论的一部分**。
