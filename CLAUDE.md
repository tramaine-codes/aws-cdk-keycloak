# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Architecture

This is an AWS CDK TypeScript project. The CDK app is executed directly from
TypeScript via `tsx` (no compile step needed at runtime).

- **`bin/aws-cdk-delivery-patterns.ts`** — CDK app entry point; instantiates
  stacks and passes them to `cdk.App`.
- **`lib/`** — CDK constructs, organized by domain. Within each domain
  directory, stacks and stages live at the top level; other constructs live in
  named subdirectories that reflect their contents.
  - **`lib/application/`** — `ApplicationStack` and `ApplicationStage`
  - **`lib/directory/`** — `DirectoryStack` (AWS Managed Microsoft AD; writes
    directory ID to SSM at `/delivery-patterns/directory-id`)
    - **`lib/directory/microsoft-ad/`** — `MicrosoftAd` construct (KMS-encrypted
      Secrets Manager admin password, `CfnMicrosoftAD` Standard edition, domain
      `corp.awscdkdelivery.internal`)
    - **`lib/directory/security-group/`** — `DirectorySecurityGroup` construct
      (egress rules for all AD protocols)
  - **`lib/logging/`** — `LoggingStack` (shared S3 server access logs bucket)
  - **`lib/network/`** — `NetworkStack` (VPC, subnets, VPC endpoints); exposes
    `vpc`, `isolatedSubnets`, and `privateSubnets` for consumption by
    `DirectoryStack`
    - **`lib/network/vpc/`** — `NetworkVpc` construct (VPC, subnets, DNS
      settings)
    - **`lib/network/vpc-endpoints/`** — `VpcEndpoints` construct (S3 gateway
      endpoint; KMS, CloudWatch Logs, Secrets Manager, SSM, SSM Messages, and
      EC2 Messages interface endpoints; endpoint security group)
  - **`lib/pipeline/`** — `DeliveryPipelineStack` and `FoundationalStage`
    - **`lib/pipeline/artifacts/`** — `ArtifactsBucket` construct (KMS key and
      logging bucket managed internally)
    - **`lib/pipeline/delivery-pipeline/`** — `DeliveryPipeline` construct
  - **`lib/repository/`** — `RepositoryStack`
- **`scripts/`** — Operational scripts run outside CDK.
  - **`scripts/upload-certs.ts`** — Discovers the Keycloak certificates bucket
    by its `keycloak:name` tag and uploads all files from `certs/`. Requires AWS
    credentials via environment variables (`AWS_ACCESS_KEY_ID`,
    `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`). Run with
    `npx tsx scripts/upload-certs.ts`.
- **`test/unit/`** — Vitest unit tests. CDK stack assertions use
  `aws-cdk-lib/assertions` (`Template.fromStack`).

`tsconfig.json` has `noEmit: true` — TypeScript is used for type-checking only.
The CDK CLI runs the app via `npx tsx` (configured in `cdk.json`).

## Tooling

- **Linter/Formatter**: [Biome](https://biomejs.dev/) (not ESLint/Prettier).
  Single quotes, 2-space indent, trailing commas (ES5), 80-char line width.
- **Test runner**: Vitest (not Jest). Config is in `vite.config.unit.ts`. Tests
  live in `test/unit/`.
- **Security checks**: [cdk-nag](https://github.com/cdklabs/cdk-nag) with
  `AwsSolutionsChecks` applied in `bin/aws-cdk-delivery-patterns.ts`. Runs
  automatically during `cdk synth` — synthesis fails on unaddressed violations.
  Use `NagSuppressions` to suppress findings that cannot be fixed in code;
  always include a `reason`.
- **Commit convention**: Conventional Commits enforced via commitlint + husky.
- **Dependency updates**:
  [npm-check-updates](https://github.com/raineorshine/npm-check-updates) with
  config in `.ncurc.cjs`. Targets latest versions for all packages except
  `@types/node`, which is pinned to minor updates only.
- **Pre-commit hook**: Runs `npm run build:ci` (clean → test → tsc) and
  `lint-staged` (biome format + lint on staged files).

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
