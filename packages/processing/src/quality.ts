import { getFfmpegPath, getFfprobePath, runCommandCapture } from "./ffmpeg";
import { QualityMetrics } from "./types";

const parseFraction = (value?: string) => {
  if (!value) return null;
  const parts = value.split("/");
  if (parts.length !== 2) return Number(value) || null;
  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);
  if (!denominator) return null;
  return numerator / denominator;
};

const parseFfprobe = (data: string) => {
  const parsed = JSON.parse(data);
  const videoStream = parsed.streams?.find((s: any) => s.codec_type === "video");
  const audioStream = parsed.streams?.find((s: any) => s.codec_type === "audio");

  const fps = parseFraction(videoStream?.r_frame_rate);

  return {
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    fps: fps ? Number(fps) : null,
    duration: parsed.format?.duration ? Number(parsed.format.duration) : null,
    videoBitrateKbps: videoStream?.bit_rate ? Number(videoStream.bit_rate) / 1000 : null,
    audioBitrateKbps: audioStream?.bit_rate ? Number(audioStream.bit_rate) / 1000 : null
  };
};

const parseVolumedetect = (data: string) => {
  const meanMatch = data.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  const maxMatch = data.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  return {
    mean: meanMatch ? Number(meanMatch[1]) : null,
    max: maxMatch ? Number(maxMatch[1]) : null
  };
};

export const computeQualityMetrics = async (videoPath: string): Promise<QualityMetrics> => {
  const ffprobePath = getFfprobePath();
  const ffmpegPath = getFfmpegPath();

  const probeOutput = await runCommandCapture(ffprobePath, [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    videoPath
  ]);

  const { width, height, fps, duration, videoBitrateKbps, audioBitrateKbps } = parseFfprobe(
    probeOutput
  );

  const volumeOutput = await runCommandCapture(ffmpegPath, [
    "-i",
    videoPath,
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-"
  ]);

  const { mean, max } = parseVolumedetect(volumeOutput);
  const snrEstimate = mean !== null ? mean - -60 : null;

  const flags = [
    {
      metric: "resolution_width",
      value: width,
      threshold: 1280,
      flagged: width !== null ? width < 1280 : true
    },
    {
      metric: "resolution_height",
      value: height,
      threshold: 720,
      flagged: height !== null ? height < 720 : true
    },
    {
      metric: "fps",
      value: fps,
      threshold: 24,
      flagged: fps !== null ? fps < 24 : true
    },
    {
      metric: "audio_mean_volume_db",
      value: mean,
      threshold: -30,
      flagged: mean !== null ? mean < -30 : true
    },
    {
      metric: "audio_max_volume_db",
      value: max,
      threshold: -1,
      flagged: max !== null ? max > -1 : false
    },
    {
      metric: "audio_snr_estimate_db",
      value: snrEstimate,
      threshold: 20,
      flagged: snrEstimate !== null ? snrEstimate < 20 : true
    }
  ];

  const score = Math.max(0, 100 - flags.filter((flag) => flag.flagged).length * 12);

  return {
    resolution: width && height ? { width, height } : null,
    fps,
    durationSec: duration,
    videoBitrateKbps,
    audioBitrateKbps,
    audioMeanVolumeDb: mean,
    audioMaxVolumeDb: max,
    audioSnrEstimateDb: snrEstimate,
    flags,
    score
  };
};
