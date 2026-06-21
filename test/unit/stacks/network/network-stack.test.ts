import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { describe, expect, test } from 'vitest';
import { LoggingStack } from '../../../../lib/stacks/logging/logging-stack.js';
import { NetworkStack } from '../../../../lib/stacks/network/network-stack.js';

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

describe('NetworkStack', () => {
  const app = new cdk.App();
  const { flowLogsBucket } = new LoggingStack(app, 'Keycloak-LoggingStack', {
    env,
  });
  const networkStack = new NetworkStack(app, 'Keycloak-NetworkStack', {
    env,
    flowLogsBucket,
  });

  test('composition matches snapshot', () => {
    expect(normalize(networkStack)).toMatchSnapshot();
  });
});
