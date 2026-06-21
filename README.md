# AWS CDK Keycloak

[![GitHub](https://img.shields.io/badge/GitHub-tramaine--codes%2Faws--cdk--keycloak-blue?logo=github)](https://github.com/tramaine-codes/aws-cdk-keycloak)

An AWS CDK project written in TypeScript for exploring and implementing Keycloak
patterns on AWS. Keycloak runs on ECS Fargate behind a Network Load Balancer
with TLS terminating on the container (NLB TCP passthrough). TLS certificates
are distributed via S3 and synced into the container by an init container at
task startup.

The repo also includes a Docker Compose setup for running Keycloak locally with
self-signed certificates, which mirrors the AWS topology.

## Prerequisites

- [Node.js](https://nodejs.org/) v24 — version pinned in `.node-version` (Volta)
  and `.nvmrc` (NVM)
- [Docker](https://docs.docker.com/get-docker/) — for local development
- [AWS CDK CLI](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html):
  `npm install -g aws-cdk`
- AWS credentials configured (via `~/.aws/credentials`, environment variables,
  or IAM role)

## Local Development

The Docker Compose stack runs two Keycloak instances (`upstream` and
`downstream`), each backed by its own Postgres database, with TLS enabled via
self-signed certificates.

### 1. Generate certificates

The `certs/` directory is gitignored. Create it and generate self-signed
certificates for each Keycloak instance. The `CN` and SAN must match the service
name used in `KC_HOSTNAME`.

```bash
mkdir certs

# Upstream cert (CN=upstream, used by KC_HOSTNAME=https://upstream:8443)
openssl req -x509 -newkey rsa:4096 \
  -keyout certs/upstream.key.pem \
  -out certs/upstream.cert.pem \
  -days 365 -nodes \
  -subj "/CN=upstream" \
  -addext "subjectAltName=DNS:upstream"

# Downstream cert (CN=downstream, used by KC_HOSTNAME=https://downstream:9443)
openssl req -x509 -newkey rsa:4096 \
  -keyout certs/downstream.key.pem \
  -out certs/downstream.cert.pem \
  -days 365 -nodes \
  -subj "/CN=downstream" \
  -addext "subjectAltName=DNS:downstream"
```

### 2. Configure environment variables

The `.env` file is gitignored. Copy `.env.example` and fill in the values:

```bash
cp .env.example .env
```

Bootstrap admin credentials are commented out in `.env.example`. Uncomment
`KC_BOOTSTRAP_ADMIN_USERNAME` and `KC_BOOTSTRAP_ADMIN_PASSWORD` on first boot
against an empty database, then comment them out again once the admin user is
persisted in Postgres.

### 3. Start the stack

```bash
docker compose up
```

| Service      | URL                     | Notes                       |
| ------------ | ----------------------- | --------------------------- |
| `upstream`   | https://upstream:8443   | Primary Keycloak instance   |
| `upstream`   | http://localhost:8080   | HTTP fallback               |
| `downstream` | https://downstream:9443 | Federated Keycloak instance |
| `downstream` | http://localhost:9080   | HTTP fallback               |

`downstream` trusts `upstream`'s self-signed certificate via a mounted
truststore, enabling back-channel federation calls.

Once both instances are running, see
[docs/local-federation-setup.md](docs/local-federation-setup.md) for the admin
console steps to configure the identity provider and test brokered login.

To resolve the service hostnames locally, add `upstream` and `downstream` to the
`localhost` line in `/etc/hosts`:

```
127.0.0.1   localhost upstream downstream
```

## Project Structure

```
bin/              # CDK app entry point (aws-cdk-keycloak.ts)
lib/
  constructs/     # Reusable Secure* constructs (ecr, kms, lambda, s3)
  stacks/         # One directory per stack:
    artifacts/    # ArtifactsStack — cert bucket and ECR repositories
    auth/         # AuthenticationStack — Keycloak on ECS Fargate behind an NLB
    database/     # DatabaseStack — Aurora PostgreSQL Serverless v2
    logging/      # LoggingStack — audit trail, flow logs, security dashboard
    network/      # NetworkStack — isolated VPC, subnets, endpoints
scripts/          # Operational scripts (upload-certs, upload-images)
test/
  unit/           # Vitest unit tests
```

## CDK Stacks

| Stack                          | Description                                       |
| ------------------------------ | ------------------------------------------------- |
| `Keycloak-NetworkStack`        | VPC and subnet infrastructure                     |
| `Keycloak-DatabaseStack`       | Aurora PostgreSQL Serverless v2 cluster           |
| `Keycloak-ArtifactsStack`      | TLS certificate bucket and ECR image repositories |
| `Keycloak-AuthenticationStack` | ECS Fargate service, NLB, ECS cluster             |

### Deployment

**1. Install dependencies**

```bash
npm install
```

**2. Bootstrap your AWS environment** _(first-time only)_

```bash
npx cdk bootstrap
```

**3. Deploy the prerequisites**

```bash
npx cdk deploy Keycloak-NetworkStack Keycloak-DatabaseStack Keycloak-ArtifactsStack
```

**4. Upload TLS certificates to S3**

The init container syncs the entire certificates bucket into the container at
task startup, so the cert and key must be in place before deploying
`Keycloak-AuthenticationStack`.

Set AWS credentials as environment variables, then run the upload script. It
discovers the bucket by its `keycloak:name` tag and uploads every file in
`certs/`.

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...   # if using temporary credentials

npx tsx scripts/upload-certs.ts
```

**5. Mirror the container images into ECR**

The authentication task definition pulls the Keycloak and aws-cli images from
private ECR repositories **by digest**, so the images must be mirrored into ECR
before deploying `Keycloak-AuthenticationStack` — otherwise the Fargate task
cannot pull them. The script discovers each repository by its `keycloak:name`
tag and copies the pinned images using `skopeo` (default) or `docker`
(`IMAGE_COPY_TOOL=docker`). Requires the same AWS credentials as above.

```bash
npx tsx scripts/upload-images.ts
```

**6. Deploy the authentication stack**

```bash
npx cdk deploy Keycloak-AuthenticationStack
```

## Development

```bash
# Type-check (no JS output)
npm run build

# Lint
npm run lint

# Lint with auto-fix
npm run lint:fix

# Format
npm run format
```

## Testing

```bash
# Run unit tests
npm test

# Run unit tests in watch mode
npm run test:watch

# Run a single test file
npx vitest run --dir test/unit --config ./vite.config.unit.ts test/unit/<filename>.test.ts

# Run tests with coverage
npm run test:cov
```

## CDK Commands

```bash
# Synthesize CloudFormation templates (also runs cdk-nag checks)
npx cdk synth

# Compare deployed stack with current state
npx cdk diff

# Deploy
npx cdk deploy --all
```

## Security Checks (cdk-nag)

[cdk-nag](https://github.com/cdklabs/cdk-nag) runs `AwsSolutionsChecks` during
synthesis. Synthesis fails on any unaddressed violation.

### Suppressed findings

| Finding                   | Construct                | Reason                                                                                                                   |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `AwsSolutions-RDS6`       | `KeycloakCluster`        | IAM authentication disabled; Keycloak requires username/password.                                                        |
| `AwsSolutions-RDS10`      | `KeycloakCluster`        | Deletion protection disabled for non-production workload.                                                                |
| `AwsSolutions-SMG4`       | `KeycloakCluster`        | Automatic secret rotation disabled for non-production workload.                                                          |
| `AwsSolutions-IAM5`       | `KeycloakTaskDefinition` | Task role needs read access to all objects in the certificates bucket.                                                   |
| `AwsSolutions-IAM5`       | `KeycloakTaskDefinition` | Execution role: `ecr:GetAuthorizationToken` is account-scoped and required to pull images from ECR.                      |
| `AwsSolutions-ECS2`       | `KeycloakTaskDefinition` | Non-sensitive Keycloak config (DB URL, port, TLS paths) passed as plaintext. Secrets use Secrets Manager.                |
| `AwsSolutions-SMG4`       | `KeycloakTaskDefinition` | Admin bootstrap secret rotation disabled for non-production workload.                                                    |
| `AwsSolutions-EC23`       | `KeycloakNlb`            | NLB is internet-facing and must accept inbound HTTPS traffic on port 443 from any IP.                                    |
| `CdkNagValidationFailure` | `KeycloakVpcEndpoints`   | EC23 cannot evaluate the VPC-CIDR ingress (a CloudFormation token); access is restricted to the VPC CIDR, not 0.0.0.0/0. |
| `AwsSolutions-S1`         | `SecureLogBucket`        | Log-destination bucket cannot send access logs to itself without a circular dependency.                                  |

## CI

The pre-commit hook runs `npm run build:ci` (clean → test → type-check) and
`lint-staged` (Biome format + lint on staged `*.js`/`*.json`/`*.ts` files;
Prettier format on staged `*.md` files) automatically via Husky.

```bash
# Full CI build
npm run build:ci
```

## Tooling

| Tool                                                    | Purpose                                       |
| ------------------------------------------------------- | --------------------------------------------- |
| [AWS CDK v2](https://docs.aws.amazon.com/cdk/v2/guide/) | Infrastructure as code                        |
| [TypeScript](https://www.typescriptlang.org/)           | Language (type-check only; runtime via `tsx`) |
| [Vitest](https://vitest.dev/)                           | Unit test runner                              |
| [Biome](https://biomejs.dev/)                           | Linter and formatter for JS/JSON/TS           |
| [Prettier](https://prettier.io/)                        | Formatter for Markdown                        |
| [cdk-nag](https://github.com/cdklabs/cdk-nag)           | CDK security and compliance checks            |
| [Husky](https://typicode.github.io/husky/)              | Git hooks                                     |
| [commitlint](https://commitlint.js.org/)                | Conventional Commits enforcement              |

## Contributing

Commits must follow the
[Conventional Commits](https://www.conventionalcommits.org/) specification,
enforced via commitlint.
