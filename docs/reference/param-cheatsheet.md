# 参数速查表

本文件回答一个问题：**这个参数在什么情况下该改？**

它不替代工具文档——默认值与确切语义以官方文档为准。这里收录的是**需要做决定的地方**：改了会实质改变结论的、不设就会静默出错的、以及决定结果能否跨样本比较的。

四列读法：**模块**（在面板里搜 id 即可定位）、**参数**（保留官方写法）、**常用值**（多数项目的起点，不是推荐值）、**什么情况下该改**（触发改变的具体条件，不是「视情况而定」）。

> **本文件为人工整理。** 原始素材由脚本从 `data/modules/*.json` 的 `params` 字段汇总：
>
> ```bash
> node tools/gen-reference.mjs params-dump    # 输出 .scratch/params-dump.md（草稿）
> ```
>
> 草稿按工具组织，本文件按**读者的问题**重新分组并压缩。数据更新后请重新生成草稿再人工整理。

## 1. 质控

| 模块 | 参数 | 常用值 | 什么情况下该改 |
|---|---|---|---|
| `qc_fastp` | `-w` | **必须显式给**（默认 3） | 永远要改。默认只有 3 线程，批量时看着 CPU 闲置却以为流程慢 |
| `qc_fastp` | `-q` / `-u` | 15 / 40 | 高覆盖度数据可提到 20~30 / 10~15；提高后一定回看读长长度分布 |
| `qc_fastp` | `-l` | 15 | 组装用途提到 50，否则短读长会产生碎片 contig |
| `qc_fastp` | `--detect_adapter_for_pe` | 自动 | **低覆盖度样本（< 20x）必加**：自动检测依赖足够的 read pair 重叠，否则漏检接头 |
| `qc_fastp` | `--adapter_sequence` | 自动推断 | 自动检测失效时显式指定（Illumina TruSeq 常见 `AGATCGGAAGAGC`） |
| `qc_fastp` | `--cut_tail` | 关闭 | 3' 端质量明显下降的 Illumina 批次建议开启 |
| `qc_trimmomatic` | `ILLUMINACLIP:...:2:30:10` | 2:30:10 | seed 越小匹配越宽松、越容易误切真实序列；换接头文件版本时必须重新评估 |
| `qc_trimmomatic` | `SLIDINGWINDOW:4:20` | 4:20 | 最影响最终读长；质量差的批次可降到 `4:15`，但要用前后 FastQC 对比确认收益 |
| `qc_trimmomatic` | `MINLEN` | 36 | 组装提到 50。**各操作按命令行顺序执行**，MINLEN 放最后与放最前结果完全不同 |
| `qc_fastqc` | `-t` / `--extract` | 1 / 关闭 | 批量时显式给线程；脚本要解析 `fastqc_data.txt` 时必须加 `--extract` |
| `qc_fastqc` | `--nogroup` / `-k` | 关闭 / 7 | 排查末端质量异常加 `--nogroup`；怀疑污染时 `-k` 提到 9~11 |
| `qc_fastqc` | `--contaminants` | 内置 | 内置列表已过时；想发现载体或常见污染物应自建 |
| `qc_multi_qc` | `-c` | 无 | **要把它当验收工具就必须给**：用配置文件里的 thresholds 定义可接受区间 |
| `qc_multi_qc` | `--ignore` / `--force` | 无 / 关闭 | 扫描范围大或中间目录混有同名日志时必给 `--ignore`，否则同一样本被统计两次 |
| `qc_remove_host` | `samtools view -f 4` | — | **永远不要写成 `-F 4`**：含义正好相反，写错会保留宿主、丢掉真实数据 |
| `qc_remove_host` | `--very-sensitive` | 关闭 | 去宿主宁多勿少，建议开启；代价是慢一些 |
| `qc_remove_host` | `-N / -L` | 0 / 20 | 调松会把微生物读长也判成宿主；与宿主同源区多的样本要谨慎 |
| `qc_contamination_screen` | `--db` | 必填 | **必须记录库名与日期**：标准库、plusPF、自定义库的结果不可比 |
| `qc_contamination_screen` | `--confidence` | 0.0 | 筛查杂音多时提到 0.1~0.5；提高会同时抬高 unclassified |
| `qc_contamination_screen` | `--minimum-hit-groups` | 2 | 控制假阳性的实用参数；降到 1 会明显增加误分类 |
| `qc_contamination_screen` | `bracken -r` / `-l` | 必填 / S | `-r` **必须与实际读长接近**；数据库种级基因组不全时改 L（属）通常更稳 |
| `qc_quality_trim_long` | `NanoFilt -q` / `-l` | 10 / 1000 | 老数据的 Q10 与新数据不是一回事，不能照搬；最小读长也不宜设太高（超长读长是完成图的关键） |
| `qc_quality_trim_long` | `--headcrop / --tailcrop` | 0 | Nanopore 两端质量常明显偏低，各切 50 很常见 |
| `qc_dedup_reads` | `clumpify dedupe=t` | f | **必须显式给出**，否则只做压缩优化——很多人以为跑了去重其实没有 |
| `qc_dedup_reads` | `dupesubs=1` | 0 | 设 0 会把重复读长全部删掉，通常不是你想要的 |
| `qc_dedup_reads` | `seqkit -M` | 0 | 把「过长」当嵌合体筛掉有风险——真实长读长很常见 |

## 2. 组装

| 模块 | 参数 | 常用值 | 什么情况下该改 |
|---|---|---|---|
| `asm_spades` | `-k` | 自动（常见 21,33,55,77） | **跨样本必须固定**：改变 k 列表会让结果与既有流程不可直接比较 |
| `asm_spades` | `--isolate` / `--careful` | 关闭 | 高覆盖度纯培养物可开 `--isolate`；两者关系与宏基因组模式选项的混用限制以官方文档为准 |
| `asm_spades` | `--cov-cutoff` | 关闭 | 污染多时有用，**但会误删低拷贝质粒** |
| `asm_spades` | `-m` | 不限制 | 设得过小不会自动降级，而是直接失败 |
| `asm_skesa` | `--contigs_out` | 默认文件名 | **必须显式指定**：默认名固定，串行脚本里极易被下一个样本覆盖 |
| `asm_unicycler` | `--mode` | conservative | 默认档留下的碎片通常反映数据不足，而不是参数不够猛 |
| `asm_flye` | `--nano-hq / --pacbio-hifi / ...` | 必选其一 | **必须与平台和碱基识别版本匹配**：选错不报错但结果系统性变差 |
| `asm_flye` | `--genome-size` | raw 模式必填 | 先用 Mash 估一个数量级正确的值并记录；错一倍会影响重复区判断 |
| `asm_flye` | `-i / --iterations` | 1 | 不要靠调它代替抛光——Flye 的共识精度不足以替代 Medaka/Pilon |
| `asm_medaka_polish` | `-m / --model` | **必须显式指定** | 模型与数据不匹配是这一步最常见的失败原因；名称以 `medaka tools list_models` 为准 |
| `asm_medaka_polish` | 抛光轮数 | 1~2 轮 | 第 2 轮之后提升通常在噪声范围内；过度抛光可能引入新错误，需用 BUSCO 确认收敛 |
| `asm_medaka_polish` | 抛光用读长过滤强度 | 轻度或无过滤 | **不要用大幅下采样后的子集**：低覆盖区域会被改动而缺乏证据 |
| `asm_short_polish` | Pilon `--frags/--jumps` | 按文库类型 | 类型给错会得到错误的插入片段模型，改动结果不可信 |
| `asm_short_polish` | Pilon `--changes` | **建议开启** | 不开就无法核查抛光到底改了什么 |
| `asm_hic_scaffold` | 酶切位点 | 必填 | 必须与建库所用限制酶一致；给错会让连接信号无法解析 |
| `asm_hic_scaffold` | 比对排序方式 | 按读长名排序 | 给错会导致没有可用连接（Hi-C 需要配对两端信息） |
| `asm_filter_contigs` | `seqkit -m` | 500 | NCBI 提交下限 200 bp，注释与 MAG 常用 500~1000 bp。**阈值必须在项目内统一** |
| `asm_filter_contigs` | 覆盖度阈值 | 无通用值 | 先看 per-contig 覆盖度分布（双峰常意味着污染或质粒），不要直接套用别人的数字 |
| `asmqc_quast` | `--min-contig` | 500 | **跨项目比较 N50 前必须先统一这个值**；改成 0/200/1000 会明显改变 contig 数与 N50 |
| `asmqc_quast` | `-r / -g` | 无 | 提供参考（与注释）后才有 genome fraction 与 misassembly 统计；参考必须同物种且版本可追溯 |
| `asmqc_busco` | `-m` | 按输入类型 | 核酸模式要跑基因预测，结果对预测器版本敏感；**有注释时优先用 proteins** |
| `asmqc_busco` | `-l` | 按类群 | 越专一的谱系灵敏度越高但只能用于对应类群；**换数据集后分数不可直接比较** |
| `asmqc_checkm2` | `--database_path` / `--extension` | 自动查找 / 官方文档 | 离线环境必须显式给数据库路径；`.fa/.fasta/.fna` 混放会静默漏文件 |
| `asmqc_checkm2` | 质量门槛（非工具参数） | 完整度 > 90% 且污染 < 5% | MAG 场景的常见经验值；具体项目应结合下游用途设定并写明依据 |
| `asmqc_gunc` | `-d` | 必填 | 数据库版本决定判定结果，必须记录 |

## 3. 注释

| 模块 | 参数 | 常用值 | 什么情况下该改 |
|---|---|---|---|
| `anno_prodigal` | `-p` | single | **模式选错会让基因数与起点系统性偏移**：单菌长序列用 single，宏基因组/碎片化 contig 用 meta |
| `anno_prodigal` | `-g` / `-c` | 11 / 关闭 | 支原体等遗传密码表用 4，写错会让翻译与下游注释全错；`-c` 减少假基因但会丢掉真实部分基因 |
| `anno_prokka` | `--kingdom` | Bacteria | **古菌、病毒、真菌必须显式改**，否则基因预测与 RNA 模型都不对 |
| `anno_prokka` | `--locustag` | 由输出前缀派生 | **多菌株项目必须显式指定唯一前缀**，否则泛基因组与合并表会报重复 ID |
| `anno_prokka` | `--mincontiglen` | 200 | 短于该长度的 contig 被静默丢弃——草图里的小质粒片段会整段消失 |
| `anno_bakta` | `--db` / `--gram` | 必填 / ? | 库类型与版本是结果的一部分必须记录；不指定 `--gram` 时信号肽与脂蛋白预测会缺失 |
| `anno_bakta` | `--meta` / `--compliant` | 关闭 | MAG 与宏基因组来源应开 `--meta`，否则漏掉跨 contig 边缘的片段基因；提交数据库前必须开 `--compliant` |
| `anno_eggnog` | `-m` / `-e` | diamond / 0.001 | 换后端会改变命中集合（mmseqs 省内存、hmmer 最敏感但极慢）；E-value 跨项目比较必须一致 |
| `anno_eggnog` | `--tax_scope` / `--dbmem` | 自动推断 / 关闭 | 非模式物种先用默认值再抽查若干基因；`--dbmem` 提速明显但要数十 GB 内存，不足会被 OOM |
| `anno_kofamscan` | `-p / -k` | 必填 | **两者必须来自同一次下载**，混用不同日期的库会让自适应阈值失效 |
| `anno_kofamscan` | `--threshold` / `-E` | 1.0 / 0.01 | 1.0 表示用每个 KO 训练出的阈值；统一收紧或放宽会改变敏感度与假阳性 |
| `anno_diamond_nr` | `-f` / `-k` | 6 / 25 | 自定义列必须写明列顺序；做 LCA 需要更多命中（100 以上），只取 top1 会丢掉分类信息 |
| `anno_diamond_nr` | `--sensitive` | 偏快的默认档 | 远缘同源（环境样本、新属）至少做一次档位对照 |
| `anno_interpro` | `-appl` / `-cpu` | 全部成员库 / 1 | 裁剪应用集能大幅提速但会改变「没有注释」的含义；不设 CPU 时一个基因组可能跑一整天 |
| `anno_interpro` | `-goterms / -pa` | 关闭 | 不开启时结果里没有 GO 列，**别以为是没有注释** |
| `anno_dbcan` | `--tools` | 多方法组合 | 官方建议以「两种以上方法支持」作为高置信标准；只留一种会让结论完全依赖该方法 |
| `res_card_rgi` | `-t` | protein | **蛋白层面模型覆盖不全**：rRNA 等耐药决定簇需要 contig/genome 输入 |
| `res_card_rgi` | `--include_loose` | 关闭 | loose 命中只能作候选扩展，**绝不能与 strict 混在一起统计** |
| `res_card_rgi` | CARD 数据库版本 | 无 | ARO 编号与模型阈值随版本变化，跨项目比较前必须锁定同一版本 |
| `res_abricate` | `--minid` / `--mincov` | 80 / 80 | 降到 70 会明显增加假阳性，提到 90 以上会漏掉真实等位变异；调低覆盖度会让截断片段进入清单 |
| `res_resfinder` | `-s / --species` | 无 | **点突变判定必需**；非支持物种没有点突变库，写错会让结果失真 |
| `res_resfinder` | `--acquired / --point` | 都要显式指定 | 只写其中一个会静默缺少另一部分结果 |
| `res_vfdb` | core (setA) vs full (setB) | 按研究目的 | **用 full 统计数量会系统性高估**；选择必须写进方法 |
| `res_plasmidfinder` | `-t / -l` | 0.8 / 0.6 | 放宽 identity 会增加染色体上复制子样序列的假阳性；低覆盖命中要回看所在 contig |
| `res_mobilome` | `--cut_ga` | 关闭 | 不开启时需自己定 E-value，结果与 curated 阈值差异明显 |
| `phage_phaster` | 输入完整性 / 完整度判定 | 推荐完成图 / 全部保留 | 碎片化草图会把前噬菌体区域截断得到假的 incomplete；**合并统计时不要并入 incomplete** |
| `phage_checkv` | 输出序列选择 | `viruses.fna` | 前病毒分析必须用 `proviruses.fna`（已切除宿主区），混用会把宿主基因算进病毒组 |
| `phage_genomad` | `--relaxed / --conservative` | 默认后处理过滤 | **过滤强度直接决定「病毒数量」**，改档必须写进方法 |
| `phage_crisprcas` | evidence level | 1–4 全部输出 | level 1 基本是背景噪声；通常只把 level 4（或 3–4）当作候选系统 |
| `phage_crisprcas` | MacSyFinder 模型版本 | 随工具发布 | v1 与 v2 模型互不兼容且输出格式不同，跨项目比较前必须统一 |

## 4. 分类与分型

| 模块 | 参数 | 常用值 | 什么情况下该改 |
|---|---|---|---|
| `tax_gtdbtk` | `--extension` | 以版本为准 | `.fa/.fasta/.fna` 混放会**静默漏掉样本**，运行前核对读入的基因组数 |
| `tax_gtdbtk` | `--min_perc_aa` | 10 | 远缘或碎片化基因组可放宽，但结果可靠性随之下降 |
| `tax_gtdbtk` | GTDB 参考数据版本 | 随安装包 | **必须写进方法**：不同版本会改变分类命名与 ANI 计算，跨批次不可混用 |
| `tax_fastani` | `--minFraction` / `--fragLen` | 0.2 / 3000 | 降低 minFraction 可比较更远的关系但数值偏差变大；**fragLen 跨运行必须固定** |
| `tax_fastani` | `--ql / --rl` | 单文件模式 | 批量必须用列表文件；参考库上千时先用 Mash/sourmash 粗筛 |
| `tax_mash` | `-k` / `-s` | 21 / 1000 | 物种级粗筛用 21，菌株级常配 31 与更大草图；**近缘比较必须加大 `-s`**，否则距离被随机误差主导 |
| `tax_sourmash` | `-p k=31,scaled=1000` | k=31, scaled=1000 | 近缘（> 99% ANI）比较要更小 scaled（如 100）；**不同草图参数的距离不可比较** |
| `tax_16s_extract` | 长度门槛 | ≥ 1200 bp | 完整 16S 约 1.5 kb；短于 1200 bp 用于鉴定会把相似度系统性拉低 |
| `tax_16s_blast` | `-outfmt` / `-max_target_seqs` | 6 / 官方文档 | 脚本化必须用表格格式并写明列定义；`-max_target_seqs` 限制的是**参与输出的命中数**，不是「最优的 N 条」 |
| `tax_16s_blast` | `-qcov_hsp_perc` | 0 | 鉴定场景设 90 以上可显著减少部分命中造成的假象 |
| `tax_16s_blast` | 参考数据库选择 | 无 | NCBI 16S RefSeq / SILVA / EzBioCloud / Greengenes 的序列集与命名不同，**版本必须记录** |
| `var_bwa_map` | `-R '@RG...'` | 无 | **必须给**：`SM` 是同一样本标识，省略会让部分下游工具报错或把样本名退化成文件名 |
| `var_bcftools_call` | `mpileup -d` | 250 | **细菌高覆盖度必须调大（如 2000）**，否则证据被静默截断 |
| `var_bcftools_call` | `mpileup -q` / `call --ploidy 1` | 0 / 必填 | 重复区多时把 `-q` 提到 20~30 减少假阳性；**细菌单倍体必须显式改 `--ploidy 1`** |
| `var_bcftools_call` | `norm -m -both` | 关闭 | 不规范化会让同一变异在不同样本里写成不同记录，破坏后续合并与比较 |
| `var_bcftools_call` | 过滤阈值 QUAL / DP | 无万能值 | 深度上限按平均覆盖度定（覆盖度 100x 时上限 200~300），并把阈值写进方法 |
| `var_snippy` | `--mincov` / `--minfrac` | 10 / 0.9 | 低覆盖度数据要下调 mincov；混合样本需下调 minfrac（等于承认多株混合） |
| `var_snippy` | `--ref` | 必填 | **参考选择决定一切**：换参考会改变 SNP 数与核心基因组大小，必须记录 accession 与版本 |
| `var_mlst` | `--scheme` | 无 | **必须与物种匹配**：不指定时会遍历全部方案，既慢又可能给出其他物种的等位基因编号 |
| `var_amrfinder` | `--organism` | 无 | **漏掉会系统性漏报染色体点突变**；不确定时至少填到属 |
| `var_amrfinder` | 数据库更新 | 随工具 | 更新是手动步骤；更新后必须重跑对照样本并记录新版本，否则同批数据前后不可比 |
| `var_typing_cgmlst` | `-g / --schema` | 必填 | schema 来源与版本必须记录，**跨 schema 的编号与距离不可比较** |
| `var_typing_cgmlst` | 未检出比例门槛 | 经验上 < 5~10% | 比例过高应先改善组装再分型，否则距离矩阵不可靠 |
| `var_typing_cgmlst` | 暴发判定距离阈值 | 物种/方案特异 | **不能跨物种照搬**，必须依据本物种的流行病学一致性研究 |

## 5. 宏基因组与扩增子

| 模块 | 参数 | 常用值 | 什么情况下该改 |
|---|---|---|---|
| `meta_kraken2` | `--memory-mapping` | 关闭 | 能大幅降低内存峰值，但依赖磁盘随机读性能——SSD 上才实用 |
| `meta_bracken` | `bracken-build -k` | 35 | **必须与 Kraken 库的 k 一致** |
| `meta_metaphlan` | `--index` | 随安装版本 | 不同版本的物种集合与命名会变，**跨版本结果不可直接比较** |
| `meta_humann` | `--input2` / `--threads` | 无 / 1 | **双端只给 R1 会丢掉一部分可比对的读长**，比对率虚低；线程不设单样本可能跑一整天 |
| `meta_humann` | `--units` | cpm | relab 是相对丰度、cpm 是长度与深度校正后的量；**同一分析内必须统一** |
| `meta_megahit` | `--min-contig-len` | 200 | **建议在分箱前过滤，而不是组装时硬剁**：保留原始 contig 便于追查 |
| `meta_megahit` | `-m` / `--presets` | 0.9 / 无 | 内存设太低会中途失败、设太高并发时打爆机器；`meta-large` 针对高复杂度群落，用错会得到更碎的 contig |
| `meta_metaspades` | `--meta` | 必选 | **用 `--isolate` 或 `--careful` 跑宏基因组会严重低估复杂度**，这是最常见的模式误用 |
| `meta_binning_metabat` | `-m / --minContig` | 2500 | **分箱后再过滤已经晚了**：短 contig 会被分错并污染 bin，应在分箱前排除 |
| `meta_binning_metabat` | `-a / --abdFile` | 必填 | 单样本覆盖度会让低丰度物种分箱质量明显变差；多样本模式要求样本来自可比群落 |
| `meta_bin_refine` | `-comp / -con` | 75 / 10 | 关键分析建议收紧到 90/5；门槛必须在方法里写明 |
| `meta_bin_refine` | `-pa / -sa` | 0.90 / 0.95 | 95% 是物种级惯例；用 90% 会把更多近缘 MAG 合成一个代表，直接减少「物种数」 |
| `meta_mag_taxonomy` | GTDB 版本 / 扩展名 | 必须记录 / 显式给 | 扩展名写错会让「0 个基因组被处理」而流程不报错 |
| `meta_assembly_qc` | 完整度 / 污染度门槛 | > 90% / < 5% | 低质量 MAG 只适合做「谁在」层面的参考；关键分析不要放宽到 10% 以上 |
| `meta_assembly_qc` | 是否把 rRNA/tRNA 作为门槛 | 不作为必要条件 | 短读长宏基因组很难拼出 rRNA 操纵子，机械套用 MIMAG 条件几乎会淘汰全部 MAG |
| `meta_coverm` | `--methods` | `mean` | mean 是平均深度、relative_abundance 是群落占比，**两者不能混用**；先确定下游统计需要哪一种 |
| `meta_coverm` | `--min-read-percent-identity` | 官方文档 | 放宽会把近缘同源读长也算进来（污染 MAG 上尤其明显） |
| `meta_coverm` | genome / contig 模式 | genome | contig 模式给的是每条 contig 的覆盖度（用于分箱），**不要当作 MAG 丰度** |
| `meta_virome` | geNomad 分数阈值 | 官方文档 | 放宽会混入可移动元件与质粒，收紧会漏掉真实病毒；阈值必须写进方法 |
| `meta_virome` | 去冗余阈值（vOTU） | 0.95 | **95% 是惯例而非标准**；阈值变化会直接改变「病毒多样性」的数字 |
| `meta_virome` | 定量方式 | 读长回贴覆盖度 | 用覆盖度而非读长计数比较不同病毒（基因组长度差异大），同时报告覆盖度作为可信度 |
| `amplicon_qiime2_import` | manifest 路径 | **绝对路径** | 相对路径在导入时不一定立刻报错，但换工作目录后就会失败 |
| `amplicon_qiime2_import` | `--p-discard-untrimmed` | 关闭 | 能显著减少嵌合与假 ASV，但会损失一部分真实数据，建议前后对比读长数 |
| `amplicon_dada2` | `truncLen` | 0（不截断） | **设太长会保留低质量尾端（造假 ASV），设太短会让 R1/R2 重叠不足而无法合并** |
| `amplicon_dada2` | `maxEE` / `truncQ` | 2 / 2 | maxEE 比固定质量阈值更稳健，是低质量数据的首选过滤方式 |
| `amplicon_dada2` | `pool` | FALSE | TRUE 更灵敏但易放大污染与 index hopping；**这个选择会实实在在地改变 ASV 数量**，必须写进方法 |
| `amplicon_deblur` | `--p-trim-length` | 必填（16S 常用 150） | 取值过短会显著降低分类分辨率，过长会把低质量尾端带进来 |
| `amplicon_taxonomy_assign` | `--p-confidence` | 0.7 | 提高会让更多 ASV 停在属/科但减少错误种名；**降低是把低置信度种名也报出来，是过度解读的常见来源** |
| `amplicon_taxonomy_assign` | 参考库版本与区域 | 无 | **SILVA 138.x / Greengenes2 的具体版本与训练所用扩增区段都必须写进方法** |
| `amplicon_qiime2_diversity` | `--p-sampling-depth` | 必填 | 取得太低会丢掉大部分样本，太高只剩少数样本；必须由稀释曲线与每样本读长数共同决定 |
| `amplicon_qiime2_diversity` | `--p-method` / `--p-pairwise` | permanova / 关闭 | permanova 检验组间差异、permdist 检验组内离散度，两者不一致时先解决离散度差异；多组两两比较必须做多重校正 |
| `amplicon_qiime2_diversity` | 距离指标 | bray_curtis 等 | 加权 UniFrac 与 Bray-Curtis 对丰度敏感，unweighted UniFrac 只看有无、对稀有类群极敏感；**指标选择会改变结论** |
| `amplicon_decontam` | `method` / `threshold` | frequency / 0.1 | prevalence 容易把稀有真实类群误判；阈值调高删得更多（也伤真实低丰度类群），必须写明取值 |
| `amplicon_phyloseq` | `fix_formula` | 无 | **把批次、受试者等协变量写进公式，而不是事后解释**；伪重复数据必须把受试者 id 放进模型 |
| `amplicon_phyloseq` | `p_adj_method` / CLR 零值处理 | BH / 无统一默认 | 用了 BH 就不要只报原始 p 值；**CLR 对零值没有定义**，必须显式选择替换方法 |
| `amplicon_its_fungal` | `truncLen` / `pool` | 0 / pseudo | **ITS 长度变异大**，固定截断会系统性丢掉长 ITS 类群；长度不一致会让 `pool=FALSE` 明显漏检真实 ASV |
| `amplicon_its_fungal` | UNITE 数据集版本 | 无 | dynamic 数据集随日期变化，版本与日期必须写进方法 |

## 6. 转录组

| 模块 | 参数 | 常用值 | 什么情况下该改 |
|---|---|---|---|
| `tran_rrna_remove` | SortMeRNA `--fastx` | **建议开启** | 不加时输出是 FASTA，质量值全部丢失——**这个默认值很容易被忽略**，而下游比对与定量都需要 FASTQ |
| `tran_rrna_remove` | `--paired_in` | 关闭 | 任一端命中就丢整对比只丢命中端更保守；代价是可能连带丢掉真实 mRNA 对 |
| `tran_rrna_remove` | RiboDetector `-l` / `-e` | 100 / `norrna` | `-l` 必须与实际读长接近；`-e` 写反会得到完全相反的结果，先在小样本上确认 |
| `tran_hisat_align` | `--no-mixed / --no-discordant` | 关闭 | RNA-seq 中这类记录多来自残留 rRNA 或重复序列，过滤后计数更干净 |
| `tran_hisat_align` | `-p` / `samtools sort -m` | 1 / 未设 | 比对通常是全流程最耗时的步骤；BAM 较大时不设 `-m` 容易触发磁盘临时文件 |
| `tran_featurecounts` | `-t / -g` | `-t exon -g gene_id` | **必须按注释文件实际内容改**（细菌常见 CDS + locus_tag）；用错会导致计数为 0 或只统计到部分基因 |
| `tran_featurecounts` | `-s` | 0 | 0=不分链，1=正向，2=反向；**dUTP 建库通常对应 2**。写错不报错，但计数会系统性偏向一侧 |
| `tran_featurecounts` | `-p / --countReadPairs` | 关闭 | 双端必须加 `-p`；「按 read 还是按 fragment 计数」由 `--countReadPairs` 控制，不同版本默认不同，**全项目必须统一** |
| `tran_featurecounts` | `-M / --fraction` | 关闭 | `--fraction` 用分数计数避免重复计数偏倚；会让计数变成小数（DESeq2 可接受），但必须在方法里说明 |
| `tran_salmon_quant` | `salmon index -k` | 31 | **必须小于最短转录本长度**：短基因较多时要调小，否则这些基因无法被定量 |
| `tran_salmon_quant` | `-l` / `--gcBias` | A / 关闭 | 自动检测在小样本或非标准链型时可能判错；偏置校正会明显增加时间与内存，**同一次比较里所有样本必须一致** |
| `tran_salmon_quant` | `tximport type` | 无（必填） | 必须与定量工具一致（salmon / kallisto）；写错会让长度偏移与计数都对不上，**而 R 不会报错** |
| `tran_deseq2` | `design` | `~ condition` | **把批次等协变量写进公式**；批次与分组完全混杂时设计矩阵秩亏，那是实验设计问题而非参数问题 |
| `tran_deseq2` | `alpha` / `lfcShrink type` | 0.05 / normal | 改动 alpha 会改变被独立过滤掉的基因集合，需与方法报告一致；**收缩后的 log2FC 不能用于假设检验** |
| `tran_deseq2` | `estimateSizeFactors type` | ratio | 大量基因为零或存在成片差异表达时，poscounts / iterate 通常更稳健 |
| `tran_deseq2` | `minReplicatesForReplace` | 7 | 每组只有 3 个重复时该功能不生效，离群样本必须靠 sizeFactors 与样本聚类自己发现 |
| `tran_edger` | `filterByExpr` | 必填 | 必须在设计矩阵确定后、检验之前运行；**不同设计会得到不同的保留集合** |
| `tran_edger` | `calcNormFactors method` | TMM | 可用 TMMwsp 或 RLE 做敏感性对比；TMM 对少数极高表达基因更稳健 |
| `tran_edger` | `glmTreat lfc` / `exactTest` | 0 / — | `glmTreat` 检验的是「效应量大于阈值」而非「不等于 0」；`exactTest` 只适用于两组无协变量比较 |
| `tran_batch_correct` | `comBat_seq group` | NULL | **必须把要保护的分组变量传进去**，否则生物学差异会一起被扣除 |
| `tran_batch_correct` | `removeBatchEffect` 的 design | 无（必填） | 必须显式给出要保留的设计；**且结果只能用于可视化**，不能用于差异检验 |
| `tran_batch_correct` | 批次与分组的关系 | — | 完全混杂时无法校正（统计上无解）；部分混杂时校正后功效下降，需在方法里说明 |
| `tran_go_enrich` | `universe` | 显式给出背景基因集 | 背景应是「表达过滤后剩下的基因」；**换背景会得到完全不同的 p 值** |
| `tran_go_enrich` | `minGSSize / maxGSSize` | 10 / 500 | 过小的条目几乎必然显著却不可解释；过大的条目缺乏特异性 |
| `tran_go_enrich` | `ont` / `enrichKEGG organism` | BP / 物种三字母代码 | GO 三个分支应分别分析而不是混做；没有物种代码时用 `"ko"`，**用错会得到完全无关的通路** |
| `tran_go_enrich` | GSEA `geneList` | 全部基因 | **必须用全部基因（不能先筛显著基因）并按统计量排序**；用 log2FC 时低表达基因的 LFC 波动很大 |

## 7. 建树与比较基因组

| 模块 | 参数 | 常用值 | 什么情况下该改 |
|---|---|---|---|
| `phy_mafft` | `--auto` | 自动 | 它是折中而不是最优；**重要分析应显式指定档位并记录** |
| `phy_mafft` | `--maxiterate` | 0 | 要真正进入精修模式必须显式给出（常用 1000 表示迭代到收敛） |
| `phy_mafft` | `--localpair/--globalpair/--genafpair` | 无 | 由「序列之间是否全长同源」决定：L-INS-i / G-INS-i / E-INS-i |
| `phy_trimal` | `-gappyout` / `-automated1` | 关闭 | `-gappyout` 按 gap 比例自动选阈值，对长度不齐的 rRNA/ITS 最有效；`-automated1` 修剪更强，务必检查修剪后长度 |
| `phy_trimal` | `-gt` / `-cons` | 无 / 60 | 手工阈值便于复现与横向比较；`-cons` 越高保留越少，需与数据分歧水平匹配 |
| `phy_iqtree` | `-m` | MFP | **不要跨数据集照搬固定模型**；日志里会列出候选与最终选择，必须核对 |
| `phy_iqtree` | `-B` / `-alrt` | 1000 / 1000 | UFBoot **会高估支持度**（可用 `-bnni` 缓解）；SH-aLRT 数值通常高于 UFBoot，**两者不可互换** |
| `phy_iqtree` | `-bb` | 关闭 | 标准 bootstrap 更保守但慢得多；发表里的关键拓扑值得用它复核 |
| `phy_iqtree` | `-p / -q` | 无 | `-p` 用分区模型、`-q` 用混合模型；把多基因串联数据当单一分区会低估速率异质性 |
| `phy_iqtree` | `-T / -seed` | 1 / 自动 | 线程数会影响浮点运算顺序带来极小差异；**要严格复现必须同时固定两者** |
| `phy_raxml` | `--model` | 必填 | **RAxML-NG 不做模型选择**：用错模型不会报错，只会让结果偏差 |
| `phy_raxml` | `--bs-metric` / `--bs-trees` | fbp / 100 | 类群采样不均衡或内部枝极短时 TBE 比 FBP 更稳健；`autoMRE{1000}` 比固定重复数更省机时 |
| `phy_raxml` | `--parse` | — | 只做输入检查不建树；序列名重复、非法字符、模型不可用、内存需求都会在这里暴露 |
| `phy_modeltest` | `-m MF / MFP` / `-criterion` | MF / BIC | MF 只做模型选择；BIC 更倾向简单模型、AIC 更倾向复杂模型 |
| `phy_fasttree` | `-nt / -gtr` | -nt（JC+CAT） | **核酸数据必须显式指定**：不指定时按蛋白处理，结果完全错误 |
| `phy_fasttree` | `-lg / -wag` / `-boot` | JTT+CAT / 关闭 | 默认 JTT 对细菌蛋白常不是最优；不加 `-boot` 时输出的是局部支持值而**不是 bootstrap 比例**，两者含义不同 |
| `phy_root_calibrate` | `set_outgroup` / `iqtree -o` | — | **多个外群要先取它们的最远共同祖先**；逐条指定会得到错误结果 |
| `phy_root_calibrate` | 外群数量 / 中点定根 | 建议 ≥ 2 / 仅作对照 | **单个外群一旦定错位置，整棵树的解读都会错**；与外群定根冲突时应先怀疑速率异质性 |
| `phy_support_test` | 支持度重复数 | 1000 | **重复数太少会让短内部枝的支持度极不稳定**，但增加重复数无法修正系统误差 |
| `phy_tree_compare` | `RF.dist normalize` | FALSE | **比较类群数不同的树集时必须归一化**，否则距离不可比 |
| `phy_tree_compare` | split 类型 / `-zb` | 无根用 split / 10000 | 把有根树当无根比较会丢掉方向信息；拓扑检验的 p 值依赖重复数 |
| `phy_its_phylogeny` | 算法档位 / 分区方案 | E-INS-i / ITS1-5.8S-ITS2 三分区 | ITS 含大段可变区，E-INS-i 允许局部不可比；不分区时高度保守的 5.8S 会主导信号 |
| `phy_its_phylogeny` | `trimAl` 模式 | `-gappyout` | 要报告保留列数——过度修剪会让短序列几乎被删空 |
| `pange_panaroo` | `--clean-mode` | 以官方文档为准 | strict 最激进地清理可疑注释，retain 保留全部；注释质量参差时用 strict |
| `pange_panaroo` | `--aligner` / `--merge_paralogs` | mafft / 关闭 | prank 对移码与插入缺失更敏感但更慢；合并旁系同源会明显减少家族总数，**必须在报告里说明** |
| `pange_roary` | `-i` / `-cd` | 95 / 99 | **与旧结果比较时必须保持一致**：下调 `-i` 会合并更多家族、核心基因数随之上升 |
| `pange_roary` | `-g` | 关闭 | **默认会拆分旁系同源**；关闭后家族数明显减少 |
| `pange_orthofinder` | `-S` / `-M` | diamond / dendroblast | mmseqs 在远缘序列上常更敏感；`msa` 精度更高但耗时相差一个数量级 |

## 8. 通用（数据、统计、绘图、流程）

| 模块 | 参数 | 常用值 | 什么情况下该改 |
|---|---|---|---|
| `py_pandas_io` | `sep` / `comment` | `"\t"` / `"#"` | **必须显式给**：默认逗号会把 TSV 读成单列且不报错；工具报告有注释行时必给 `comment` |
| `py_pandas_io` | `dtype` / `na_values` | 强制 `str` / `["", "NA", "-", "N/A"]` | **id 列永远要给 `dtype=str`**（基因名被猜成日期是合并失败的头号原因）；缺失值写法不补会出现名叫 `-` 的分组 |
| `py_pandas_tidy` | `merge(how=, validate=)` | `left` / `many_to_one` | `inner` 会静默丢样本；`validate` 是最省事的防错参数，让 pandas 主动报键重复 |
| `py_pandas_tidy` | `pivot_table(aggfunc=)` | `mean` | `pivot` 遇到重复键会报错，`pivot_table` 会静默平均——**后者更危险**，先用 `duplicated` 查重复 |
| `r_tidyverse` | `summarise(.groups=)` | `"drop"` | 不显式丢弃分组会让后续 `mutate`/`count` 都按组进行，结果「多了几行」而原因极难定位 |
| `py_scipy_stats` | `multipletests method` | `fdr_bh` | **不要用默认的 `'hs'`**（控制 FWER，几千次比较时几乎不会有显著结果） |
| `py_scipy_stats` | 校正范围 | 全部检验的 p 值一次性校正 | **绝不能按物种/基因分批校正**，分批会让每一批都有人为的显著结果 |
| `r_limma_stats` | `topTable number` | `Inf` | **默认只返回 10 行**；忘了改，后续校正只针对 10 个特征，而结果看起来完全正常 |
| `r_limma_stats` | `design` / `makeContrasts` | `~ 0 + group + batch` / 显式写 | 用 `~0 +` 让每个组一个系数，对照表达式最直观；**方向写反会让所有 logFC 符号颠倒且看不出错** |
| `r_limma_stats` | `eBayes(trend, robust)` / `lmFit(block)` | 建议开启 / 无 | trend 允许方差随丰度变化、robust 对离群特征更稳健；配对或重复测量设计必须用 `block` |
| `r_vegan_diversity` | `adonis2 permutations / by` | 999 / `"terms"` | 置换次数决定 p 值的最小可分辨值；要报告各项边际效应时改 `"margin"` |
| `r_vegan_diversity` | `betadisper` | 必须做 | **与 PERMANOVA 一起报**：组内离散度不等时 PERMANOVA 的显著是伪影 |
| `r_vegan_diversity` | `vegdist method` / `diversity index` | `"bray"` / `"shannon"` | 大量双零时 Jaccard 更合适；Shannon 对稀有物种更敏感、Simpson 更侧重优势物种，**报哪个要先说清** |
| `r_matrix_stats` | `cmdscale(eig=)` / `metaMDS` | `TRUE` / `set.seed` | 要算解释度就必须给 `eig=TRUE`，且**负特征值必须从分母里排除**；NMDS 是迭代算法必须固定种子 |
| `r_matrix_stats` | `dist(method)` / `hclust(method)` | `"euclidean"` / `"complete"` | 高维稀疏数据上曼哈顿或相关系数距离往往更合适，必须写明理由；single 有链式效应 |
| `py_sklearn_cluster` | `KMeans(random_state, n_init)` | `0, 10` | **必须固定种子**，否则每次运行分组都不同；`n_init` 设大避免局部最优 |
| `viz_ggplot2` | `aes(colour = )` 的位置 | 写在 `aes()` **内部** | 写在外部只是设一个固定颜色，不会按分组区分 |
| `viz_ggplot2` | `facet_wrap(scales=)` | `"free_y"` | 多指标同图时必给，否则量纲小的指标被压成一条线 |
| `viz_ggplot2` | `coord_cartesian(ylim=)` | 裁剪用这个 | **`scale_*_continuous(limits=)` 会丢弃范围外的数据点**，统计量会与实际数据不一致 |
| `viz_ggplot2` | `geom_boxplot(outlier.shape)` | `NA`（配 jitter 时） | 不设会让同一个点被画两遍，读者误判样本数 |
| `viz_volcano_ma` | p 值列 / x 轴范围 | `adj.P.Val` / 关于 0 对称 | **必须用校正后 p 值**；x 轴不对称会视觉上夸大某个方向的变化 |
| `viz_heatmap` | `scale` / `center` | 图注必须写明方向 / 相关矩阵用 `center=0` | **按行 Z-score 与不标准化回答的问题完全不同**；0 不在色标中点会夸大方向性差异 |
| `viz_heatmap` | `breaks` / `show_rownames` | 固定范围 / `FALSE` | **多张热图互相比较必须固定同一 breaks**；行数超过约 200 时行名会重叠成黑块 |
| `viz_pub_style` | `base_size` / `units` | 11（屏幕默认）/ `"cm"` | 投稿图偏大，单栏通常 7~9 pt，**按最终物理尺寸输出后实测**；期刊按厘米给尺寸 |
| `viz_pub_style` | `device` / `dpi` | `cairo_pdf` / 300 | 含中文标签必须用 `cairo_pdf`，否则换机器打开变方框；线条图部分期刊要求 600 dpi |
| `viz_pub_style` | 配色方案 | viridis / ColorBrewer | **禁彩虹色盘（rainbow/jet）、禁红绿对比**；超过 6~7 组需增加形状或分面 |
| `viz_seaborn` | `matplotlib.use("Agg")` | 无头服务器必设 | 不设会在 `plt.show()` 处报错或挂起；先 `tight_layout()` 再 `savefig`，顺序反了标签被裁切 |
| `py_export_report` | Excel 输出 | 同时导出一份 CSV | **xlsx 会被 Excel 改写基因名与长数字 id**；CSV 必须是权威版本 |
| `wf_snakemake` | `--cores` / `--use-conda` | 显式给数字 / 开启 | 不给 `--cores` 会串行执行；不开 `--use-conda` 则所有工具共用当前环境 |
| `wf_snakemake` | `--forcerun` | 改环境后**必须**给 | **引擎不会自动检测工具版本变化**，升级工具后必须显式重跑 |
| `wf_snakemake` | `--rerun-incomplete` / `--unlock` | 中断后开启 / 异常退出后 | 不加前者会因「文件存在但无效」卡住；不解除锁时后续命令都报「目录被锁定」 |
| `wf_snakemake` | `--latency-wait` | 5 → 共享文件系统调 30~60 | NFS 上文件同步有延迟，默认值会产生「输出文件不存在」的假报错 |
| `wf_nextflow` | `-resume` / `maxForks` | 失败后接续 / 按配额设 | `-resume` 完全依赖 `work/` 缓存目录，删掉就从头重跑；不限制 `maxForks` 会一次压垮集群 |
| `wf_conda_env` | 通道顺序 / `--no-builds` | bioconda → conda-forge → defaults / 跨平台时用 | 顺序写错会装到不同来源的同名包，问题在运行期才暴露；含 build 号最严格但可能装不上 |
| `wf_conda_env` | 环境位置 | 项目内 `-p envs/<name>` | 用路径而非名字，避免不同项目都叫 `bioinfo` 而误用别人的环境 |
| `wf_container` | 镜像引用 | **digest**（`@sha256:...`） | tag 是可变的；**上游重建同一个 tag 会得到不同内容**，`latest` 等于放弃版本固定 |
| `wf_container` | `docker --user` | `$(id -u):$(id -g)` | 容器内以 root 运行会生成 root 所有的输出文件，宿主机上无法修改 |
| `wf_checkpoint_pipeline` | 完整性判据 | **存在且非空** | 被中断的任务常留下 0 字节文件，只判断「存在」会让下游拿到空数据 |
| `wf_batch_loop` | `set -e` / `parallel --jobs` | **不要用** / 总核数 ÷ 每样本线程数 | 批量循环用 `set -e` 会让第一个样本失败就中断整批；`--jobs 16` 配每任务 8 线程实际申请 128 线程，比串行还慢 |
| `wf_batch_loop` | `while read` 的 `IFS` / `--joblog` | `IFS=$'\t'` / 开启 | 读 TSV 不指定 `IFS` 会让含空格的字段被拆开、样本名错位；`--joblog` 是「只重跑失败样本」的依据 |
| `wf_cluster_submit` | `--cpus-per-task` / `--mem` | **与工具线程数一致** / 按工具特性 | 申请 16 核但命令里没传 `-t` 是最常见的浪费；`fastp` 几 GB 而**宏基因组组装常需 100~250 GB**，不足会在数小时后被 OOM 杀死 |
| `wf_cluster_submit` | `--output / --error` / `--array=1-N%M` | **必须显式指定** / 加 `%M` | 不指定则作业输出散落在提交目录，几十个 `slurm-*.out` 无法与样本对应；不限并发会一次占满队列 |
| `io_compress_index` | `bgzip` vs `gzip` / `tabix -C` | `bgzip` / 超长基因组时用 | **只有 bgzip 的分块流才能被索引**，两者文件内容与扩展名都相同、无法从外表区分 |
| `io_interop_standard` | `dtype` | 逐列显式声明 | 自动推断会改写 ID 与缺失值语义；跨语言交换的表必须逐列声明类型 |

---

## 附：三类「不设就会静默出错」的参数

速度类与阈值类参数改错了通常看得出来，但下面三类改了**不会有任何提示**：

| 类别 | 典型参数 | 静默出错的形态 |
|---|---|---|
| **方向类** | `samtools -f` vs `-F`、`featureCounts -s`、`makeContrasts` 的对照方向、RiboDetector `-e` | 结果看起来完全正常，只是含义反了 |
| **坐标与类型类** | GFF→BED 的 ±1、`--ploidy 1`、id 列的 `dtype=str` | 每条记录都错一点点，不报错、行数不变 |
| **开关类** | `clumpify dedupe=t`、SortMeRNA `--fastx`、`--compliant`、`prokka --kingdom` | 该做的处理没做，输出「看起来成功」但缺少内容 |
