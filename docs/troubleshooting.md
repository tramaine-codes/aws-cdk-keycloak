# Troubleshooting

## cdk-nag reports a finding that is already suppressed (stale `cdk.out`)

### Symptom

`cdk synth` or `cdk deploy` fails with a cdk-nag error — e.g.:

```
ERROR AwsSolutions-IAM5[Resource::*]: The IAM entity contains wildcard
permissions and does not have a cdk-nag rule suppression with evidence ...
   Keycloak-AuthenticationStack/.../ExecutionRole/DefaultPolicy/Resource
Synthesis finished with errors
```

…even though that resource **does** have a matching `NagSuppressions` entry, and
the synthesized template (`cdk.out/<Stack>.template.json`) shows the suppression
metadata on the resource:

```jsonc
"Metadata": {
  "cdk_nag": {
    "rules_to_suppress": [
      { "id": "AwsSolutions-IAM5", "applies_to": ["Resource::*"], "reason": "..." }
    ]
  }
}
```

Re-running `cdk synth`/`cdk deploy` does not clear it.

### Root cause

A **stale `cdk.out`**. The cdk CLI can keep surfacing a phantom cdk-nag error
annotation that was baked into the cloud assembly by an _earlier_ synth — for
example after editing/temporarily breaking a suppression. cdk-nag's own rule
logic actually suppresses the finding on the current code; the CLI is reporting
cached state, not a live evaluation.

### Fix

```bash
rm -rf cdk.out
npx cdk synth <StackName>
```

Always wipe `cdk.out` after changing a `NagSuppressions` call before trusting a
synth/deploy result.

### How to confirm it is a phantom (not a real finding)

1. **Run the app directly**, bypassing the cdk CLI and its assembly cache:

   ```bash
   CDK_DEFAULT_ACCOUNT=<acct> CDK_DEFAULT_REGION=us-east-1 \
     CDK_OUTDIR=cdk.out.probe npx tsx bin/aws-cdk-keycloak.ts
   rm -rf cdk.out.probe
   ```

   A clean run here means the suppression is correct and the CLI error is stale.

2. **Add a temporary logger probe** to `AwsSolutionsChecks` in
   `bin/aws-cdk-keycloak.ts` to see whether cdk-nag treats the finding as
   suppressed or non-compliant:

   ```ts
   const probe = {
     onCompliance() {},
     onNotApplicable() {},
     onError() {},
     onSuppressedError() {},
     onNotEnabled() {},
     onNonCompliance(d: any) {
       console.error(
         `NONCOMPLIANT ${d.ruleId}[${d.findingId}] @ ${d.resource.node.path}`,
       );
     },
     onSuppressed(d: any) {
       console.error(
         `SUPPRESSED ${d.ruleId}[${d.findingId}] @ ${d.resource.node.path}`,
       );
     },
   };
   cdk.Aspects.of(app).add(
     new AwsSolutionsChecks({
       verbose: true,
       additionalLoggers: [probe as any],
     }),
   );
   ```

   If it prints `SUPPRESSED` for the finding while the CLI still prints `ERROR`,
   the error is stale — wipe `cdk.out`. Remove the probe afterward.

### Related gotcha: unit tests do not run cdk-nag

The Vitest stack tests build stacks with `Template.fromStack(...)` and do
**not** apply the `AwsSolutionsChecks` aspect (it is added at the app level in
`bin/aws-cdk-keycloak.ts`). A broken or missing suppression therefore passes
`npm test` and only surfaces during `cdk synth`/`cdk deploy`. After changing a
suppression, always run a fresh `cdk synth` (with `cdk.out` wiped) to validate.
