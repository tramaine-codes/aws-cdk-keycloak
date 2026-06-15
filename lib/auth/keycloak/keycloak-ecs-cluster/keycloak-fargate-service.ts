import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import type { KeycloakCluster } from '../../../database/keycloak-cluster/keycloak-cluster.js';
import type { KeycloakVpc } from '../../../network/keycloak-vpc/keycloak-vpc.js';

interface KeycloakFargateServiceProps {
  cluster: ecs.ICluster;
  databaseCluster: KeycloakCluster;
  networkVpc: KeycloakVpc;
  taskDefinition: ecs.FargateTaskDefinition;
}

export class KeycloakFargateService extends Construct {
  readonly loadBalancerTarget: ecs.IEcsLoadBalancerTarget;
  readonly serviceSecurityGroup: ec2.SecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    props: KeycloakFargateServiceProps
  ) {
    super(scope, id);

    const {
      cluster,
      databaseCluster,
      networkVpc: { publicSubnets, vpc },
      taskDefinition,
    } = props;

    this.serviceSecurityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
    });

    const service = new ecs.FargateService(this, 'FargateService', {
      assignPublicIp: true,
      circuitBreaker: { rollback: true },
      cluster,
      desiredCount: 1,
      healthCheckGracePeriod: cdk.Duration.minutes(3),
      minHealthyPercent: 0,
      securityGroups: [this.serviceSecurityGroup],
      taskDefinition,
      vpcSubnets: { subnets: [...publicSubnets] },
    });

    this.loadBalancerTarget = service.loadBalancerTarget({
      containerName: 'keycloak',
      containerPort: 8443,
    });

    databaseCluster.allowIngressFrom(this.serviceSecurityGroup);
  }
}
