import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { describe, test } from 'vitest';
import { SecureEcrRepository } from '../../../../lib/constructs/ecr/secure-ecr-repository.js';

describe('SecureEcrRepository', () => {
  const stack = new cdk.Stack();
  new SecureEcrRepository(stack, 'Repo', { keyAlias: 'alias/test/repo' });
  const template = Template.fromStack(stack);

  test('scans images on push', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      ImageScanningConfiguration: { ScanOnPush: true },
    });
  });

  test('enforces immutable tags', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      ImageTagMutability: 'IMMUTABLE',
    });
  });

  test('encrypts with a customer-managed KMS key', () => {
    template.resourceCountIs('AWS::KMS::Key', 1);
    template.hasResourceProperties('AWS::ECR::Repository', {
      EncryptionConfiguration: {
        EncryptionType: 'KMS',
        KmsKey: Match.anyValue(),
      },
    });
  });

  test('caps retained images via lifecycle policy', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      LifecyclePolicy: {
        LifecyclePolicyText: Match.serializedJson(
          Match.objectLike({
            rules: Match.arrayWith([
              Match.objectLike({
                selection: Match.objectLike({ countNumber: 10 }),
              }),
            ]),
          })
        ),
      },
    });
  });

  test('lets ECR use the key for encryption', () => {
    template.hasResourceProperties('AWS::KMS::Key', {
      KeyPolicy: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Sid: 'AccountEcrAccess' }),
        ]),
      }),
    });
  });
});
