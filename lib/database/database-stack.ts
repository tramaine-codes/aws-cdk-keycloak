import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { KeycloakVpc } from '../network/keycloak-vpc/keycloak-vpc.js';
import { KeycloakCluster } from './keycloak-cluster/keycloak-cluster.js';

interface DatabaseStackProps extends cdk.StackProps {
  readonly keycloakVpc: KeycloakVpc;
}

export class DatabaseStack extends cdk.Stack {
  readonly keycloakDatabaseCluster: KeycloakCluster;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    this.keycloakDatabaseCluster = new KeycloakCluster(
      this,
      'KeycloakDatabaseCluster',
      {
        networkVpc: props.keycloakVpc,
      }
    );
  }
}
