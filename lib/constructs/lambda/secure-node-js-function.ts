import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as sns from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';
import { SecureLogGroup } from '../logs/secure-log-group.js';

export interface SecureNodejsFunctionProps
  extends Omit<lambdaNodejs.NodejsFunctionProps, 'logGroup'> {
  readonly alarmTopic: sns.ITopic;
  readonly logGroupKeyAlias: string;
}

export class SecureNodejsFunction extends lambdaNodejs.NodejsFunction {
  constructor(scope: Construct, id: string, props: SecureNodejsFunctionProps) {
    const { alarmTopic, logGroupKeyAlias: keyAlias, ...functionProps } = props;

    super(scope, id, {
      bundling: { sourceMap: true },
      memorySize: cdk.Size.mebibytes(512).toMebibytes(),
      runtime: lambda.Runtime.NODEJS_24_X,
      tracing: lambda.Tracing.ACTIVE,
      ...functionProps,
      environment: {
        ...functionProps.environment,
        AWS_USE_FIPS_ENDPOINT: 'true',
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new SecureLogGroup(scope, `${id}LogGroup`, {
        keyAlias,
      }),
    });

    const timeout = props.timeout ?? cdk.Duration.seconds(3);
    const alarmAction = new cloudwatchActions.SnsAction(props.alarmTopic);

    const errorsAlarm = new cloudwatch.Alarm(this, 'ErrorsAlarm', {
      alarmDescription: `${this.functionName} error count >= 1`,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      metric: this.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    errorsAlarm.addAlarmAction(alarmAction);

    const throttlesAlarm = new cloudwatch.Alarm(this, 'ThrottlesAlarm', {
      alarmDescription: `${this.functionName} throttle count >= 1`,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      threshold: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      metric: this.metricThrottles({ period: cdk.Duration.minutes(5) }),
    });
    throttlesAlarm.addAlarmAction(alarmAction);

    const durationAlarm = new cloudwatch.Alarm(this, 'DurationAlarm', {
      alarmDescription: `${this.functionName} duration >= 80% of timeout`,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      metric: this.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      threshold: timeout.toMilliseconds() * 0.8,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    durationAlarm.addAlarmAction(alarmAction);
  }
}
