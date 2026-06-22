import { Match, Template } from 'aws-cdk-lib/assertions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cdk from 'aws-cdk-lib/core';
import { describe, test } from 'vitest';
import { SecureLogGroup } from '../../../../lib/constructs/logs/secure-log-group.js';

describe('SecureLogGroup', () => {
  const stack = new cdk.Stack();
  new SecureLogGroup(stack, 'LogGroup', { keyAlias: 'alias/test/log-group' });
  const template = Template.fromStack(stack);

  test('is destroyed on removal', () => {
    template.hasResource('AWS::Logs::LogGroup', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  test('defaults to one week retention', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 7,
    });
  });

  test('allows retention to be overridden', () => {
    const overrideStack = new cdk.Stack();
    new SecureLogGroup(overrideStack, 'LogGroup', {
      keyAlias: 'alias/test/override',
      retention: logs.RetentionDays.ONE_MONTH,
    });
    Template.fromStack(overrideStack).hasResourceProperties(
      'AWS::Logs::LogGroup',
      { RetentionInDays: 30 }
    );
  });

  test('encrypts with a customer managed key', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      KmsKeyId: Match.objectLike({ 'Fn::GetAtt': Match.arrayWith(['Arn']) }),
    });
  });

  test('grants CloudWatch Logs access to the key', () => {
    template.hasResourceProperties('AWS::KMS::Key', {
      KeyPolicy: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'CloudWatchLogsAccess',
            Action: Match.arrayWith([
              'kms:Decrypt',
              'kms:DescribeKey',
              'kms:Encrypt',
              'kms:GenerateDataKey*',
              'kms:ReEncrypt*',
            ]),
            Principal: Match.objectLike({
              Service: Match.anyValue(),
            }),
          }),
        ]),
      }),
    });
  });
});
