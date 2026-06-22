# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Architecture

This is an AWS CDK TypeScript project. The CDK app is executed directly from
TypeScript via `tsx` (no compile step needed at runtime).

- **`bin/aws-cdk-keycloak.ts`** — CDK app entry point; instantiates the five
  stacks and wires their cross-stack dependencies.
- **`lib/constructs/`** — Reusable, security-hardened constructs grouped by
  service. Each `Secure*` construct extends its CDK L2 with the project's
  baseline (KMS encryption, blocked public access, scan-on-push, and similar).
  - **`lib/constructs/ecr/`** — `SecureEcrRepository`
  - **`lib/constructs/kms/`** — `SecureKey`
  - **`lib/constructs/lambda/`** — `SecureNodejsFunction`
  - **`lib/constructs/rds/`** — `SecureDatabaseCluster`
  - **`lib/constructs/s3/`** — `SecureBucket`, `SecureLogBucket`
- **`lib/stacks/`** — CDK stacks, one directory per domain. The stack lives at
  the top of each directory; its composing constructs live in named
  subdirectories.
  - **`lib/stacks/network/`** — `NetworkStack` (isolated VPC, subnets, and the
    gateway/interface VPC endpoints)
  - **`lib/stacks/database/`** — `DatabaseStack` (Aurora PostgreSQL Serverless
    v2 cluster)
  - **`lib/stacks/artifacts/`** — `ArtifactsStack` (TLS certificate bucket and
    the Keycloak/aws-cli ECR repositories)
  - **`lib/stacks/logging/`** — `LoggingStack` (CloudTrail audit trail, VPC flow
    logs, S3 server access logs, and a CloudWatch security dashboard)
  - **`lib/stacks/auth/`** — `AuthenticationStack` (Keycloak on ECS Fargate
    behind an NLB; pulls its images from ECR by digest)
- **`scripts/`** — Operational scripts run outside CDK.
  - **`scripts/upload-certs.ts`** — Discovers the Keycloak certificates bucket
    by its `keycloak:name` tag and uploads all files from `certs/`. Requires AWS
    credentials via environment variables (`AWS_ACCESS_KEY_ID`,
    `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`). Run with
    `npx tsx scripts/upload-certs.ts`.
  - **`scripts/upload-images.ts`** — Mirrors the pinned Keycloak and aws-cli
    container images (by digest) into the ECR repositories it discovers by
    `keycloak:name` tag. Requires AWS credentials (as above) and a registry copy
    tool — `skopeo` (default) or Docker Buildx (`docker buildx`, set
    `IMAGE_COPY_TOOL=docker`). Must run after `Keycloak-ArtifactsStack` (which
    creates the repositories) and before `Keycloak-AuthenticationStack` (whose
    task definition pulls the images by digest). Run with
    `npx tsx scripts/upload-images.ts`.
- **`test/unit/`** — Vitest unit tests. CDK stack assertions use
  `aws-cdk-lib/assertions` (`Template.fromStack`).

`tsconfig.json` has `noEmit: true` — TypeScript is used for type-checking only.
The CDK CLI runs the app via `npx tsx` (configured in `cdk.json`).

## Tooling

- **Linter/Formatter**: [Biome](https://biomejs.dev/) (not ESLint) for `*.js`,
  `*.json`, and `*.ts` files. Single quotes, 2-space indent, trailing commas
  (ES5), 80-char line width. [Prettier](https://prettier.io/) for `*.md` files
  (config in `prettier.config.js`).
- **Test runner**: Vitest (not Jest). Config is in `vite.config.unit.ts`. Tests
  live in `test/unit/`.
- **Security checks**: [cdk-nag](https://github.com/cdklabs/cdk-nag) with
  `AwsSolutionsChecks` applied in `bin/aws-cdk-keycloak.ts`. Runs automatically
  during `cdk synth` — synthesis fails on unaddressed violations. Use
  `NagSuppressions` to suppress findings that cannot be fixed in code; always
  include a `reason`.
- **Commit convention**: Conventional Commits enforced via commitlint + husky.
- **Dependency updates**:
  [npm-check-updates](https://github.com/raineorshine/npm-check-updates) with
  config in `.ncurc.cjs`. Targets latest versions for all packages except
  `@types/node`, which is pinned to minor updates only.
- **Pre-commit hook**: Runs `npm run build:ci` (clean → test → tsc) and
  `lint-staged` (biome format + lint on staged `*.js`/`*.json`/`*.ts` files;
  prettier format on staged `*.md` files).

## Commands

```bash
# Type checking (noEmit — does not produce JS output)
npm run build

# Run unit tests
npm test

# Run unit tests in watch mode
npm run test:watch

# Run a single test file
npx vitest run --dir test/unit --config ./vite.config.unit.ts test/unit/<filename>.test.ts

# Run tests with coverage
npm run test:cov

# Lint
npm run lint

# Lint with auto-fix
npm run lint:fix

# Format
npm run format

# Full CI build (clean → test → tsc)
npm run build:ci

# CDK commands (uses tsx to run TS directly)
npx cdk synth
npx cdk diff
npx cdk deploy
```

## TypeScript Conventions

- Always sort lists of field names alphabetically (interface properties, object
  literals, enum members, etc.)

## Git Conventions

- Always show the user the diff and wait for explicit approval before
  committing.
- Do not reference Claude, Claude Code, or AI assistance in commit messages
- Use Conventional Commits prefixes:
  - `build:` — changes to the build system or external dependencies
  - `chore:` — project tooling, config, scripts
  - `ci:` — CI/CD pipeline changes
  - `docs:` — documentation only
  - `feat:` — new user-facing feature
  - `fix:` — bug fix
  - `perf:` — performance improvement
  - `refactor:` — code restructuring with no behavior change
  - `revert:` — reverts a previous commit
  - `style:` — formatting changes that do not affect behavior
  - `test:` — adding or updating tests

## Workflow

- Keep changes small and focused. Avoid unrelated refactors.

- Before implementing any non-trivial change, propose a short implementation
  plan (≤10 bullets) and wait for confirmation.

- After each code change:
  - Run `npm run build`
  - Run `npm test`
  - Fix all failures before proceeding.

- After any infrastructure (CDK) change:
  - Run `npx cdk synth`
  - Before running a diff, describe the expected infrastructure changes:
    - Resources added
    - Resources modified
    - Resources removed
    - Any resource replacements
  - Include an **Impact Summary**:
    - Potential cost drivers (e.g., NAT Gateway, Interface VPC Endpoints,
      ALB/NLB, RDS, OpenSearch, KMS CMKs, CloudWatch Logs retention)
    - Security-impacting changes (IAM policies, security groups, public access,
      encryption, logging)
  - If the stack is currently deployed in any environment:
    - Run `npx cdk diff`
    - Confirm the actual diff matches the expected changes.
  - If the stack is not deployed:
    - Derive expected impact from the synthesized templates and summarize the
      changes.

- Never deploy infrastructure without first describing the expected diff.

- Prefer cost-minimizing defaults unless explicitly instructed otherwise.

- Do not suppress `cdk-nag` findings unless:
  - The issue cannot be resolved in code, and
  - A clear, specific justification is provided.

- Do not introduce new stacks, stages, or environments without explaining:
  - Their purpose
  - Their lifecycle
  - Their rollback implications
