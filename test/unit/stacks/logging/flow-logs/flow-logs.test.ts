import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { describe, test } from 'vitest';
import { FlowLogs } from '../../../../../lib/stacks/logging/flow-logs/flow-logs.js';

describe('FlowLogs', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  new FlowLogs(stack, 'FlowLogs');
  const template = Template.fromStack(stack);

  // S3-managed (not KMS) because S3 flow-log delivery does not support a
  // KMS-encrypted target bucket. The rest of the hardening is covered by the
  // SecureLogBucket primitive test.
  test('uses S3-managed encryption', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
    });
  });

  test('expires objects after 7 days', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({ ExpirationInDays: 7, Status: 'Enabled' }),
        ]),
      },
    });
  });
});
