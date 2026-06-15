import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { describe, test } from 'vitest';
import { KeycloakVpc } from '../../../../lib/network/keycloak-vpc/keycloak-vpc.js';

describe('KeycloakVpc', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack');
  new KeycloakVpc(stack, 'TestKeycloakVpc');
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
    template.resourceCountIs('AWS::EC2::Subnet', 4);
  });

  test('creates isolated subnets', () => {
    template.hasResourceProperties('AWS::EC2::Subnet', {
      CidrBlock: Match.stringLikeRegexp('/24$'),
      Tags: Match.arrayWith([
        Match.objectLike({ Key: 'aws-cdk:subnet-name', Value: 'Isolated' }),
      ]),
    });
  });
});
