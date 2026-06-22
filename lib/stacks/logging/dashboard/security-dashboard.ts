import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import type { AuditTrail } from '../audit-trail/audit-trail.js';

interface SecurityDashboardProps {
  readonly auditTrail: AuditTrail;
}

export class SecurityDashboard extends Construct {
  constructor(scope: Construct, id: string, props: SecurityDashboardProps) {
    super(scope, id);

    const {
      auditTrail: { logGroup: cloudTrailLogGroup },
    } = props;

    new cloudwatch.Dashboard(this, 'Resource', {
      dashboardName: 'Keycloak-CloudTrail',
      widgets: [
        [
          new cloudwatch.LogQueryWidget({
            logGroupNames: [cloudTrailLogGroup.logGroupName],
            queryLines: [
              'stats count(*) as events by eventSource',
              'sort events desc',
              'limit 10',
            ],
            title: 'CloudTrail Events by Service',
            width: 12,
          }),
          new cloudwatch.LogQueryWidget({
            logGroupNames: [cloudTrailLogGroup.logGroupName],
            queryLines: [
              'fields eventTime, eventName, eventSource, userIdentity.arn',
              'filter errorCode like /Unauthorized|AccessDenied|Forbidden/',
              'sort eventTime desc',
              'limit 25',
            ],
            title: 'Access Denied Events',
            width: 12,
          }),
        ],
        [
          new cloudwatch.LogQueryWidget({
            logGroupNames: [cloudTrailLogGroup.logGroupName],
            queryLines: [
              'fields eventTime, eventName, eventSource, userIdentity.arn',
              'sort eventTime desc',
              'limit 50',
            ],
            title: 'Recent CloudTrail Events',
            width: 24,
          }),
        ],
      ],
    });
  }
}
