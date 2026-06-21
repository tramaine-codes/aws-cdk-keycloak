import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';

export interface SecureLogBucketProps
  extends Omit<
    s3.BucketProps,
    'blockPublicAccess' | 'enforceSSL' | 'versioned'
  > {}

export class SecureLogBucket extends s3.Bucket {
  constructor(scope: Construct, id: string, props?: SecureLogBucketProps) {
    super(scope, id, {
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      ...props,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
    });

    NagSuppressions.addResourceSuppressions(this, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'Log-destination bucket cannot send access logs to itself without a circular dependency.',
      },
    ]);
  }
}
