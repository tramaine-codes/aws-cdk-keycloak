import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import type { KeycloakVpc } from './keycloak-vpc.js';

interface KeycloakVpcEndpointsProps {
  readonly networkVpc: KeycloakVpc;
}

export class KeycloakVpcEndpoints extends Construct {
  readonly s3PrefixListId: string;
  readonly vpcEndpointSecurityGroup: ec2.ISecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    {
      networkVpc: { applicationSubnets, endpointsSubnets, vpc },
    }: KeycloakVpcEndpointsProps
  ) {
    super(scope, id);

    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnets: [...applicationSubnets] }],
    });
    const { prefixListId } = ec2.PrefixList.fromLookup(this, 'S3PrefixList', {
      prefixListName: `com.amazonaws.${cdk.Stack.of(this).region}.s3`,
    });
    this.s3PrefixListId = prefixListId;

    this.vpcEndpointSecurityGroup = new ec2.SecurityGroup(
      this,
      'EndpointSecurityGroup',
      {
        allowAllOutbound: false,
        description: 'Allow HTTPS from within the VPC to interface endpoints',
        vpc,
      }
    );
    this.vpcEndpointSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.HTTPS
    );

    vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
      securityGroups: [this.vpcEndpointSecurityGroup],
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      subnets: { subnets: [...endpointsSubnets] },
    });

    vpc.addInterfaceEndpoint('EcrEndpoint', {
      securityGroups: [this.vpcEndpointSecurityGroup],
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      subnets: { subnets: [...endpointsSubnets] },
    });

    vpc.addInterfaceEndpoint('EcrDockerEndpoint', {
      securityGroups: [this.vpcEndpointSecurityGroup],
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      subnets: { subnets: [...endpointsSubnets] },
    });

    vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      securityGroups: [this.vpcEndpointSecurityGroup],
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnets: [...endpointsSubnets] },
    });

    NagSuppressions.addResourceSuppressions(this.vpcEndpointSecurityGroup, [
      {
        id: 'CdkNagValidationFailure',
        reason:
          'AwsSolutions-EC23 cannot evaluate the ingress source because it is the VPC CIDR resolved as a CloudFormation token (Fn::GetAtt CidrBlock). Ingress is restricted to the VPC CIDR on HTTPS, not 0.0.0.0/0, so the rule is not actually violated.',
      },
    ]);
  }
}
