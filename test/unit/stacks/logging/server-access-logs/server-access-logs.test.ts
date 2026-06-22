import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { describe, test } from 'vitest';
import { ServerAccessLogs } from '../../../../../lib/stacks/logging/server-access-logs/server-access-logs.js';

describe('ServerAccessLogs', () => {
  const env = { account: '000000000000', region: 'us-east-1' };
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack', { env });
  new ServerAccessLogs(stack, 'ServerAccessLogs');
  const template = Template.fromStack(stack);

  // S3-managed (not KMS) because S3 server-access-log delivery does not support
  // a KMS-encrypted target bucket. Public-access/SSL hardening is covered by the
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
