import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { describe, test } from 'vitest';
import { AuditTrail } from '../../../../../lib/stacks/logging/audit-trail/audit-trail.js';
import { SecurityDashboard } from '../../../../../lib/stacks/logging/dashboard/security-dashboard.js';

describe('SecurityDashboard', () => {
  const env = { account: '000000000000', region: 'us-east-1' };
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack', { env });
  const auditTrail = new AuditTrail(stack, 'AuditTrail');
  new SecurityDashboard(stack, 'SecurityDashboard', { auditTrail });
  const template = Template.fromStack(stack);

  test('creates the CloudTrail dashboard', () => {
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'Keycloak-CloudTrail',
    });
  });
});
