import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { NagSuppressions } from 'cdk-nag';
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
  readonly service: ecs.FargateService;
  readonly serviceSecurityGroup: ec2.SecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    props: KeycloakFargateServiceProps
  ) {
    super(scope, id);

    const { cluster, databaseCluster, networkVpc, taskDefinition } = props;

    this.serviceSecurityGroup = new ec2.SecurityGroup(
      this,
      'TaskSecurityGroup',
      {
        vpc: networkVpc.vpc,
      }
    );

    this.service = new ecs.FargateService(this, 'FargateService', {
      assignPublicIp: true,
      circuitBreaker: { rollback: true },
      cluster,
      desiredCount: 1,
      minHealthyPercent: 0,
      securityGroups: [this.serviceSecurityGroup],
      taskDefinition,
      vpcSubnets: { subnets: [...networkVpc.publicSubnets] },
    });

    databaseCluster.allowIngressFrom(this.serviceSecurityGroup);

    NagSuppressions.addResourceSuppressions(this.serviceSecurityGroup, [
      {
        id: 'AwsSolutions-EC23',
        reason:
          'cdk-nag cannot evaluate the VPC CIDR block (Fn::GetAtt intrinsic function) at synthesis time. The security group restricts inbound access to specific ports from the VPC CIDR only.',
      },
    ]);
  }
}
