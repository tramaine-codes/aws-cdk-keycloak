import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { describe, test } from 'vitest';
import { FlowLogs } from '../../../../../lib/stacks/logging/flow-logs/flow-logs.js';

describe('FlowLogs', () => {
  const env = { account: '000000000000', region: 'us-east-1' };
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack', { env });
  new FlowLogs(stack, 'FlowLogs');
  const template = Template.fromStack(stack);

  test('encrypts with a customer managed key', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          Match.objectLike({
            ServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms' },
          }),
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

  test('grants flow logs delivery service access to the key', () => {
    template.hasResourceProperties('AWS::KMS::Key', {
      KeyPolicy: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'FlowLogsDelivery',
            Principal: {
              Service: 'delivery.logs.amazonaws.com',
            },
            Condition: Match.objectLike({
              StringEquals: {
                'aws:SourceAccount': '000000000000',
              },
            }),
          }),
        ]),
      }),
    });
  });
});
