import * as cdk from 'aws-cdk-lib';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { SecureBucket } from '../../../constructs/s3/secure-bucket.js';

interface KeycloakCertificatesProps {
  readonly serverAccessLogsBucket: s3.IBucket;
}

export class KeycloakCertificates extends Construct {
  readonly bucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: KeycloakCertificatesProps) {
    super(scope, id);

    this.bucket = new SecureBucket(this, 'Bucket', {
      keyAlias: 'alias/keycloak/s3/certificates-bucket',
      serverAccessLogsBucket: props.serverAccessLogsBucket,
      serverAccessLogsPrefix: 'keycloak-certificates-bucket',
    });
    cdk.Tags.of(this.bucket).add('keycloak:name', 'KeycloakCertificates');
  }
}
