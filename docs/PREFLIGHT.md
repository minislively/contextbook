# Preflight before npm publish

Preflight means: **check the package before you publish it.**

The goal is simple: make sure users will install a working CLI, and make sure private/runtime files do not enter the npm tarball.

## Quick command list

Run these from the repository root:

```bash
npm test
npm run release:smoke
npm pack --dry-run
npm view contextbook
```

For the first public release, expected results are:

- `npm test` passes
- `npm run release:smoke` returns `ok: true`
- `npm pack --dry-run` shows only public/runtime files
- `npm view contextbook` returns `E404` before first publish, which means the package is not visible in the public registry from this environment

## Why release smoke exists

`npm test` checks the source checkout.

`npm run release:smoke` checks the thing users will actually install. It builds a tarball, installs it into a temporary global prefix, then runs the packed `contextbook` binary.

It verifies:

- the normal test suite passes
- `git diff --check` passes
- `npm pack --dry-run` succeeds
- a real tarball installs with `npm install -g --prefix <temp>`
- `contextbook --help` works from the packed binary
- `contextbook setup --auto` installs Codex and Claude Code helper files
- `contextbook hooks status --json` reports helper health without mutating memory
- `contextbook hooks smoke --json` returns valid helper output and no raw prompt leak
- `contextbook doctor --json` stays read-only

## Private-file check

Before publishing, check the tarball explicitly:

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

`badPrivateFiles` should be an empty array.

## Publish step

Do not mix preflight and publish.

After preflight is clean and npm login is ready:

```bash
npm whoami
npm publish
npm view contextbook version
```

If `npm whoami` returns `ENEEDAUTH`, log in first with `npm login` or `npm adduser`.
