import { Match, Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib/core';
import { describe, test } from 'vitest';
import { SecureBucket } from '../../../../lib/constructs/s3/secure-bucket.js';

describe('SecureBucket', () => {
  const stack = new cdk.Stack();
  // Imported so only the SecureBucket itself appears as a real resource.
  const serverAccessLogsBucket = s3.Bucket.fromBucketName(
    stack,
    'Logs',
    'access-logs'
  );
  new SecureBucket(stack, 'Bucket', {
    alias: 'alias/test/bucket',
    serverAccessLogsBucket,
  });
  const template = Template.fromStack(stack);

  test('encrypts with a customer-managed KMS key', () => {
    template.resourceCountIs('AWS::KMS::Key', 1);
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

  test('blocks all public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('enables versioning', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
    });
  });

  test('enforces TLS and rejects unencrypted PutObject', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
          Match.objectLike({
            Effect: 'Deny',
            Action: 's3:PutObject',
            Condition: {
              StringNotEqualsIfExists: Match.anyValue(),
            },
          }),
        ]),
      },
    });
  });
});
