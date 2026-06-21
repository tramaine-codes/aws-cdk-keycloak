import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { describe, expect, test } from 'vitest';
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

describe('LoggingStack', () => {
  const app = new cdk.App();
  const loggingStack = new LoggingStack(app, 'Keycloak-LoggingStack', { env });

  test('composition matches snapshot', () => {
    expect(normalize(loggingStack)).toMatchSnapshot();
  });
});
