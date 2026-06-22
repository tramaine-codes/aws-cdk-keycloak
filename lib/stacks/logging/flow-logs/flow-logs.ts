import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { SecureLogBucket } from '../../../constructs/s3/secure-log-bucket.js';

export class FlowLogs extends Construct {
  readonly bucket: s3.IBucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const bucket = new SecureLogBucket(this, 'Bucket', {
      keyAlias: 'alias/keycloak/s3/flow-logs',
      lifecycleRules: [{ expiration: cdk.Duration.days(7) }],
    });
    cdk.Tags.of(bucket).add('keycloak:name', 'FlowLogs');

    this.bucket = bucket;

    const { account } = cdk.Stack.of(this);

    bucket.grantKeyAccess(
      new iam.PolicyStatement({
        sid: 'FlowLogsDelivery',
        actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:GenerateDataKey*'],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': account,
          },
        },
        principals: [new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
        resources: ['*'],
      })
    );
  }
}
