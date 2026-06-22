import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import { SecureKey } from '../kms/secure-key.js';

export interface SecureLogBucketProps
  extends Omit<
    s3.BucketProps,
    | 'blockPublicAccess'
    | 'encryption'
    | 'encryptionKey'
    | 'enforceSSL'
    | 'versioned'
  > {
  readonly keyAlias?: string;
}

export class SecureLogBucket extends s3.Bucket {
  constructor(scope: Construct, id: string, props?: SecureLogBucketProps) {
    const { keyAlias: alias, ...bucketProps } = props ?? {};

    const encryptionKey = alias
      ? new SecureKey(scope, `${id}Key`, { alias })
      : undefined;

    super(scope, id, {
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      ...bucketProps,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: encryptionKey
        ? s3.BucketEncryption.KMS
        : s3.BucketEncryption.S3_MANAGED,
      // Only include encryptionKey when defined; passing encryptionKey: undefined
      // alongside encryption: S3_MANAGED triggers CDK's EncryptionkeySpecified error.
      ...(encryptionKey && { encryptionKey }),
      enforceSSL: true,
      versioned: true,
    });

    if (encryptionKey) {
      const { account, region } = cdk.Stack.of(this);

      encryptionKey.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'AccountS3Access',
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
              'kms:ViaService': `s3.${region}.amazonaws.com`,
            },
          },
          principals: [new iam.AccountRootPrincipal()],
          resources: ['*'],
        })
      );
    }

    NagSuppressions.addResourceSuppressions(this, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'Log-destination bucket cannot send access logs to itself without a circular dependency.',
      },
    ]);
  }

  grantKeyAccess = (statement: iam.PolicyStatement) => {
    if (!this.encryptionKey) {
      throw new Error('encryption key is undefined');
    }

    this.encryptionKey.addToResourcePolicy(statement);
  };
}
