import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import { SecureLogGroup } from '../../../../constructs/logs/secure-log-group.js';

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

    // Pre-create the Container Insights performance log group so it inherits the
    // project's CMK encryption and retention. Container Insights writes to an
    // existing log group of this exact name rather than creating its own
    // (unencrypted, never-expiring) one. Referencing cluster.clusterName keeps
    // the cluster name auto-generated and orders the log group after the
    // cluster — well before any task emits metrics.
    new SecureLogGroup(this, 'InsightsLogGroup', {
      keyAlias: 'alias/keycloak/logs/container-insights',
      logGroupName: `/aws/ecs/containerinsights/${this.cluster.clusterName}/performance`,
    });
  }
}
