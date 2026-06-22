import * as cdk from 'aws-cdk-lib';
import type * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { SecureEcrRepository } from '../../../constructs/ecr/secure-ecr-repository.js';

export class KeycloakEcrRepositories extends Construct {
  readonly awsCliEcrRepository: ecr.IRepository;
  readonly keycloakEcrRepository: ecr.IRepository;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.awsCliEcrRepository = new SecureEcrRepository(this, 'AwsCli', {
      keyAlias: 'alias/keycloak/ecr/aws-cli',
    });
    cdk.Tags.of(this.awsCliEcrRepository).add('keycloak:name', 'AwsCli');

    this.keycloakEcrRepository = new SecureEcrRepository(this, 'Keycloak', {
      keyAlias: 'alias/keycloak/ecr/keycloak',
    });
    cdk.Tags.of(this.keycloakEcrRepository).add('keycloak:name', 'Keycloak');
  }
}
