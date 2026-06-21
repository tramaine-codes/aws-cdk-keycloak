import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as kms from 'aws-cdk-lib/aws-kms';
import type { Construct } from 'constructs';
import { SecureKey } from '../kms/secure-key.js';

export interface SecureEcrRepositoryProps
  extends Omit<
    ecr.RepositoryProps,
    'encryption' | 'encryptionKey' | 'imageScanOnPush' | 'imageTagMutability'
  > {
  readonly alias: string;
}

export class SecureEcrRepository extends ecr.Repository {
  readonly encryptionKey: kms.IKey;

  constructor(scope: Construct, id: string, props: SecureEcrRepositoryProps) {
    const { alias, ...repositoryProps } = props;

    const encryptionKey = new SecureKey(scope, `${id}Key`, { alias });

    super(scope, id, {
      emptyOnDelete: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [{ maxImageCount: 10 }],
      ...repositoryProps,
      encryption: ecr.RepositoryEncryption.KMS,
      encryptionKey,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
    });

    this.encryptionKey = encryptionKey;

    const stack = cdk.Stack.of(this);

    encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AccountEcrAccess',
        actions: [
          'kms:Decrypt',
          'kms:DescribeKey',
          'kms:Encrypt',
          'kms:GenerateDataKey*',
          'kms:ReEncrypt*',
        ],
        conditions: {
          StringEquals: {
            'kms:CallerAccount': stack.account,
            'kms:ViaService': `ecr.${stack.region}.amazonaws.com`,
          },
        },
        principals: [new iam.AccountRootPrincipal()],
        resources: ['*'],
      })
    );
  }
}
