import { Match, Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib/core';
import { describe, test } from 'vitest';
import { KeycloakVpc } from '../../../../lib/stacks/network/keycloak-vpc/keycloak-vpc.js';

describe('KeycloakVpc', () => {
  const app = new cdk.App();
  // A placeholder account keeps the stack environment-specific (so synth runs)
  // while avoiding real lookups: the AZ and S3 prefix-list context providers
  // return dummy values during synth, so no AWS credentials are needed.
  const stack = new cdk.Stack(app, 'TestStack', {
    env: { account: '000000000000', region: 'us-east-1' },
  });
  const flowLogsBucket = new s3.Bucket(stack, 'FlowLogsBucket');
  new KeycloakVpc(stack, 'TestKeycloakVpc', { flowLogsBucket });
  const template = Template.fromStack(stack);

  test('creates a VPC', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
  });

  test('uses an explicit CIDR block', () => {
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.16.0.0/16',
    });
  });

  test('enables DNS hostnames and support', () => {
    template.hasResourceProperties('AWS::EC2::VPC', {
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
    });
  });

  test('configures 2 AZs', () => {
    template.resourceCountIs('AWS::EC2::Subnet', 8);
  });

  test('creates isolated subnets', () => {
    template.hasResourceProperties('AWS::EC2::Subnet', {
      CidrBlock: Match.stringLikeRegexp('/24$'),
      Tags: Match.arrayWith([
        Match.objectLike({ Key: 'aws-cdk:subnet-type', Value: 'Isolated' }),
      ]),
    });
  });
});
