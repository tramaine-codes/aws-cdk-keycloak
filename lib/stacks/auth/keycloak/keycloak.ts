import type * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { KeycloakEcrRepositories } from '../../artifacts/keycloak-ecr-repositories/keycloak-ecr-repositories.js';
import type { KeycloakCluster } from '../../database/keycloak-cluster/keycloak-cluster.js';
import type { KeycloakVpc } from '../../network/keycloak-vpc/keycloak-vpc.js';
import { KeycloakEcsCluster } from './keycloak-ecs-cluster/keycloak-ecs-cluster.js';
import { KeycloakFargateService } from './keycloak-ecs-cluster/keycloak-fargate-service.js';
import { KeycloakTaskDefinition } from './keycloak-ecs-cluster/keycloak-task-definition.js';
import { KeycloakNlb } from './keycloak-nlb/keycloak-nlb.js';

interface KeycloakProps {
  readonly certificatesBucket: s3.IBucket;
  readonly databaseCluster: KeycloakCluster;
  readonly keycloakEcrRepositories: KeycloakEcrRepositories;
  readonly networkVpc: KeycloakVpc;
  readonly serverAccessLogsBucket: s3.IBucket;
}

export class Keycloak extends Construct {
  constructor(scope: Construct, id: string, props: KeycloakProps) {
    super(scope, id);

    const {
      certificatesBucket,
      databaseCluster,
      keycloakEcrRepositories,
      networkVpc,
      serverAccessLogsBucket,
    } = props;

    const nlb = new KeycloakNlb(this, 'KeycloakNlb', {
      networkVpc,
      serverAccessLogsBucket,
    });

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
        keycloakEcrRepositories,
      }
    );

    const service = new KeycloakFargateService(this, 'KeycloakFargateService', {
      cluster,
      databaseCluster,
      networkVpc,
      taskDefinition,
    });

    nlb.addKeycloakTarget(service);
  }
}
