import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { app } from "electron";

let db: Database.Database | null = null;

export interface RatingCacheEntry {
  rating: number;
  updatedAt: number;
  sourceModifiedAt: number | null;
}

function getDatabasePath(): string {
  const userData = app.getPath("userData");
  const nextPath = join(userData, "pickshot", "ratings.db");
  const legacyPath = join(userData, "photo-selector", "ratings.db");
  if (existsSync(nextPath) || !existsSync(legacyPath)) {
    return nextPath;
  }
  return legacyPath;
}

export function initRatingsStore(): void {
  const dbPath = getDatabasePath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  try {
    db = new Database(dbPath);
  } catch (error) {
    console.error("Failed to open ratings database", error);
    throw error;
  }
  db.pragma("journal_mode = WAL");
  db.exec(
    `CREATE TABLE IF NOT EXISTS ratings (
      id TEXT PRIMARY KEY,
      rating INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      source_modified_at INTEGER
    )`,
  );

  ensureSourceModifiedColumn(db);
}

function ensureDb(): Database.Database {
  if (!db) {
    throw new Error(
      "Ratings store has not been initialized. Call initRatingsStore() first.",
    );
  }
  return db;
}

function ensureSourceModifiedColumn(database: Database.Database): void {
  const columns = database
    .prepare("PRAGMA table_info(ratings)")
    .all() as Array<{ name: string }>;
  const hasColumn = columns.some(
    (column) => column.name === "source_modified_at",
  );
  if (!hasColumn) {
    database.exec("ALTER TABLE ratings ADD COLUMN source_modified_at INTEGER");
  }
}

export function getAllRatings(): Record<string, RatingCacheEntry> {
  const database = ensureDb();
  const rows = database
    .prepare("SELECT id, rating, updated_at, source_modified_at FROM ratings")
    .all() as Array<{
    id: string;
    rating: number;
    updated_at: number;
    source_modified_at: number | null;
  }>;
  const map: Record<string, RatingCacheEntry> = {};
  for (const row of rows) {
    map[row.id] = {
      rating: row.rating,
      updatedAt: row.updated_at,
      sourceModifiedAt:
        typeof row.source_modified_at === "number"
          ? row.source_modified_at
          : null,
    };
  }
  return map;
}

export function upsertRating(
  id: string,
  rating: number,
  sourceModifiedAt: number | null,
): void {
  const database = ensureDb();
  const now = Date.now();
  database
    .prepare(
      `INSERT INTO ratings (id, rating, updated_at, source_modified_at)
       VALUES (@id, @rating, @updated_at, @source_modified_at)
       ON CONFLICT (id) DO UPDATE SET
         rating = excluded.rating,
         updated_at = excluded.updated_at,
         source_modified_at = excluded.source_modified_at`,
    )
    .run({
      id,
      rating,
      updated_at: now,
      source_modified_at: sourceModifiedAt,
    });
}

export function deleteRating(id: string): void {
  const database = ensureDb();
  database.prepare("DELETE FROM ratings WHERE id = ?").run(id);
}

export function deleteRatings(ids: string[]): void {
  if (ids.length === 0) return;
  const database = ensureDb();
  const placeholders = ids.map(() => "?").join(",");
  database
    .prepare(`DELETE FROM ratings WHERE id IN (${placeholders})`)
    .run(...ids);
}

export function renameRating(oldId: string, newId: string): void {
  const database = ensureDb();
  database.prepare("UPDATE ratings SET id = ? WHERE id = ?").run(newId, oldId);
}
