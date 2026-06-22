import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

const MANAGEMENT_ACTIONS = [
  'kms:CancelKeyDeletion',
  'kms:Create*',
  'kms:DeleteAlias',
  'kms:Describe*',
  'kms:Disable*',
  'kms:Enable*',
  'kms:Get*',
  'kms:List*',
  'kms:Put*',
  'kms:Revoke*',
  'kms:RotateKeyOnDemand',
  'kms:ScheduleKeyDeletion',
  'kms:Tag*',
  'kms:Untag*',
  'kms:Update*',
];

export interface SecureKeyProps
  extends Omit<kms.KeyProps, 'enableKeyRotation' | 'policy'> {}

export class SecureKey extends kms.Key {
  constructor(scope: Construct, id: string, props?: SecureKeyProps) {
    super(scope, id, {
      pendingWindow: cdk.Duration.days(7),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      ...props,
      enableKeyRotation: true,
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: 'KeyManagement',
            actions: MANAGEMENT_ACTIONS,
            principals: [new iam.AccountRootPrincipal()],
            resources: ['*'],
          }),
        ],
      }),
    });
  }
}
