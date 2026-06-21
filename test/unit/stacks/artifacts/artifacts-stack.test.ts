import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { describe, expect, test } from 'vitest';
import { ArtifactsStack } from '../../../../lib/stacks/artifacts/artifacts-stack.js';
import { LoggingStack } from '../../../../lib/stacks/logging/logging-stack.js';

// Placeholder env keeps the stack environment-specific so lookups resolve to
// deterministic dummy values without AWS credentials.
const env = { account: '000000000000', region: 'us-east-1' };

// Replace content/asset SHA-256 hashes so bundling changes don't churn the
// snapshot; composition is what this guards.
const normalize = (stack: cdk.Stack): unknown =>
  JSON.parse(
    JSON.stringify(Template.fromStack(stack).toJSON()).replace(
      /[a-f0-9]{64}/g,
      'HASH'
    )
  );

describe('ArtifactsStack', () => {
  const app = new cdk.App();
  const { serverAccessLogsBucket } = new LoggingStack(
    app,
    'Keycloak-LoggingStack',
    { env }
  );
  const artifactsStack = new ArtifactsStack(app, 'Keycloak-ArtifactsStack', {
    env,
    serverAccessLogsBucket,
  });

  test('composition matches snapshot', () => {
    expect(normalize(artifactsStack)).toMatchSnapshot();
  });
});
