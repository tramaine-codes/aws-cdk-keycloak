import type * as s3 from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';
import { KeycloakVpc } from './keycloak-vpc/keycloak-vpc.js';

interface NetworkStackProps extends cdk.StackProps {
  readonly flowLogsBucket: s3.IBucket;
}

export class NetworkStack extends cdk.Stack {
  readonly keycloakVpc: KeycloakVpc;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    this.keycloakVpc = new KeycloakVpc(this, 'KeycloakVpc', {
      flowLogsBucket: props.flowLogsBucket,
    });
  }
}
