import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  ECRClient,
  GetAuthorizationTokenCommand,
  ListTagsForResourceCommand,
  paginateDescribeRepositories,
  type Repository,
} from '@aws-sdk/client-ecr';
import { fromEnv } from '@aws-sdk/credential-providers';
import { Array as Arr, Console, Effect, Match, Option, Stream } from 'effect';
import { UnknownError } from 'effect/Cause';

const client = new ECRClient({ credentials: fromEnv() });
const tagName = 'keycloak:name';

interface Image {
  readonly digest: string;
  readonly repositoryTag: string;
  readonly source: string;
  readonly version: string;
}

// name -> version -> digest, pinned. Upgrading an image means bumping its
// version and digest together here. Digests are multi-arch index digests so
// Fargate selects the right architecture.
const images: ReadonlyArray<Image> = [
  {
    digest:
      'sha256:dea26401d06341095cc4ea9d66896200b55de5ca1daa1d2fcbe58493afa6e0ad',
    repositoryTag: 'Keycloak',
    source: 'quay.io/keycloak/keycloak',
    version: '26.6.1',
  },
  {
    digest:
      'sha256:01be46681e0bd75da54c2ca7c4edad9ecd29499f664cac5f6cbf0a189d67d0f3',
    repositoryTag: 'AwsCli',
    source: 'docker.io/amazon/aws-cli',
    version: '2.35.9',
  },
];

interface Credentials {
  readonly creds: string;
  readonly password: string;
  readonly registry: string;
}

const execFileAsync = promisify(execFile);

// promisify(execFile) rejects on a non-zero exit, which Effect.tryPromise
// surfaces as a failure, so no manual exit-code handling is needed.
const run = (command: string, args: ReadonlyArray<string>) =>
  Effect.tryPromise(() => execFileAsync(command, [...args]));

const hasTag = (
  tags: ReadonlyArray<{ readonly Key?: string; readonly Value?: string }>,
  value: string
) => Arr.some(tags, ({ Key, Value }) => Key === tagName && Value === value);

// The decoded ECR token is "AWS:<password>", which is exactly the user:password
// form skopeo's --dest-creds expects; the password alone is sliced off for
// docker login. Both pass the short-lived token on argv; prefer --password-stdin
// for hardened/CI use.
const authenticate = () =>
  Effect.gen(function* () {
    const { authorizationData } = yield* Effect.tryPromise(() =>
      client.send(new GetAuthorizationTokenCommand())
    );
    const data = yield* Effect.fromNullishOr(authorizationData);
    const { authorizationToken, proxyEndpoint } = yield* Effect.fromOption(
      Arr.head(data)
    );
    const token = yield* Effect.fromNullishOr(authorizationToken);
    const registry = yield* Effect.fromNullishOr(proxyEndpoint);
    const creds = Buffer.from(token, 'base64').toString();

    return { creds, password: creds.slice('AWS:'.length), registry };
  });

const hasRepositoryTag = (
  { repositoryArn: resourceArn }: Repository,
  tagValue: string
) =>
  Effect.tryPromise(() =>
    client.send(
      new ListTagsForResourceCommand({
        resourceArn,
      })
    )
  ).pipe(
    Effect.map(({ tags }) =>
      Option.fromNullishOr(tags).pipe(
        Option.andThen((tag) => hasTag(tag, tagValue)),
        Option.getOrElse(() => false)
      )
    )
  );

const findRepositoryUriByTag = (tagValue: string) =>
  Stream.fromAsyncIterable(
    paginateDescribeRepositories({ client }, {}),
    (error) => new UnknownError(error)
  ).pipe(
    Stream.flatMap(({ repositories }) =>
      Stream.fromIterable(
        Option.fromNullishOr(repositories).pipe(
          Option.getOrElse(() => Arr.empty<Repository>())
        )
      )
    ),
    Stream.filterEffect((repository) => hasRepositoryTag(repository, tagValue)),
    Stream.runHead,
    Effect.andThen((repository) => Effect.fromOption(repository)),
    Effect.andThen(({ repositoryUri }) => Effect.fromNullishOr(repositoryUri)),
    Effect.tapErrorTag('NoSuchElementError', () =>
      Console.log(
        `no repository found with tag '${tagName}' set to '${tagValue}'`
      )
    )
  );

const copyImageWithDocker = (
  credentials: Credentials,
  source: string,
  destination: string
) =>
  Effect.all(
    [
      run('docker', [
        'login',
        credentials.registry,
        '--username',
        'AWS',
        '--password',
        credentials.password,
      ]),
      // Copy the manifest list as-is, preserving multi-arch and the source
      // digest. A plain pull/tag/push would flatten it to a single architecture
      // and land it under a different digest than the task definition pins.
      run('docker', [
        'buildx',
        'imagetools',
        'create',
        '--tag',
        destination,
        source,
      ]),
    ],
    { concurrency: 1 }
  ).pipe(Effect.asVoid);

const copyImageWithSkopeo = (
  credentials: Credentials,
  source: string,
  destination: string
) =>
  run('skopeo', [
    'copy',
    // Copy the whole multi-arch index as-is: avoids host-platform matching
    // (the source is linux-only, the host may be darwin) and preserves the
    // index digest so it matches the digest the task definition pins.
    '--all',
    '--dest-creds',
    credentials.creds,
    `docker://${source}`,
    `docker://${destination}`,
  ]).pipe(Effect.asVoid);

const copyImage = (
  tool: string,
  credentials: Credentials,
  image: Image,
  repositoryUri: string
) => {
  const source = `${image.source}@${image.digest}`;
  const destination = `${repositoryUri}:${image.version}`;

  return Match.value(tool)
    .pipe(
      Match.when('docker', () =>
        copyImageWithDocker(credentials, source, destination)
      ),
      Match.orElse(() => copyImageWithSkopeo(credentials, source, destination))
    )
    .pipe(
      Effect.tap(() =>
        Console.log(
          `mirrored ${image.source}:${image.version} -> ${destination}`
        )
      )
    );
};

const mirror = (tool: string, credentials: Credentials, image: Image) =>
  Effect.gen(function* () {
    const repositoryUri = yield* findRepositoryUriByTag(image.repositoryTag);
    yield* copyImage(tool, credentials, image, repositoryUri);
  });

const program = Effect.gen(function* () {
  const tool = Option.fromNullishOr(process.env.IMAGE_COPY_TOOL).pipe(
    Option.getOrElse(() => 'skopeo')
  );
  const credentials = yield* authenticate();

  yield* Effect.forEach(images, (image) => mirror(tool, credentials, image));
});

Effect.runPromise(program);
