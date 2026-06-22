import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { describe, test } from 'vitest';
import { SecureKey } from '../../../../lib/constructs/kms/secure-key.js';

describe('SecureKey', () => {
  const stack = new cdk.Stack();
  new SecureKey(stack, 'Key', { alias: 'alias/test/key' });
  const template = Template.fromStack(stack);

  test('enables key rotation', () => {
    template.hasResourceProperties('AWS::KMS::Key', {
      EnableKeyRotation: true,
    });
  });

  test('is destroyed on removal', () => {
    template.hasResource('AWS::KMS::Key', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  test('sets the pending deletion window to 7 days', () => {
    template.hasResourceProperties('AWS::KMS::Key', {
      PendingWindowInDays: 7,
    });
  });

  test('restricts the base key policy to account-root management only', () => {
    template.hasResourceProperties('AWS::KMS::Key', {
      KeyPolicy: Match.objectLike({
        Statement: [
          Match.objectLike({
            Sid: 'KeyManagement',
            Action: Match.arrayWith([
              'kms:CancelKeyDeletion',
              'kms:Create*',
              'kms:DeleteAlias',
              'kms:ScheduleKeyDeletion',
            ]),
          }),
        ],
      }),
    });
  });

  test('does not grant data-plane actions in the base policy', () => {
    const key = Object.values(template.findResources('AWS::KMS::Key'))[0];
    if (!key) {
      throw new Error('expected a KMS key to be created');
    }
    const actions: string[] = key.Properties.KeyPolicy.Statement.flatMap(
      (statement: { Action: string | string[] }) => statement.Action
    );
    for (const denied of [
      'kms:Decrypt',
      'kms:Encrypt',
      'kms:GenerateDataKey',
    ]) {
      if (actions.includes(denied)) {
        throw new Error(`base key policy must not grant ${denied}`);
      }
    }
  });

  test('creates the requested alias', () => {
    template.hasResourceProperties('AWS::KMS::Alias', {
      AliasName: 'alias/test/key',
    });
  });
});
