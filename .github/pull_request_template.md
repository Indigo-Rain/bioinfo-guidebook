## Summary / 改动说明

<!-- What changed and why. Link the related issue: "Closes #123". -->

## Type of change / 改动类型

- [ ] Content correction (version, parameter, output, link, wording)
- [ ] New module
- [ ] New end-to-end workflow
- [ ] New data type or category
- [ ] Panel UI / interaction
- [ ] Tooling, build or CI
- [ ] Documentation only

## Checklist / 提交前检查

- [ ] `node tools/build.mjs --strict` passes (0 errors, 0 warnings).
- [ ] `node --test tools/tests/model.test.mjs` passes (48/48).
- [ ] `node tools/verify-exports.mjs` passes (16/16).
- [ ] `node tools/diagnose-preset-edges.mjs` reports 0 type errors.
- [ ] `node tools/smoke-edge.mjs` static checks pass (browser probe may be skipped).
- [ ] `index.html` and `data/bundle.json` were regenerated, not hand-edited.
- [ ] New module IDs are registered in `data/module-manifest.json`.
- [ ] Documentation uses real module IDs and working links.
- [ ] No external HTTP(S) resource was added to the panel.
- [ ] No secrets, tokens or personal absolute paths are included.

## Evidence / 依据

<!-- For content changes: official documentation links or reproducible commands. -->

## Screenshots / 截图

<!-- For panel changes, before/after screenshots are appreciated. -->
