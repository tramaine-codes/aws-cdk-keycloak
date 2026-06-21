import { Template } from 'aws-cdk-lib/assertions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cdk from 'aws-cdk-lib/core';
import { describe, test } from 'vitest';
import { SecurityDashboard } from '../../../../../lib/stacks/logging/dashboard/security-dashboard.js';

describe('SecurityDashboard', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  const cloudTrailLogGroup = new logs.LogGroup(stack, 'LogGroup');
  new SecurityDashboard(stack, 'SecurityDashboard', { cloudTrailLogGroup });
  const template = Template.fromStack(stack);

  test('creates the CloudTrail dashboard', () => {
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'Keycloak-CloudTrail',
    });
  });
});
