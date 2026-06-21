import * as cdk from 'aws-cdk-lib';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { KeycloakEcrRepositories } from '../artifacts/keycloak-ecr-repositories/keycloak-ecr-repositories.js';
import type { KeycloakCluster } from '../database/keycloak-cluster/keycloak-cluster.js';
import type { KeycloakVpc } from '../network/keycloak-vpc/keycloak-vpc.js';
import { Keycloak } from './keycloak/keycloak.js';

interface AuthenticationStackProps extends cdk.StackProps {
  keycloakCertificatesBucket: s3.IBucket;
  keycloakDatabaseCluster: KeycloakCluster;
  keycloakEcrRepositories: KeycloakEcrRepositories;
  keycloakVpc: KeycloakVpc;
  serverAccessLogsBucket: s3.IBucket;
}

export class AuthenticationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuthenticationStackProps) {
    super(scope, id, props);

    const {
      keycloakCertificatesBucket: certificatesBucket,
      keycloakDatabaseCluster: databaseCluster,
      keycloakEcrRepositories,
      keycloakVpc: networkVpc,
      serverAccessLogsBucket,
    } = props;

    new Keycloak(this, 'Keycloak', {
      certificatesBucket,
      databaseCluster,
      keycloakEcrRepositories,
      networkVpc,
      serverAccessLogsBucket,
    });
  }
}
