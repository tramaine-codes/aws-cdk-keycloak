#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { AwsSolutionsChecks } from 'cdk-nag';
import { ArtifactsStack } from '../lib/artifacts/artifacts-stack.js';
import { AuthenticationStack } from '../lib/auth/authentication-stack.js';
import { DatabaseStack } from '../lib/database/database-stack.js';
import { NetworkStack } from '../lib/network/network-stack.js';

const app = new cdk.App();
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1',
};

const { keycloakVpc } = new NetworkStack(app, 'Keycloak-NetworkStack', {
  description: 'Provisions the Keycloak VPC and subnet infrastructure',
  env,
});

const { keycloakDatabaseCluster } = new DatabaseStack(
  app,
  'Keycloak-DatabaseStack',
  {
    description: 'Provisions the Keycloak database cluster',
    env,
    keycloakVpc,
  }
);

const { keycloakCertificatesBucket } = new ArtifactsStack(
  app,
  'Keycloak-ArtifactsStack',
  {
    description: 'Provisions shared artifacts used by the Keycloak stacks',
    env,
  }
);

new AuthenticationStack(app, 'Keycloak-AuthenticationStack', {
  description: 'Provisions the Keycloak authentication service',
  env,
  keycloakCertificatesBucket,
  keycloakDatabaseCluster,
  keycloakVpc,
});
