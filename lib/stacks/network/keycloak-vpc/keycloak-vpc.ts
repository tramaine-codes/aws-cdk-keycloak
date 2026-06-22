import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { SecureLogGroup } from '../../../constructs/logs/secure-log-group.js';
import { KeycloakVpcEndpoints } from './keycloak-vpc-endpoints.js';

const SubnetName = {
  APPLICATION: 'Application',
  DATABASE: 'Database',
  ENDPOINTS: 'Endpoints',
  PUBLIC: 'Public',
} as const;

interface KeycloakVpcProps {
  readonly flowLogsBucket: s3.IBucket;
}

export class KeycloakVpc extends Construct {
  readonly vpc: ec2.IVpc;

  private readonly vpcEndpoints: KeycloakVpcEndpoints;

  constructor(scope: Construct, id: string, props: KeycloakVpcProps) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      enableDnsHostnames: true,
      enableDnsSupport: true,
      ipAddresses: ec2.IpAddresses.cidr('10.16.0.0/16'),
      maxAzs: 2,
      restrictDefaultSecurityGroup: true,
      // Ordered largest CIDR first to pack address space without gaps.
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: SubnetName.APPLICATION,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 24,
          name: SubnetName.DATABASE,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 28,
          name: SubnetName.PUBLIC,
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 28,
          name: SubnetName.ENDPOINTS,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });
    // Tag the VPC resource directly to avoid cascading to subnets and NAT gateways.
    // biome-ignore lint/style/noNonNullAssertion: defaultChild is guaranteed for L2 constructs backed by a single CFN resource.
    cdk.Tags.of(this.vpc.node.defaultChild!).add('keycloak:name', 'NetworkVpc');

    const flowLogGroup = new SecureLogGroup(this, 'FlowLogGroup', {
      keyAlias: 'alias/keycloak/logs/vpc-flow',
    });
    this.vpc.addFlowLog('CloudWatchFlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });
    this.vpc.addFlowLog('S3FlowLog', {
      destination: ec2.FlowLogDestination.toS3(
        props.flowLogsBucket,
        'keycloak-vpc-flow-logs'
      ),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    this.vpcEndpoints = new KeycloakVpcEndpoints(this, 'Endpoint', {
      networkVpc: this,
    });
  }

  get s3PrefixListId() {
    return this.vpcEndpoints.s3PrefixListId;
  }

  get vpcEndpointSecurityGroup() {
    return this.vpcEndpoints.vpcEndpointSecurityGroup;
  }

  get applicationSubnets(): ReadonlyArray<ec2.ISubnet> {
    return this.vpc.selectSubnets({ subnetGroupName: SubnetName.APPLICATION })
      .subnets;
  }

  get databaseSubnets(): ReadonlyArray<ec2.ISubnet> {
    return this.vpc.selectSubnets({ subnetGroupName: SubnetName.DATABASE })
      .subnets;
  }

  get endpointsSubnets(): ReadonlyArray<ec2.ISubnet> {
    return this.vpc.selectSubnets({ subnetGroupName: SubnetName.ENDPOINTS })
      .subnets;
  }

  get publicSubnets(): ReadonlyArray<ec2.ISubnet> {
    return this.vpc.selectSubnets({ subnetGroupName: SubnetName.PUBLIC })
      .subnets;
  }
}
