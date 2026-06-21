#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { AwsSolutionsChecks } from 'cdk-nag';
import { ArtifactsStack } from '../lib/stacks/artifacts/artifacts-stack.js';
import { AuthenticationStack } from '../lib/stacks/auth/authentication-stack.js';
import { DatabaseStack } from '../lib/stacks/database/database-stack.js';
import { LoggingStack } from '../lib/stacks/logging/logging-stack.js';
import { NetworkStack } from '../lib/stacks/network/network-stack.js';
import packageJson from '../package.json' with { type: 'json' };

const app = new cdk.App();
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
cdk.Tags.of(app).add('keycloak:version', packageJson.version);

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1',
};

const { flowLogsBucket, serverAccessLogsBucket } = new LoggingStack(
  app,
  'Keycloak-LoggingStack',
  {
    description: 'Provisions shared logging infrastructure',
    env,
  }
);

const { keycloakVpc } = new NetworkStack(app, 'Keycloak-NetworkStack', {
  description: 'Provisions the Keycloak VPC and subnet infrastructure',
  env,
  flowLogsBucket,
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

const { keycloakCertificatesBucket, keycloakEcrRepositories } =
  new ArtifactsStack(app, 'Keycloak-ArtifactsStack', {
    description: 'Provisions shared artifacts used by the Keycloak stacks',
    env,
    serverAccessLogsBucket,
  });

new AuthenticationStack(app, 'Keycloak-AuthenticationStack', {
  description: 'Provisions the Keycloak authentication service',
  env,
  keycloakCertificatesBucket,
  keycloakDatabaseCluster,
  keycloakEcrRepositories,
  keycloakVpc,
  serverAccessLogsBucket,
});
