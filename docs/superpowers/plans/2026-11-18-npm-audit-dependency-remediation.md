# npm Audit Dependency Remediation

## Result

The full audit remains at **20 findings (18 high, 2 moderate)**. No vulnerable
package versions were fixed. A production-only audit is now **0 findings**, down
from 12, because build-only packages were classified as development dependencies.
This is a deployment-scope mitigation, not a fix to the vulnerable packages: the
full development/build dependency tree remains affected.

The following build-time packages were moved from `dependencies` to
`devDependencies`, with their existing version ranges retained:

- `@tailwindcss/vite` (`^4.3.3`)
- `tailwindcss` (`^4.3.3`)
- `shadcn` (`^4.21.0`, lockfile still resolves to 4.23.0)

The app's stylesheet imports Tailwind and `shadcn/tailwind.css`; they are required
to build the static UI, not at application runtime. Source search found no use of
glob/matcher APIs in the application. This justifies excluding these packages
from production installs while keeping them available in build and development
environments.

### Vulnerable package classification

After the manifest change, every package in the audit's vulnerable paths is
development/build-time only; none is required by the production runtime, and no
audited vulnerable package is classified as optional:

- Vite/Vitest/tooling: `vite`, `vitest`, `@vitejs/plugin-react`,
  `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`,
  `@typescript-eslint/type-utils`, `@typescript-eslint/typescript-estree`,
  `@typescript-eslint/utils`, `typescript-eslint`, `tinyglobby`, `fdir`, and
  both `picomatch` copies.
- shadcn tooling: `shadcn`, `@dotenvx/dotenvx`, `@shadcn/registry`, `fast-glob`,
  `micromatch`, `ts-morph`, `@ts-morph/common`, and `minimatch`.
- Production runtime: none of the vulnerable paths remain after reclassification;
  verified by `npm audit --omit=dev` and `npm ls --omit=dev --depth=0`.

Development services are now local-only by default: Vite binds to `127.0.0.1`,
and `npm run dev:server` uses a dev-only wrapper to bind the Express development
server to `127.0.0.1`. Direct/production startup of `server/index.ts` retains its
previous `0.0.0.0` default; `QROUTE_SERVER_HOST` can explicitly configure it.

No `overrides` or package-version upgrades were added. `package-lock.json` was
already dirty before this task; its existing dependency resolutions were retained.
The lockfile changes for this task record the dependency reclassification.

## Findings and dependency paths

The high-severity findings are mostly propagated through these paths:

- `vite@8.3.8` and `vitest@4.1.12` -> `picomatch@4.0.7`, and -> `tinyglobby@0.2.17`
  -> `fdir@6.5.0` -> `picomatch@4.0.7`. `@vitejs/plugin-react@6.1.1` is affected
  through Vite.
- `typescript-eslint@8.73.0` -> `@typescript-eslint/typescript-estree@8.73.0`
  -> `tinyglobby@0.2.17` -> `fdir@6.5.0` -> `picomatch@4.0.7`.
- `shadcn@4.23.0` -> `@dotenvx/dotenvx@1.75.1` -> `picomatch@4.0.7`.
- `shadcn@4.23.0` -> `@shadcn/registry@0.2.1` -> `fast-glob@3.3.3`
  -> `micromatch@4.0.8` -> nested `picomatch@2.3.2`.
- The same `fast-glob`/`micromatch` branch occurs under `shadcn` and
  `ts-morph@26.0.0` -> `@ts-morph/common@0.27.0`.
- `ts-morph@26.0.0` -> `@ts-morph/common@0.27.0` -> `minimatch@10.2.6`.

The picomatch advisory is GHSA-fc5q-39xc-vjpf (affected through 4.0.7); the
minimatch advisory is GHSA-g3hv-75wg-m249 (affected below 11.0.1). Audit aggregates
these dependency issues into findings for their parent packages, accounting for
most of the 18 high findings and both moderate findings.

## Why no package update was safe

- The registry currently lists `picomatch@4.0.7` as latest and has no 4.0.8 or
  2.3.3 release. Both locked picomatch copies remain in the advisory range.
  `micromatch@4.0.8` requires picomatch `^2.3.1`; forcing 4.x there would cross
  its major-version API contract.
- `@ts-morph/common@0.27.0` requires `minimatch ^10.0.1`, while its parent
  `ts-morph@26.0.0` requires `@ts-morph/common ~0.27.0` and `shadcn@4.23.0`
  requires `ts-morph ^26.0.0`. The locked minimatch 10.x line has no version
  outside the advisory range; moving to 11.x would violate those constraints.
- `npm audit fix --dry-run` reported zero added, removed, or changed packages.
  The audit's suggested alternatives (including Vite 6.2.7, Vitest 3.1.4,
  `typescript-eslint` 8.47.0, and shadcn 2.10.0) fall outside the project's
  current dependency ranges or downgrade existing major versions. Some also
  appear to remain in the audit's own affected ranges (for example, shadcn 2.10.0
  against `>=2.0.0` and Vitest 3.1.4 against `>=3.1.2`). They were not applied.

The smallest safe next step is to take compatible upstream releases when available:
patched picomatch versions for both the 4.x and 2.x consumer paths, and an updated
ts-morph/shadcn chain that accepts a patched minimatch. Until then, changing the
locked consumer versions or overriding their declared majors would be a breaking,
untested migration.

## Exposure and remaining risks

The original production audit findings came from build-time packages incorrectly
listed as production dependencies. After reclassification, `npm audit --omit=dev`
reports no vulnerable production dependency paths. This does not mean the
vulnerable code was patched: all 20 full-audit findings remain in the development
and build toolchain, including the Vite/Vitest/TypeScript ESLint `tinyglobby` →
`fdir` → `picomatch` path, the shadcn `dotenvx` and `fast-glob` paths, and the
shadcn/ts-morph `minimatch` path described above.

The local Node/npm versions were Node.js 26.8.2 and npm 11.19.1. They are behind
the current patched releases available at investigation time (Node.js 26.13.1
and npm 11.21.3); update the local toolchain through the normal managed runtime
process. No project engine constraint was added. Keep dev servers bound to
loopback unless remote access is explicitly required and separately secured.

References:

- [GHSA-fc5q-39xc-vjpf: picomatch](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
- [GHSA-g3hv-75wg-m249: minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit)
- [npm `devDependencies`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#devdependencies)
- [Vite server host](https://vite.dev/config/server-options#server-host)
- [Node.js release schedule](https://github.com/nodejs/Release)

## Verification

- Before mitigation: `npm audit` reported 20 findings (18 high, 2 moderate);
  `npm audit --omit=dev` reported 12.
- After mitigation: `npm audit` still reports 20 findings (18 high, 2 moderate);
  `npm audit --omit=dev` reports 0.
- `npm audit fix --dry-run --json`: 0 packages changed; same audit counts.
- `npm ls --depth=0`, `npm ls --omit=dev --depth=0`, and
  `npm ls --package-lock-only --depth=0` completed successfully without
  peer-dependency errors.
- `node --check` passed for `vite.config.ts`, `server/index.ts`, and
  `server/dev.ts`; this only checks syntax and does not execute them.
- `npm explain` confirmed the dependency paths above.
- Registry metadata confirmed the current latest versions and the parent
  dependency ranges described above.
- Tests, lint, production build, and dev-server startup were not run. The available
  environment is not OS-sandboxed; the security-audit workflow requires an
  isolated environment before executing repository-controlled scripts or
  processes. Run `npm test`, `npm run lint`, `npm run build`, and local-only
  startup checks in such an environment.

No application logic, authentication, authorization, database policy, or
production listener default was changed.
