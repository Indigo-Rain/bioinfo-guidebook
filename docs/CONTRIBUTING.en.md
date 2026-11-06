# Contributing

> This is the English contributor guide. The exhaustive, authoritative version is
> [CONTRIBUTING.md](CONTRIBUTING.md) (Chinese). If the two disagree, the Chinese
> guide wins. Corrections to this translation are welcome.

This knowledge base is **data-driven**: the panel, the tool index and the exports
are all derived from `data/modules/*.json`. Most contributions therefore add or
correct data and prose; code changes are relatively rare.

## 1. Before you start

You need **Node.js ≥ 18**. There are no third-party dependencies and no
`npm install` step.

```bash
node tools/build.mjs --check    # validate only, write nothing
node tools/build.mjs            # validate + regenerate index.html and data/bundle.json
```

Read these two documents first:

- [Module schema](reference/module-schema.md) — required fields, sub-structures
  and writing requirements for a module entry.
- [Architecture](ARCHITECTURE.md) — how the single-source build works and why
  `feeds` is validated the way it is.

## 2. What you can contribute

| I want to… | Start here |
|---|---|
| Fix a wrong version, default or output name | Open a "Content correction" issue with an official-doc link |
| Add an analysis module | Section 3 below |
| Add an end-to-end workflow | Section 4 below |
| Add a data type or category | Section 5 below |
| Change the panel UI | Section 6 below |
| Improve or translate documentation | Section 7 below |

For content corrections, **evidence is required**. A version number, default
value or output filename will only be changed if the issue links to the
official documentation (or a reproducible command) that supports the change.

## 3. Add a module

### Step 1 — register the ID in the manifest

Add an entry under `byCategory` in `data/module-manifest.json`:

```json
"quality-control": [
  { "id": "qc_example_tool", "name": "Short name (ExampleTool)" }
]
```

This must come **before** the implementation. The build cross-checks both
directions: "implemented but not registered" is always an error. The manifest
also acts as a prior contract so that other modules can reference your ID in
`feeds.target` before your module exists.

ID rules: `^[a-z][a-z0-9_-]{2,40}$`, with a prefix fixed per category (see
`naming.prefixes` in the manifest).

### Step 2 — add the entry to the category file

Add an object to the array in `data/modules/<category>.json`. A minimal,
valid entry looks like this:

```json
{
  "id": "qc_example_tool",
  "name": "Example QC tool (ExampleTool)",
  "category": "quality-control",
  "layer": "upstream",
  "kind": "standard",
  "maturity": "stable",
  "domains": ["genomics"],
  "tags": ["QC", "example"],
  "summary": "One sentence, at most 60 characters.",
  "what": [
    "Paragraph 1: what this step does and its core mechanism.",
    "Paragraph 2: its key judgement or limitation — when not to use it."
  ],
  "inputs": [{ "type": "raw-reads", "name": "Raw reads", "required": true }],
  "outputs": [{ "type": "clean-reads", "name": "Clean reads", "ext": ".clean.fq.gz" }],
  "provides": [
    { "tool": "ExampleTool", "version": "1.2.x", "access": "cli", "install": "conda" }
  ],
  "feeds": [
    { "target": "asm_spades", "viaType": "clean-reads", "note": "Clean reads feed assembly" }
  ],
  "params": [
    { "flag": "-q", "default": "20", "note": "Quality threshold; why this value is reasonable" }
  ],
  "pitfalls": [
    "A specific, verifiable lesson that changes a decision — not 'choose parameters carefully'."
  ],
  "recipes": {
    "bash": "exampletool -i 00_raw/${SAMPLE}.fq.gz -o 01_clean/${SAMPLE}.fq.gz"
  },
  "related": [{ "id": "qc_fastp", "note": "More common all-in-one alternative" }],
  "docs": [{ "label": "Chapter 2 — Upstream QC", "path": "docs/guidebook/02-upstream-qc.md" }]
}
```

### Step 3 — think carefully about `feeds`

`feeds` is the most valuable and most error-prone part of the data model.

- List only **real, typical downstream consumers**; 2–5 entries is usually enough.
- Ask: *who actually consumes the main output of this module?*
- `viaType` must be a type that appears in **your own `outputs`**, and it must
  be accepted by an input of the target module.
- If there is no sensible downstream module, write `[]`. Do not invent an edge
  just to fill the field.

When unsure about a target's input ports:

```bash
node -e "const m=JSON.parse(require('fs').readFileSync('data/modules/assembly.json','utf8')).find(x=>x.id==='asm_spades');console.log(m.inputs)"
```

### Step 4 — self-check

```bash
node tools/build.mjs --check
```

Common errors:

| Code | Meaning | Fix |
|---|---|---|
| `dangling-feed` | `feeds.target` does not exist | Use a real ID from the manifest |
| `feed-type-mismatch` | The output cannot feed the target's inputs | Change `viaType`, or the target's inputs |
| `feed-not-produced` | `viaType` is not among your own outputs | Do not claim a data flow the module does not produce |
| `unknown-type` | An unregistered data type | Change the type, or register it (Section 5) |
| `category-file-mismatch` | The entry's `category` does not match its file | Move the entry or fix the field |
| `summary-too-long` | `summary` exceeds 60 characters | Shorten it |
| `what-too-short` | `what` has fewer than 2 paragraphs | Add the second paragraph |

### Step 5 — regenerate derived artifacts

`docs/reference/tool-index.md` is generated from the data. Run the generator
(see `tools/gen-reference.mjs`) and rebuild `index.html` / `data/bundle.json`
with `node tools/build.mjs`. Never hand-edit generated files.

## 4. Add an end-to-end workflow

Add an entry to `data/presets.json`:

```json
{
  "id": "preset-my-flow",
  "name": "Workflow name",
  "tags": ["genomics", "end-to-end"],
  "difficulty": "入门",
  "summary": "One sentence: what problem does this workflow solve?",
  "starter": false,
  "steps": ["List the analysis steps in order"],
  "nodes": [{ "id": "n1", "moduleId": "qc_fastp", "x": 60, "y": 80 }],
  "edges": [{ "from": "n1", "to": "n2", "fromType": "clean-reads" }],
  "notes": [{ "nodeId": "n1", "text": "The decision criterion for this step" }],
  "docs": ["docs/guidebook/02-upstream-qc.md"],
  "expectedOutputs": ["Intermediate files and final results"]
}
```

Requirements:

- `difficulty` must be exactly `入门`, `进阶` or `高阶` (the panel's CSS classes
  depend on these values).
- `fromType` must be a real output type of the source module and accepted by the
  target. Omitted types are resolved by `chooseEdgeTypes()`, but explicit types
  are validated as written.
- `notes` carry most of the value: explain *why* a step is done this way and
  when to switch to another module.
- Only use modules that already exist in the manifest.

Verify that no edge is classified as a type error:

```bash
node tools/diagnose-preset-edges.mjs    # must report 0
node tools/verify-exports.mjs           # Bash / Python / JSON exports
```

## 5. Add a data type or category

Only add a data type when the existing types are **semantically wrong**. Check
`catalog.dataTypes` in `data/catalog.json` first — there are 33 already.

```json
{
  "id": "rrna-fasta",
  "label": "rRNA sequence",
  "labelEn": "rRNA FASTA",
  "glyph": "FASTA",
  "shape": "sequence",
  "ext": ".rrna.fna",
  "description": "Ribosomal RNA sequences used for taxonomy, not coding-region analysis"
}
```

`shape` decides edge behaviour, so it matters far more than `label`:
`any`, `sequence`, `sequence-set`, `table`, `alignment`, `tree`, `figure`,
`list`, `code`. Do **not** abuse `any` just to make an edge connect — it
downgrades red edges to yellow and removes type safety.

For a new category:

1. Add an entry to `catalog.categories` (`id` / `label` / `file` / `order`).
2. Create `data/modules/<file>` containing `[]` (the build checks that every
   registered file exists, even when empty).
3. Register the ID prefix in `module-manifest.json` → `naming.prefixes` and add
   the category array under `byCategory`.
4. If it belongs to a new analysis layer, register that layer in `catalog.layers`.

## 6. Change the panel

Panel sources live in `assets/`:

```text
assets/templates/panel.html   HTML skeleton (placeholders replaced at build time)
assets/css/panel.css          styles (all colours via CSS custom properties)
assets/js/panel.js            interaction logic
```

At build time these files and `tools/lib/model.mjs` are inlined into
`index.html`. After any change:

```bash
node tools/build.mjs
node tools/smoke-edge.mjs
```

`smoke-edge.mjs` verifies that every DOM ID referenced by the script exists in
the template — a class of typo that is otherwise invisible without a browser.
It also attempts a real render; when the environment cannot start Chromium, it
reports a skip/failure instead of pretending to pass.

Important: `tools/lib/model.mjs` must remain free of `import` statements and
Node-specific APIs, because the browser reuses the same source with `export`
keywords stripped.

## 7. Writing style

The guide is meant to **support decisions**, not to copy vendor manuals.

- **Write the decision criterion, not a tool inventory.** "When to use A rather
  than B" is more useful than "A has the following features".
- **State limitations honestly.** Every tool has things it cannot do; saying so
  is more valuable than marketing it.
- **Make pitfalls specific and verifiable.** Good: "a wrong k-mer collapses
  repeats; SPAdes skips k=21 with fewer than 153 reads". Bad: "choose parameters
  carefully".
- **Write versions as `major.minor.x`.** The exact version is the user's job to
  verify; omitting a version gives up reproducibility.
- **If unsure, write "check the official documentation".** Never invent a
  parameter name, default value or output filename.
- **Chinese prose, English terminology.** Keep official capitalisation of tool
  names (`Bakta`, `GTDB-Tk`, `fastANI`).
- **Cite the source** in the issue/PR when correcting a fact.

## 8. Before you submit

```bash
node tools/build.mjs --strict
node --test tools/tests/model.test.mjs
node tools/verify-exports.mjs
node tools/diagnose-preset-edges.mjs
node tools/smoke-edge.mjs
```

- [ ] Build passes with `--strict` (0 errors, 0 warnings).
- [ ] Unit tests pass (48/48).
- [ ] Exports pass (16/16) and no preset has a type-error edge.
- [ ] Static smoke checks pass (browser probe may be skipped in restricted environments).
- [ ] `index.html` and `data/bundle.json` were regenerated, not hand-edited.
- [ ] New module IDs are registered in the manifest.
- [ ] Docs use real module IDs and working links.
- [ ] No external HTTP(S) resources were added to the panel.
- [ ] No secrets, tokens or personal paths are included.

## 9. Reporting issues

Use the issue templates on GitHub:

- **Bug report** — panel behaviour, build failure, export problem;
- **Content correction** — wrong version, parameter, output or wording (attach evidence);
- **Module / workflow request** — propose a new step or end-to-end flow.

For security-sensitive reports, please contact the maintainer privately instead
of opening a public issue.
