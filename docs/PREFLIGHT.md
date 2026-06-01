# Preflight before npm publish

Preflight is the final safety check before `npm publish`.

Think of it as: **test the package users will install, not just the source checkout.**

## Required checks

Run from the repository root:

```bash
npm test
npm run release:smoke
npm pack --dry-run
npm view contextbook
```

Expected result for the first public release:

- `npm test` passes
- `npm run release:smoke` returns `ok: true`
- `npm pack --dry-run` includes only public/runtime files
- `npm view contextbook` returns `E404` before first publish, meaning the package name is currently unclaimed or inaccessible

## What release smoke verifies

`npm run release:smoke` runs in a temporary HOME/project and checks:

- source tests pass
- `git diff --check` passes
- `npm pack --dry-run` succeeds
- a real tarball can be installed with `npm install -g --prefix <temp>`
- the packed `contextbook --help` works
- `contextbook setup --auto` installs Codex and Claude Code helper files
- `contextbook hooks status --json` reports helper health without mutating memory
- `contextbook hooks smoke --json` reports valid helper output and no raw prompt leak
- `contextbook doctor --json` remains read-only

## Private-file check

Before publishing, confirm the tarball does not include private/runtime state:

```bash
npm pack --json --dry-run > /tmp/contextbook-pack.json
node - <<'NODE'
const fs = require('fs');
const pack = JSON.parse(fs.readFileSync('/tmp/contextbook-pack.json', 'utf8'))[0];
const bad = pack.files
  .map((file) => file.path)
  .filter((path) => path.startsWith('.omx/') || path.startsWith('.contextbook/') || path.startsWith('docs/private/'));
console.log({ name: pack.name, version: pack.version, totalFiles: pack.files.length, badPrivateFiles: bad });
if (bad.length > 0) process.exit(1);
NODE
```

## Publish boundary

Do not run `npm publish` during preflight. Publish is a separate explicit step after the checks are clean.
