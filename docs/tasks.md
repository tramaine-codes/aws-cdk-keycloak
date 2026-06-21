# Tasks — Deferred Follow-ups

Work intentionally parked during the ECR / internet-free image-pull effort. Each
item is self-contained; none blocks the others.

---

## 1. Guard the pinned image digests with a test

**Context.** The Keycloak and aws-cli images are pulled from ECR **by digest**
(`keycloak-task-definition.ts`, constants `keycloakImageDigest` /
`awsCliImageDigest`). The `AuthenticationStack` composition snapshot does
**not** lock these: `normalize()` in the snapshot tests scrubs every 64-hex
string, and an image digest is a 64-hex string, so both digests appear in the
snapshot as `@sha256:HASH`. A wrong/changed digest would not fail any test.

**Do.** Add a targeted assertion (a `KeycloakTaskDefinition` construct test, or
an assertion in the auth-stack test before `normalize`) that the two container
image references contain the exact pinned digests. Note the digest is embedded
in an `Fn::Join` alongside the cross-stack-imported repository URI, so match on
the joined fragment rather than a bare string.

---

## 2. Centralize the image manifest (single source of truth)

**Context.** The version + digest pairs are duplicated:

- `scripts/upload-images.ts` — the `images` manifest (`source`, `version`,
  `digest`, `repositoryTag`).
- `keycloak-task-definition.ts` — `keycloakImageDigest` / `awsCliImageDigest`.

The `keycloak:name` tag values (`Keycloak`, `AwsCli`) are likewise a contract
shared between `keycloak-ecr-repositories.ts` (which tags the repos) and
`upload-images.ts` (which discovers them by that tag).

**Do.** Extract one module (e.g. a `keycloak-images` const) exporting
`{ repositoryTag, source, version, digest }` per image, imported by the task
definition (digests), the repositories construct (tag values), and the upload
script (everything). Upgrading an image then touches exactly one place. Deferred
pending a decision on where it should live (`lib/` is importable by both
`scripts/` and the stacks).

---

## 3. Rotate the database and admin secrets (un-suppress `SMG4`)

**Context.** Automatic secret rotation is currently suppressed with the reason
"not a production workload" in:

- `keycloak-cluster.ts` — the Aurora cluster and its `databaseSecret`.
- `keycloak-task-definition.ts` — the Keycloak `AdminSecret`.

For the air-gapped/ADC target this is a real gap — NIST 800-53 expects
credential rotation, and unrotated long-lived secrets are exactly what `SMG4`
flags.

**Why it isn't a one-liner.** Keycloak reads `KC_DB_PASSWORD` **once at
container start** (ECS injects the Secrets Manager value at task launch) and
caches it in its connection pool; it does not re-read the secret at runtime.
Naive **single-user** rotation changes the password on the database out from
under the running task, so new connections fail and Keycloak degrades until
restarted.

**Do.**

- Use **`addRotationMultiUser`** (alternating-users strategy) so the active
  credential stays valid across a full rotation window instead of being
  invalidated immediately.
- Add a **redeploy-on-rotation** hook — an EventBridge rule on rotation success
  that forces a new ECS service deployment so the task restarts and re-reads the
  rotated secret (rolling, no outage).
- The rotation Lambda runs in the VPC; it needs the Secrets Manager interface
  endpoint (already present) and reachability to the cluster.
- Apply the same treatment to the `AdminSecret`.

---

## 4. Run Keycloak as a cluster (multi-node HA)

**Context.** Keycloak currently runs as a **single** Fargate task
(`KeycloakFargateService`, `desiredCount: 1`) with `KC_CACHE: 'local'` in
`keycloak-task-definition.ts` — i.e. clustering is explicitly disabled and there
is no session/state replication or HA.

**Do.** Move to a clustered, multi-node deployment:

- **Replicas** — raise the Fargate service `desiredCount` above 1.
- **Distributed cache** — switch from `KC_CACHE: 'local'` to the distributed
  Infinispan cache so sessions and auth state replicate across nodes.
- **Node discovery** — multicast does not work on Fargate. Keycloak 26 defaults
  JGroups discovery to **JDBC_PING** (uses the database, which already exists),
  so nodes find each other through Aurora with no extra infrastructure. Confirm
  the task can reach the DB on the JGroups requirements; otherwise configure a
  cache stack explicitly.
- **Inter-node networking** — open the **JGroups port (7800/TCP by default)**
  between tasks via a self-referencing rule on the service security group so
  nodes can form the cluster.
- **Rolling deploys** — verify graceful shutdown / health-check settings so a
  rolling replacement drains and rejoins cleanly without dropping sessions.

**Decisions to make.** Cache stack (default JDBC_PING vs. DNS_PING via Cloud Map
/ ECS Service Connect), target replica count, and whether the NLB needs any
stickiness (with a distributed cache it generally does not).

---

## 5. Make the ECR lifecycle policy multi-arch-aware

**Context.** `SecureEcrRepository` sets
`lifecycleRules: [{ maxImageCount: 10 }]`. A multi-arch image is not one
manifest but an index plus one manifest per platform (plus build attestations):
`keycloak:26.6.1` is **7** ECR images (the index, three platform images for
amd64/arm64/ppc64le, and three attestation manifests); `aws-cli` is 3.
`maxImageCount` counts every manifest, so 10 holds only ~1 keycloak version — a
second version push starts expiring the oldest images and can leave a prior
version's index partially pruned (a broken, unpullable index).

**Do.** Replace the blunt `maxImageCount` with a multi-arch-safe retention
strategy — e.g. a count sized to (manifests-per-version x versions-to-keep), or
tag-based rules that key off the tagged index rather than the untagged
sub-manifests. Acceptable as-is for a pin-the-current-digest workflow, but
revisit before keeping multiple versions in a repo.

---

## 6. CMK-encrypt the Secrets Manager secrets (via a `SecureSecret` construct)

**Context.** The Keycloak `AdminSecret` (`keycloak-task-definition.ts`) and the
Aurora database secret (`keycloak-cluster.ts`) are encrypted with the default
`aws/secretsmanager` AWS-managed key, not customer-managed CMKs. For the ADC
posture we want customer-controlled, revocable, auditable key material.

**Why it isn't a drop-in.** Passing a `SecureKey` as the secret's
`encryptionKey` triggers a cross-stack dependency cycle. The database secret's
CMK lives in `DatabaseStack`, but its consumer — the ECS execution role — lives
in `AuthenticationStack`, which already depends on `DatabaseStack`. Because
`SecureKey`'s policy does not trust account IAM identities, CDK writes the
consumer's decrypt grant into the key's resource policy, so `DatabaseStack` then
references the auth role and the two stacks form a cycle.

**Do.** Build a `SecureSecret` construct that owns the key wiring:

- Create a `SecureKey` internally with an `AccountSecretsManagerAccess`
  statement (account-root data-plane scoped via
  `kms:ViaService: secretsmanager.<region>.amazonaws.com`), so any account
  principal may decrypt through Secrets Manager.
- Override `grantRead` to grant the consumer `secretsmanager:GetSecretValue` and
  `kms:Decrypt` on the consumer's IAM policy only (`iam.Grant.addToPrincipal`),
  and NOT call `key.grantDecrypt` — that auto-grant is what mutates the key
  resource policy cross-stack and creates the cycle.
- Apply to the `AdminSecret` and the database secret (`rds.DatabaseSecret`
  accepts an `encryptionKey`).
