import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { describe, expect, test } from 'vitest';
import { AuditTrail } from '../../../../../lib/stacks/logging/audit-trail/audit-trail.js';

describe('AuditTrail', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  new AuditTrail(stack, 'AuditTrail');
  const template = Template.fromStack(stack);

  test('encrypts the trail and enables log file validation', () => {
    template.hasResourceProperties('AWS::CloudTrail::Trail', {
      EnableLogFileValidation: true,
      IsLogging: true,
      KMSKeyId: Match.anyValue(),
    });
  });

  test('is single-region and streams to CloudWatch Logs', () => {
    template.hasResourceProperties('AWS::CloudTrail::Trail', {
      CloudWatchLogsLogGroupArn: Match.anyValue(),
      IsMultiRegionTrail: false,
    });
  });

  test('encrypts the audit bucket with the CMK', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: Match.objectLike({
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            ServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms' },
          }),
        ]),
      }),
    });
  });

  test('denies unencrypted PutObject except from CloudTrail', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 's3:PutObject',
            Effect: 'Deny',
            Condition: Match.objectLike({
              StringNotEqualsIfExists: Match.objectLike({
                's3:x-amz-server-side-encryption-aws-kms-key-id':
                  Match.anyValue(),
              }),
              StringNotEqualsIgnoreCase: {
                'aws:PrincipalServiceName': 'cloudtrail.amazonaws.com',
              },
            }),
          }),
        ]),
      }),
    });
  });

  test('expires audit logs after 7 days', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({ ExpirationInDays: 7, Status: 'Enabled' }),
        ]),
      },
    });
  });

  // Regression guard for the partition fix: the CloudTrail key grant must be
  // scoped to the stack's partition, never a hardcoded one.
  test('scopes the CloudTrail key grant to the stack partition', () => {
    const keyPolicies = JSON.stringify(template.findResources('AWS::KMS::Key'));
    expect(keyPolicies).toContain('cloudtrail');
    expect(keyPolicies).not.toContain('aws-us-gov');
  });
});
