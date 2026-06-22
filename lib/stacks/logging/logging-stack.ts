import * as cdk from 'aws-cdk-lib';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { AuditTrail } from './audit-trail/audit-trail.js';
import { SecurityDashboard } from './dashboard/security-dashboard.js';
import { FlowLogs } from './flow-logs/flow-logs.js';
import { ServerAccessLogs } from './server-access-logs/server-access-logs.js';

export class LoggingStack extends cdk.Stack {
  readonly flowLogsBucket: s3.IBucket;
  readonly serverAccessLogsBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const flowLogs = new FlowLogs(this, 'FlowLogs');
    this.flowLogsBucket = flowLogs.bucket;

    const serverAccessLogs = new ServerAccessLogs(this, 'ServerAccessLogs');
    this.serverAccessLogsBucket = serverAccessLogs.bucket;

    const auditTrail = new AuditTrail(this, 'AuditTrail');

    new SecurityDashboard(this, 'SecurityDashboard', {
      auditTrail,
    });
  }
}
