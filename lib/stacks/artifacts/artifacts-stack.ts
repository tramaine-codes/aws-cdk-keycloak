import * as cdk from 'aws-cdk-lib';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { SecureBucket } from '../../constructs/s3/secure-bucket.js';
import { KeycloakEcrRepositories } from './keycloak-ecr-repositories/keycloak-ecr-repositories.js';

interface ArtifactsStackProps extends cdk.StackProps {
  readonly serverAccessLogsBucket: s3.IBucket;
}

export class ArtifactsStack extends cdk.Stack {
  readonly keycloakCertificatesBucket: s3.IBucket;
  readonly keycloakEcrRepositories: KeycloakEcrRepositories;

  constructor(scope: Construct, id: string, props: ArtifactsStackProps) {
    super(scope, id, props);

    this.keycloakCertificatesBucket = new SecureBucket(
      this,
      'CertificatesBucket',
      {
        alias: 'alias/keycloak/certificates-bucket',
        serverAccessLogsBucket: props.serverAccessLogsBucket,
        serverAccessLogsPrefix: 'keycloak-certificates-bucket',
      }
    );
    cdk.Tags.of(this.keycloakCertificatesBucket).add(
      'keycloak:name',
      'KeycloakCertificates'
    );

    this.keycloakEcrRepositories = new KeycloakEcrRepositories(
      this,
      'KeycloakEcrRepositories'
    );
  }
}
