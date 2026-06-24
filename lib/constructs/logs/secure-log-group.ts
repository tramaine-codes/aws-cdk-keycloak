import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { SecureKey } from '../kms/secure-key.js';

export interface SecureLogGroupProps
  extends Omit<logs.LogGroupProps, 'encryptionKey'> {
  readonly keyAlias: string;
}

export class SecureLogGroup extends logs.LogGroup {
  constructor(scope: Construct, id: string, props: SecureLogGroupProps) {
    const { keyAlias: alias, ...logGroupProps } = props;
    const encryptionKey = new SecureKey(scope, `${id}Key`, { alias });

    super(scope, id, {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      ...logGroupProps,
      encryptionKey,
    });

    const { account, partition, region } = cdk.Stack.of(this);

    encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsAccess',
        actions: [
          'kms:Decrypt',
          'kms:DescribeKey',
          'kms:Encrypt',
          'kms:GenerateDataKey*',
          'kms:ReEncrypt*',
        ],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:${partition}:logs:${region}:${account}:log-group:*`,
          },
        },
        principals: [new iam.ServicePrincipal(`logs.${region}.amazonaws.com`)],
        resources: ['*'],
      })
    );
  }
}
