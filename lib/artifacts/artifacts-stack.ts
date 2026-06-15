import * as cdk from 'aws-cdk-lib';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { KeycloakCertificatesBucket } from './keycloak-certificates-bucket/keycloak-certificates-bucket.js';

export class ArtifactsStack extends cdk.Stack {
  readonly keycloakCertificatesBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const { bucket: keycloakCertificatesBucket } =
      new KeycloakCertificatesBucket(this, 'KeycloakCertificatesBucket');

    this.keycloakCertificatesBucket = keycloakCertificatesBucket;
  }
}
