# aws-cdk-keycloak

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
bin/
  aws-cdk-keycloak.ts       # CDK app entry point
lib/
  artifacts/                # ArtifactsStack
    keycloak-certificates-bucket/
  auth/                     # AuthenticationStack
    keycloak/               # Keycloak compose construct
      keycloak-ecs-cluster/ # ECS cluster, task definition, Fargate service
      keycloak-nlb/         # Network Load Balancer
  database/                 # DatabaseStack
    keycloak-cluster/       # Aurora PostgreSQL Serverless v2
  network/                  # NetworkStack
    keycloak-vpc/           # VPC, subnets
test/
  unit/                     # Vitest unit tests
    network/
      vpc/
```

## CDK Stacks

| Stack                          | Description                             |
| ------------------------------ | --------------------------------------- |
| `Keycloak-NetworkStack`        | VPC and subnet infrastructure           |
| `Keycloak-DatabaseStack`       | Aurora PostgreSQL Serverless v2 cluster |
| `Keycloak-ArtifactsStack`      | S3 bucket for TLS certificates          |
| `Keycloak-AuthenticationStack` | ECS Fargate service, NLB, ECS cluster   |

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

```bash
BUCKET=$(aws resourcegroupstaggingapi get-resources \
  --resource-type-filters s3 \
  --tag-filters Key=Name,Values=KeycloakCertificates \
  --query "ResourceTagMappingList[0].ResourceARN" \
  --output text | sed 's|arn:aws:s3:::||')

aws s3 cp certs/upstream.cert.pem s3://$BUCKET/
aws s3 cp certs/upstream.key.pem s3://$BUCKET/
```

**5. Deploy the authentication stack**

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

| Finding              | Construct                    | Reason                                                                                                    |
| -------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AwsSolutions-VPC7`  | `KeycloakVpc`                | VPC flow logs disabled to reduce cost.                                                                    |
| `AwsSolutions-ECS4`  | `KeycloakEcsCluster`         | CloudWatch Container Insights disabled to reduce cost.                                                    |
| `AwsSolutions-IAM5`  | `KeycloakTaskDefinition`     | Task role needs read access to all objects in the certificates bucket.                                    |
| `AwsSolutions-ECS2`  | `KeycloakTaskDefinition`     | Non-sensitive Keycloak config (DB URL, port, TLS paths) passed as plaintext. Secrets use Secrets Manager. |
| `AwsSolutions-EC23`  | `KeycloakNlb`                | NLB is internet-facing and must accept inbound HTTPS traffic on port 443 from any IP.                     |
| `AwsSolutions-ELB2`  | `KeycloakNlb`                | NLB access logs disabled to reduce cost.                                                                  |
| `AwsSolutions-RDS6`  | `KeycloakCluster`            | IAM authentication disabled; Keycloak requires username/password.                                         |
| `AwsSolutions-RDS10` | `KeycloakCluster`            | Deletion protection disabled for non-production workload.                                                 |
| `AwsSolutions-SMG4`  | `KeycloakCluster`            | Automatic secret rotation disabled for non-production workload.                                           |
| `AwsSolutions-S1`    | `KeycloakCertificatesBucket` | Server access logging disabled to reduce cost for a non-production workload.                              |

## CI

The pre-commit hook runs `npm run build:ci` (clean → test → type-check) and
`lint-staged` (Biome format + lint on staged files) automatically via Husky.

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
| [Biome](https://biomejs.dev/)                           | Linter and formatter                          |
| [cdk-nag](https://github.com/cdklabs/cdk-nag)           | CDK security and compliance checks            |
| [Husky](https://typicode.github.io/husky/)              | Git hooks                                     |
| [commitlint](https://commitlint.js.org/)                | Conventional Commits enforcement              |

## Contributing

Commits must follow the
[Conventional Commits](https://www.conventionalcommits.org/) specification,
enforced via commitlint.
