import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

interface KeycloakEcsClusterProps {
  vpc: ec2.IVpc;
}

export class KeycloakEcsCluster extends Construct {
  readonly cluster: ecs.ICluster;

  constructor(scope: Construct, id: string, { vpc }: KeycloakEcsClusterProps) {
    super(scope, id);

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
      vpc,
    });
  }
}
