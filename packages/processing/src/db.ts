import { Pool } from "pg";
import { env } from "./config";

const pool = new Pool({ connectionString: env.DATABASE_URL });

export const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      room_name TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      egress_id TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS session_events (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

export const insertSession = async (sessionId: string, roomName: string) => {
  await pool.query(
    "INSERT INTO sessions (id, room_name, status) VALUES ($1, $2, 'active')",
    [sessionId, roomName]
  );
};

export const updateSessionEnd = async (sessionId: string, egressId?: string) => {
  await pool.query(
    "UPDATE sessions SET ended_at = NOW(), status = 'ended', egress_id = $2 WHERE id = $1",
    [sessionId, egressId ?? null]
  );
};

export const insertSessionEvent = async (
  sessionId: string,
  eventType: string,
  payload: unknown
) => {
  await pool.query(
    "INSERT INTO session_events (session_id, event_type, payload) VALUES ($1, $2, $3)",
    [sessionId, eventType, payload]
  );
};
