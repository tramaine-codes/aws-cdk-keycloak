import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import type { KeycloakVpc } from '../../../network/keycloak-vpc/keycloak-vpc.js';
import type { KeycloakFargateService } from '../keycloak-ecs-cluster/keycloak-fargate-service.js';

interface KeycloakNlbProps {
  networkVpc: KeycloakVpc;
  serverAccessLogsBucket: s3.IBucket;
}

export class KeycloakNlb extends Construct {
  private readonly listener: elbv2.NetworkListener;
  private readonly nlb: elbv2.NetworkLoadBalancer;
  private readonly securityGroup: ec2.ISecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    { networkVpc, serverAccessLogsBucket }: KeycloakNlbProps
  ) {
    super(scope, id);

    const { publicSubnets, vpc } = networkVpc;

    this.securityGroup = new ec2.SecurityGroup(this, 'EndpointSecurityGroup', {
      allowAllOutbound: false,
      description: 'Allow HTTPS from within the VPC to interface endpoints',
      vpc,
    });
    this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));

    this.nlb = new elbv2.NetworkLoadBalancer(this, 'Nlb', {
      internetFacing: true,
      loadBalancerName: 'keycloak-nlb',
      securityGroups: [this.securityGroup],
      vpc,
      vpcSubnets: { subnets: [...publicSubnets] },
    });

    this.nlb.logAccessLogs(serverAccessLogsBucket, 'keycloak-nlb');

    this.listener = this.nlb.addListener('Listener', {
      port: 443,
    });

    NagSuppressions.addResourceSuppressions(this.securityGroup, [
      {
        id: 'AwsSolutions-EC23',
        reason:
          'The NLB is internet-facing and must accept inbound HTTPS traffic on port 443 from any IP.',
      },
    ]);
  }

  get loadBalancerDnsName() {
    return this.nlb.loadBalancerDnsName;
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

    this.securityGroup.addEgressRule(serviceSecurityGroup, ec2.Port.tcp(8443));
    this.securityGroup.addEgressRule(serviceSecurityGroup, ec2.Port.tcp(9000));

    serviceSecurityGroup.addIngressRule(this.securityGroup, ec2.Port.tcp(8443));
    serviceSecurityGroup.addIngressRule(this.securityGroup, ec2.Port.tcp(9000));
  };
}
