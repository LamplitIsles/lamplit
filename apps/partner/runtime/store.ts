import type { InputImage } from './images.ts';
import type { CompactBoundary, ContextObservation } from "../src/lib/continuity.ts";
import { clampAffinity, type RelationshipUpdate, type CompanionState, type CompanionStateRecord } from "../src/lib/companion/domain.ts";
import { DatabaseSync } from 'node:sqlite';
import { createSqliteDurabilityStore, sqliteDurabilitySchema,
  type DurabilitySqliteQuery, type DurabilitySqliteTransaction } from 'nanocodex/durability';

export type Message = { id: string; input: string; answer: string | null; error: string | null; usage: string | null; created: number };
export type MessagePageOptions = { before?: number; after?: number };
export type PagedMessage = Message & { sequence: number; revision: number };
export type ImageRecord = { id: string; operation_id: string; name: string; data: Uint8Array };

export class Store {
  private db: DatabaseSync;
  private writes: Promise<unknown> = Promise.resolve();
  private closed = false;
  readonly durability;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    try {
      // One application owns this database for its lifetime. A second runtime
      // must fail to open, rather than fence a still-running first process.
      this.db.exec('PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      for (const sql of sqliteDurabilitySchema) this.db.exec(sql);
      this.db.exec(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, input TEXT NOT NULL, answer TEXT, error TEXT, usage TEXT, created INTEGER NOT NULL
      ); CREATE TABLE IF NOT EXISTS compact_boundaries (
        id TEXT PRIMARY KEY, anchor_id TEXT, position TEXT NOT NULL CHECK(position IN ('before','after-user','after')), time INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS context_observation (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS relationship (call_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, previous_affinity INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS input_images (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, name TEXT NOT NULL, media_type TEXT NOT NULL, data BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, name TEXT NOT NULL, data BLOB NOT NULL);`);
      this.db.exec(`CREATE TABLE IF NOT EXISTS message_revisions (revision INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL UNIQUE);
        INSERT OR IGNORE INTO message_revisions(message_id) SELECT id FROM messages ORDER BY rowid;
        CREATE TRIGGER IF NOT EXISTS message_insert_revision AFTER INSERT ON messages BEGIN
          INSERT OR REPLACE INTO message_revisions(message_id) VALUES(NEW.id); END;
        CREATE TRIGGER IF NOT EXISTS message_update_revision AFTER UPDATE ON messages BEGIN
          INSERT OR REPLACE INTO message_revisions(message_id) VALUES(NEW.id); END;`);
      this.durability = createSqliteDurabilityStore({ transaction: this.transaction });
    } catch (error) { this.db.close(); throw error; }
  }
  readonly transaction: DurabilitySqliteTransaction = (callback) => {
    if (this.closed) return Promise.reject(new Error('Session store is closed'));
    const result = this.writes.then(async () => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const query: DurabilitySqliteQuery = (sql, args) => this.db.prepare(sql).all(...args) as never;
        const value = await callback(query);
        this.db.exec('COMMIT');
        return value;
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    });
    this.writes = result.catch(() => {});
    return result;
  };
  async messages(): Promise<Message[]> {
    return this.transaction(() => this.db.prepare('SELECT * FROM messages ORDER BY created,rowid').all() as Message[]);
  }
  async messagePage(options: MessagePageOptions = {}) {
    return this.transaction(() => {
      const cursor = Number(this.db.prepare('SELECT COALESCE(MAX(revision),0) AS cursor FROM message_revisions').get()!.cursor);
      if (options.after !== undefined && options.after > cursor) throw new Error('Message cursor is ahead of this session');
      const changes = options.after !== undefined;
      const rows = this.db.prepare(`SELECT m.*,m.rowid AS sequence,r.revision FROM messages m
        JOIN message_revisions r ON r.message_id=m.id WHERE ${changes ? 'r.revision>?' : 'm.rowid<?'}
        ORDER BY ${changes ? 'r.revision ASC' : 'm.rowid DESC'} LIMIT 31`)
        .all(options.after ?? options.before ?? Number.MAX_SAFE_INTEGER) as PagedMessage[];
      const more = rows.length > 30;
      const page = rows.slice(0,30);
      const next = changes && more ? page.at(-1)!.revision : cursor;
      page.sort((a,b) => a.sequence-b.sequence);
      return { messages: page, cursor: next, hasChangesMore: changes && more,
        hasMore: !changes && more, before: page[0]?.sequence ?? null };
    });
  }
  async touchMessage(id: string) {
    await this.transaction(() => this.db.prepare('UPDATE messages SET input=input WHERE id=?').run(id));
  }
  async admit(id: string, input: string, images: readonly InputImage[] = []): Promise<Message> {
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT * FROM messages WHERE id=?').get(id) as Message | undefined;
      if (previous) {
        const oldImages = this.db.prepare('SELECT id FROM input_images WHERE operation_id=? ORDER BY rowid').all(id);
        if (previous.input !== input || JSON.stringify(oldImages.map(image => image.id)) !== JSON.stringify(images.map(image => image.id))) throw new Error('Message ID already belongs to different content');
        return previous;
      }
      const created = Date.now();
      this.db.prepare('INSERT INTO messages(id,input,created) VALUES(?,?,?)').run(id, input, created);
      for (const image of images) this.db.prepare('INSERT INTO input_images(id,operation_id,name,media_type,data) VALUES(?,?,?,?,?)').run(image.id, id, image.name, image.media_type, image.data);
      return { id, input, created, answer: null, error: null, usage: null };
    });
  }
  async finish(id: string, answer: string | null, usage: unknown, error: string | null = null) {
    await this.transaction(() => {
      this.db.prepare('UPDATE messages SET answer=?,usage=?,error=? WHERE id=?')
        .run(answer, usage == null ? null : JSON.stringify(usage), error, id);
    });
  }
  async saveImage(image: ImageRecord) {
    await this.transaction(() => this.db.prepare('INSERT INTO images(id,operation_id,name,data) VALUES(?,?,?,?)').run(image.id, image.operation_id, image.name, image.data));
  }
  async inputImages(operation: string): Promise<InputImage[]> {
    return this.transaction(() => this.db.prepare('SELECT * FROM input_images WHERE operation_id=? ORDER BY rowid').all(operation) as InputImage[]);
  }
  async inputImageMetadata(ids?: readonly string[]): Promise<Omit<InputImage, 'data'>[]> {
    return this.transaction(() => this.db.prepare(`SELECT id,operation_id,name,media_type FROM input_images ${ids ? 'WHERE operation_id IN (SELECT value FROM json_each(?))' : ''} ORDER BY rowid`).all(...(ids ? [JSON.stringify(ids)] : [])) as Omit<InputImage, "data">[]);
  }
  async image(id: string): Promise<InputImage | undefined> {
    return this.transaction(() => this.db.prepare("SELECT id,operation_id,name,data,'image/png' AS media_type FROM images WHERE id=? UNION ALL SELECT id,operation_id,name,data,media_type FROM input_images WHERE id=?").get(id,id) as InputImage | undefined);
  }
  async images(ids?: readonly string[]): Promise<Omit<ImageRecord, 'data'>[]> {
    return this.transaction(() => this.db.prepare(`SELECT id,operation_id,name FROM images ${ids ? 'WHERE operation_id IN (SELECT value FROM json_each(?))' : ''} ORDER BY rowid`).all(...(ids ? [JSON.stringify(ids)] : [])) as Omit<ImageRecord, 'data'>[]);
  }
  async relationshipHistory(): Promise<CompanionStateRecord[]> {
    return this.transaction(() => this.db.prepare('SELECT data FROM relationship ORDER BY rowid DESC').all().map((row) => JSON.parse(String(row.data))));
  }
  async updateRelationship(operation: string, callId: string, update: RelationshipUpdate & { signature?: { value: string; reason: string } }): Promise<CompanionState> {
    if (!operation) throw new Error('Relationship updates require an active conversation turn');
    return this.transaction(() => {
      const key = `${operation}:${callId}`;
      const existing = this.db.prepare('SELECT data FROM relationship WHERE call_id=?').get(key);
      if (existing) return JSON.parse(String(existing.data)).state;
      const last = this.db.prepare('SELECT data FROM relationship ORDER BY rowid DESC LIMIT 1').get();
      const previous: CompanionState = last ? JSON.parse(String(last.data)).state : { mood: 'neutral', affinity: 50, signature: '' };
      const state = { ...previous };
      const changes: CompanionStateRecord['changes'] = {};
      if (update.mood) { state.mood = update.mood.value; state.note = update.mood.note; changes.mood = update.mood; }
      if (update.affinity) {
        const first = this.db.prepare('SELECT previous_affinity FROM relationship WHERE operation_id=? ORDER BY rowid LIMIT 1').get(operation);
        const base = first ? Number(first.previous_affinity) : previous.affinity;
        state.affinity = clampAffinity(Math.max(base - 10, Math.min(base + 10, state.affinity + update.affinity.delta)));
        changes.affinity = { value: state.affinity, delta: state.affinity - previous.affinity, reason: update.affinity.reason };
      }
      if (update.signature) { state.signature = update.signature.value; changes.signature = update.signature; }
      const record: CompanionStateRecord = { at: new Date().toISOString(), changes, state };
      this.db.prepare('INSERT INTO relationship(call_id,operation_id,previous_affinity,data) VALUES(?,?,?,?)').run(key, operation, previous.affinity, JSON.stringify(record));
      return state;
    });
  }
  async observeContext(context: ContextObservation) {
    await this.transaction(() => this.db.prepare('INSERT INTO context_observation(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(context)));
  }
  async observedContext(): Promise<ContextObservation | null> {
    return this.transaction(() => { const row = this.db.prepare('SELECT data FROM context_observation WHERE id=1').get(); return row ? JSON.parse(String(row.data)) : null; });
  }
  async saveCompactBoundary(boundary: CompactBoundary): Promise<void> {
    await this.transaction(() => this.db.prepare('INSERT OR IGNORE INTO compact_boundaries(id,anchor_id,position,time) VALUES(?,?,?,?)')
      .run(boundary.id, boundary.anchorId, boundary.position, boundary.time));
  }
  async compactBoundaries(): Promise<CompactBoundary[]> {
    return this.transaction(() => this.db.prepare('SELECT id,anchor_id AS anchorId,position,time FROM compact_boundaries ORDER BY time,id').all() as CompactBoundary[]);
  }
  async close() {
    this.closed = true;
    await this.writes;
    this.db.close();
  }
}
