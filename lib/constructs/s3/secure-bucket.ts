import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { SecureKey } from '../kms/secure-key.js';

export interface SecureBucketProps
  extends Omit<
    s3.BucketProps,
    | 'blockPublicAccess'
    | 'encryption'
    | 'encryptionKey'
    | 'enforceSSL'
    | 'versioned'
  > {
  readonly keyAlias: string;
  readonly serverAccessLogsBucket: s3.IBucket;
}

export class SecureBucket extends s3.Bucket {
  override readonly encryptionKey: kms.IKey;

  constructor(scope: Construct, id: string, props: SecureBucketProps) {
    const { keyAlias: alias, ...bucketProps } = props;

    const encryptionKey = new SecureKey(scope, `${id}Key`, { alias });

    super(scope, id, {
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      ...bucketProps,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey,
      enforceSSL: true,
      versioned: true,
    });

    this.encryptionKey = encryptionKey;

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

    this.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject'],
        conditions: {
          StringNotEqualsIfExists: {
            's3:x-amz-server-side-encryption-aws-kms-key-id':
              encryptionKey.keyArn,
          },
        },
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        resources: [this.arnForObjects('*')],
      })
    );
  }

  grantConsumer = (principal: iam.IPrincipal) => {
    const { account, region } = cdk.Stack.of(this);

    this.encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'S3Consumer',
        actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:GenerateDataKey*'],
        conditions: {
          StringEquals: {
            'kms:CallerAccount': account,
            'kms:ViaService': `s3.${region}.amazonaws.com`,
          },
        },
        principals: [principal],
        resources: ['*'],
      })
    );
  };
}
