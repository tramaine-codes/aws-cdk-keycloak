import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { SecureLogBucket } from '../../../constructs/s3/secure-log-bucket.js';

export class ServerAccessLogs extends Construct {
  readonly bucket: s3.IBucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new SecureLogBucket(this, 'Bucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: cdk.Duration.days(7) }],
    });
    cdk.Tags.of(this.bucket).add('keycloak:name', 'ServerAccessLogs');
  }
}
