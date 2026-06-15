import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import type { KeycloakVpc } from '../../../network/keycloak-vpc/keycloak-vpc.js';
import type { KeycloakFargateService } from '../keycloak-ecs-cluster/keycloak-fargate-service.js';

interface KeycloakNlbProps {
  networkVpc: KeycloakVpc;
}

export class KeycloakNlb extends Construct {
  readonly loadBalancerDnsName: string;

  private readonly listener: elbv2.NetworkListener;
  private readonly nlb: elbv2.NetworkLoadBalancer;

  constructor(scope: Construct, id: string, props: KeycloakNlbProps) {
    super(scope, id);

    const { networkVpc } = props;

    this.nlb = new elbv2.NetworkLoadBalancer(this, 'Nlb', {
      internetFacing: true,
      loadBalancerName: 'keycloak-nlb',
      vpc: networkVpc.vpc,
      vpcSubnets: { subnets: [...networkVpc.publicSubnets] },
    });

    this.nlb.connections.allowFromAnyIpv4(ec2.Port.tcp(443));

    this.loadBalancerDnsName = this.nlb.loadBalancerDnsName;

    this.listener = this.nlb.addListener('Listener', {
      port: 443,
    });

    NagSuppressions.addResourceSuppressions(this.nlb, [
      {
        id: 'AwsSolutions-ELB2',
        reason:
          'NLB access logs are disabled to minimize cost for a non-production workload.',
      },
    ]);

    NagSuppressions.addResourceSuppressions(
      this.nlb.connections.securityGroups[0],
      [
        {
          id: 'AwsSolutions-EC23',
          reason:
            'The NLB is internet-facing and must accept inbound HTTPS traffic on port 443 from any IP.',
        },
      ]
    );
  }

  addKeycloakTarget = ({
    loadBalancerTarget,
    serviceSecurityGroup,
  }: KeycloakFargateService) => {
    this.listener.addTargets('KeycloakTarget', {
      healthCheck: {
        enabled: true,
        path: '/health/ready',
        port: '9000',
        protocol: elbv2.Protocol.HTTPS,
      },
      port: 8443,
      protocol: elbv2.Protocol.TCP,
      targets: [loadBalancerTarget],
    });

    this.nlb.connections.allowTo(serviceSecurityGroup, ec2.Port.tcp(8080));
    this.nlb.connections.allowTo(serviceSecurityGroup, ec2.Port.tcp(8443));
    this.nlb.connections.allowTo(serviceSecurityGroup, ec2.Port.tcp(9000));
  };
}
