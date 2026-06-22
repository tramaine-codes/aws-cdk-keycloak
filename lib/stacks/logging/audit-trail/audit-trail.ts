import * as cdk from 'aws-cdk-lib';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { SecureKey } from '../../../constructs/kms/secure-key.js';
import { SecureLogBucket } from '../../../constructs/s3/secure-log-bucket.js';

export class AuditTrail extends Construct {
  readonly cloudTrailLogGroup: logs.ILogGroup;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stack = cdk.Stack.of(this);

    const encryptionKey = new SecureKey(this, 'Key', {
      alias: 'alias/keycloak/cloud-trail/audit-trail',
    });
    cdk.Tags.of(encryptionKey).add('keycloak:name', 'AuditTrailKey');

    encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'CloudTrailConsumer',
        actions: ['kms:DescribeKey', 'kms:GenerateDataKey*'],
        conditions: {
          StringLike: {
            'kms:EncryptionContext:aws:cloudtrail:arn': `arn:${stack.partition}:cloudtrail:*:${stack.account}:trail/*`,
          },
        },
        principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
        resources: ['*'],
      })
    );

    encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'S3DeliveryConsumer',
        actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:GenerateDataKey*'],
        conditions: {
          StringEquals: {
            'kms:CallerAccount': stack.account,
            'kms:ViaService': `s3.${stack.region}.amazonaws.com`,
          },
        },
        principals: [new iam.AccountRootPrincipal()],
        resources: ['*'],
      })
    );

    const bucket = new SecureLogBucket(this, 'Bucket', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(7),
        },
      ],
    });
    cdk.Tags.of(bucket).add('keycloak:name', 'AuditTrail');

    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject'],
        conditions: {
          StringNotEqualsIfExists: {
            's3:x-amz-server-side-encryption-aws-kms-key-id':
              encryptionKey.keyArn,
          },
          StringNotEqualsIgnoreCase: {
            'aws:PrincipalServiceName': 'cloudtrail.amazonaws.com',
          },
        },
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        resources: [bucket.arnForObjects('*')],
      })
    );

    const cloudTrailLogGroup = new logs.LogGroup(this, 'LogGroup', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    const trail = new cloudtrail.Trail(this, 'Resource', {
      bucket,
      cloudWatchLogGroup: cloudTrailLogGroup,
      enableFileValidation: true,
      encryptionKey,
      isMultiRegionTrail: false,
      sendToCloudWatchLogs: true,
      trailName: 'keycloak-audit',
    });
    cdk.Tags.of(trail).add('keycloak:name', 'AuditTrail');
    this.cloudTrailLogGroup = cloudTrailLogGroup;
  }
}
