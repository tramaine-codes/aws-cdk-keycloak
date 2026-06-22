import * as cdk from 'aws-cdk-lib';
import type * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as logs from 'aws-cdk-lib/aws-logs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { SecureLogGroup } from '../../../../constructs/logs/secure-log-group.js';
import type { KeycloakEcrRepositories } from '../../../artifacts/keycloak-ecr-repositories/keycloak-ecr-repositories.js';
import type { KeycloakCluster } from '../../../database/keycloak-cluster/keycloak-cluster.js';

// Pinned multi-arch index digests; mirrored into ECR by scripts/upload-images.ts.
const awsCliImageDigest =
  'sha256:01be46681e0bd75da54c2ca7c4edad9ecd29499f664cac5f6cbf0a189d67d0f3';
const keycloakImageDigest =
  'sha256:dea26401d06341095cc4ea9d66896200b55de5ca1daa1d2fcbe58493afa6e0ad';

interface KeycloakTaskDefinitionProps {
  certificatesBucket: s3.IBucket;
  databaseCluster: KeycloakCluster;
  hostname: string;
  keycloakEcrRepositories: KeycloakEcrRepositories;
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
    const { awsCliEcrRepository, keycloakEcrRepository } =
      props.keycloakEcrRepositories;

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

    const logGroup = new SecureLogGroup(this, 'LogGroup', {
      keyAlias: 'alias/keycloak/logs/keycloak-task',
    });

    const initContainer = this.addInitContainer(
      awsCliEcrRepository,
      certificatesBucket,
      logGroup
    );
    this.addKeycloakContainer(
      keycloakEcrRepository,
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
      this.taskDefinition.obtainExecutionRole(),
      [
        {
          appliesTo: ['Resource::*'],
          id: 'AwsSolutions-IAM5',
          reason:
            'ecr:GetAuthorizationToken is account-scoped and cannot target a resource; it is required for the execution role to pull the Keycloak and aws-cli images from ECR.',
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
    awsCliRepository: ecr.IRepository,
    { bucketName }: s3.IBucket,
    logGroup: logs.ILogGroup
  ): ecs.ContainerDefinition {
    const initContainer = this.taskDefinition.addContainer('init-certs', {
      command: ['s3', 'sync', `s3://${bucketName}`, this.certsMountPath],
      essential: false,
      image: ecs.ContainerImage.fromEcrRepository(
        awsCliRepository,
        awsCliImageDigest
      ),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: 'init-certs',
      }),
    });

    initContainer.addMountPoints({
      containerPath: this.certsMountPath,
      readOnly: false,
      sourceVolume: this.certsVolumeName,
    });

    return initContainer;
  }

  private addKeycloakContainer = (
    keycloakRepository: ecr.IRepository,
    databaseCluster: KeycloakCluster,
    hostname: string,
    initContainer: ecs.ContainerDefinition,
    logGroup: logs.ILogGroup
  ) => {
    const adminSecret = new secretsmanager.Secret(this, 'AdminSecret', {
      description: 'Keycloak bootstrap admin username and password.',
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    const { hostname: databaseHostname, port: databasePort } =
      databaseCluster.clusterEndpoint();
    const databaseSecret = databaseCluster.secret();

    const keycloakContainer = this.taskDefinition.addContainer('keycloak', {
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
      image: ecs.ContainerImage.fromEcrRepository(
        keycloakRepository,
        keycloakImageDigest
      ),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: 'keycloak',
      }),
      portMappings: [{ containerPort: 8443 }, { containerPort: 9000 }],
      secrets: {
        KC_BOOTSTRAP_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(adminSecret),
        KC_DB_PASSWORD: ecs.Secret.fromSecretsManager(
          databaseSecret,
          'password'
        ),
      },
    });

    keycloakContainer.addMountPoints({
      containerPath: this.certsMountPath,
      readOnly: true,
      sourceVolume: this.certsVolumeName,
    });

    keycloakContainer.addContainerDependencies({
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
