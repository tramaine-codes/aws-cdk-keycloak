import * as cdk from 'aws-cdk-lib';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { SecureLogGroup } from '../../../constructs/logs/secure-log-group.js';
import { SecureLogBucket } from '../../../constructs/s3/secure-log-bucket.js';

export class AuditTrail extends Construct {
  readonly logGroup: logs.ILogGroup;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const bucket = new SecureLogBucket(this, 'Bucket', {
      keyAlias: 'alias/keycloak/cloud-trail/audit-trail',
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(7),
        },
      ],
    });
    cdk.Tags.of(bucket).add('keycloak:name', 'AuditTrail');

    const { encryptionKey } = bucket;
    if (!encryptionKey) {
      throw new Error('AuditTrail requires a SecureLogBucket with a keyAlias');
    }
    cdk.Tags.of(encryptionKey).add('keycloak:name', 'AuditTrailKey');

    const { account } = cdk.Stack.of(this);

    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'DenyIncorrectEncryptionKey',
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

    this.logGroup = new SecureLogGroup(this, 'LogGroup', {
      keyAlias: 'alias/keycloak/logs/audit-trail',
    });

    const trail = new cloudtrail.Trail(this, 'Resource', {
      bucket,
      cloudWatchLogGroup: this.logGroup,
      enableFileValidation: true,
      encryptionKey,
      isMultiRegionTrail: false,
      sendToCloudWatchLogs: true,
    });
    cdk.Tags.of(trail).add('keycloak:name', 'AuditTrail');

    bucket.grantKeyAccess(
      new iam.PolicyStatement({
        sid: 'CloudTrailConsumer',
        actions: ['kms:DescribeKey', 'kms:GenerateDataKey*'],
        conditions: {
          StringEquals: {
            'kms:CallerAccount': account,
          },
        },
        principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
        resources: ['*'],
      })
    );
  }
}
