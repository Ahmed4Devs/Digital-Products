import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ServerEnv } from "@/lib/env/schema";

// Thin wrapper over the S3 API (MinIO locally, Cloudflare R2 in production). Pending
// uploads and product files live in the private bucket; only verified images are copied
// to the public bucket.

export type StorageConfig = Pick<
  ServerEnv,
  | "S3_ENDPOINT"
  | "S3_REGION"
  | "S3_ACCESS_KEY_ID"
  | "S3_SECRET_ACCESS_KEY"
  | "S3_BUCKET_PRIVATE"
  | "S3_BUCKET_PUBLIC"
>;

export type Bucket = "private" | "public";

export type StoredObject = {
  sizeBytes: number;
  /** ETag without quotes: the MD5 of single-part uploads. */
  etag: string;
  contentType: string | null;
};

export type Storage = ReturnType<typeof createStorage>;

export function createStorage(config: StorageConfig) {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
    // MinIO and R2 both serve path-style URLs; virtual hosts need extra DNS.
    forcePathStyle: true,
    // Default CRC checksums would be signed into pre-signed URLs, which browsers cannot
    // compute, and R2 rejects some of them. Only send checksums an operation requires.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  const buckets: Record<Bucket, string> = {
    private: config.S3_BUCKET_PRIVATE,
    public: config.S3_BUCKET_PUBLIC,
  };

  return {
    /**
     * Pre-signed PUT URL for a browser upload. Content-Type and Content-Length are part
     * of the signature, so storage rejects a body of another type or size.
     */
    async presignUpload(options: {
      key: string;
      contentType: string;
      contentLength: number;
      expiresInSeconds: number;
    }): Promise<string> {
      const command = new PutObjectCommand({
        Bucket: buckets.private,
        Key: options.key,
        ContentType: options.contentType,
        ContentLength: options.contentLength,
      });
      return getSignedUrl(client, command, {
        expiresIn: options.expiresInSeconds,
        // Signed explicitly: the presigner leaves Content-Type unsigned by default.
        signableHeaders: new Set(["content-type"]),
      });
    },

    /** Pre-signed GET that downloads as an attachment under the given name. */
    async presignDownload(options: {
      key: string;
      contentDisposition: string;
      contentType: string;
      expiresInSeconds: number;
    }): Promise<string> {
      const command = new GetObjectCommand({
        Bucket: buckets.private,
        Key: options.key,
        ResponseContentDisposition: options.contentDisposition,
        ResponseContentType: options.contentType,
      });
      return getSignedUrl(client, command, { expiresIn: options.expiresInSeconds });
    },

    /** Object metadata as reported by storage, or null when the object does not exist. */
    async head(bucket: Bucket, key: string): Promise<StoredObject | null> {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: buckets[bucket], Key: key }),
        );
        return {
          sizeBytes: result.ContentLength ?? 0,
          etag: (result.ETag ?? "").replaceAll('"', ""),
          contentType: result.ContentType ?? null,
        };
      } catch (error) {
        if (error instanceof NotFound) return null;
        if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
          return null;
        throw error;
      }
    },

    /** The first `length` bytes of an object (or all of it when shorter). */
    async readStart(bucket: Bucket, key: string, length: number): Promise<Uint8Array> {
      const result = await client.send(
        new GetObjectCommand({ Bucket: buckets[bucket], Key: key, Range: `bytes=0-${length - 1}` }),
      );
      return (await result.Body?.transformToByteArray()) ?? new Uint8Array();
    },

    /** Server-side copy; storage never sends the bytes through the app. */
    async copy(options: {
      from: { bucket: Bucket; key: string };
      to: { bucket: Bucket; key: string };
      contentType: string;
      cacheControl?: string;
    }): Promise<StoredObject> {
      await client.send(
        new CopyObjectCommand({
          Bucket: buckets[options.to.bucket],
          Key: options.to.key,
          CopySource: `${buckets[options.from.bucket]}/${options.from.key}`,
          MetadataDirective: "REPLACE",
          ContentType: options.contentType,
          CacheControl: options.cacheControl,
        }),
      );
      const copied = await this.head(options.to.bucket, options.to.key);
      if (!copied) throw new Error("Copied object is missing");
      return copied;
    },

    async delete(bucket: Bucket, key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: buckets[bucket], Key: key }));
    },

    /** Keys under a prefix in the private bucket last modified before `before`. */
    async listOlderThan(prefix: string, before: Date): Promise<string[]> {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: buckets.private,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const object of page.Contents ?? []) {
          if (object.Key && object.LastModified && object.LastModified < before)
            keys.push(object.Key);
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
      return keys;
    },
  };
}
