import type * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { KeycloakCluster } from '../../database/keycloak-cluster/keycloak-cluster.js';
import type { KeycloakVpc } from '../../network/keycloak-vpc/keycloak-vpc.js';
import { KeycloakEcsCluster } from './keycloak-ecs-cluster/keycloak-ecs-cluster.js';
import { KeycloakFargateService } from './keycloak-ecs-cluster/keycloak-fargate-service.js';
import { KeycloakTaskDefinition } from './keycloak-ecs-cluster/keycloak-task-definition.js';
import { KeycloakNlb } from './keycloak-nlb/keycloak-nlb.js';

interface KeycloakProps {
  certificatesBucket: s3.IBucket;
  databaseCluster: KeycloakCluster;
  networkVpc: KeycloakVpc;
}

export class Keycloak extends Construct {
  constructor(scope: Construct, id: string, props: KeycloakProps) {
    super(scope, id);

    const { certificatesBucket, databaseCluster, networkVpc } = props;

    const nlb = new KeycloakNlb(this, 'KeycloakNlb', { networkVpc });

    const { cluster } = new KeycloakEcsCluster(this, 'KeycloakEcsCluster', {
      vpc: networkVpc.vpc,
    });

    const { taskDefinition } = new KeycloakTaskDefinition(
      this,
      'KeycloakTaskDefinition',
      {
        certificatesBucket,
        databaseCluster,
        hostname: `https://${nlb.loadBalancerDnsName}`,
      }
    );

    const { service, serviceSecurityGroup } = new KeycloakFargateService(
      this,
      'KeycloakFargateService',
      {
        cluster,
        databaseCluster,
        networkVpc,
        taskDefinition,
      }
    );

    nlb.addTarget(service, serviceSecurityGroup);
  }
}
