import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

interface KeycloakEcsClusterProps {
  vpc: ec2.IVpc;
}

export class KeycloakEcsCluster extends Construct {
  readonly cluster: ecs.ICluster;

  constructor(scope: Construct, id: string, { vpc }: KeycloakEcsClusterProps) {
    super(scope, id);

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    });

    NagSuppressions.addResourceSuppressions(this.cluster, [
      {
        id: 'AwsSolutions-ECS4',
        reason:
          'CloudWatch Container Insights is disabled to minimize cost for a non-production workload.',
      },
    ]);
  }
}
