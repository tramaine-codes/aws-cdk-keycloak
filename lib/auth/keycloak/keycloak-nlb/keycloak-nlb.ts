import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import type { KeycloakVpc } from '../../../network/keycloak-vpc/keycloak-vpc.js';

interface KeycloakNlbProps {
  networkVpc: KeycloakVpc;
}

export class KeycloakNlb extends Construct {
  readonly loadBalancerDnsName: string;

  private readonly listener: elbv2.NetworkListener;
  private readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props: KeycloakNlbProps) {
    super(scope, id);

    const { networkVpc } = props;
    this.vpc = networkVpc.vpc;

    const nlb = new elbv2.NetworkLoadBalancer(this, 'Nlb', {
      internetFacing: true,
      vpc: this.vpc,
      vpcSubnets: { subnets: [...networkVpc.publicSubnets] },
    });

    this.loadBalancerDnsName = nlb.loadBalancerDnsName;

    this.listener = nlb.addListener('Listener', {
      port: 443,
    });

    NagSuppressions.addResourceSuppressions(nlb, [
      {
        id: 'AwsSolutions-ELB2',
        reason:
          'NLB access logs are disabled to minimize cost for a non-production workload.',
      },
    ]);
  }

  addTarget(
    service: ecs.FargateService,
    serviceSecurityGroup: ec2.ISecurityGroup
  ): void {
    this.listener.addTargets('KeycloakTarget', {
      healthCheck: {
        enabled: true,
        path: '/health/ready',
        port: '8080',
        protocol: elbv2.Protocol.HTTP,
      },
      port: 8443,
      protocol: elbv2.Protocol.TCP,
      targets: [service],
    });

    serviceSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(8080)
    );

    serviceSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(8443)
    );
  }
}
