# LiveKit Session Monitor

A minimal LiveKit Cloud web platform in TypeScript that:
- Streams a user's webcam with start/end controls.
- Records every session via LiveKit Egress.
- Extracts video, audio, and transcript files to S3.
- Flags realtime safety events (nudity now; placeholders for other categories).
- Computes post-session engagement + quality scores, then stores metrics in S3.

## Repo layout
- `apps/web` — Next.js UI + API routes (LiveKit tokens, egress, webhooks)
- `packages/processing` — reusable video/audio/transcript processing pipeline

The processing package is designed to be reused even if the UI changes (ex: 1:1 matching flow).

## Requirements
- Node.js 18+
- LiveKit Cloud project (API key/secret + URL)
- AWS S3 bucket
- PostgreSQL (Neon or similar)
- Gemini API key
- Hugging Face token (for Whisper transcription)

## Environment
Use the existing `.env` at repo root. For Next.js, copy it into `apps/web/.env.local` (or set env vars in your shell). When deploying, add the same values in Vercel.

Required variables:
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `DATABASE_URL`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `RECORDINGS_S3_BUCKET` (supports ARN or bucket name)
- `GEMINI_API_KEY`
- `HUGGINGFACE_ACCESS_TOKEN`

## Local development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the Next.js app:
   ```bash
   npm run dev
   ```
3. Visit `http://localhost:3000`.

## Database schema
The app auto-creates tables on first use, but you can also initialize manually:
```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  room_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  egress_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS session_events (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## LiveKit webhook
Configure a LiveKit webhook to hit:
```
https://<your-domain>/api/livekit/webhook
```
This webhook is used to trigger post-session processing when egress completes.

## How sessions flow
1. **Start Session** → creates a LiveKit room + token.
2. **Egress start** → LiveKit writes MP4 to S3 under `sessions/<sessionId>/`.
3. **Webhook** → triggers processing pipeline:
   - download MP4
   - extract audio
   - transcribe with Whisper via Hugging Face
   - compute quality + engagement scores
   - call Gemini for reasoning scores
   - upload metrics + transcript to S3

## Metrics output (S3)
Each session is stored under:
```
sessions/<sessionId>/
  recording.mp4
  audio.wav
  transcript.json
  transcript.txt
  quality.json
  engagement.json
  combined-score.json
  analysis.json
  safety/<timestamp>.json
```

## Realtime safety (nudity)
Nudity detection runs in the browser using `nsfwjs` + TensorFlow.js. If a flagged event is detected, it is stored as JSON in S3 and logged to Postgres.

Other categories (suspicious behavior, AI bot, offensive, harassment, violence) are currently placeholders with a score of `0`. The code is ready to be extended with models or Groq/Llama classification.

## Deployment (Vercel)
1. Import the repo into Vercel.
2. Set the root directory to `apps/web`.
3. Add all `.env` variables in the Vercel project settings.
4. Deploy.

Notes:
- The processing pipeline uses FFmpeg binaries via `ffmpeg-static`. Vercel Serverless works for short sessions but heavier workloads should be moved to a dedicated worker (ex: AWS Lambda or a container) and called by the webhook.

## Next steps you might want
- Add multi-participant room layouts and per-participant analysis.
- Replace placeholder safety categories with Groq/Llama or Hugging Face moderation models.
- Store analysis summaries in the DB for dashboards.
