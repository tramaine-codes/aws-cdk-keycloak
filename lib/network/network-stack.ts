import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';
import { KeycloakVpc } from './keycloak-vpc/keycloak-vpc.js';

export class NetworkStack extends cdk.Stack {
  readonly keycloakVpc: KeycloakVpc;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.keycloakVpc = new KeycloakVpc(this, 'KeycloakVpc');
  }
}
