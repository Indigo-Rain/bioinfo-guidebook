# 第 1 章 环境与工程规范

## 1.1 这一层要回答什么问题

这一章不解决任何生物学问题，它解决的是**后面所有章节都会踩的坑**：

- 为什么 `conda install` 装不上某个工具，或者装上了却报共享库错误？
- 为什么同一套命令在同事机器上跑出不同的结果？
- 为什么半年后自己重跑同一个流程，物种组成变了？
- 为什么脚本在 Windows 上跑不了？

这些问题的根源几乎都落在三件事上：**环境隔离、数据组织、版本记录**。这一章把这三件事定好，后面就不用反复处理同类问题。

## 1.2 目录结构与数据组织

### 推荐布局

```
project/
├── 00_raw/            # 原始数据，只读，永不修改
├── 01_clean/          # 质控后读长
├── 02_assembly/       # 组装产物
├── 03_annotation/     # 注释结果
├── 04_quant/          # 定量 / 丰度矩阵
├── 05_alignment/      # 比对与变异
├── 09_results/        # 最终结果与图（交付物）
├── 10_logs/           # 日志、质控报告、溯源清单
├── refs/              # 参考数据库与索引（体积大，单独管理版本）
├── envs/              # 环境定义与锁文件
├── scripts/           # 提交脚本、工具脚本
└── samples.tsv        # 样本清单（批量的驱动源）
```

模块的面板节点在提示里使用同样的目录约定（`00_raw`、`01_clean` 等），导出的 Bash 脚本会先创建这些目录。

### 三条纪律

**① `00_raw` 只读。**
原始数据永不修改。任何派生数据都写到 `01_clean` 之后。这条纪律的价值在排查问题时体现：结果的任何差异都可以归因到某一步，而不是「数据可能被人动过」。

**② 文件名里带样本名，且样本名统一用下划线。**
```
✅ 01_clean/Sample01_R1.fq.gz
❌ 01_clean/clean_1_1.fq.gz          # 看不出是哪个样本、哪个 mate
❌ 01_clean/Sample-01_R1.fq.gz        # 连字符会破坏通配符匹配（Snakemake 尤甚）
❌ 01_clean/Sample 01_R1.fq.gz        # 空格会让 shell 与并行工具出各种问题
```
样本名的不一致（`Sample1` vs `Sample_1`、大小写差异、多余空格）是下游合并失败最常见的原因。统一命名比事后到处写容错代码省事得多。

**③ 样本清单即数据。**
用一个 `samples.tsv` 描述所有样本及其实验属性，批量处理遍历它而不是硬编码列表：

```tsv
sample	r1	r2	group	batch
S01	00_raw/S01_R1.fq.gz	00_raw/S01_R2.fq.gz	control	B1
S02	00_raw/S02_R1.fq.gz	00_raw/S02_R2.fq.gz	control	B1
S03	00_raw/S03_R1.fq.gz	00_raw/S03_R2.fq.gz	treat	B2
```

好处有三层：增加样本只需改表；表的版本可以连同结果一起归档；分组与批次信息从一开始就在数据里，不必等统计时再手工对应。

### Windows 上的现实建议

部分生信工具没有 Windows 原生构建（SPAdes、Prokka、大部分 R/Bioconductor 包在 Windows 上都有坑）。两种可行方案：

1. **WSL2**（推荐给个人机器）：在 Windows 内跑一个真实的 Linux 环境，能直接用 conda 与绝大多数工具，文件系统互通。
2. **容器**：Docker Desktop 或直接在 Linux 服务器上工作。

不要尝试在原生 Windows 上拼凑一套生信环境。路径分隔符、大小写敏感、缺少 POSIX 工具会让你在无关的地方反复花时间。

## 1.3 环境隔离：为什么不能全都装在一个环境里

### 冲突是怎么发生的

生信工具依赖关系复杂且互相矛盾。典型例子：某工具依赖 Python 3.8 与 numpy 1.x，另一个工具依赖 Python 3.11 与 numpy 2.x；某工具需要较新的 GCC 共享库，另一个编译时链接了旧版本。把它们装进同一个 conda 环境，求解器要么直接失败，要么装上一个「能装但跑不起来」的组合。

**因此：每个工具（或每组紧密相关的小工具）一个独立环境。**

### 两种组织策略

| 策略 | 做法 | 优点 | 代价 |
|---|---|---|---|
| 逐工具环境 | 每个工具一个 yaml（`envs/fastp.yaml`） | 互不影响、增删工具不影响其它 | 环境数量多，磁盘占用大 |
| 逐步骤环境 | 一组协同的工具一个环境（`envs/qc.yaml`：fastp + fastqc + multiqc） | 环境少、切换少 | 同一步骤内仍有冲突可能 |

实践中**按步骤分组**最常见：质控工具放在一起（它们都是轻量工具），组装工具各自独立（SPAdes 依赖复杂）。工作流引擎（第 11 章）为每个规则声明环境文件，天然支持这种粒度。

### conda 与 mamba

`mamba` 是 conda 的快速求解器实现，命令兼容：

```bash
# 用路径而不是名字装环境，避免与全局环境重名混淆
mamba env create -f envs/qc.yaml -p envs/qc

# 激活（注意：路径形式的环境用 -p 激活）
mamba activate ./envs/qc
```

### 通道顺序很重要

bioconda 的生信包依赖 conda-forge 的库，而 conda-forge 的包有时与 defaults 通道的同名包冲突。约定顺序是 **bioconda → conda-forge → defaults**，并开启严格优先级：

```bash
conda config --add channels bioconda
conda config --add channels conda-forge
conda config --set channel_priority strict
```

顺序写错会装到不同来源的同名包，或解析出完全不同的依赖版本组合。

### 一个具体的环境文件

```yaml
# envs/qc.yaml
name: qc
channels:
  - bioconda
  - conda-forge
dependencies:
  - fastp=0.23.4
  - fastqc=0.12.1
  - multiqc=1.21
  - seqkit=2.9.0
```

### 锁定：把"能装上"变成"能复现"

写了 `fastp=0.23.4` 还不够——它的依赖（htslib、libdeflate 等）版本没有固定，半年后重建会装到不同版本，可能影响结果。**必须导出完整依赖树**：

```bash
mamba env export -p envs/qc --no-builds > envs/qc.lock.yaml
```

`--no-builds` 去掉构建号，可移植性更好；去掉这个参数则最严格但可能跨平台装不上。两者选一个并把选择写进项目说明。

**不要把环境目录本身纳入版本管理**。conda 环境有数 GB 且含平台相关二进制；纳入的是 yaml / lock 文件，环境目录写进 `.gitignore`。

### pip 的边界

尽量不用 `pip install` 往 conda 环境里装包——它会破坏依赖一致性，且让 `env export` 无法完整描述环境。必须在 bioconda 找不到时才用，并在项目说明里显式记录装了哪些 pip 包、为什么。

## 1.4 容器：比 conda 更彻底的隔离

容器把操作系统层以下之外的依赖全部封进镜像。与 conda 的关键区别是：**conda 是「按依赖文件重建出的近似环境」，容器是「作者当时验证过的那一套环境」**。

```bash
# 优先复用 BioContainers 的现成镜像（数千个常用工具已有官方镜像）
docker run --rm -v "$PWD":/data -w /data \
  quay.io/biocontainers/fastp:0.23.4--h5f740d0_0 fastp --version
```

### 两个必须知道的细节

**① 记 digest 而不是 tag。**
tag 是可变的：上游重新构建同一个 tag 会得到不同内容。溯源必须记 digest：

```bash
docker inspect --format='{{index .RepoDigests 0}}' quay.io/biocontainers/fastp:0.23.4--h5f740d0_0
```

**② 容器固定的是软件，不是数据。**
参考数据库、工具索引、分类模型体积太大，不会打进镜像。**它们的版本仍需单独管理**（见 1.5）。这是容器化最容易被忽略的缺口——镜像 digest 记得再仔细，数据库版本缺失一样无法复现。

### 集群上用 Apptainer 而不是 Docker

多数 HPC 集群不允许 Docker（需要守护进程与 root）。用 Apptainer/Singularity：

```bash
apptainer exec --bind "$PWD:/data" --writable-tmpfs \
  docker://quay.io/biocontainers/fastp:0.23.4--h5f740d0_0 fastp --version

# 转成本地 SIF 后运行更快，也便于在集群上共享
apptainer build fastp_0.23.4.sif docker://quay.io/biocontainers/fastp:0.23.4--h5f740d0_0
```

注意 `--writable-tmpfs`：Apptainer 默认只读，而很多工具会往 `/tmp` 写临时文件，不开这个选项会以难懂的错误失败。

## 1.5 版本记录：四项缺一不可

结果要可追溯，必须能回答「这是用什么算出来的」。需要记录四项：

| 项 | 怎么记 | 为什么 |
|---|---|---|
| **软件版本** | `tool --version` 输出、conda lock 文件、镜像 digest | 工具行为随版本变化 |
| **数据库版本** | 数据库名称 + 版本号 + 下载日期 + 来源 URL + 校验和 | **权重常高于软件版本**：换库会改变物种组成与分类结果 |
| **输入校验和** | `sha256sum` 每个输入文件 | 回答「用的是不是同一批数据」 |
| **实际命令与参数** | 工作流引擎日志，或脚本中的显式命令 | 参数比工具本身更常变 |

### 为什么数据库版本特别重要

同一版 Kraken2 配标准库与配 plusPF 库，会给出不同的物种组成；同一版 GTDB-Tk 配不同版的 GTDB，会给出不同的分类。软件版本记得再仔细，数据库版本缺失一样无法复现。

```bash
# 下载数据库时同时写一份版本说明，与数据一起存放
DL_DIR=refs/kraken2_standard
mkdir -p "$DL_DIR"

cat > "$DL_DIR/VERSION.txt" <<EOF
name: Kraken2 standard database
source: https://benlangmead.github.io/aws-indexes/k2
downloaded: $(date -Iseconds)
md5_declared: <官方页面公布的 md5>
notes: 用于读长级物种分类；换库会使物种组成结果不可比
EOF

# 计算并记录实际校验和，与官方值核对
find "$DL_DIR" -type f -name '*.k2d' -exec sha256sum {} + > "$DL_DIR/checksums.sha256"
```

### 最小可用的溯源清单

```bash
#!/usr/bin/env bash
# 在流程结束时运行，产出 run_manifest.tsv
set -euo pipefail
OUT=10_logs/run_manifest.tsv

{
  printf 'key\tvalue\n'
  printf 'generated_at\t%s\n' "$(date -Iseconds)"
  printf 'hostname\t%s\n'     "$(hostname)"
  printf 'working_dir\t%s\n'  "$PWD"

  # 输入数据的校验和
  if [ -d 00_raw ]; then
    printf 'input_checksums\t%s\n' \
      "$(find 00_raw -type f -name '*.fq.gz' -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)"
  fi

  # 软件版本
  for pair in "fastp:fastp --version" "spades:spades.py --version" "quast:quast.py --version"; do
    name=${pair%%:*}; cmd=${pair#*:}
    printf 'tool_%s\t%s\n' "$name" "$(eval "$cmd" 2>&1 | head -1 || echo 'not found')"
  done

  # 数据库版本（最常被遗漏，但权重最高）
  [ -n "${KRAKEN_DB:-}" ] && printf 'db_kraken\t%s\n' "$(basename "$KRAKEN_DB")"
  [ -f refs/gtdbtk/VERSION.txt ] && printf 'db_gtdbtk\t%s\n' "$(head -1 refs/gtdbtk/VERSION.txt)"
} > "$OUT"

cat "$OUT"
```

CLI 工具 `util_checksum` 提供校验和计算与核对，`util_install_tools` 提供安装步骤，`util_download_ref` 提供数据库下载与版本管理，`wf_reproducibility` 是这项工作在面板里的对应模块。

## 1.6 集群作业的基本规范

如果工作在集群上（Slurm / PBS），环境问题会以「非交互式 shell 里 conda 未初始化」的形式出现：

```bash
# 非交互式作业脚本里 conda activate 会报 CommandNotFoundError
eval "$(conda shell.bash hook)"     # 必须先初始化
conda activate ./envs/qc
```

另外两条常见规范：

**① 重任务必须提交到计算节点。** 在登录节点上跑组装会被管理员直接杀掉，也影响其他用户。

**② 作业输出必须显式指定路径。** 不指定时批量作业会产生几十个 `slurm-*.out` 散落在提交目录，无法与样本对应：

```bash
#SBATCH --output=10_logs/slurm/%x.%j.out
#SBATCH --error=10_logs/slurm/%x.%j.err
```

## 1.7 常见坑

**通道顺序写错导致装到不同版本。** defaults 放在 bioconda 之前会装到来源不同的同名包，行为可能有差异。约定 bioconda → conda-forge → defaults 并开 strict 优先级。

**长期不更新环境，然后某天装不上新工具。** 通道里的旧包会被清理。但也不应随意更新——更新环境意味着结果可能需要重跑，应作为显式决策并记录。

**把 `pip install` 混进 conda 环境。** 破坏依赖一致性，`env export` 无法完整描述。必须在 bioconda 找不到时才用，并显式记录。

**用环境名而不是路径。** 不同项目都叫 `bioinfo`，激活后跑的是别人的环境。用 `-p envs/xxx` 把环境放在项目内。

**在非交互式脚本里直接用 `conda activate`。** 必须先 `eval "$(conda shell.bash hook)"`。

**把环境目录纳入版本管理。** 数 GB 且含平台相关二进制；应纳入的是 yaml / lock 文件。

**只记软件版本不记数据库版本。** 这是生信复现失败最常见的单一原因。

**样本名含连字符、点或空格。** 通配符匹配、shell 变量、并行工具的引号处理都会出问题。统一用下划线。

**把重计算放在登录节点。** 会被杀，且影响他人。

## 1.8 与面板模块 id 的对应

| 模块 id | 说明 |
|---|---|
| `wf_conda_env` | 环境与依赖锁定（conda / mamba / pixi） |
| `wf_container` | 容器化运行（Docker / Singularity / Apptainer） |
| `util_install_tools` | 工具安装与环境准备 |
| `util_download_ref` | 参考数据库下载与版本管理 |
| `util_checksum` | 文件校验与完整性确认 |
| `util_rename_manifest` | 重命名、样本清单与路径整理 |
| `wf_reproducibility` | 结果可追溯与版本记录 |
| `wf_cluster_submit` | 集群提交与资源申请（Slurm / PBS） |
| `wf_batch_loop` | 多样本批量循环处理 |

## 1.9 延伸阅读

- 面板预设「质控指标汇总与项目报告」（`preset-qc-metrics-report`）演示了溯源记录如何接入流程
- 第 11 章深入讲工作流引擎、容器与可重复性的完整实践
- `docs/reference/module-schema.md`：如果要为本知识库新增模块，先读它
