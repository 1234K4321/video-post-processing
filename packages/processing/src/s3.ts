import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import { pipeline } from "stream/promises";
import { env, resolveBucketName } from "./config";

const bucketName = resolveBucketName(env.RECORDINGS_S3_BUCKET);

export const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY
  }
});

export const putJson = async (key: string, value: unknown) => {
  const body = JSON.stringify(value, null, 2);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: "application/json"
    })
  );
};

export const uploadFile = async (key: string, filePath: string, contentType?: string) => {
  const stream = fs.createReadStream(filePath);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: stream,
      ContentType: contentType
    })
  );
};

export const downloadToFile = async (key: string, filePath: string) => {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    })
  );

  if (!response.Body) {
    throw new Error(`No body returned for ${key}`);
  }

  const writeStream = fs.createWriteStream(filePath);
  await pipeline(response.Body as NodeJS.ReadableStream, writeStream);
};

export const bucket = bucketName;
