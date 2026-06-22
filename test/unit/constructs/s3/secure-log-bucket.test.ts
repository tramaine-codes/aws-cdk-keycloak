import { Match, Template } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib/core';
import { describe, expect, test } from 'vitest';
import { SecureLogBucket } from '../../../../lib/constructs/s3/secure-log-bucket.js';

describe('SecureLogBucket', () => {
  const stack = new cdk.Stack();
  new SecureLogBucket(stack, 'LogBucket');
  const template = Template.fromStack(stack);

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

  test('enforces TLS', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  test('is destroyed on removal', () => {
    template.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  test('grantKeyAccess throws when no keyAlias was provided', () => {
    const bucket = new SecureLogBucket(new cdk.Stack(), 'Bucket');
    expect(() =>
      bucket.grantKeyAccess(new iam.PolicyStatement({ resources: ['*'] }))
    ).toThrow('encryption key is undefined');
  });

  test('uses S3-managed encryption when no key alias is provided', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
    });
  });
});

describe('SecureLogBucket with keyAlias', () => {
  const env = { account: '000000000000', region: 'us-east-1' };
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack', { env });
  new SecureLogBucket(stack, 'LogBucket', {
    keyAlias: 'alias/test/log-bucket',
  });
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

  test('creates a KMS key and alias', () => {
    template.resourceCountIs('AWS::KMS::Key', 1);
    template.hasResourceProperties('AWS::KMS::Alias', {
      AliasName: 'alias/test/log-bucket',
    });
  });

  test('grants S3 ViaService access to the key', () => {
    template.hasResourceProperties('AWS::KMS::Key', {
      KeyPolicy: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'AccountS3Access',
            Condition: Match.objectLike({
              StringEquals: Match.objectLike({
                'kms:ViaService': 's3.us-east-1.amazonaws.com',
              }),
            }),
          }),
        ]),
      }),
    });
  });
});
