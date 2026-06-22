import * as cdk from 'aws-cdk-lib';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { KeycloakCertificates } from './keycloak-certificates/keycloak-certificates.js';
import { KeycloakEcrRepositories } from './keycloak-ecr-repositories/keycloak-ecr-repositories.js';

interface ArtifactsStackProps extends cdk.StackProps {
  readonly serverAccessLogsBucket: s3.IBucket;
}

export class ArtifactsStack extends cdk.Stack {
  readonly keycloakCertificatesBucket: s3.IBucket;
  readonly keycloakEcrRepositories: KeycloakEcrRepositories;

  constructor(scope: Construct, id: string, props: ArtifactsStackProps) {
    super(scope, id, props);

    const keycloakCertificates = new KeycloakCertificates(
      this,
      'KeycloakCertificates',
      { serverAccessLogsBucket: props.serverAccessLogsBucket }
    );
    this.keycloakCertificatesBucket = keycloakCertificates.bucket;

    this.keycloakEcrRepositories = new KeycloakEcrRepositories(
      this,
      'KeycloakEcrRepositories'
    );
  }
}
