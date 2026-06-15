import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import type { KeycloakCluster } from '../../../database/keycloak-cluster/keycloak-cluster.js';

interface KeycloakTaskDefinitionProps {
  certificatesBucket: s3.IBucket;
  databaseCluster: KeycloakCluster;
  hostname: string;
}

export class KeycloakTaskDefinition extends Construct {
  readonly taskDefinition: ecs.FargateTaskDefinition;

  private readonly certsMountPath = '/opt/keycloak/conf/certs';
  private readonly certsVolumeName = 'certs';

  constructor(
    scope: Construct,
    id: string,
    props: KeycloakTaskDefinitionProps
  ) {
    super(scope, id);

    const { certificatesBucket, databaseCluster, hostname } = props;

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    certificatesBucket.grantRead(taskRole);

    this.taskDefinition = new ecs.FargateTaskDefinition(
      this,
      'TaskDefinition',
      {
        cpu: 512,
        memoryLimitMiB: cdk.Size.gibibytes(1).toMebibytes(),
        taskRole,
      }
    );

    this.taskDefinition.addVolume({ name: this.certsVolumeName });

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    const initContainer = this.addInitContainer(certificatesBucket, logGroup);
    this.addKeycloakContainer(
      databaseCluster,
      hostname,
      initContainer,
      logGroup
    );

    NagSuppressions.addResourceSuppressions(
      taskRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'The task role requires read access to all objects in the dedicated certificates bucket to retrieve TLS certificate files.',
        },
      ],
      true
    );

    NagSuppressions.addResourceSuppressions(
      this.taskDefinition,
      [
        {
          id: 'AwsSolutions-ECS2',
          reason:
            'Non-sensitive Keycloak configuration values (database URL, port, name, username, and TLS paths) are provided as plaintext environment variables. Sensitive values (passwords) are already managed via Secrets Manager.',
        },
      ],
      true
    );
  }

  private addInitContainer(
    { bucketName }: s3.IBucket,
    logGroup: logs.ILogGroup
  ): ecs.ContainerDefinition {
    const container = this.taskDefinition.addContainer('init-certs', {
      command: ['s3', 'sync', `s3://${bucketName}`, this.certsMountPath],
      essential: false,
      image: ecs.ContainerImage.fromRegistry('amazon/aws-cli'),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: 'init-certs',
      }),
    });

    container.addMountPoints({
      containerPath: this.certsMountPath,
      readOnly: false,
      sourceVolume: this.certsVolumeName,
    });

    return container;
  }

  private addKeycloakContainer = (
    databaseCluster: KeycloakCluster,
    hostname: string,
    initContainer: ecs.ContainerDefinition,
    logGroup: logs.ILogGroup
  ) => {
    const adminSecret = new secretsmanager.Secret(this, 'AdminSecret', {
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    const { hostname: databaseHostname, port: databasePort } =
      databaseCluster.clusterEndpoint();
    const databaseSecret = databaseCluster.secret();

    const container = this.taskDefinition.addContainer('keycloak', {
      command: ['start'],
      environment: {
        KC_BOOTSTRAP_ADMIN_USERNAME: 'admin',
        KC_CACHE: 'local',
        KC_DB: 'postgres',
        KC_DB_URL_DATABASE: 'keycloak',
        KC_DB_URL_HOST: databaseHostname,
        KC_DB_URL_PORT: databasePort.toString(),
        KC_DB_USERNAME: 'keycloak',
        KC_HEALTH_ENABLED: 'true',
        KC_HOSTNAME: hostname,
        KC_HTTP_ENABLED: 'true',
        KC_HTTPS_CERTIFICATE_FILE: `${this.certsMountPath}/upstream.cert.pem`,
        KC_HTTPS_CERTIFICATE_KEY_FILE: `${this.certsMountPath}/upstream.key.pem`,
      },
      image: ecs.ContainerImage.fromRegistry(
        'quay.io/keycloak/keycloak:26.6.1'
      ),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: 'keycloak',
      }),
      portMappings: [
        { containerPort: 8080 },
        { containerPort: 8443 },
        { containerPort: 9000 },
      ],
      secrets: {
        KC_BOOTSTRAP_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(adminSecret),
        KC_DB_PASSWORD: ecs.Secret.fromSecretsManager(
          databaseSecret,
          'password'
        ),
      },
    });

    container.addMountPoints({
      containerPath: this.certsMountPath,
      readOnly: true,
      sourceVolume: this.certsVolumeName,
    });

    container.addContainerDependencies({
      condition: ecs.ContainerDependencyCondition.SUCCESS,
      container: initContainer,
    });

    NagSuppressions.addResourceSuppressions(adminSecret, [
      {
        id: 'AwsSolutions-SMG4',
        reason:
          'Automatic secret rotation is disabled because this is not a production workload.',
      },
    ]);
  };
}
