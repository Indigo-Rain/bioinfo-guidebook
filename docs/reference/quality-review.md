# 模块数据质量审查（对抗式复核报告）

> **本文件是一份审查记录，不是使用文档。** 它保留了独立的对抗式复核所发现的全部问题，
> 目的是让后续维护者知道哪些问题已修、哪些仍待联网核对。
>
> **审查时点**：160 个模块全部写入之后。以下是**当时的**发现与随后的处置。

## 处置状态（审查后已完成的修复）

| 发现 | 状态 |
|---|---|
| `build.mjs` 的文档引用检查正则不含下划线，导致检查空转 | ✅ 已修（字符类加入 `_`）；修好后立刻查出 1 处真实错误（第 11 章把 `meta_humann` 误写成了另一个名字，已修正） |
| 文档一致性检查只覆盖 presets，不覆盖模块的 `docs.path` | ✅ 已修（模块级 docs 链接现在会被校验） |
| `presets` 的连边可声明来源模块并不产出的 `fromType` | ✅ 已修：新增 `edge-output-not-declared` / `edge-input-not-declared` 校验；随后修正了 12 条预设里共 20+ 处错误连边 |
| **22 条 `feeds[].viaType` 不在来源模块 outputs 中**（其中 8 条是绘图模块声称传递数据框） | ✅ 已修：新增 `feed-not-produced` 校验并重写了 21 个模块的 feeds |
| `anno_bakta` 的 `--gram` 默认值写成字面量 `"?"` | ✅ 已修（改为说明该参数无默认值、需显式指定） |
| `res_card_rgi` 用 `awk '$6=="Strict"'` 硬编码列号，会静默产生空结果 | ✅ 已修（改为按表头定位 Cut_Off 列并在脚本内断言） |
| `asmqc_ideel` 两个 recipes 都是未完成的占位代码 | ✅ 已修：`kind` 改为 `template`（面板会明确提示「需按项目改写」），provides 的版本改为可核对的形式，note 写明本模块只给出输入输出与判定思路、未固化具体调用 |
| `preset-resistance-virulence` 让短读长抛光与 SPAdes 并行（与模块数据直接矛盾） | ✅ 已修（移除该环节） |
| `preset-virome` 的 `steps` 仍写「宿主预测」，与 geNomad 实际能力矛盾；且与 `meta_virome` 重复调用 geNomad | ✅ 已修（改名 + 去掉重复节点） |
| 模块名「病毒序列识别与宿主预测 (geNomad)」误导 | ✅ 已修（manifest 与模块名统一改为「病毒与质粒序列识别」） |
| `proksee-batch@0.6.x` 疑似编造（无外部锚点） | ✅ 已联网核实**真实存在**，且 `--input/--output/--download-example-data` 与官方文档一致，输出形态（HTML 报告 + 需配套数据目录）也与模块描述相符。保留 |

## 仍待处理（需要能联网的环境逐条核对）

**版本号跨文件不一致（17 个工具）**——最需要复核的几组：

| 工具 | 冲突写法 | 说明 |
|---|---|---|
| `SAMtools` / `HTSlib` / `bcftools` | `1.1x` ↔ `1.21.x` / `1.2x` | 这一族应同版本联动；牵连 11 个模块，影响最广 |
| `BLAST+` | `2.1x.x` ↔ `2.16.x` | `2.1x.x` 不是合法写法（主.次不可能同时含 `x`） |
| `CheckM2` | `1.0.x` ↔ `1.1.x` | 直接影响 MAG 质量门槛的可比性 |
| `Pyrodigal` vs `Prodigal` | 两者都写 `2.6.x` | 是两个不同实现，版本线并不同步 |
| `DendroPy` `ape` `HMMER` `MAFFT` `trimAl` `DIAMOND` `bedtools` `seqtk` `Bracken` `BWA` `edgeR` `limma` `UNITE` `GNU parallel` | 各有 2–3 种写法 | 多为「精确版本」与「区间」混用，属风格问题但影响索引去重 |

**工具名不统一（4 组）**：`bwa`/`BWA`、`BCFtools`/`bcftools`、`HTSlib (bgzip/tabix)`/`HTSlib (bgzip / tabix)`、`Snakemake / Nextflow 报告`/`Snakemake / Nextflow`。会让工具索引出现重复条目。

**10 条 `version` 不是版本号**：其中 6 条是合理占位（`web/v6`、`web`、`registry`、`coreutils` ×3、`引擎自带` ×2），可接受；`asmqc_ideel` 两条已修。

**字段语义误用**：
- 68 条 `params[].default` 填的是「以官方文档为准」而非值（占 867 条的 8%）。这本意是诚实的占位，但会让「按默认值检索」失效。建议区分 `default`（值）与 note（不确定性）。
- 必填参数的表达方式不统一：`"无"` / `"无（必填）"` / `"必填"` 三种写法并存。
- `meta_kraken2` 把 `-k`（k-mer 长度，建库时固定）与 `--threads` 并列在同一个 `flag` 字段里——两个无关参数不应共用一个 flag。
- 18 条 `outputs[].ext` 用 ` / ` 塞了多个文件名（如 `.html / 数据集`），`ext` 是扩展名而非文件清单。

**待核对的参数真值**：CheckM2 `--threads`/`--extension`、SPAdes `-m`、DIAMOND `--max-target-seqs`（数据里出现 25/5/1 三种）、Bakta `--gram`/`--min-contig-length`、dRep `-comp`、RGI 的 Cut_Off 列号、`islandpath_dimob` 的入口名、Kraken2 运行时是否有 `-k` 与 `--minimum-hit-groups`、`fastp` 默认线程数是否为 3、`statsmodels.multipletests` 默认方法是否为 `'hs'`、`fastANI --fragLen` 默认 3000。

**`quality-control.json` 内容偏薄**：平均内文密度约 709 字符/模块，低于全库约 1050；全库最薄的 8 个模块里它占 6 个。结构合规，但深度不及其它分类，是补写性价比最高的一册。

**文献卷页**：各章「延伸阅读」的书目部分只给了「作者 + 期刊 + 年份」，投稿前需逐条核对卷期页码。

**已在数据中确认正确、不要误改的项**：`kraken.report` 标 `abundance-table` 是正确的（它确实是 tab 分隔的 6 列计数表）；`qc_contamination_screen` 的 docs 跨章引用是正确的（同时引了第 2 章与第 4 章）；`presets.json` 的节点与边引用在修复后完全一致。

---

以下为审查原始报告（保留当时的行号与逐条证据，行号对应审查快照，可能与当前文件略有偏移）。
# `data/modules/*.json` 对抗式质量审查报告

**审查对象**：`data/modules/*.json`，20 个文件 / **160** 个模块 / 406 条 `provides` / 867 条 `params` / 1048 条 `pitfalls` / 507 条 `usage` / 300 个 recipes / 326 个 inputs / 452 个 outputs。

> ⚠️ **关于时效性**：审查期间这批文件正在被**并发写入**（我只读，未做任何修改）。
> 首轮扫描时 `downstream-r.json` 是 7 个模块 / 66401 字节，几分钟后变成 8 个 / 78772 字节（新增 `r_survival_meta`）；`annotation-resistance.json`、`taxonomy.json`、`variant-calling.json`、`annotation-phage.json` 也都在审查过程中增长。
> 为此我**冻结了一份快照**（20 个文件的副本 + 逐文件 SHA256 清单）并在快照上重跑全部检查，本报告的行号均对应快照；审查结束后该快照已删除（它只是我的工作副本，`data/` 原文件未被改动）。
> **到审查结束时数据面已稳定**：实时读取与快照的 160 / 406 完全一致，`node tools/build.mjs --check` 报 `CHECK OK —— 0 个错误、0 个警告`。**因此下述结论对当前仓库状态成立**，唯一例外是 `docs/guidebook/` 的章节文件（见 🟡 F）。
> 环境无网络：**凡涉及"某工具的真实默认值/版本号"的判断我都标注了「需联网核对」**；未标注的均是可仅凭仓库内部证据自证的结论。

---

## 🔴 事实性错误（会导致用户按错误信息操作）

### 1. `asmqc_ideel` 整个模块的 recipes 是未完成的占位代码

- `data/modules/assembly-qc.json` · `asmqc_ideel` · 模块 **lines 320-397**；具体位置 `recipes.bash` **line 368**、`recipes.python` **line 369**
  写的是（line 368，**整行是注释**）：
  ```
  #    <ideel 命令> 02_assembly/${SAMPLE}.polished.fasta \
  #    可执行入口与参数名以官方仓库文档为准，请按所用版本补齐下一行
  ```
  （line 369）：
  ```
  # TODO: 按官方仓库文档补上 IDEEL 的调用（入口与参数名随版本变化）
  run(f"assembly-scan {ASM_DIR}/{sample}.polished.fasta > ...")   # 只有 assembly-scan，没有 IDEEL
  ```
  实际是：**两个 recipes 都无法运行**。`recipes.bash` 里 IDEEL 那一行是注释；`recipes.python` 明确写着 `TODO`，只调用了 `assembly-scan`，**完全没有调用 IDEEL**。
  依据：模块自称 provides `IDEEL`，`usage[1]` 也只给了 `column -t 04_qc/ideel_sample/errors.tsv`（对**已存在**文件的查看命令），全模块没有任何一条可执行的 IDEEL 调用。`docs/reference/module-schema.md` 第 6 节明确要求"不要编造不存在的参数或输出文件名"——这里选择了留 TODO，但后果是**照抄这个模块的人拿不到任何可用命令**。

  同一模块还有两个连带问题：
  - `provides[0].version` 与 `provides[1].version` 都是 `"以官方仓库为准"`（**lines 343、344**）。全库共 10 条非版本号 `version`，其中 6 条属合理占位（`iTOL = web/v6`、`Proksee = web`、`BioContainers = registry`、三条 `coreutils`），**另外 4 条里有 2 条在这个模块**——违反 schema 第 3 节"version 必须写主.次.x"。
  - `params` 里 **line 373** 等处的 `default` 是 `"以官方文档为准"`，且**没有给出任何真实参数名**（flag 写的是「短读长比对质量与碱基质量阈值」「最小覆盖度」）。全模块没有一个可核对的 flag。

### 2. `anno_bakta` `params[2] --gram` 的默认值写成了一个问号

- `data/modules/annotation-functional.json` · `anno_bakta` · 模块 lines 92-182 · **line 159**
  写的是：`{ "flag": "--gram", "default": "?", "note": "革兰氏类型…不指定时这部分判断会缺失，细菌应显式给 + 或 -" }`
  实际是：**`default` 字段的值就是字面量 `"?"`**。
  依据：程序化扫描确认这是全部 867 条 params 中**唯一**一个把默认值写成 `?` 的条目（其余空缺统一用 `—`）。同一条目自己的 note 已经说明"不指定时判断会缺失"，因此 `"?"` 是想表达"无默认/必填"，但渲染出去就是一个问号。另注：Bakta 的 `--gram` 在多数版本里是**必填**而非有默认值——**需联网核对**。

### 3. `anno_bakta` `--min-contig-length` 默认值标成 1，紧邻的用法却写 200

- `data/modules/annotation-functional.json` · `anno_bakta` · **line 158**（`params[1]`），对照 **line 144**（`usage[2]`）
  写的是（line 158）：`--min-contig-length / -m` 默认 `"1（--compliant 时为 200）"`
  实际是：同一条目 `usage[2]`（line 144）里**同时**写了 `--compliant --gram - --min-contig-length 200`。
  依据：既然 `--compliant` 已经会把下限变成 200，该条 usage 里显式再写 `--min-contig-length 200` 就是冗余的——两者必有一个记错。`"1"` 这个默认值本身**需联网核对**（不同 Bakta 版本此默认值改过）。

### 4. `res_card_rgi` 用 `$6` 抽取 Strict 命中，与模块自己"列序不固定"的声明矛盾

- `data/modules/annotation-resistance.json` · `res_card_rgi` · **line 60**（`recipes.bash`；模块整体范围 lines 3-88）
  写的是：`awk -F'\t' 'NR==1 || $6=="Strict"' 04_resistance/${SAMPLE}_rgi.txt > 09_results/${SAMPLE}.rgi_strict.tsv`
  实际是：RGI 的 `main` 输出表里判定列是 **Cut_Off**，它并不固定在**第 6 列**。
  依据：(a) 同模块 `outputs[2]` 的说明写的是「JSON/TSV 结果，**含 Cut_Off 判定列**」，并未承诺列序；(b) 全库仅此一处用 `$N=="字面量"` 硬编码文本列，而仓库内更谨慎的作者用的是"先看表头再写脚本"（`res_plasmidfinder` usage[2]、`phage_checkv` usage[3] 都明确写「列序号以你的版本为准，先 head 看表头」）。这里硬编码 `$6` 属于会**静默产生空结果**（`NR==1` 保住表头、正文一行不剩）的错误。**Cut_Off 的确切列号需联网核对**。
  另外该模块 `provides[2]`（**line 29**）的 `tool` 写作 `"BLAST+ / DIAMOND"`——把两个独立工具塞进一个 tool 字段，导致版本号 `2.1x.x` 无法归属到具体哪个工具（全库有 9 条 tool 名含 `/`，但其余都是同族同类如 `bgzip/tabix`、`PBS/Torque`，只有这条把**两个真正不同**的工具并列）。

### 5. `meta_bin_refine` 声明的 dRep 完整度门槛（75）与全库其它模块（50）不一致，且该门槛未在正文出现

- `data/modules/metagenome.json` · `meta_bin_refine` · 模块 lines 576-658 · **line 633**（`params[0]`）
  写的是：`-comp / -con（dRep）` 默认 `"75 / 10（视版本）"`，note 为「纳入去冗余的完整度与污染度门槛。关键分析建议收紧到 90/5；门槛必须在方法里写明，并与质量评估模块的报告一致」
  实际是：同一模块 `what[2]` 明确写「先用 CheckM2 过滤（例如只保留完整度 > 50%、污染度 < 10% 的 bin，关键分析进一步收紧到 > 90%/< 5%），再进入 dRep」。
  依据：`params[0]` 的 `default` 字段在 schema 里表示"该参数的实际取值"（见 `docs/reference/module-schema.md` 第 3 节示例 `-q` 默认 `15`）。这里写 **75**，但正文的推荐流程是 **50**，note 里又建议收紧到 **90**——**三个完整度数字（75/50/90）互不衔接**，用户无法判断该用哪个。而且**参数给的 75 在 `usage`/`recipes` 里从未出现**（该模块连 `dRep` 命令都没给出）。**dRep 各版本的 `-comp` 真实默认值需联网核对**；但"同一模块内 75 与 50 并存"这一点无需联网即可确认是缺陷。

### 6. `comp_island_path` 声称的离线可执行入口与 `provides` 里的工具名对不上

- `data/modules/comparative.json` · `comp_island_path` · **lines 328-409**
  写的是：`islandpath_dimob -f genome.fna -g annotation.gff -o islands.txt`（**lines 372**（usage[1]）、**381**（recipes.bash）、**382**（recipes.python）共 3 处），而 `provides[1]` 的 tool 名是 `IslandPath-DIMOB`、`provides[0]` 是 `IslandViewer 4`、`provides[2]` 是 `alien_hunter`。
  实际是：IslandViewer 4 是**网页服务**（模块自己在 `usage[0]` 也这么写：「IslandViewer 以网页提交为主」），而 `islandpath_dimob` 这个**下划线命名**的可执行文件既不在 `provides` 里作为独立条目出现，其存在性与调用语法也无处可查。
  依据：`records` 里 `islandpath_dimob` 出现 3 次但 provides 只声明了 `IslandPath-DIMOB`（连字符命名）；如果这个命令来自某个 pip/conda 包，`provides` 缺一条声明。**入口名与参数（`-f/-g/-o`）需联网核对**。

### 7. `comp_proksee` 把一个"网页工具的批量封装"当成可安装工具，并提供未经验证的子命令

- `data/modules/comparative.json` · `comp_proksee` · **lines 85-162**；可疑选项在 **line 126**（`usage[1]`）
  写的是：`proksee-batch@0.6.x`（`provides[0]`，access=cli, install=conda）+ `proksee-batch --input ... --output ...`（line 110）与 `proksee-batch --download-example-data example_input`（**line 126**）
  实际是：Proksee 是网页应用；`proksee-batch` 这个包名、`0.6.x` 这个版本、`--download-example-data` 这个子命令，三者在同一模块里互相支撑但没有任何外部可核对处。模块自己的 `usage` 注释也写「每个基因组一个子目录」「只拷 HTML 会得到空白页」——描述的是一个网页工具的批量封装，而非一个已知的 conda 包。
  依据：我无法在离线环境下证实该包存在。**这条最需要联网核对**：请优先确认 `proksee-batch` 是否为真实可安装的 CLI，以及 `--download-example-data` 是否为真实选项。如果不存在，这是典型的"编造工具名+版本+参数"。

---

## 🟡 跨文件 / 内部不一致

### A. 版本号格式不统一（表观缺陷，但机械可证，且会让读者误以为版本退化了）

这些不是"版本写错"，而是**同一个工具在不同文件里被写成了形式不同的版本串**——按 schema 的「主.次.x」约定，其中至少有一侧写得不合规。机械统计：**19 个工具名（按小写归一）存在两种以上版本串**。完整清单如下，可逐条复验：

| 工具 | 出现的写法 | 分别出现在 | 问题 |
|---|---|---|---|
| `samtools` | `1.1x` ×9 / `1.21.x` ×2 | `1.1x`: asm_filter_contigs, io_bam_to_bed, io_compress_index, qc_remove_host, tran_rrna_remove, tran_hisat_align, tran_featurecounts, util_samtools, var_bwa_map；`1.21.x`: meta_megahit, meta_metaspades | **`1.1x` 有歧义**：读作 "1.1x" 还是 "1.1–1.2x"？`1.21.x` 是 2 位次版本，两者不可能是同一区间。**samtools 是否存在 1.21 需联网核对** |
| `DIAMOND` | `2.1.x` ×11 / `2.2.x` ×1 | `2.2.x` 只在 phage_checkv | 11:1，phage_checkv 是离群值 |
| `HMMER` | `3.3.x` ×2 / `3.4` ×1 / `3.4.x` ×4 | `3.3.x`: phage_checkv, meta_mag_taxonomy；`3.4`: var_amrfinder；`3.4.x`: anno_kofamscan, anno_interpro, anno_dbcan, res_mobilome | 一个工具三种写法 |
| `CheckM2` | `1.0.x` ×2 / `1.1.x` ×1 | `1.1.x` 只在 asmqc_checkm2 | 全库最值得复核的一条：**CheckM2 是否发布过 1.1.x 需联网核对** |
| `trimAl` | `1.4.x` / `1.5.x` | 1.4.x: pange_core_align；1.5.x: phy_trimal | |
| `DendroPy` | `4.5.x` / `5.0.x` | 4.5.x: io_newick_convert；5.0.x: phy_root_calibrate, phy_tree_compare | 差一个主版本 |
| `ape` | `5.7.x` / `5.8` / `5.8.x` | 5.7.x: io_newick_convert；5.8: r_vegan_diversity, r_matrix_stats, viz_tree_plot；5.8.x: phy_root_calibrate | 三种写法 |
| `MAFFT` | `7.5x` / `7.5xx` | 7.5x: phy_mafft, phy_its_phylogeny；7.5xx: pange_panaroo, pange_orthofinder, pange_core_align | `7.5xx` 按 schema 约定应写 `7.5.x` |
| `BLAST+` | `2.16.x` ×3 / `2.1x.x` ×4 | 2.16.x: tax_16s_blast, var_amrfinder, var_typing_cgmlst；2.1x.x: anno_cazy, res_abricate, res_vfdb, res_plasmidfinder | `2.16.x` ⊂ `2.1x.x`，是两种粒度混用；`2.1x.x` 形式本身怪异（次位写成 `1x`） |
| `bcftools` | `1.1x` ×2 / `1.2x` ×1 | 1.1x: comp_snp_dist, io_vcf_convert；1.2x: var_bcftools_call | 与 htslib 同步出现 |
| `htslib` | `1.1x` / `1.2x` | 1.1x: io_compress_index；1.2x: var_bcftools_call | bcftools/htslib/samtools 三者本应同源同版本 |
| `limma` | `3.5x` / `3.6x` | 3.5x: r_limma_stats；3.6x: tran_edger, tran_batch_correct | |
| `edgeR` | `4.x` / `4.2.x` | 4.x: r_limma_stats；4.2.x: tran_edger | |
| `BWA` | `0.7.17` / `0.7.x` | 0.7.17: asm_hic_scaffold, var_bwa_map；0.7.x: tran_hisat_align | 精确版本 vs 区间混用 |
| `Bracken` | `2.9` / `2.9.x` | 2.9: qc_contamination_screen；2.9.x: meta_bracken | |
| `seqtk` | `1.4` / `1.4.x` | 1.4: asm_filter_contigs；1.4.x: io_fastq_to_fasta, util_seqkit | |
| `UNITE` | `9.x` / `9.0.x` | 9.x: amplicon_its_fungal；9.0.x: phy_its_phylogeny | |
| `bedtools` | `2.3x` ×2 / `2.31.x` ×1 | 2.31.x: tax_16s_extract；2.3x: io_bam_to_bed, util_bedtools | `2.3x` 与 `2.31.x` 语义不同（前者含 2.30–2.39，后者是 2.31 系列） |
| `GNU parallel` | `2024.x` / `2024xxxx` | 2024xxxx 只在 wf_batch_loop | `2024xxxx` 写法诡异（应为 `2024.x` 或 `2024xxxx` 是包装脚本版本？） |

> 说明：`trimmomatic 0.39`、`make 4.4`、`circos 0.69`、`pheatmap 1.0.12`、`mash 2.3`、`salsa2 2.3`、`barrnap 0.9`、`RNAmmer 1.2` 这几个没有第三位，属于"该工具本来就只有主.次"，**不算错误**。

### B. 「同一工具同一字段写法不同」的内部不一致

- `data/modules/transcriptome.json` · `tran_featurecounts` vs `data/modules/downstream-r.json` · `r_limma_stats` / `tran_edger`：featureCounts 被声明为 `2.0.x`（`tran_featurecounts`），HTSeq 也是 `2.0.x`——两条 provides 版本号相同但工具不同，属巧合，无需改。
- **`samtools` 版本与 bcftools/htslib 应该绑定**：`var_bcftools_call` 声明 `bcftools 1.2x` + `htslib 1.2x`，而 `io_compress_index` 声明 `htslib 1.1x` + `samtools 1.1x`，`util_samtools` 声明 `samtools 1.1x`。同一套 HTSlib 家族在同一知识库里出现 1.1x 与 1.2x 两个区间，**跨模块比较同一个 BAM 处理流程时会前后矛盾**。
- **`anno_prokka` 与 `pange_roary` 都声明 `Prokka@1.14.x`（一致，OK）**，但 `anno_bakta` 声明 `Prodigal (Pyrodigal)@2.6.x`、`anno_prodigal` 声明 `Prodigal@2.6.x`、`meta_mag_taxonomy` / `tax_gtdbtk` 也声明 `Prodigal@2.6.x`——**Pyrodigal 与 Prodigal 是两个不同实现却被写成同一版本号 2.6.x**。Pyrodigal 的版本号与 Prodigal 并不同步，这个 `2.6.x` 至少对 Pyrodigal 是错的（**需联网核对 Pyrodigal 的真实版本线**）。

### C. 阈值/门槛类数值的跨文件冲突

| 概念 | 各模块写法 | 位置 |
|---|---|---|
| CheckM2 高质量门槛 | `> 90%` + `< 5%`（4 处）vs `≥ 50%` + `< 10%`（中等，3 处） | `asmqc_checkm2` params[4]、`meta_assembly_qc` params[0..1]、`meta_binning_metabat` what[3]、`meta_bin_refine` what[2]、`meta_coverm` what[3] |
| dRep 入组完整度门槛 | **75**（`meta_bin_refine` params[0]）vs **50**（同模块 what[2]）vs **>90**（关键分析） | 见 🔴 第 5 条 |
| 「核心基因」出现率阈值 | `100%`（`pange_core_align` params[0]）/ `≈100%` + soft-core `≈95%`（`pange_acc_stats` params[0]）/ 「按 95%/99% 出现率定义的软核心」（`pange_core_align` what[0]） | 三处表述不统一：what 里出现 **99%**，params 与 `pange_acc_stats` 都只说 95% |
| shell/cloud 边界 | `15%–95%` / `<15%`（只出现在 `pange_acc_stats` params[1]） | 其它泛基因组模块未引用，无法交叉验证 |
| ANI 物种界限 | `≥95%`（`tax_fastani`、`tax_gtdbtk`、`meta_bin_refine`、`meta_virome`、`tax_16s_blast`）| **一致，OK**（这条做得好） |
| 16S 鉴定阈值 | `≥99%` 同种 / `97–99%` 同属 / `<95%` 更高层级（`tax_16s_blast`）| 全库只此一处，无冲突 |
| Mash 距离↔ANI 换算 | `k=21 时 d≈0.05 ↔ ANI 95%`（`tax_mash` what[1] 与 pitfalls）| 内部自洽，OK |
| fastp `-q` 默认 | `15`（`qc_fastp` params[0]），note 写「30 更严格」| 与 usage 里用的 `-q 20` 无矛盾（usage 是"严格模式"示例），OK |

### D. 同一参数在不同模块默认值矛盾（逐条核对后，多数是"不同工具的字母撞车"，以下为**真正同工具同参数**）

> 我逐条核对了 41 组"flag 相同、默认值不同"的记录，其中约 30 组是**不同工具恰好用了同一个字母**（如 `-t` 在 FastQC/Bracken/BWA/SPAdes/QUAST 里含义与默认值本就不同；`-q` 在 fastp/Prodigal/BCFtools 里同理），**这些不是错误**，不应改。
> 以下是**确实是同一工具、同一参数**却写法不同的：

- `--threads` 之于 **CheckM2**：`asmqc_checkm2` **line 218** 写 `"以版本为准"`；`meta_assembly_qc` **line 972** 写 `"1"`。同一工具同一参数，一处在编造具体数字（`1`），一处老实承认不知道。**CheckM2 `--threads` 真实默认值需联网核对**；但两处不一致本身就可证。
- `--extension` 之于 **CheckM2**：`asmqc_checkm2` **line 216** 写 `"以官方文档为准"`，同模块 usage 用 `--extension fna`；`meta_assembly_qc` 把它和 `--input` 合并成 **line 971**（flag 写作 `"--extension / --input"`，default `"无"`），而它的 usage（**line 951**）用 `--extension fa`、recipes 也用 `fa`。**同一个工具在同一知识库里被写成 `fna` 和 `fa` 两种后缀**，而 `asmqc_checkm2` `params[1]` 的 note 恰好警告「.fa/.fasta/.fna 混放时容易漏文件」——**文档自己在示范这个错误**。
- `--meta` 之于 **SPAdes/metaSPAdes**：`anno_bakta` `"关闭"`、`asm_flye` `"关闭"`、`meta_metaspades` `"无（必选）"`——三处的 `--meta` 分属 Bakta / Flye / SPAdes 三个工具，**不属于冲突**，但 `meta_metaspades` 把必选参数的 `default` 写成 `"无（必选）"` 是字段语义误用（`default` 应是值，必选性应写在 note）。
- `-m / --memory` 之于 **SPAdes**：`asm_spades` 写 `"不限制"`，`meta_metaspades` 写 `"自动（按可用内存）"`。同一工具同一参数，一处说"不限制"、一处说"自动按可用内存"——两句不可能同时成立。**SPAdes `-m` 的真实默认行为需联网核对**；但两处不一致本身就可证。
- `--min-contig-len` 之于 **MEGAHIT**：`meta_megahit` `params[0]` 写 `"200（MEGAHIT 默认保留较短 contig）"`——note 是 default 的同义反复，没有提供任何新信息，而 usage 里实际用 1000。
- `-k / --max-target-seqs` 之于 **DIAMOND**：`anno_cazy`、`res_vfdb` 写 `"5（推荐）"`，`res_mobilome` 写 `"1（推荐 1–5）"`，`anno_diamond_nr` 写 `"25"`（这才是 DIAMOND 的真实默认值），`comp_gene_presence` usage 用 `--max-target-seqs 1`。**四处"推荐值"互不相同且都没有说明推荐依据**；把"推荐值"填进 `default` 字段是同一类字段语义误用。**DIAMOND 官方默认 25 需联网核对**（若确为 25，则 `anno_diamond_nr` 正确、其余三处应把建议值移出 `default`）。
- `-e` 之于 **DIAMOND**：`anno_eggnog`/`anno_diamond_nr` 写 `0.001`，`pange_roary` 写 `1e-5`——**后者是 Roary 的 `-e`（BLASTP E 值），不是 DIAMOND**，不算冲突。
- `--mincov` / `--minid` 之于 **ABRicate**：`res_abricate` `80` / `80`，`res_vfdb` `80` / `80`——**一致，OK**。`var_snippy --mincov` 是 `10`（Snippy 的参数），**不是冲突**。
- `design` 之于 **DESeq2**：`tran_deseq2` 写 `"~ condition"`，`r_deseq2_object` 写 `"~ group"`。同一设计公式两种列名，示例数据里到底叫 `condition` 还是 `group` 需要统一。
- `alpha` 之于 **Sankey**：`viz_sankey_flow` `1` vs `tran_deseq2` `0.05`——不同工具，不算冲突。`-t` 在 FastQC/Bracken/BWA/SPAdes/QUAST/BUSCO/interproscan 里含义本就不同，同理不算冲突。

### E. 数据类型语义

- 全库 `type` 词表共 **29 个**，全部在 `data/catalog.json` 的 `dataTypes` 里有登记，**没有未登记类型**（`node tools/build.mjs --check` 的注册表校验也是 OK）。这一块质量好。
- 语义可疑的有 **2 类**（我降级了最初的一个怀疑，见下）：
  - `res_resfinder` 的 4 个 outputs **全部**声明为 `tsv-table`，其中 `.json`（CGE 标准 JSON，含参数与数据库版本）也被标成 `tsv-table`——JSON 不是表格。另外 `.PointFinder_results.txt` / `.pheno_table.txt` 的扩展名是 `.txt` 而非 tsv。这属于"用最接近的类型凑合"，类型系统的分辨力在这里失效（严格说 `tsv-table` 的那一行 `.json` 应改用 `log-report` 或重新登记类型）。
  - **18 条 `outputs[].ext` 用 ` / ` 把多个文件塞进一个字段**（`anno_dbcan`: `hmmer.out / diamond.out / dbcan.out`；`phage_checkv`: `completeness.tsv / contamination.tsv`、`viruses.fna / proviruses.fna`；`io_gff_convert`: `.gff3 / .gtf`、`.gbk / .embl`；`io_vcf_convert`: `.ped / .geno.tsv`、`.phy / .snp.fasta`；`viz_tree_plot`: `.html / 数据集` 等）。`ext` 字段被当成"文件清单"用，渲染时会出现 `/` 拼出来的假扩展名。其中 `viz_tree_plot` 的 `.html / 数据集` 尤其明显——"数据集"不是扩展名。
- **我最初标记但核对后撤回的一条**：`meta_kraken2`（**metagenome.json line 101**）与 `qc_contamination_screen`（**quality-control.json line 547**）把 Kraken2 的 `.kraken.report` 声明为 `abundance-table`。我原以为这是类型误用，但核对后：该文件确实是**制表符分隔的 6 列层级计数表**（note 也明确列出「百分比 / 该节点读长数 / 直接命中数 / 层级 / taxid / 名称」，`shape=table`），且 `meta_kraken2` line 32 还特意注明「只有经过 Bracken 才能谈『丰度』」。**这条不成立，不应改。**

### F. `docs` 引用

- 147/160 个模块有 `docs` 字段，13 个没有（**不是错误**，`docs` 在 schema 里是可选的）。无模块引用不存在的 `docs` 路径之外的错误。
- 多 `docs` 引用的模块里，指向的章节都与内容相关（如 `qc_contamination_screen` 引第 2 章 + 第 4 章，`qc_remove_host` 引第 2 章 + 第 8 章），**未发现明显错配**。（我最初怀疑 `qc_contamination_screen` 越章引用，核对后它同时引了正确的第 2 章，该怀疑不成立，特此更正。）
- `docs` 路径与分类的对应关系**自洽**（03←assembly、04←assembly-qc、05←taxonomy、06←annotation-*、07←pangenome/comparative/phylogeny、08←amplicon/metagenome、09←transcriptome、10←visualization/downstream、11←workflow/utility/io-formats）。
- **`docs` 整体已不再是问题**：我审查开始时 `docs/guidebook/` 只有第 00、01、02 三章（其余 9 章的 `docs.path` 全部指向不存在的文件，`node tools/build.mjs --check` 因此 FAILED，报 18 个错误）。审查过程中第 03–11 章被陆续写入，**现在 160 个模块的 `docs.path` 全部指向真实文件，build 报 `CHECK OK —— 0 个错误`**。这条从"严重"自动消解，记录在此仅为说明时间线。
- **一个仍然存在的工具缺口**：`tools/build.mjs` 的"文档引用一致性"检查只覆盖 `presets.json` 的 `docs`，**不覆盖 `data/modules/*.json` 的 `docs.path`**（我核对了它当时的报错清单，18 条全部是 preset 引用，模块引用一条都没报）。这意味着**模块里的 doc 链接失效不会被 CI 拦住**——建议补上这个检查（我未修改 `tools/build.mjs`，仅报告）。

### G. `outputs` 声明的产物在 `usage`/`recipes` 里不出现

机械扫描出 200+ 条，但**绝大多数是误报**（`ext` 是"用户自定义扩展名"，如 `.gff`、`.faa`、`.tsv`；usage 用变量拼路径）。我人工核对了输出文件名与命令不对应的少数几条：

- `phage_crisprcas` · `recipes.bash` · **`data/modules/annotation-phage.json` line 300**：
  `cp 04_resistance/${SAMPLE}_crispr/TSV/CRISPR-Cas_summary.tsv ...` —— 同模块 `usage[0]` 的注释写「可选参数（`-gscf`、`-ccc`、`-ccvr`、`-drpt`、`-html`）会额外产出对应文件」，而 `recipes.bash` 的 `CRISPRCasFinder.pl` 调用（同一行）**没有加任何这些开关**，却直接 `cp` 那个 TSV。该模块 `outputs[1]`（**line 269**，`CRISPR-Cas_summary.tsv`）正是靠 `-gscf` 才产出的文件，默认调用下不存在，这条 recipe 会失败。
- `asmqc_ideel` · `recipes.bash`：`outputs`（**assembly-qc.json line 339**）声明 `.ideel.errors.tsv`，但 recipes 里没有任何命令产生它（见 🔴 第 1 条）。

---

## 🟢 质量建议

### 1. `pitfalls` 的空话问题——总体不存在，反而偏"过度解释"

这是我最意外的结论：**1048 条 pitfalls 里我一条"注意参数选择"式的空话都没找到**（机械扫描 `<20 字符的 pitfalls` 返回 **0 条**）。相反，问题在于**啰嗦**：大量 pitfalls 长达 150–200 字，把"是什么/为什么/怎么做/边界"全塞进一条。建议拆分或压缩，但内容本身可验证。**schema 把 pitfalls 称为"本知识系统最有价值的部分"，这个目标是达到了的。**

真正的问题只有两处字段语义缺陷：
- `data/modules/annotation-resistance.json` · `res_abricate` · **line 147**：`{ "flag": "--db", "default": "无", … }`——`--db` 实际是**必填**，写 `"无"` 会让人以为可以不填。同一份文件里 `meta_kraken2` **line 58** 写的是 `"无（必填）"`（好得多），而 `asmqc_checkm2` **line 215** 又把必选性直接写进 `default`（`--input = "必填"`），`qc_contamination_screen` **line 585** 则写成 `"无"`。**同一概念三种写法**。建议全库统一：`default` 只放值，必选性放 note。
- `data/modules/metagenome.json` · `meta_kraken2` · **line 63**：`{ "flag": "-k / --threads", "default": "k=35", … }`——把 **k-mer 长度参数 `-k`** 和 **线程参数 `--threads`** 塞进同一个 `flag` 字段。这不是同一个参数的短/长形式，而是**两个无关参数**（模块自己的 note 也解释「k-mer 长度在建库时固定，运行时不能改」）。这是全库 867 条 params 里唯一把两个不相干参数并列的条目，会让"按 flag 检索"失效。另注：这条的 note 语义正确，但 kraken2 **运行时**是否有 `-k` 选项、以及 `--minimum-hit-groups`（**line 60**，`default "2"`）是否为该版本的合法 flag，**需联网核对**——这两个 flag 是我在 867 条里最不确定真伪的两条。

### 2. 复制粘贴残留

- `data/modules/io-formats.json` · `io_fastq_to_fasta` · **line 58**：`{ "flag": "seqkit fq2fa -w", "default": "60", … }`——把工具名+子命令+选项一起塞进了 `flag` 字段（应为 `-w`）。同一 note 逐字出现在 `utility.json` · `util_seqkit`（那里 flag 写的是正确的 `"seqkit seq -w"` 形式）。这是两个作者共享了一段 note，但一个把 flag 写歪了。
- `data/modules/utility.json` · `util_seqkit` · `usage[1]` 与 `data/modules/quality-control.json` · `qc_dedup_reads` 存在**逐字相同的命令**：`seqkit seq -m 100 -M 300 --remove-gaps clean.fq.gz -o filtered.fq.gz`。两个模块用途重叠（去重/长度过滤），同一示例复制到两处。建议其中一处换成体现差异的示例（如 `qc_dedup_reads` 换成 `clumpify`）。
- `data/modules/utility.json` · `util_install_tools` · pitfalls 里出现了 `numpy` 与 `pysam`，而该模块只声明 `mamba / micromamba / conda-lock / apptainer`。读上下文是"某个包装脚本依赖 numpy/pysam"——**需人工确认是否为本意**，很可能是从别的模块粘过来的。
- `data/modules/downstream-python.json` · `py_biopython` · pitfalls 提到 `seqkit`，而只声明 `biopython`。同类，建议人工复核。

### 3. `params.default` 的字段语义被系统性误用（27% 的模块）

867 条 params 中 **68 条的 `default` 不是值而是"我不知道"**（`以官方文档为准` / `以版本为准` / `随安装` / `视版本` / `官方仓库` …），分布在 **43/160 个模块（27%）**。schema 说"不确定的地方写'以官方文档为准'"，所以这不违规；但**把它填在 `default` 字段里会让 UI 渲染出"默认值 = 以版本为准"这种无意义字符串**。建议：不确定时用 `—` 或省略 `default`，把"以官方文档为准"移到 note。
集中在：`asm_skesa`（5 条，lines 138-141 等）、`tax_16s_extract`（4 条，lines 215-218）、`asmqc_busco`（3 条，lines 137、138、140）、`pange_panaroo`（3 条）、`asmqc_gunc`（3 条）、`tax_gtdbtk`（3 条）。

### 4. `recipes` 语言覆盖

**20 个模块只有 1 个 recipe，0 个模块没有 recipe。** 这 20 个并非随机分布：`downstream-python.json` 的 8 个全部只有 `python`，`downstream-r.json` 的部分只有 `r`，`viz_*` 部分只有 `r`/`python`——即"这个模块本身只属于一种语言生态"。**因此这是合理的设计而非缺陷**，我把它列出来只是提示：schema 说 `recipes` 是 `{bash, python, r}` 三选多，如果 UI 期望"每个模块都能导出 bash 脚本"，则这 20 个模块在导出功能上会退化。是否需要补 bash 版本取决于产品预期，**不建议盲目补**。

### 5. 明显偏薄的模块（作者产出质量不均）

按 "(what + pitfalls) 字符数" 排序，最薄的 8 个里有 6 个来自 `quality-control.json`：

| 模块 | 字符数 | 备注 |
|---|---|---|
| `qc_quality_trim_long` | 625 | 全库最薄 |
| `qc_multi_qc` | 632 | 结构合规（what=3, pitfalls=5, params=5），但内文密度最低 |
| `qc_dedup_reads` | 676 | 有一条 usage 与 `util_seqkit` 逐字重复（见 🟢 2） |
| `qc_fastqc` | 701 | |
| `qc_trimmomatic` | 707 | |
| `qc_contamination_screen` | 745 | |
| `qc_remove_host` | 753 | |
| `var_amrfinder` | 759 | |

对照组：`amplicon_qiime2_import` 1673、`meta_assembly_qc` 1658、`amplicon_dada2` 1644、`phy_mafft` 1618。
**`quality-control.json` 整册内文密度只有全库平均的约 2/3（709 vs 全库平均 ~1050 字符/模块）**，而它恰好是"用户最先接触、最需要讲清坑"的一册。建议优先补写这 8 个模块（结构都合规，缺的是内容深度）。

### 6. 未完成内容标记（除 🔴 第 1 条外）

- `data/modules/variant-calling.json` · `var_snippy` · `recipes.python`：`# TODO: 所有样本完成后运行一次 snippy-core（多样本合并步骤不应放进单样本循环）`——**这是合理的注释**（提醒流程设计），不是残缺。
- `data/modules/annotation-functional.json` · `anno_cazy` · `usage[1]`：`# 脚本需自己实现：按蛋白 ID 对齐...`——同上，是诚实说明，可接受。
- `data/modules/assembly.json` · `asm_medaka_polish` · `usage[0]`：`-m <model_name>` 占位符——**可接受**，因为前一行就是 `medaka tools list_models`，用户能自己填。
- `data/modules/variant-calling.json` · `var_mlst` · `usage[1..2]`：`mlst --scheme <scheme>` 占位——**可接受**，`usage[0]` 教了怎么查方案名。

> 只有 `asmqc_ideel` 是真正把"未完成"留在交付物里。

---

## 总体评价

### 这批模块最不可靠的部分

1. **工具版本号（`provides[].version`）——最不可靠，且是系统性的。** 不是"某个作者写错了"，而是**没有统一口径**：同一个 `samtools` 写成 `1.1x` 与 `1.21.x`，同一个 `HMMER` 写成 `3.3.x`/`3.4`/`3.4.x`，同一个 `BLAST+` 写成 `2.16.x` 与 `2.1x.x`，同一个 `ape` 有三种写法。机械统计：**19 个工具存在跨文件版本串冲突**（见 🟡 A 表）；其中 `samtools`/`bcftools`/`htslib` 这一族牵连 11 个模块。另有 **10 条 `version` 根本不是版本号**，分布在 8 个模块。其中 6 条是**可以接受的**（`iTOL = web/v6`、`Proksee = web`、`BioContainers = registry`、`SHA256/md5sum = coreutils`、`awk/sort/join = coreutils`、`xargs -P = coreutils` —— 网页服务、registry 与 coreutils 本来就没有发行版本号，用占位说明比编一个数字好）；**剩下的 4 条全部落在 `asmqc_ideel`**（`IDEEL` 与 `assembly-scan` 各写成 `以官方仓库为准`），这与 schema 第 3 节"version 必须写主.次.x，版本漂移是复现性主要杀手"直接冲突。这是全库最该先修的一块——机械可查、修起来没有争议。

2. **工具的真实参数默认值——第二不可靠。** 867 条 params 里，`default` 字段有 27% 的模块填的是"以官方文档为准"；而**凡是填了具体数字的地方，我抽查到多个可疑值**（CheckM2 `--threads=1`、Bakta `--min-contig-length=1`、SPAdes `-m=不限制`、DIAMOND `--max-target-seqs` 四处互相矛盾）。**模式很清楚：参数"名字"大多是对的（我没找到明显编造的 flag），但"默认值"被大量记成了"作者自己常用的建议值"。** 这正是任务里预判的最危险情况——默认值写错最容易被记住、影响最大。

3. **`quality-control.json` 整册——内容最薄。** 8 个模块的平均内文密度只有全库平均的约 2/3（709 vs ~1050 字符/模块），薄榜前 8 名里它占了 6 个，全库最薄的 `qc_quality_trim_long`（625）也在这里。结构全部合规（`what` 都是 3 段、`pitfalls` 5 条），缺的是内容深度而非格式。这一册是用户的入口，补写性价比最高。

4. **`asmqc_ideel`——单模块质量最低，是唯一的"未完成交付"。** recipes 不可运行、version 是占位字符串、params 无一个真实 flag 名。它不是"写得浅"，是"没写完"。

### 建议优先联网核对（按风险排序）

无网络环境下我无法证实/证伪，以下是**投入产出比最高的核对清单**：

| 优先级 | 待核对项 | 位置 | 为什么优先 |
|---|---|---|---|
| 1 | **`proksee-batch` 是否为真实 CLI 包**，版本 `0.6.x` 与 `--download-example-data` 是否为真选项 | `comparative.json` · `comp_proksee` | 三者互相支撑、无外部锚点；若不存在即为编造 |
| 2 | **CheckM2 是否发布过 `1.1.x`**；`--threads` 与 `--extension` 的真实默认值 | `assembly-qc.json` · `asmqc_checkm2`；`metagenome.json` · `meta_assembly_qc` | 版本号 + 三个默认值四处冲突 |
| 3 | **`samtools` / `bcftools` / `htslib` 是否存在 1.21 与 1.1x 两种线** | 11 个模块（见 🟡 A 表） | 影响面最广（11 个模块） |
| 4 | **DIAMOND `--max-target-seqs` 官方默认是否 25**；4 处"推荐值"如何统一 | `anno_diamond_nr` / `anno_cazy` / `res_vfdb` / `res_mobilome` | 4 个模块不一致 |
| 5 | **RGI 输出表里 Cut_Off 的列号**（是否真为 6） | `annotation-resistance.json` · `res_card_rgi` `recipes.bash` | 硬编码 `$6` 会静默产生空结果 |
| 6 | **Bakta `--gram` 是否必填、`--min-contig-length` 真实默认** | `annotation-functional.json` · `anno_bakta` | 默认值写成了 `?` 和 `1` |
| 7 | **`islandpath_dimob` / `alien_hunter` 的入口名与参数** | `comparative.json` · `comp_island_path` | provides 名与命令名对不上 |
| 8 | **dRep `-comp` 各版本默认值**（75 还是 50） | `metagenome.json` · `meta_bin_refine` | 与同模块正文冲突 |
| 9 | **Pyrodigal 的真实版本线**（`anno_bakta` 把它写成 `2.6.x`，与 Prodigal 同号） | `annotation-functional.json` · `anno_bakta` | 两个实现被写成同一版本 |
| 10 | **`kraken2` 运行时是否存在 `-k` 选项；`--minimum-hit-groups` 是否为合法 flag** | `metagenome.json` · `meta_kraken2` **line 60/63** | 这两条是我在 867 条 flag 里最不确定真伪的 |
| 11 | **trimAl 1.4 vs 1.5、DendroPy 4.5 vs 5.0、ape 5.7 vs 5.8 应以哪个为准** | `pange_core_align` / `phy_trimal` / `io_newick_convert` / `phy_root_calibrate` | 差一个主/次版本，影响可复现性声明 |

### 做得好的部分（不应在修复中被破坏）

- **无重复 id（160/160 唯一）、无重复模块名、无重复 summary、与 `module-manifest.json` 完全对齐、20 个文件全部无 BOM 且 JSON 合法。**
- **`feeds.target` 与 `related.id` 全部可解析（0 个悬空引用）**——这是 schema 里最难维护的部分，完成度 100%。
- **`type` 全部在 `catalog.dataTypes` 登记（0 个未登记类型）**，连线契约没被破坏。
- **`summary` 全部 ≤ 60 字符（0 个超长）**。
- **`pitfalls` 无一条空话**：**1048** 条里机械扫描不出任何 <20 字符的条目，抽查的每一条都有具体数字与判据——这是这个知识系统最有价值的部分，质量达标（唯一建议是压缩长度，不是补内容）。
- **ANI 95% 物种界限、MIMAG 高质量 MAG 门槛（>90%/<5%）、16S 鉴定阈值（99/97/95）、Mash↔ANI 换算（k=21, d≈0.05）** 这几个跨模块概念**彼此一致**，没有出现"同一概念两种定义"的经典问题。
- **可复核性**：`node tools/build.mjs --check` 可独立复跑；本报告表格里的每一条版本号/默认值都可用 `node -e` 直接读 `data/modules/*.json` 验证，无需依赖我的中间产物（我创建的临时脚本与快照已在审查结束后全部删除）。
- **无用例空转的 `feeds`**：schema 要求"找不到合适下游就写 `[]`"，全库没有为了凑数而连到语义不符模块的情况。
