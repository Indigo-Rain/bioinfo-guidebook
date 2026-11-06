# 工具索引（tool index）

> **本文件由数据生成，如需更新请重新运行生成脚本，不要手工编辑。**
>
> 生成命令（在仓库根目录执行）：
>
> ```bash
> node tools/gen-reference.mjs tool-index
> ```
>
> 数据源：`data/catalog.json`（分类顺序）+ `data/modules/*.json`（模块与 `provides`）。
> 表中的模块 id 直接取自数据，因此天然存在；如需核对 docs/ 全部章节里的模块 id 引用与文档链接，运行：
>
> ```bash
> node tools/gen-reference.mjs verify
> ```

## 索引概览

| 指标 | 数量 |
|---|---|
| 分类 | 20 |
| 模块 | 160 |
| 工具声明（provides 条目，按「模块 × 工具」计） | 406 |
| 去重后的工具名 | 262 |
| 分类文件 | 20 |

「工具声明」与「工具名」的区别值得说清楚：同一个工具常出现在多个模块里（`samtools` 既在质控去宿主、也在变异检测与格式转换中出现），
因此声明数（每条都带自己的版本与用途上下文）远多于工具名数。**统计工具总数时要说清用的是哪个口径**。

版本号写法遵循 `docs/reference/module-schema.md` 的约定：写「主.次」加 `x`（如 `0.23.x`），
用来表达「这个模块验证过的版本区间」，而不是某个精确的构建号。精确版本由使用者在自己的环境里核对。

## 按分类索引

分类顺序与 `data/catalog.json` 的 `categories[].order` 一致（上游 → 核心 → 下游 → 引擎）。

### 质控与去宿主（`quality-control`）

层：上游分析（`upstream`）　|　模块：8　|　工具声明：16

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `qc_fastp` | 读长质控与去接头 (fastp) | 常规 | fastp 0.23.x |
| `qc_fastqc` | 原始读长质量报告 (FastQC) | 常规 | FastQC 0.12.x |
| `qc_trimmomatic` | 读长修剪 (Trimmomatic) | 常规 | Trimmomatic 0.39 |
| `qc_multi_qc` | 多步骤质控汇总 (MultiQC) | 常规 | MultiQC 1.2x |
| `qc_remove_host` | 去除宿主污染序列 (Bowtie2 / minimap2) | 常规 | Bowtie2 2.5.x<br>minimap2 2.2x<br>SAMtools 1.1x |
| `qc_dedup_reads` | 读长去重与格式精简 (seqkit / clumpify) | 常规 | clumpify 39.x<br>seqkit 2.9.x |
| `qc_quality_trim_long` | 长读长质量控制 (NanoFilt / Filtlong) | 常规 | Filtlong 0.2.x<br>NanoFilt 2.8.x<br>NanoPlot 1.4x |
| `qc_contamination_screen` | 原始数据污染筛查 (Kraken 2 / FastQ Screen) | 常规 | Kraken 2 2.1.x<br>Bracken 2.9<br>FastQ Screen 0.15.x<br>Krona 2.8.x |

### 基因组组装（`assembly`）

层：核心分析（`core`）　|　模块：8　|　工具声明：17

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `asm_spades` | 基因组组装：SPAdes | 常规 | SPAdes 3.15.x |
| `asm_skesa` | 基因组组装：SKESA | 常规 | SKESA 4.5.x |
| `asm_flye` | 长读长组装：Flye | 常规 | Flye 2.9.x |
| `asm_unicycler` | 混合组装：Unicycler | 常规 | Unicycler 0.5.x<br>Pilon 1.2x |
| `asm_short_polish` | 短读长抛光长读长组装 (Pilon / POLCA) | 常规 | Pilon 1.2x<br>POLCA 4.x<br>BWA-MEM2 2.2.x |
| `asm_medaka_polish` | 长读长共识抛光 (Medaka / Racon) | 常规 | Medaka 1.1x<br>Racon 1.5.x<br>minimap2 2.2x |
| `asm_hic_scaffold` | Hi-C 挂载到染色体 (YaHS / SALSA2) | 常规 | YaHS 1.2.x<br>SALSA2 2.3<br>bwa 0.7.17 |
| `asm_filter_contigs` | contig 过滤与精简 (seqkit / seqtk) | 常规 | seqkit 2.9.x<br>seqtk 1.4<br>SAMtools 1.1x |

### 组装质量与污染评估（`assembly-qc`）

层：核心分析（`core`）　|　模块：5　|　工具声明：7

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `asmqc_quast` | 组装统计评估 (QUAST) | 常规 | QUAST 5.2.x |
| `asmqc_busco` | 单拷贝基因完整性评估 (BUSCO) | 常规 | BUSCO 5.6.x |
| `asmqc_checkm2` | 基因组完整度与污染度 (CheckM2) | 常规 | CheckM2 1.1.x |
| `asmqc_gunc` | 污染与近缘物种检验 (GUNC) | 常规 | GUNC 1.0.x<br>DIAMOND 2.1.x |
| `asmqc_ideel` | 组装错误与嵌合检验 (IDEEL / Assembly-scan) | 模板 | IDEEL 1.0.x<br>assembly-scan 0.7.x |

### 分类鉴定与物种注释（`taxonomy`）

层：核心分析（`core`）　|　模块：6　|　工具声明：10

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `tax_gtdbtk` | 基因组分类学注释 (GTDB-Tk) | 常规 | GTDB-Tk 2.4.x<br>Prodigal 2.6.x |
| `tax_fastani` | 基因组平均核苷酸一致性 (fastANI) | 常规 | fastANI 1.3x |
| `tax_16s_extract` | 从基因组提取 16S rRNA (barrnap / RNAmmer) | 常规 | barrnap 0.9<br>bedtools 2.31.x<br>RNAmmer 1.2 |
| `tax_16s_blast` | 16S 序列比对鉴定 (BLAST / EzBioCloud) | 常规 | BLAST+ 2.16.x |
| `tax_sourmash` | 基于 k-mer 的基因组相似性 (sourmash) | 常规 | sourmash 4.8.x<br>sourmash (Python API) 4.8.x |
| `tax_mash` | 快速基因组距离估计 (Mash) | 常规 | Mash 2.3 |

### 变异检测与分型（`variant-calling`）

层：核心分析（`core`）　|　模块：6　|　工具声明：14

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `var_bwa_map` | 读长比对到参考基因组 (BWA-MEM2) | 常规 | BWA-MEM2 2.2.x<br>BWA 0.7.17<br>SAMtools 1.1x |
| `var_bcftools_call` | 变异检出与过滤 (bcftools / FreeBayes) | 常规 | BCFtools 1.2x<br>FreeBayes 1.3.x<br>HTSlib (bgzip/tabix) 1.2x |
| `var_snippy` | 单菌 SNP 流程 (Snippy) | 常规 | Snippy 4.6.x<br>FreeBayes 1.3.x |
| `var_mlst` | 多位点序列分型 (MLST) | 常规 | mlst 2.2x |
| `var_amrfinder` | 耐药基因与突变检测 (AMRFinderPlus) | 常规 | AMRFinderPlus 3.12.x<br>BLAST+ 2.16.x<br>HMMER 3.4 |
| `var_typing_cgmlst` | cgMLST 分型 (chewBBACA / Ridom) | 常规 | chewBBACA 3.3.x<br>BLAST+ 2.16.x |

### 功能注释（`annotation-functional`）

层：核心分析（`core`）　|　模块：10　|　工具声明：21

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `anno_prokka` | 基因组注释：Prokka | 常规 | Prokka 1.14.x<br>Prodigal 2.6.x |
| `anno_bakta` | 基因组注释：Bakta | 常规 | Bakta 1.9.x<br>Prodigal (Pyrodigal) 2.6.x |
| `anno_prodigal` | 基因预测 (Prodigal) | 常规 | Prodigal 2.6.x |
| `anno_ncbi_submit` | 提交到 NCBI 注释 (PGAP) | 常规 | NCBI PGAP 2024.x<br>table2asn 1.2x.x |
| `anno_eggnog` | 同源群与功能归类 (eggNOG-mapper) | 常规 | eggNOG-mapper 2.1.x<br>DIAMOND 2.1.x<br>eggNOG 数据库 5.0.x |
| `anno_kofamscan` | KEGG 直系同源分配 (KofamScan) | 常规 | KofamScan 1.3.x<br>HMMER 3.4.x |
| `anno_diamond_nr` | 蛋白序列同源搜索 (DIAMOND / MMseqs2) | 常规 | DIAMOND 2.1.x<br>MMseqs2 15.x |
| `anno_interpro` | 蛋白结构域注释 (InterProScan) | 常规 | InterProScan 5.6x.x<br>HMMER 3.4.x |
| `anno_dbcan` | 碳水化合物活性酶注释 (dbCAN) | 常规 | dbCAN (run_dbcan) 4.1.x<br>HMMER 3.4.x<br>DIAMOND 2.1.x |
| `anno_cazy` | CAZy 分类归属 (CAZy 数据库比对) | 常规 | DIAMOND 2.1.x<br>BLAST+ 2.1x.x |

### 耐药与毒力（`annotation-resistance`）

层：核心分析（`core`）　|　模块：6　|　工具声明：17

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `res_card_rgi` | 耐药基因注释 (RGI / CARD) | 常规 | RGI 6.0.x<br>CARD 3.2.x<br>BLAST+ / DIAMOND 2.1x.x |
| `res_abricate` | 多数据库基因筛查 (ABRicate) | 常规 | ABRicate 1.0.x<br>BLAST+ 2.1x.x |
| `res_resfinder` | 耐药基因与突变 (ResFinder / PointFinder) | 常规 | ResFinder 4.7.x<br>PointFinder 4.7.x<br>KMA 1.4.x |
| `res_vfdb` | 毒力因子注释 (VFDB) | 常规 | ABRicate 1.0.x<br>BLAST+ 2.1x.x<br>DIAMOND 2.1.x |
| `res_plasmidfinder` | 质粒复制子分型 (PlasmidFinder) | 常规 | PlasmidFinder 2.1.x<br>KMA 1.4.x<br>BLAST+ 2.1x.x |
| `res_mobilome` | 可移动元件注释 (mobileOG-db) | 常规 | DIAMOND 2.1.x<br>HMMER 3.4.x<br>mobileOG-db 1.6.x |

### 噬菌体与可移动元件（`annotation-phage`）

层：核心分析（`core`）　|　模块：4　|　工具声明：9

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `phage_phaster` | 前噬菌体鉴定 (PHASTER / PHASTEST) | 常规 | PHASTER / PHASTEST (web service) 2023.x |
| `phage_checkv` | 病毒序列鉴定与质量评估 (CheckV) | 常规 | CheckV 1.0.x<br>DIAMOND 2.2.x<br>HMMER 3.3.x |
| `phage_genomad` | 病毒与质粒序列识别 (geNomad) | 常规 | geNomad 1.7.x<br>MMseqs2 15.x |
| `phage_crisprcas` | CRISPR-Cas 系统鉴定 (CRT / CRISPRCasFinder) | 常规 | CRISPRCasFinder 4.2.x<br>MacSyFinder 2.1.x<br>Prodigal 2.6.x |

### 泛基因组（`pangenome`）

层：核心分析（`core`）　|　模块：5　|　工具声明：13

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `pange_panaroo` | 泛基因组构建 (Panaroo) | 常规 | Panaroo 1.5.x<br>MAFFT 7.5xx<br>CD-HIT 4.8.x |
| `pange_roary` | 泛基因组构建：Roary（经典） | 常规 | Roary 3.13.x<br>Prokka 1.14.x |
| `pange_orthofinder` | 直系同源群推断 (OrthoFinder) | 常规 | OrthoFinder 3.1.x<br>DIAMOND 2.1.x<br>MAFFT 7.5xx |
| `pange_core_align` | 核心基因比对与串联 (core SNP alignment) | 常规 | MAFFT 7.5xx<br>trimAl 1.4.x<br>snp-sites 2.5.x |
| `pange_acc_stats` | 核心/附属基因统计与曲线 (rarefaction / accumulation) | 模板 | micropan 2.0.x<br>R 4.x |

### 比较基因组（`comparative`）

层：核心分析（`core`）　|　模块：5　|　工具声明：15

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `comp_syri` | 基因组共线性比较 (SyRI / MUMmer) | 常规 | SyRI 1.7.x<br>MUMmer (nucmer) 4.0.x<br>minimap2 2.2x |
| `comp_proksee` | 比较基因组可视化 (Proksee / CGView) | 常规 | proksee-batch 0.6.x<br>CGView 1.0.x |
| `comp_snp_dist` | SNP 距离矩阵（菌株传播） | 常规 | snp-dists 0.8.x<br>Snippy 4.6.x<br>Gubbins 3.3.x<br>bcftools 1.1x |
| `comp_gene_presence` | 基因存在/缺失矩阵构建 | 常规 | Scoary 1.6.x<br>DIAMOND 2.1.x<br>pandas 2.2.x |
| `comp_island_path` | 基因组岛与致病岛预测 (IslandViewer) | 常规 | IslandViewer 4 4.0.x<br>IslandPath-DIMOB 1.0.x<br>alien_hunter 1.7.x |

### 扩增子与微生物组（`amplicon`）

层：核心分析（`core`）　|　模块：8　|　工具声明：24

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `amplicon_qiime2_import` | 扩增子数据导入 (QIIME 2) | 常规 | QIIME 2 2024.x<br>q2-demux 2024.x<br>cutadapt (q2-cutadapt) 2024.x |
| `amplicon_dada2` | ASV 推断与去噪 (DADA2) | 常规 | DADA2 1.3x<br>q2-dada2 2024.x |
| `amplicon_deblur` | ASV 推断 (Deblur) | 常规 | Deblur 1.1.x<br>q2-deblur 2024.x |
| `amplicon_taxonomy_assign` | ASV 物种注释 (SILVA / Greengenes2) | 常规 | q2-feature-classifier 2024.x<br>DADA2 (assignTaxonomy) 1.3x<br>VSEARCH 2.2x<br>RESCRIPt 2024.x |
| `amplicon_qiime2_diversity` | 多样性与群落结构 (QIIME 2 diversity) | 常规 | QIIME 2 (q2-diversity) 2024.x<br>QIIME 2 (q2-phylogeny) 2024.x<br>SEPP (q2-fragment-insertion) 2024.x |
| `amplicon_phyloseq` | 微生物组数据对象与差异分析 (phyloseq) | 常规 | phyloseq 1.4x<br>microbiome 1.2x<br>ANCOMBC 2.x<br>ALDEx2 1.3x<br>DESeq2 1.4x |
| `amplicon_decontam` | 污染物序列识别 (decontam) | 常规 | decontam 1.2x |
| `amplicon_its_fungal` | 真菌 ITS 扩增子分析 (ITSx / UNITE) | 常规 | DADA2 1.3x<br>ITSx 1.1.x<br>ITSxpress 2.x<br>UNITE 9.x |

### 宏基因组分类与功能（`metagenome`）

层：核心分析（`core`）　|　模块：12　|　工具声明：33

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `meta_kraken2` | 读长物种分类 (Kraken 2) | 常规 | Kraken 2 2.1.x<br>Krona 2.8.x |
| `meta_bracken` | 物种丰度重估计 (Bracken) | 常规 | Bracken 2.9.x |
| `meta_metaphlan` | 标志基因物种谱 (MetaPhlAn) | 常规 | MetaPhlAn 4.1.x<br>StrainPhlAn 4.1.x |
| `meta_humann` | 通路与功能谱 (HUMAnN) | 常规 | HUMAnN 3.8.x<br>DIAMOND 2.1.x<br>MetaPhlAn 4.1.x |
| `meta_megahit` | 宏基因组组装 (MEGAHIT) | 常规 | MEGAHIT 1.2.x<br>Bowtie2 2.5.x<br>SAMtools 1.21.x |
| `meta_metaspades` | 宏基因组组装：metaSPAdes | 常规 | SPAdes (metaSPAdes) 3.15.x<br>Bowtie2 2.5.x<br>SAMtools 1.21.x |
| `meta_binning_metabat` | MAG 分箱 (MetaBAT2 / MaxBin2 / SemiBin) | 常规 | MetaBAT2 2.15.x<br>MaxBin2 2.2.x<br>SemiBin 1.4.x |
| `meta_bin_refine` | 分箱优化与去冗余 (DAS Tool / dRep) | 常规 | DAS Tool 1.1.x<br>dRep 3.4.x<br>CheckM2 1.0.x |
| `meta_mag_taxonomy` | MAG 分类注释与命名 (GTDB-Tk) | 常规 | GTDB-Tk 2.4.x<br>Prodigal 2.6.x<br>HMMER 3.3.x |
| `meta_coverm` | MAG 丰度定量 (CoverM / Bowtie2) | 常规 | CoverM 0.7.x<br>Bowtie2 2.5.x<br>minimap2 2.2x |
| `meta_virome` | 病毒组识别与丰度 (geNomad / CheckV) | 常规 | geNomad 1.7.x<br>CheckV 1.0.x<br>CD-HIT 4.8.x |
| `meta_assembly_qc` | 宏基因组组装质量与去冗余 | 常规 | QUAST 5.2.x<br>CheckM2 1.0.x<br>GUNC 1.0.x<br>MultiQC 1.2x |

### 转录组定量与差异表达（`transcriptome`）

层：核心分析（`core`）　|　模块：8　|　工具声明：26

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `tran_rrna_remove` | rRNA 去除与富集评估 (SortMeRNA / RiboDetector) | 常规 | SortMeRNA 4.3.x<br>RiboDetector 0.4.x<br>Bowtie2 2.5.x<br>SAMtools 1.1x |
| `tran_hisat_align` | 读长比对 (HISAT2 / Bowtie2) | 常规 | HISAT2 2.2.x<br>Bowtie2 2.5.x<br>BWA 0.7.x<br>SAMtools 1.1x |
| `tran_featurecounts` | 基因水平计数 (featureCounts) | 常规 | featureCounts 2.0.x<br>HTSeq 2.0.x<br>SAMtools 1.1x |
| `tran_salmon_quant` | 转录本定量 (Salmon / kallisto) | 常规 | Salmon 1.10.x<br>kallisto 0.5x<br>tximport 1.3x |
| `tran_deseq2` | 差异表达分析 (DESeq2) | 常规 | DESeq2 1.4x<br>apeglm 1.2x<br>tximport 1.3x |
| `tran_edger` | 差异表达分析 (edgeR) | 常规 | edgeR 4.2.x<br>limma 3.6x |
| `tran_batch_correct` | 批次效应校正 (ComBat-seq / limma) | 常规 | sva (ComBat-seq) 3.5x<br>limma 3.6x<br>RUVSeq 1.3x |
| `tran_go_enrich` | GO / 通路富集分析 | 常规 | clusterProfiler 4.1x<br>GO.db 3.1x<br>topGO 2.5x<br>gprofiler2 0.2.x |

### 系统发育与建树（`phylogeny`）

层：核心分析（`core`）　|　模块：10　|　工具声明：29

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `phy_mafft` | 多序列比对 (MAFFT) | 常规 | MAFFT 7.5x<br>MUSCLE 5.1.x<br>Clustal Omega 1.2.x |
| `phy_trimal` | 比对修剪 (trimAl) | 常规 | trimAl 1.5.x<br>GBlocks 0.91.x<br>BMGE 1.12.x |
| `phy_iqtree` | 最大似然建树 (IQ-TREE) | 常规 | IQ-TREE 2.3.x<br>ModelFinder 2.3.x |
| `phy_fasttree` | 快速建树 (FastTree) | 常规 | FastTree 2.1.x |
| `phy_raxml` | 最大似然建树 (RAxML-NG) | 常规 | RAxML-NG 1.2.x<br>RAxML 8.2.x |
| `phy_modeltest` | 替换模型选择 (ModelFinder) | 常规 | ModelFinder 2.3.x<br>ModelTest-NG 0.1.x<br>IQ-TREE 2.3.x |
| `phy_root_calibrate` | 定根与外群设置 | 常规 | ETE 3 3.1.x<br>DendroPy 5.0.x<br>TreeTime 0.11.x<br>ape 5.8.x |
| `phy_support_test` | 分支支持度检验 (bootstrap / SH-aLRT / aLRT) | 常规 | IQ-TREE 2.3.x<br>RAxML-NG 1.2.x<br>PhyML 3.3.x |
| `phy_tree_compare` | 树拓扑比较 (Robinson-Foulds) | 常规 | phangorn 2.1x<br>ETE 3 3.1.x<br>DendroPy 5.0.x<br>IQ-TREE 2.3.x |
| `phy_its_phylogeny` | 真菌 ITS / 大亚基建树 | 常规 | ITSx 1.1.x<br>MAFFT 7.5x<br>IQ-TREE 2.3.x<br>UNITE 9.0.x |

### Python 数据处理（`downstream-python`）

层：数据处理（`downstream`）　|　模块：9　|　工具声明：14

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `py_pandas_io` | 表格读取与整理 (pandas) | 常规 | pandas 2.2.x |
| `py_pandas_tidy` | 长宽表转换与合并 (tidy 数据整理) | 常规 | pandas 2.2.x |
| `py_numpy_arrays` | 数值数组与向量化计算 (NumPy) | 常规 | NumPy 2.x |
| `py_scipy_stats` | 统计检验与多重校正 (SciPy / statsmodels) | 常规 | SciPy 1.1x<br>statsmodels 0.14.x |
| `py_sklearn_cluster` | 聚类与降维 (scikit-learn / UMAP) | 常规 | scikit-learn 1.5.x<br>UMAP 0.5.x<br>SciPy 1.1x |
| `py_biopython` | 序列读写与格式解析 (Biopython) | 常规 | Biopython 1.8x |
| `py_pysam` | 比对文件读写 (pysam) | 常规 | pysam 0.22.x |
| `py_export_report` | 生成表格与报告 (to_csv / Jinja2) | 常规 | pandas 2.2.x<br>openpyxl 3.1.x<br>Jinja2 3.1.x |
| `py_snakemake_py` | Python 侧流程粘合 (Snakemake rule 片段) | 模板 | Snakemake 8.x |

### R 数据处理与统计（`downstream-r`）

层：数据处理（`downstream`）　|　模块：8　|　工具声明：19

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `r_read_import` | 结果表读入与清洗 (readr / readxl) | 常规 | readr 2.1.x<br>readxl 1.4.x |
| `r_tidyverse` | R 数据整形 (tidyverse / dplyr) | 常规 | dplyr 1.1.x<br>tidyr 1.3.x<br>janitor 2.2.x |
| `r_vegan_diversity` | 群落多样性与排序 (vegan) | 常规 | vegan 2.6-x<br>phyloseq 1.4x<br>ape 5.8 |
| `r_matrix_stats` | 矩阵运算与距离计算 (base R / ape) | 常规 | base R 4.4.x<br>ape 5.8 |
| `r_limma_stats` | 线性模型差异分析 (limma) | 常规 | limma 3.5x<br>edgeR 4.x |
| `r_export_table` | R 结果导出与表格生成 (write_csv / flextable) | 常规 | readr 2.1.x<br>flextable 0.9.x<br>openxlsx 4.2.x |
| `r_deseq2_object` | DESeq2 对象与差异表 | 常规 | DESeq2 1.4x |
| `r_survival_meta` | 效应量合并与元分析 (metafor / survival) | 常规 | metafor 4.6-x<br>survival 3.6-x<br>survminer 0.4.x |

### 可视化与图表（`visualization`）

层：下游可视化（`viz`）　|　模块：13　|　工具声明：41

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `viz_ggplot2` | 通用统计绘图 (ggplot2) | 常规 | ggplot2 3.5.x<br>patchwork 1.2.x<br>scales 1.3.x |
| `viz_seaborn` | Python 统计绘图 (seaborn / matplotlib) | 常规 | seaborn 0.13.x<br>matplotlib 3.9.x<br>adjustText 1.1.x |
| `viz_heatmap` | 热图与聚类热图 (ComplexHeatmap / pheatmap) | 常规 | ComplexHeatmap 2.1x<br>pheatmap 1.0.12<br>seaborn 0.13.x |
| `viz_alpha_beta` | Alpha/Beta 多样性图 (PCoA / NMDS) | 常规 | vegan 2.6-x<br>ggplot2 3.5.x<br>phyloseq 1.4x |
| `viz_volcano_ma` | 差异表达火山图与 MA 图 | 常规 | ggplot2 3.5.x<br>ggrepel 0.9.x<br>matplotlib 3.9.x |
| `viz_plotly` | 交互式图表 (plotly) | 常规 | plotly 5.2x<br>kaleido 0.2.x |
| `viz_composition_bar` | 群落组成堆叠柱状图 | 常规 | ggplot2 3.5.x<br>phyloseq 1.4x<br>plotly 5.2x |
| `viz_rarefaction_curve` | 稀释曲线与累积曲线 | 常规 | vegan 2.6-x<br>iNEXT 3.0.x<br>QIIME 2 2024.x |
| `viz_upset` | 集合交集可视化 (UpSet) | 常规 | ComplexUpset 1.3.x<br>UpSetR 1.4.x<br>upsetplot 0.9.x |
| `viz_sankey_flow` | 丰度流向与桑基图 (Sankey) | 常规 | ggalluvial 0.12.x<br>networkD3 0.4.x<br>plotly 5.2x |
| `viz_tree_plot` | 进化树可视化与注释 (ggtree / iTOL) | 常规 | ggtree 3.1x<br>treeio 1.2x<br>iTOL web/v6<br>ape 5.8 |
| `viz_circos` | 基因组环形图 (Circos / pyCirclize) | 常规 | pyCirclize 1.x<br>circlize 0.4.x<br>Circos 0.69<br>Proksee web |
| `viz_pub_style` | 出版级图规范与配色 | 常规 | ggplot2 3.5.x<br>RColorBrewer 1.1.x<br>viridis 0.6.x<br>matplotlib 3.9.x |

### 流程引擎与调度（`workflow`）

层：流程引擎与工具（`engine`）　|　模块：10　|　工具声明：29

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `wf_snakemake` | 流程编排：Snakemake | 常规 | Snakemake 8.x<br>Graphviz 9.x |
| `wf_nextflow` | 流程编排：Nextflow | 常规 | Nextflow 24.x<br>nf-core tools 3.x |
| `wf_conda_env` | 环境与依赖锁定 (conda / mamba / pixi) | 常规 | mamba 1.5.x<br>conda 24.x<br>pixi 0.4x |
| `wf_container` | 容器化运行 (Docker / Singularity) | 常规 | Docker 26.x<br>Apptainer 1.3.x<br>Podman 5.x<br>BioContainers registry |
| `wf_reproducibility` | 结果可追溯与版本记录 | 常规 | SHA256 / md5sum coreutils<br>Git 2.4x<br>Snakemake / Nextflow 报告 引擎自带 |
| `wf_flexible_join` | 通用数据流适配器（格式/接口转换） | 适配器 | Python (pandas) 2.2.x<br>seqkit 2.9.x<br>awk / sort / join coreutils |
| `wf_checkpoint_pipeline` | 断点续跑与缓存复用 | 常规 | Snakemake 8.x<br>Nextflow 24.x<br>make 4.4 |
| `wf_batch_loop` | 多样本批量循环处理 | 常规 | GNU parallel 2024xxxx<br>xargs -P coreutils<br>Snakemake 8.x |
| `wf_dag_rule` | 流程结构与依赖声明 (DAG / rule) | 常规 | Graphviz 9.x<br>Snakemake 8.x<br>Python (networkx) 3.3.x |
| `wf_cluster_submit` | 集群提交与资源申请 (Slurm / PBS) | 常规 | Slurm 23.x<br>PBS / Torque 22.x<br>Snakemake / Nextflow 引擎自带 |

### 工具与数据操作（`utility`）

层：流程引擎与工具（`engine`）　|　模块：10　|　工具声明：26

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `util_seqkit` | 序列文件操作 (seqkit / seqtk) | 常规 | seqkit 2.9.x<br>seqtk 1.4.x |
| `util_samtools` | 比对文件操作 (SAMtools / BAM) | 常规 | SAMtools 1.1x<br>mosdepth 0.3.x |
| `util_bedtools` | 区间运算 (bedtools) | 常规 | bedtools 2.3x<br>BEDOPS 2.4.x |
| `util_gnu_parallel` | 并行执行与任务分发 (GNU parallel / xargs) | 模板 | GNU parallel 2024.x<br>GNU xargs (coreutils) 9.4.x |
| `util_awk_sed` | 文本流处理 (awk / sed / grep) | 模板 | GNU awk (gawk) 5.3.x<br>GNU sed 4.9.x<br>GNU grep 3.11.x |
| `util_rename_manifest` | 重命名、样本清单与路径整理 | 适配器 | GNU coreutils 9.4.x<br>Python 3.12.x |
| `util_args_validate` | 参数校验与输入检查 | 模板 | Python 3.12.x<br>GNU bash 5.2.x |
| `util_install_tools` | 工具安装与环境准备 | 常规 | mamba 1.5.x<br>micromamba 1.5.x<br>conda-lock 2.5.x<br>Apptainer 1.3.x |
| `util_download_ref` | 参考数据库下载与版本管理 | 参考数据 | curl 8.7.x<br>aria2 1.37.x<br>Kraken 2 2.1.x<br>DIAMOND 2.1.x |
| `util_checksum` | 文件校验与完整性确认 (md5 / sha256) | 常规 | GNU coreutils 9.4.x<br>Python 3.12.x<br>xxHash 0.8.x |

### 数据格式与互转（`io-formats`）

层：流程引擎与工具（`engine`）　|　模块：9　|　工具声明：26

| 模块 id | 中文名称 | 类型 | 工具（版本） |
|---|---|---|---|
| `io_fastq_to_fasta` | FASTQ 与 FASTA 互转 | 适配器 | seqkit 2.9.x<br>seqtk 1.4.x |
| `io_bam_to_bed` | 比对转覆盖度与区间 (BAM → BED / depth) | 适配器 | SAMtools 1.1x<br>bedtools 2.3x<br>deepTools 3.5.x |
| `io_gff_convert` | 注释格式互转 (GFF / GTF / GenBank) | 适配器 | gffread 0.12.x<br>AGAT 1.7.x<br>Biopython 1.8x |
| `io_vcf_convert` | 变异格式互转 (VCF / PED / PHYLIP) | 适配器 | bcftools 1.1x<br>VCFtools 0.1.x<br>PLINK 2.0.x |
| `io_table_to_phylip` | 表格转 PHYLIP / Nexus（建树输入） | 适配器 | Biopython 1.8x<br>pandas 2.2.x<br>EMBOSS (seqret) 6.6.x |
| `io_biom_to_tsv` | BIOM 与环境数据表互转 | 适配器 | biom-format 2.1.x<br>QIIME 2 2024.x<br>phyloseq 1.4x |
| `io_newick_convert` | 树文件格式互转 (Newick / Nexus / NEXML) | 适配器 | DendroPy 4.5.x<br>Biopython 1.8x<br>ape 5.7.x |
| `io_compress_index` | 压缩与索引 (bgzip / tabix / samtools index) | 适配器 | SAMtools 1.1x<br>HTSlib (bgzip / tabix) 1.1x<br>pysam 0.22.x |
| `io_interop_standard` | 跨语言数据互通 (Parquet / Arrow / Feather) | 适配器 | pyarrow 17.0.x<br>pandas 2.2.x<br>arrow (R) 16.1.x |

## 按工具名索引

下面这张表按工具名排序，用来回答「某个工具在这个知识系统里出现在哪些模块」。
当你想知道「我手上的 samtools 还能用在哪」时，从这张表进比从分类进更快。

| 工具 | 版本 | 出现于模块 |
|---|---|---|
| ABRicate | 1.0.x | `res_abricate`、`res_vfdb` |
| adjustText | 1.1.x | `viz_seaborn` |
| AGAT | 1.7.x | `io_gff_convert` |
| ALDEx2 | 1.3x | `amplicon_phyloseq` |
| alien_hunter | 1.7.x | `comp_island_path` |
| AMRFinderPlus | 3.12.x | `var_amrfinder` |
| ANCOMBC | 2.x | `amplicon_phyloseq` |
| ape | 5.8.x / 5.8 / 5.7.x | `io_newick_convert`、`phy_root_calibrate`、`r_matrix_stats`、`r_vegan_diversity`、`viz_tree_plot` |
| apeglm | 1.2x | `tran_deseq2` |
| Apptainer | 1.3.x | `util_install_tools`、`wf_container` |
| aria2 | 1.37.x | `util_download_ref` |
| arrow (R) | 16.1.x | `io_interop_standard` |
| assembly-scan | 0.7.x | `asmqc_ideel` |
| awk / sort / join | coreutils | `wf_flexible_join` |
| Bakta | 1.9.x | `anno_bakta` |
| barrnap | 0.9 | `tax_16s_extract` |
| base R | 4.4.x | `r_matrix_stats` |
| BCFtools | 1.2x | `var_bcftools_call` |
| bcftools | 1.1x | `comp_snp_dist`、`io_vcf_convert` |
| BEDOPS | 2.4.x | `util_bedtools` |
| bedtools | 2.31.x / 2.3x | `io_bam_to_bed`、`tax_16s_extract`、`util_bedtools` |
| BioContainers | registry | `wf_container` |
| biom-format | 2.1.x | `io_biom_to_tsv` |
| Biopython | 1.8x | `io_gff_convert`、`io_newick_convert`、`io_table_to_phylip`、`py_biopython` |
| BLAST+ | 2.16.x / 2.1x.x | `anno_cazy`、`res_abricate`、`res_plasmidfinder`、`res_vfdb`、`tax_16s_blast`、`var_amrfinder`、`var_typing_cgmlst` |
| BLAST+ / DIAMOND | 2.1x.x | `res_card_rgi` |
| BMGE | 1.12.x | `phy_trimal` |
| Bowtie2 | 2.5.x | `meta_coverm`、`meta_megahit`、`meta_metaspades`、`qc_remove_host`、`tran_hisat_align`、`tran_rrna_remove` |
| Bracken | 2.9 / 2.9.x | `meta_bracken`、`qc_contamination_screen` |
| BUSCO | 5.6.x | `asmqc_busco` |
| bwa | 0.7.17 | `asm_hic_scaffold` |
| BWA | 0.7.17 / 0.7.x | `tran_hisat_align`、`var_bwa_map` |
| BWA-MEM2 | 2.2.x | `asm_short_polish`、`var_bwa_map` |
| CARD | 3.2.x | `res_card_rgi` |
| CD-HIT | 4.8.x | `meta_virome`、`pange_panaroo` |
| CGView | 1.0.x | `comp_proksee` |
| CheckM2 | 1.1.x / 1.0.x | `asmqc_checkm2`、`meta_assembly_qc`、`meta_bin_refine` |
| CheckV | 1.0.x | `meta_virome`、`phage_checkv` |
| chewBBACA | 3.3.x | `var_typing_cgmlst` |
| circlize | 0.4.x | `viz_circos` |
| Circos | 0.69 | `viz_circos` |
| clumpify | 39.x | `qc_dedup_reads` |
| Clustal Omega | 1.2.x | `phy_mafft` |
| clusterProfiler | 4.1x | `tran_go_enrich` |
| ComplexHeatmap | 2.1x | `viz_heatmap` |
| ComplexUpset | 1.3.x | `viz_upset` |
| conda | 24.x | `wf_conda_env` |
| conda-lock | 2.5.x | `util_install_tools` |
| CoverM | 0.7.x | `meta_coverm` |
| CRISPRCasFinder | 4.2.x | `phage_crisprcas` |
| curl | 8.7.x | `util_download_ref` |
| cutadapt (q2-cutadapt) | 2024.x | `amplicon_qiime2_import` |
| DADA2 | 1.3x | `amplicon_dada2`、`amplicon_its_fungal` |
| DADA2 (assignTaxonomy) | 1.3x | `amplicon_taxonomy_assign` |
| DAS Tool | 1.1.x | `meta_bin_refine` |
| dbCAN (run_dbcan) | 4.1.x | `anno_dbcan` |
| Deblur | 1.1.x | `amplicon_deblur` |
| decontam | 1.2x | `amplicon_decontam` |
| deepTools | 3.5.x | `io_bam_to_bed` |
| DendroPy | 5.0.x / 4.5.x | `io_newick_convert`、`phy_root_calibrate`、`phy_tree_compare` |
| DESeq2 | 1.4x | `amplicon_phyloseq`、`r_deseq2_object`、`tran_deseq2` |
| DIAMOND | 2.1.x / 2.2.x | `anno_cazy`、`anno_dbcan`、`anno_diamond_nr`、`anno_eggnog`、`asmqc_gunc`、`comp_gene_presence`、`meta_humann`、`pange_orthofinder`、`phage_checkv`、`res_mobilome`、`res_vfdb`、`util_download_ref` |
| Docker | 26.x | `wf_container` |
| dplyr | 1.1.x | `r_tidyverse` |
| dRep | 3.4.x | `meta_bin_refine` |
| edgeR | 4.2.x / 4.x | `r_limma_stats`、`tran_edger` |
| eggNOG 数据库 | 5.0.x | `anno_eggnog` |
| eggNOG-mapper | 2.1.x | `anno_eggnog` |
| EMBOSS (seqret) | 6.6.x | `io_table_to_phylip` |
| ETE 3 | 3.1.x | `phy_root_calibrate`、`phy_tree_compare` |
| fastANI | 1.3x | `tax_fastani` |
| fastp | 0.23.x | `qc_fastp` |
| FastQ Screen | 0.15.x | `qc_contamination_screen` |
| FastQC | 0.12.x | `qc_fastqc` |
| FastTree | 2.1.x | `phy_fasttree` |
| featureCounts | 2.0.x | `tran_featurecounts` |
| Filtlong | 0.2.x | `qc_quality_trim_long` |
| flextable | 0.9.x | `r_export_table` |
| Flye | 2.9.x | `asm_flye` |
| FreeBayes | 1.3.x | `var_bcftools_call`、`var_snippy` |
| GBlocks | 0.91.x | `phy_trimal` |
| geNomad | 1.7.x | `meta_virome`、`phage_genomad` |
| gffread | 0.12.x | `io_gff_convert` |
| ggalluvial | 0.12.x | `viz_sankey_flow` |
| ggplot2 | 3.5.x | `viz_alpha_beta`、`viz_composition_bar`、`viz_ggplot2`、`viz_pub_style`、`viz_volcano_ma` |
| ggrepel | 0.9.x | `viz_volcano_ma` |
| ggtree | 3.1x | `viz_tree_plot` |
| Git | 2.4x | `wf_reproducibility` |
| GNU awk (gawk) | 5.3.x | `util_awk_sed` |
| GNU bash | 5.2.x | `util_args_validate` |
| GNU coreutils | 9.4.x | `util_checksum`、`util_rename_manifest` |
| GNU grep | 3.11.x | `util_awk_sed` |
| GNU parallel | 2024xxxx / 2024.x | `util_gnu_parallel`、`wf_batch_loop` |
| GNU sed | 4.9.x | `util_awk_sed` |
| GNU xargs (coreutils) | 9.4.x | `util_gnu_parallel` |
| GO.db | 3.1x | `tran_go_enrich` |
| gprofiler2 | 0.2.x | `tran_go_enrich` |
| Graphviz | 9.x | `wf_dag_rule`、`wf_snakemake` |
| GTDB-Tk | 2.4.x | `meta_mag_taxonomy`、`tax_gtdbtk` |
| Gubbins | 3.3.x | `comp_snp_dist` |
| GUNC | 1.0.x | `asmqc_gunc`、`meta_assembly_qc` |
| HISAT2 | 2.2.x | `tran_hisat_align` |
| HMMER | 3.4 / 3.4.x / 3.3.x | `anno_dbcan`、`anno_interpro`、`anno_kofamscan`、`meta_mag_taxonomy`、`phage_checkv`、`res_mobilome`、`var_amrfinder` |
| HTSeq | 2.0.x | `tran_featurecounts` |
| HTSlib (bgzip / tabix) | 1.1x | `io_compress_index` |
| HTSlib (bgzip/tabix) | 1.2x | `var_bcftools_call` |
| HUMAnN | 3.8.x | `meta_humann` |
| IDEEL | 1.0.x | `asmqc_ideel` |
| iNEXT | 3.0.x | `viz_rarefaction_curve` |
| InterProScan | 5.6x.x | `anno_interpro` |
| IQ-TREE | 2.3.x | `phy_iqtree`、`phy_its_phylogeny`、`phy_modeltest`、`phy_support_test`、`phy_tree_compare` |
| IslandPath-DIMOB | 1.0.x | `comp_island_path` |
| IslandViewer 4 | 4.0.x | `comp_island_path` |
| iTOL | web/v6 | `viz_tree_plot` |
| ITSx | 1.1.x | `amplicon_its_fungal`、`phy_its_phylogeny` |
| ITSxpress | 2.x | `amplicon_its_fungal` |
| janitor | 2.2.x | `r_tidyverse` |
| Jinja2 | 3.1.x | `py_export_report` |
| kaleido | 0.2.x | `viz_plotly` |
| kallisto | 0.5x | `tran_salmon_quant` |
| KMA | 1.4.x | `res_plasmidfinder`、`res_resfinder` |
| KofamScan | 1.3.x | `anno_kofamscan` |
| Kraken 2 | 2.1.x | `meta_kraken2`、`qc_contamination_screen`、`util_download_ref` |
| Krona | 2.8.x | `meta_kraken2`、`qc_contamination_screen` |
| limma | 3.6x / 3.5x | `r_limma_stats`、`tran_batch_correct`、`tran_edger` |
| MacSyFinder | 2.1.x | `phage_crisprcas` |
| MAFFT | 7.5xx / 7.5x | `pange_core_align`、`pange_orthofinder`、`pange_panaroo`、`phy_its_phylogeny`、`phy_mafft` |
| make | 4.4 | `wf_checkpoint_pipeline` |
| mamba | 1.5.x | `util_install_tools`、`wf_conda_env` |
| Mash | 2.3 | `tax_mash` |
| matplotlib | 3.9.x | `viz_pub_style`、`viz_seaborn`、`viz_volcano_ma` |
| MaxBin2 | 2.2.x | `meta_binning_metabat` |
| Medaka | 1.1x | `asm_medaka_polish` |
| MEGAHIT | 1.2.x | `meta_megahit` |
| MetaBAT2 | 2.15.x | `meta_binning_metabat` |
| metafor | 4.6-x | `r_survival_meta` |
| MetaPhlAn | 4.1.x | `meta_humann`、`meta_metaphlan` |
| microbiome | 1.2x | `amplicon_phyloseq` |
| micromamba | 1.5.x | `util_install_tools` |
| micropan | 2.0.x | `pange_acc_stats` |
| minimap2 | 2.2x | `asm_medaka_polish`、`comp_syri`、`meta_coverm`、`qc_remove_host` |
| mlst | 2.2x | `var_mlst` |
| MMseqs2 | 15.x | `anno_diamond_nr`、`phage_genomad` |
| mobileOG-db | 1.6.x | `res_mobilome` |
| ModelFinder | 2.3.x | `phy_iqtree`、`phy_modeltest` |
| ModelTest-NG | 0.1.x | `phy_modeltest` |
| mosdepth | 0.3.x | `util_samtools` |
| MultiQC | 1.2x | `meta_assembly_qc`、`qc_multi_qc` |
| MUMmer (nucmer) | 4.0.x | `comp_syri` |
| MUSCLE | 5.1.x | `phy_mafft` |
| NanoFilt | 2.8.x | `qc_quality_trim_long` |
| NanoPlot | 1.4x | `qc_quality_trim_long` |
| NCBI PGAP | 2024.x | `anno_ncbi_submit` |
| networkD3 | 0.4.x | `viz_sankey_flow` |
| Nextflow | 24.x | `wf_checkpoint_pipeline`、`wf_nextflow` |
| nf-core tools | 3.x | `wf_nextflow` |
| NumPy | 2.x | `py_numpy_arrays` |
| openpyxl | 3.1.x | `py_export_report` |
| openxlsx | 4.2.x | `r_export_table` |
| OrthoFinder | 3.1.x | `pange_orthofinder` |
| Panaroo | 1.5.x | `pange_panaroo` |
| pandas | 2.2.x | `comp_gene_presence`、`io_interop_standard`、`io_table_to_phylip`、`py_export_report`、`py_pandas_io`、`py_pandas_tidy` |
| patchwork | 1.2.x | `viz_ggplot2` |
| PBS / Torque | 22.x | `wf_cluster_submit` |
| phangorn | 2.1x | `phy_tree_compare` |
| PHASTER / PHASTEST (web service) | 2023.x | `phage_phaster` |
| pheatmap | 1.0.12 | `viz_heatmap` |
| phyloseq | 1.4x | `amplicon_phyloseq`、`io_biom_to_tsv`、`r_vegan_diversity`、`viz_alpha_beta`、`viz_composition_bar` |
| PhyML | 3.3.x | `phy_support_test` |
| Pilon | 1.2x | `asm_short_polish`、`asm_unicycler` |
| pixi | 0.4x | `wf_conda_env` |
| PlasmidFinder | 2.1.x | `res_plasmidfinder` |
| PLINK | 2.0.x | `io_vcf_convert` |
| plotly | 5.2x | `viz_composition_bar`、`viz_plotly`、`viz_sankey_flow` |
| Podman | 5.x | `wf_container` |
| PointFinder | 4.7.x | `res_resfinder` |
| POLCA | 4.x | `asm_short_polish` |
| Prodigal | 2.6.x | `anno_prodigal`、`anno_prokka`、`meta_mag_taxonomy`、`phage_crisprcas`、`tax_gtdbtk` |
| Prodigal (Pyrodigal) | 2.6.x | `anno_bakta` |
| Prokka | 1.14.x | `anno_prokka`、`pange_roary` |
| Proksee | web | `viz_circos` |
| proksee-batch | 0.6.x | `comp_proksee` |
| pyarrow | 17.0.x | `io_interop_standard` |
| pyCirclize | 1.x | `viz_circos` |
| pysam | 0.22.x | `io_compress_index`、`py_pysam` |
| Python | 3.12.x | `util_args_validate`、`util_checksum`、`util_rename_manifest` |
| Python (networkx) | 3.3.x | `wf_dag_rule` |
| Python (pandas) | 2.2.x | `wf_flexible_join` |
| q2-dada2 | 2024.x | `amplicon_dada2` |
| q2-deblur | 2024.x | `amplicon_deblur` |
| q2-demux | 2024.x | `amplicon_qiime2_import` |
| q2-feature-classifier | 2024.x | `amplicon_taxonomy_assign` |
| QIIME 2 | 2024.x | `amplicon_qiime2_import`、`io_biom_to_tsv`、`viz_rarefaction_curve` |
| QIIME 2 (q2-diversity) | 2024.x | `amplicon_qiime2_diversity` |
| QIIME 2 (q2-phylogeny) | 2024.x | `amplicon_qiime2_diversity` |
| QUAST | 5.2.x | `asmqc_quast`、`meta_assembly_qc` |
| R | 4.x | `pange_acc_stats` |
| Racon | 1.5.x | `asm_medaka_polish` |
| RAxML | 8.2.x | `phy_raxml` |
| RAxML-NG | 1.2.x | `phy_raxml`、`phy_support_test` |
| RColorBrewer | 1.1.x | `viz_pub_style` |
| readr | 2.1.x | `r_export_table`、`r_read_import` |
| readxl | 1.4.x | `r_read_import` |
| RESCRIPt | 2024.x | `amplicon_taxonomy_assign` |
| ResFinder | 4.7.x | `res_resfinder` |
| RGI | 6.0.x | `res_card_rgi` |
| RiboDetector | 0.4.x | `tran_rrna_remove` |
| RNAmmer | 1.2 | `tax_16s_extract` |
| Roary | 3.13.x | `pange_roary` |
| RUVSeq | 1.3x | `tran_batch_correct` |
| Salmon | 1.10.x | `tran_salmon_quant` |
| SALSA2 | 2.3 | `asm_hic_scaffold` |
| SAMtools | 1.1x / 1.21.x | `asm_filter_contigs`、`io_bam_to_bed`、`io_compress_index`、`meta_megahit`、`meta_metaspades`、`qc_remove_host`、`tran_featurecounts`、`tran_hisat_align`、`tran_rrna_remove`、`util_samtools`、`var_bwa_map` |
| scales | 1.3.x | `viz_ggplot2` |
| scikit-learn | 1.5.x | `py_sklearn_cluster` |
| SciPy | 1.1x | `py_scipy_stats`、`py_sklearn_cluster` |
| Scoary | 1.6.x | `comp_gene_presence` |
| seaborn | 0.13.x | `viz_heatmap`、`viz_seaborn` |
| SemiBin | 1.4.x | `meta_binning_metabat` |
| SEPP (q2-fragment-insertion) | 2024.x | `amplicon_qiime2_diversity` |
| seqkit | 2.9.x | `asm_filter_contigs`、`io_fastq_to_fasta`、`qc_dedup_reads`、`util_seqkit`、`wf_flexible_join` |
| seqtk | 1.4 / 1.4.x | `asm_filter_contigs`、`io_fastq_to_fasta`、`util_seqkit` |
| SHA256 / md5sum | coreutils | `wf_reproducibility` |
| SKESA | 4.5.x | `asm_skesa` |
| Slurm | 23.x | `wf_cluster_submit` |
| Snakemake | 8.x | `py_snakemake_py`、`wf_batch_loop`、`wf_checkpoint_pipeline`、`wf_dag_rule`、`wf_snakemake` |
| Snakemake / Nextflow | 引擎自带 | `wf_cluster_submit` |
| Snakemake / Nextflow 报告 | 引擎自带 | `wf_reproducibility` |
| Snippy | 4.6.x | `comp_snp_dist`、`var_snippy` |
| snp-dists | 0.8.x | `comp_snp_dist` |
| snp-sites | 2.5.x | `pange_core_align` |
| SortMeRNA | 4.3.x | `tran_rrna_remove` |
| sourmash | 4.8.x | `tax_sourmash` |
| sourmash (Python API) | 4.8.x | `tax_sourmash` |
| SPAdes | 3.15.x | `asm_spades` |
| SPAdes (metaSPAdes) | 3.15.x | `meta_metaspades` |
| statsmodels | 0.14.x | `py_scipy_stats` |
| StrainPhlAn | 4.1.x | `meta_metaphlan` |
| survival | 3.6-x | `r_survival_meta` |
| survminer | 0.4.x | `r_survival_meta` |
| sva (ComBat-seq) | 3.5x | `tran_batch_correct` |
| SyRI | 1.7.x | `comp_syri` |
| table2asn | 1.2x.x | `anno_ncbi_submit` |
| tidyr | 1.3.x | `r_tidyverse` |
| topGO | 2.5x | `tran_go_enrich` |
| treeio | 1.2x | `viz_tree_plot` |
| TreeTime | 0.11.x | `phy_root_calibrate` |
| trimAl | 1.4.x / 1.5.x | `pange_core_align`、`phy_trimal` |
| Trimmomatic | 0.39 | `qc_trimmomatic` |
| tximport | 1.3x | `tran_deseq2`、`tran_salmon_quant` |
| UMAP | 0.5.x | `py_sklearn_cluster` |
| Unicycler | 0.5.x | `asm_unicycler` |
| UNITE | 9.x / 9.0.x | `amplicon_its_fungal`、`phy_its_phylogeny` |
| upsetplot | 0.9.x | `viz_upset` |
| UpSetR | 1.4.x | `viz_upset` |
| VCFtools | 0.1.x | `io_vcf_convert` |
| vegan | 2.6-x | `r_vegan_diversity`、`viz_alpha_beta`、`viz_rarefaction_curve` |
| viridis | 0.6.x | `viz_pub_style` |
| VSEARCH | 2.2x | `amplicon_taxonomy_assign` |
| xargs -P | coreutils | `wf_batch_loop` |
| xxHash | 0.8.x | `util_checksum` |
| YaHS | 1.2.x | `asm_hic_scaffold` |
