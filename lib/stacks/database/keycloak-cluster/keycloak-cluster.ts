import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { SecureDatabaseCluster } from '../../../constructs/rds/secure-database-cluster.js';
import type { KeycloakFargateService } from '../../auth/keycloak/keycloak-ecs-cluster/keycloak-fargate-service.js';
import type { KeycloakVpc } from '../../network/keycloak-vpc/keycloak-vpc.js';

interface KeycloakClusterProps extends cdk.StackProps {
  readonly networkVpc: KeycloakVpc;
}

export class KeycloakCluster extends Construct {
  private readonly cluster: rds.IDatabaseCluster;
  private readonly clusterSecurityGroup: ec2.SecurityGroup;
  private readonly databaseSecret: secretsmanager.ISecret;

  constructor(
    scope: Construct,
    id: string,
    { networkVpc }: KeycloakClusterProps
  ) {
    super(scope, id);

    this.databaseSecret = new rds.DatabaseSecret(
      this,
      'KeycloakClusterSecret',
      {
        username: 'keycloak',
      }
    );

    const { databaseSubnets, vpc } = networkVpc;

    this.clusterSecurityGroup = new ec2.SecurityGroup(
      this,
      'KeycloakClusterSecurityGroup',
      {
        allowAllOutbound: false,
        vpc,
      }
    );

    this.cluster = new SecureDatabaseCluster(this, 'KeycloakCluster', {
      credentials: rds.Credentials.fromSecret(this.databaseSecret),
      defaultDatabaseName: 'keycloak',
      enableDataApi: true,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_17_9,
      }),
      keyAlias: 'alias/keycloak/rds/keycloak-cluster',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      securityGroups: [this.clusterSecurityGroup],
      serverlessV2MaxCapacity: 1.0,
      serverlessV2MinCapacity: 0.5,
      vpc,
      vpcSubnets: { subnets: [...databaseSubnets] },
      writer: rds.ClusterInstance.serverlessV2('writer'),
    });

    NagSuppressions.addResourceSuppressions(this.cluster, [
      {
        id: 'AwsSolutions-RDS6',
        reason:
          'IAM authentication is disabled because Keycloak expects a username/password.',
      },
      {
        id: 'AwsSolutions-RDS10',
        reason:
          'Deletion protection is disabled because this is not a production workload.',
      },
      {
        id: 'AwsSolutions-SMG4',
        reason:
          'Automatic secret rotation is disabled because this is not a production workload.',
      },
    ]);

    NagSuppressions.addResourceSuppressions(this.databaseSecret, [
      {
        id: 'AwsSolutions-SMG4',
        reason:
          'Automatic secret rotation is disabled because this is not a production workload.',
      },
    ]);
  }

  allowIngressFromKeycloak = ({
    serviceSecurityGroup,
  }: KeycloakFargateService) => {
    this.clusterSecurityGroup.addIngressRule(
      serviceSecurityGroup,
      ec2.Port.tcp(5432),
      undefined,
      true
    );

    serviceSecurityGroup.addEgressRule(
      this.clusterSecurityGroup,
      ec2.Port.tcp(5432)
    );
  };

  clusterEndpoint = () => ({
    hostname: this.cluster.clusterEndpoint.hostname,
    port: this.cluster.clusterEndpoint.port,
  });

  secret = () => this.databaseSecret;
}
