import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PutObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type SnapshotStorageResult = {
  path: string;
  providerUrl?: string;
  remoteStored: boolean;
  sha256?: string;
  verifiedAt?: string;
  note?: string;
};

export interface SnapshotStorageAdapter {
  putObject(path: string, body: string, contentType: string): Promise<SnapshotStorageResult>;
}

export class LocalSnapshotStorageAdapter implements SnapshotStorageAdapter {
  constructor(private readonly rootDir = (process.env.VERCEL === "1" || process.env.VERCEL_ENV) ? "/tmp/smokecheck-snapshots" : (process.env.LOCAL_SNAPSHOT_STORAGE_DIR ?? ".local/smokecheck-source-snapshots")) {}

  async putObject(objectPath: string, body: string) {
    const safePath = objectPath.replace(/^\/+/, "");
    const destination = path.join(this.rootDir, safePath);
    // Ensure absolute path — process.cwd() is not used because Vercel has read-only filesystem
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, body, "utf8");

    const sha256 = createHash("sha256").update(body).digest("hex");

    return {
      path: `local://${this.rootDir}/${safePath}`,
      remoteStored: false,
      sha256,
      verifiedAt: new Date().toISOString(),
      note: "Stored in local fallback storage because remote object storage is not configured.",
    } satisfies SnapshotStorageResult;
  }
}

export type RemoteSnapshotStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

const IMMUTABLE_CACHE_CONTROL = "public, immutable, max-age=31536000";

export class RemoteSnapshotStorageAdapter implements SnapshotStorageAdapter {
  constructor(
    private readonly config: RemoteSnapshotStorageConfig = readRemoteStorageConfigFromEnv(),
    private readonly client: Pick<S3Client, "send"> = createS3Client(config),
  ) {}

  async putObject(objectPath: string, body: string, contentType: string) {
    const safePath = objectPath.replace(/^\/+/, "");
    const sha256 = createHash("sha256").update(body).digest("hex");

    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: safePath,
      Body: body,
      ContentType: contentType,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
      Metadata: {
        "smokecheck-sha256": sha256,
        "smokecheck-stored-at": new Date().toISOString(),
      },
    }));

    let verifiedAt: string | undefined;
    try {
      const head = await this.client.send(new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: safePath,
      }));
      const remoteHash = head.Metadata?.["smokecheck-sha256"];
      if (remoteHash === sha256) {
        verifiedAt = new Date().toISOString();
      }
    } catch {
      verifiedAt = undefined;
    }

    return {
      path: `s3://${this.config.bucket}/${safePath}`,
      providerUrl: toPathStyleProviderUrl(this.config.endpoint, this.config.bucket, safePath),
      remoteStored: true,
      sha256,
      verifiedAt,
    } satisfies SnapshotStorageResult;
  }
}

export function createSnapshotStorageAdapter(): SnapshotStorageAdapter {
  const remoteModeEnabled = process.env.SMOKECHECK_OBJECT_STORAGE_MODE === "remote";
  if (remoteModeEnabled || hasRemoteStorageEnvironment()) {
    return new RemoteSnapshotStorageAdapter();
  }
  return new LocalSnapshotStorageAdapter();
}

function createS3Client(config: RemoteSnapshotStorageConfig) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function readRemoteStorageConfigFromEnv(): RemoteSnapshotStorageConfig {
  return {
    endpoint: requireEnv("OBJECT_STORAGE_ENDPOINT"),
    region: requireEnv("OBJECT_STORAGE_REGION"),
    bucket: requireEnv("OBJECT_STORAGE_BUCKET"),
    accessKeyId: requireEnv("OBJECT_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("OBJECT_STORAGE_SECRET_ACCESS_KEY"),
    forcePathStyle: parseBooleanEnv("OBJECT_STORAGE_FORCE_PATH_STYLE", true),
  };
}

function hasRemoteStorageEnvironment() {
  return Boolean(
    process.env.OBJECT_STORAGE_ENDPOINT
      && process.env.OBJECT_STORAGE_REGION
      && process.env.OBJECT_STORAGE_BUCKET
      && process.env.OBJECT_STORAGE_ACCESS_KEY_ID
      && process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  );
}

function parseBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function toPathStyleProviderUrl(endpoint: string, bucket: string, key: string) {
  return `${endpoint.replace(/\/$/, "")}/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for remote snapshot storage.`);
  return value;
}
