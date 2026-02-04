import dotenv from "dotenv";
import fs from "fs";
import path from "path";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "..", "..", ".env")
];

for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

type RequiredEnv = {
  LIVEKIT_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  RECORDINGS_S3_BUCKET: string;
  DATABASE_URL: string;
  GEMINI_API_KEY: string;
  HUGGINGFACE_ACCESS_TOKEN: string;
};

const getEnv = (key: keyof RequiredEnv, fallback?: string) => {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing env var: ${key}`);
  }
  return value;
};

export const env = {
  LIVEKIT_URL: getEnv("LIVEKIT_URL"),
  LIVEKIT_API_KEY: getEnv("LIVEKIT_API_KEY"),
  LIVEKIT_API_SECRET: getEnv("LIVEKIT_API_SECRET"),
  AWS_REGION: getEnv("AWS_REGION"),
  AWS_ACCESS_KEY_ID: getEnv("AWS_ACCESS_KEY_ID"),
  AWS_SECRET_ACCESS_KEY: getEnv("AWS_SECRET_ACCESS_KEY"),
  RECORDINGS_S3_BUCKET: getEnv("RECORDINGS_S3_BUCKET"),
  DATABASE_URL: getEnv("DATABASE_URL"),
  GEMINI_API_KEY: getEnv("GEMINI_API_KEY"),
  HUGGINGFACE_ACCESS_TOKEN: getEnv("HUGGINGFACE_ACCESS_TOKEN")
};

export const resolveBucketName = (bucket: string) => {
  if (bucket.startsWith("arn:")) {
    const parts = bucket.split(":::");
    return parts[1] ?? bucket;
  }
  return bucket;
};
