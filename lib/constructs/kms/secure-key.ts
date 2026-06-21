import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

const MANAGEMENT_ACTIONS = [
  'kms:Create*',
  'kms:Describe*',
  'kms:Enable*',
  'kms:Disable*',
  'kms:Get*',
  'kms:List*',
  'kms:Put*',
  'kms:Update*',
  'kms:Revoke*',
  'kms:Tag*',
  'kms:Untag*',
  'kms:ScheduleKeyDeletion',
  'kms:CancelKeyDeletion',
  'kms:RotateKeyOnDemand',
];

export interface SecureKeyProps
  extends Omit<kms.KeyProps, 'enableKeyRotation' | 'policy'> {}

export class SecureKey extends kms.Key {
  constructor(scope: Construct, id: string, props?: SecureKeyProps) {
    super(scope, id, {
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
