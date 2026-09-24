import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type JobState =
  | 'submitting'
  | 'waiting'
  | 'queuing'
  | 'generating'
  | 'downloading'
  | 'success'
  | 'fail'
  | 'timeout';

export const TERMINAL_STATES: JobState[] = ['success', 'fail', 'timeout'];

export interface JobRow {
  id: string;
  projectId: string;
  nodeId: string;
  kieModel: string;
  input: Record<string, unknown>;
  outputType: string | null;
  state: JobState;
  taskId: string | null;
  progress: number | null;
  resultUrls: string[];
  files: string[];
  credits: number | null;
  errorCode: string | null;
  errorMsg: string | null;
  timeoutSec: number;
  createdAt: number;
  submittedAt: number | null;
  finishedAt: number | null;
  updatedAt: number;
}

const JSON_COLS = ['input', 'resultUrls', 'files'] as const;

export class Store {
  readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        nodeId TEXT NOT NULL,
        kieModel TEXT NOT NULL,
        input TEXT NOT NULL,
        outputType TEXT,
        state TEXT NOT NULL,
        taskId TEXT,
        progress REAL,
        resultUrls TEXT NOT NULL DEFAULT '[]',
        files TEXT NOT NULL DEFAULT '[]',
        credits REAL,
        errorCode TEXT,
        errorMsg TEXT,
        timeoutSec INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        submittedAt INTEGER,
        finishedAt INTEGER,
        updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS jobs_project ON jobs(projectId, createdAt);
      CREATE TABLE IF NOT EXISTS uploads (
        hash TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        uploadedAt INTEGER NOT NULL
      );
    `);
  }

  private decode(row: Record<string, unknown> | undefined): JobRow | undefined {
    if (!row) return undefined;
    const out = { ...row } as Record<string, unknown>;
    for (const c of JSON_COLS) out[c] = JSON.parse(String(row[c]));
    return out as unknown as JobRow;
  }

  insertJob(job: JobRow) {
    const cols = Object.keys(job);
    const values = cols.map((c) => {
      const v = (job as unknown as Record<string, unknown>)[c];
      return (JSON_COLS as readonly string[]).includes(c) ? JSON.stringify(v) : (v as never);
    });
    this.db
      .prepare(`INSERT INTO jobs (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(...values);
  }

  updateJob(id: string, patch: Partial<JobRow>) {
    const entries = Object.entries({ ...patch, updatedAt: Date.now() });
    const sets = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([k, v]) =>
      (JSON_COLS as readonly string[]).includes(k) ? JSON.stringify(v) : (v as never),
    );
    this.db.prepare(`UPDATE jobs SET ${sets} WHERE id = ?`).run(...values, id);
  }

  getJob(id: string): JobRow | undefined {
    return this.decode(this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown>);
  }

  listJobs(projectId?: string): JobRow[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM jobs WHERE projectId = ? ORDER BY createdAt DESC').all(projectId)
      : this.db.prepare('SELECT * FROM jobs ORDER BY createdAt DESC LIMIT 500').all();
    return rows.map((r) => this.decode(r as Record<string, unknown>)!);
  }

  unfinishedJobs(): JobRow[] {
    const placeholders = TERMINAL_STATES.map(() => '?').join(',');
    return this.db
      .prepare(`SELECT * FROM jobs WHERE state NOT IN (${placeholders}) ORDER BY createdAt`)
      .all(...TERMINAL_STATES)
      .map((r) => this.decode(r as Record<string, unknown>)!);
  }

  getUpload(hash: string): { url: string; uploadedAt: number } | undefined {
    return this.db.prepare('SELECT url, uploadedAt FROM uploads WHERE hash = ?').get(hash) as
      | { url: string; uploadedAt: number }
      | undefined;
  }

  putUpload(hash: string, url: string, uploadedAt: number) {
    this.db
      .prepare('INSERT OR REPLACE INTO uploads (hash, url, uploadedAt) VALUES (?, ?, ?)')
      .run(hash, url, uploadedAt);
  }
}
