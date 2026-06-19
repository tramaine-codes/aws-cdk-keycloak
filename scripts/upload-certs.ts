import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type Bucket,
  GetBucketTaggingCommand,
  paginateListBuckets,
  S3Client,
} from '@aws-sdk/client-s3';
import { fromEnv } from '@aws-sdk/credential-providers';
import { Upload } from '@aws-sdk/lib-storage';
import { Array as Arr, Console, Effect, Match, Option, Stream } from 'effect';
import { UnknownError } from 'effect/Cause';
import { packageDirectory } from 'package-directory';

const client = new S3Client({ credentials: fromEnv() });
const tag = 'keycloak:name';
const tagValue = 'KeycloakCertificates';

const hasTag = (
  tags: ReadonlyArray<{ Key?: string; Value?: string }>,
  tagValue: string
) => Arr.some(tags, ({ Key, Value }) => Key === tag && Value === tagValue);

const rootDir = () =>
  Effect.gen(function* () {
    const dir = yield* Effect.tryPromise(() => packageDirectory());
    return yield* Effect.fromNullishOr(dir);
  });

const certsDir = () =>
  Effect.gen(function* () {
    const root = yield* rootDir();
    return path.join(root, 'certs');
  });

const listFiles = (
  dir: string
): Effect.Effect<ReadonlyArray<string>, UnknownError> =>
  Effect.gen(function* () {
    const files = yield* Effect.tryPromise(() => fs.readdir(dir));
    return Arr.map(files, (file) => path.join(dir, file));
  });

const findBucketByTag = (tagValue: string) =>
  Stream.fromAsyncIterable(
    paginateListBuckets({ client }, {}),
    (error) => new UnknownError(error)
  ).pipe(
    Stream.flatMap(({ Buckets }) =>
      Stream.fromIterable(
        Option.fromNullishOr(Buckets).pipe(
          Option.getOrElse(() => Arr.empty<Bucket>())
        )
      )
    ),
    Stream.filterEffect(({ Name: Bucket }) =>
      Effect.tryPromise(() =>
        client.send(new GetBucketTaggingCommand({ Bucket }))
      ).pipe(
        Effect.map(({ TagSet }) =>
          Option.fromNullishOr(TagSet).pipe(
            Option.andThen((tagSet) => hasTag(tagSet, tagValue)),
            Option.getOrElse(() => false)
          )
        ),
        Effect.catchTag('UnknownError', (error) =>
          Match.value(error.cause).pipe(
            Match.when({ name: 'NoSuchTagSet' }, () =>
              Console.log(`no tags found for ${Bucket}`).pipe(Effect.as(false))
            ),
            Match.orElse(() => Effect.fail(error))
          )
        )
      )
    ),
    Stream.runHead,
    Effect.andThen((bucket) => Effect.fromOption(bucket)),
    Effect.andThen(({ Name }) => Effect.fromNullishOr(Name)),
    Effect.tapErrorTag('NoSuchElementError', () =>
      Console.log(
        `no bucket found with tag named '${tag}' set to '${tagValue}'`
      )
    )
  );

const uploadFile = (file: string, bucket: string) =>
  Effect.tryPromise(async () => {
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Body: createReadStream(file),
        Key: path.basename(file),
      },
    });

    await upload.done();
  }).pipe(Effect.tap(() => Console.log(`uploaded ${file} to s3://${bucket}`)));

const uploadFiles = (files: ReadonlyArray<string>, bucket: string) =>
  Effect.all(
    Arr.map(files, (file) => uploadFile(file, bucket)),
    {
      concurrency: 'unbounded',
    }
  ).pipe(Effect.asVoid);

const program = Effect.gen(function* () {
  const dir = yield* certsDir();
  const files = yield* listFiles(dir);
  const bucket = yield* findBucketByTag(tagValue);

  yield* uploadFiles(files, bucket);
});

Effect.runPromise(program);
