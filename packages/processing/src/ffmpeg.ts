import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";

export const getFfmpegPath = () => {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not resolve a path");
  }
  return ffmpegPath;
};

export const getFfprobePath = () => {
  if (!ffprobe.path) {
    throw new Error("ffprobe-static did not resolve a path");
  }
  return ffprobe.path;
};

export const runCommand = (cmd: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed (${code}): ${cmd} ${args.join(" ")}\n${stderr}`));
      }
    });
  });

export const runCommandCapture = (cmd: string, args: string[]) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout || stderr);
      } else {
        reject(new Error(`Command failed (${code}): ${cmd} ${args.join(" ")}\n${stderr}`));
      }
    });
  });
