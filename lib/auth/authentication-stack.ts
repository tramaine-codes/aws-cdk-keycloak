import * as cdk from 'aws-cdk-lib';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { KeycloakCluster } from '../database/keycloak-cluster/keycloak-cluster.js';
import type { KeycloakVpc } from '../network/keycloak-vpc/keycloak-vpc.js';
import { Keycloak } from './keycloak/keycloak.js';

interface AuthenticationStackProps extends cdk.StackProps {
  keycloakCertificatesBucket: s3.IBucket;
  keycloakDatabaseCluster: KeycloakCluster;
  keycloakVpc: KeycloakVpc;
}

export class AuthenticationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuthenticationStackProps) {
    super(scope, id, props);

    const {
      keycloakCertificatesBucket: certificatesBucket,
      keycloakDatabaseCluster: databaseCluster,
      keycloakVpc: networkVpc,
    } = props;

    new Keycloak(this, 'Keycloak', {
      certificatesBucket,
      databaseCluster,
      networkVpc,
    });
  }
}
