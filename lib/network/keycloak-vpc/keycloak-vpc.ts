import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

export class KeycloakVpc extends Construct {
  readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      enableDnsHostnames: true,
      enableDnsSupport: true,
      ipAddresses: ec2.IpAddresses.cidr('10.16.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          mapPublicIpOnLaunch: true,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    NagSuppressions.addResourceSuppressions(this.vpc, [
      {
        id: 'AwsSolutions-VPC7',
        reason:
          'Flow logs are disabled to reduce cost. Enable if compliance or security monitoring requires VPC traffic analysis.',
      },
    ]);
  }

  get isolatedSubnets(): ReadonlyArray<ec2.ISubnet> {
    return this.vpc.selectSubnets({ subnetGroupName: 'Isolated' }).subnets;
  }

  get publicSubnets(): ReadonlyArray<ec2.ISubnet> {
    return this.vpc.selectSubnets({ subnetGroupName: 'Public' }).subnets;
  }
}
