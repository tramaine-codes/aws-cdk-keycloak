import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import type { Construct } from 'constructs';
import { SecureKey } from '../kms/secure-key.js';

export interface SecureDatabaseClusterProps
  extends Omit<
    rds.DatabaseClusterProps,
    'storageEncrypted' | 'storageEncryptionKey'
  > {
  readonly keyAlias: string;
}

export class SecureDatabaseCluster extends rds.DatabaseCluster {
  constructor(scope: Construct, id: string, props: SecureDatabaseClusterProps) {
    const { keyAlias: alias, ...clusterProps } = props;

    const storageEncryptionKey = new SecureKey(scope, `${id}Key`, { alias });

    super(scope, id, { ...clusterProps, storageEncryptionKey });

    const { account, region } = cdk.Stack.of(this);

    storageEncryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AccountRdsAccess',
        actions: [
          'kms:Decrypt',
          'kms:DescribeKey',
          'kms:Encrypt',
          'kms:GenerateDataKey*',
          'kms:ReEncrypt*',
        ],
        conditions: {
          StringEquals: {
            'kms:CallerAccount': account,
            'kms:ViaService': `rds.${region}.amazonaws.com`,
          },
        },
        principals: [new iam.AccountRootPrincipal()],
        resources: ['*'],
      })
    );
  }
}
