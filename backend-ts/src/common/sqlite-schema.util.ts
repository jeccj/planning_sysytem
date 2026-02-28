import { DataSource } from 'typeorm';

type SqliteDbType = 'sqlite' | 'better-sqlite3';

interface SqliteColumnPatch {
  name: string;
  sql: string;
}

interface SqliteTablePatch {
  name: string;
  createSql: string;
  columnPatches: SqliteColumnPatch[];
  indexSql?: string[];
}

interface SqliteTableInfoRow {
  name?: string;
}

interface SqliteMasterRow {
  name?: string;
}

interface SqliteErrorShape {
  code?: string;
  message?: string;
  driverError?: {
    code?: string;
    message?: string;
  };
}

const SQLITE_TYPES: ReadonlySet<SqliteDbType> = new Set<SqliteDbType>([
  'sqlite',
  'better-sqlite3',
]);

const TABLE_PATCHES: SqliteTablePatch[] = [
  {
    name: 'users',
    createSql:
      `CREATE TABLE IF NOT EXISTS "users" (` +
      `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
      `"username" varchar NOT NULL, ` +
      `"hashed_password" varchar NOT NULL, ` +
      `"role" varchar NOT NULL DEFAULT ('student_teacher'), ` +
      `"is_first_login" boolean NOT NULL DEFAULT (1), ` +
      `"contact_info" varchar, ` +
      `"managed_building" varchar, ` +
      `"managed_floor" varchar, ` +
      `"identity_last6" varchar, ` +
      `"login_session_id" varchar DEFAULT (''), ` +
      `"last_login_at" datetime, ` +
      `"last_active_at" datetime, ` +
      `CONSTRAINT "UQ_4baf95322bd69fe419c26c5430c" UNIQUE ("username"))`,
    columnPatches: [
      {
        name: 'contact_info',
        sql: `ALTER TABLE users ADD COLUMN contact_info varchar`,
      },
      {
        name: 'managed_building',
        sql: `ALTER TABLE users ADD COLUMN managed_building varchar`,
      },
      {
        name: 'managed_floor',
        sql: `ALTER TABLE users ADD COLUMN managed_floor varchar`,
      },
      {
        name: 'identity_last6',
        sql: `ALTER TABLE users ADD COLUMN identity_last6 varchar`,
      },
      {
        name: 'login_session_id',
        sql: `ALTER TABLE users ADD COLUMN login_session_id varchar DEFAULT ''`,
      },
      {
        name: 'last_login_at',
        sql: `ALTER TABLE users ADD COLUMN last_login_at datetime`,
      },
      {
        name: 'last_active_at',
        sql: `ALTER TABLE users ADD COLUMN last_active_at datetime`,
      },
    ],
  },
  {
    name: 'system_config',
    createSql:
      `CREATE TABLE IF NOT EXISTS "system_config" (` +
      `"key" varchar PRIMARY KEY NOT NULL, ` +
      `"value" varchar NOT NULL, ` +
      `"description" varchar)`,
    columnPatches: [
      {
        name: 'description',
        sql: `ALTER TABLE system_config ADD COLUMN description varchar`,
      },
    ],
  },
  {
    name: 'venues',
    createSql:
      `CREATE TABLE IF NOT EXISTS "venues" (` +
      `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
      `"name" varchar NOT NULL, ` +
      `"type" varchar NOT NULL, ` +
      `"capacity" integer NOT NULL, ` +
      `"location" varchar NOT NULL, ` +
      `"facilities" text NOT NULL, ` +
      `"status" varchar NOT NULL DEFAULT ('available'), ` +
      `"image_url" varchar, ` +
      `"admin_id" integer NOT NULL, ` +
      `"open_hours" varchar, ` +
      `"description" text, ` +
      `"building_name" varchar, ` +
      `"floor_label" varchar, ` +
      `"room_code" varchar, ` +
      `"photos" text, ` +
      `CONSTRAINT "FK_b3b9a9bfb59ad78804cd9393f4e" FOREIGN KEY ("admin_id") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    columnPatches: [
      {
        name: 'open_hours',
        sql: `ALTER TABLE venues ADD COLUMN open_hours varchar`,
      },
      {
        name: 'description',
        sql: `ALTER TABLE venues ADD COLUMN description text`,
      },
      {
        name: 'building_name',
        sql: `ALTER TABLE venues ADD COLUMN building_name varchar`,
      },
      {
        name: 'floor_label',
        sql: `ALTER TABLE venues ADD COLUMN floor_label varchar`,
      },
      {
        name: 'room_code',
        sql: `ALTER TABLE venues ADD COLUMN room_code varchar`,
      },
      {
        name: 'photos',
        sql: `ALTER TABLE venues ADD COLUMN photos text`,
      },
    ],
    indexSql: [
      `CREATE INDEX IF NOT EXISTS "idx_venues_building_floor" ON "venues" ("building_name", "floor_label")`,
      `CREATE INDEX IF NOT EXISTS "idx_venues_status" ON "venues" ("status")`,
      `CREATE INDEX IF NOT EXISTS "idx_venues_admin" ON "venues" ("admin_id")`,
    ],
  },
  {
    name: 'reservations',
    createSql:
      `CREATE TABLE IF NOT EXISTS "reservations" (` +
      `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
      `"user_id" integer NOT NULL, ` +
      `"venue_id" integer NOT NULL, ` +
      `"start_time" datetime NOT NULL, ` +
      `"end_time" datetime NOT NULL, ` +
      `"activity_name" varchar NOT NULL, ` +
      `"organizer" varchar, ` +
      `"organizer_unit" varchar, ` +
      `"contact_name" varchar, ` +
      `"contact_phone" varchar, ` +
      `"attendees_count" integer NOT NULL, ` +
      `"proposal_content" text NOT NULL, ` +
      `"status" varchar NOT NULL DEFAULT ('pending'), ` +
      `"rejection_reason" varchar, ` +
      `"ai_risk_score" float, ` +
      `"ai_audit_comment" text, ` +
      `"proposal_url" varchar, ` +
      `"activity_description" text, ` +
      `CONSTRAINT "FK_f486dcef5c26fd22cc63ba1c071" FOREIGN KEY ("venue_id") REFERENCES "venues" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, ` +
      `CONSTRAINT "FK_4af5055a871c46d011345a255a6" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    columnPatches: [
      {
        name: 'organizer_unit',
        sql: `ALTER TABLE reservations ADD COLUMN organizer_unit varchar`,
      },
      {
        name: 'contact_name',
        sql: `ALTER TABLE reservations ADD COLUMN contact_name varchar`,
      },
      {
        name: 'contact_phone',
        sql: `ALTER TABLE reservations ADD COLUMN contact_phone varchar`,
      },
      {
        name: 'ai_risk_score',
        sql: `ALTER TABLE reservations ADD COLUMN ai_risk_score float`,
      },
      {
        name: 'ai_audit_comment',
        sql: `ALTER TABLE reservations ADD COLUMN ai_audit_comment text`,
      },
      {
        name: 'proposal_url',
        sql: `ALTER TABLE reservations ADD COLUMN proposal_url varchar`,
      },
      {
        name: 'activity_description',
        sql: `ALTER TABLE reservations ADD COLUMN activity_description text`,
      },
    ],
    indexSql: [
      `CREATE INDEX IF NOT EXISTS "idx_reservations_user_start" ON "reservations" ("user_id", "start_time")`,
      `CREATE INDEX IF NOT EXISTS "idx_reservations_venue_status_start_end" ON "reservations" ("venue_id", "status", "start_time", "end_time")`,
      `CREATE INDEX IF NOT EXISTS "idx_reservations_status_start" ON "reservations" ("status", "start_time")`,
    ],
  },
  {
    name: 'reservation_slots',
    createSql:
      `CREATE TABLE IF NOT EXISTS "reservation_slots" (` +
      `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
      `"venue_id" integer NOT NULL, ` +
      `"reservation_id" integer NOT NULL, ` +
      `"slot_start" datetime NOT NULL, ` +
      `"slot_end" datetime NOT NULL, ` +
      `CONSTRAINT "FK_d6f29b90b27f4e4433348699932" FOREIGN KEY ("reservation_id") REFERENCES "reservations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    columnPatches: [],
    indexSql: [
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_c4bab4a526f9f8fd5f4bf3fe43" ON "reservation_slots" ("venue_id", "slot_start")`,
      `CREATE INDEX IF NOT EXISTS "idx_reservation_slots_reservation_id" ON "reservation_slots" ("reservation_id")`,
    ],
  },
  {
    name: 'announcements',
    createSql:
      `CREATE TABLE IF NOT EXISTS "announcements" (` +
      `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
      `"title" varchar NOT NULL, ` +
      `"content" text NOT NULL, ` +
      `"publish_time" datetime NOT NULL DEFAULT (datetime('now')), ` +
      `"target_role" varchar NOT NULL DEFAULT ('all'), ` +
      `"scope_building" varchar, ` +
      `"scope_floor" varchar)`,
    columnPatches: [
      {
        name: 'target_role',
        sql: `ALTER TABLE announcements ADD COLUMN target_role varchar NOT NULL DEFAULT 'all'`,
      },
      {
        name: 'scope_building',
        sql: `ALTER TABLE announcements ADD COLUMN scope_building varchar`,
      },
      {
        name: 'scope_floor',
        sql: `ALTER TABLE announcements ADD COLUMN scope_floor varchar`,
      },
    ],
  },
  {
    name: 'notifications',
    createSql:
      `CREATE TABLE IF NOT EXISTS "notifications" (` +
      `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
      `"user_id" integer NOT NULL, ` +
      `"title" varchar NOT NULL, ` +
      `"content" text NOT NULL, ` +
      `"is_read" boolean NOT NULL DEFAULT (0), ` +
      `"created_at" datetime NOT NULL DEFAULT (datetime('now')), ` +
      `"notification_type" varchar NOT NULL DEFAULT ('system'), ` +
      `CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    columnPatches: [
      {
        name: 'notification_type',
        sql: `ALTER TABLE notifications ADD COLUMN notification_type varchar NOT NULL DEFAULT 'system'`,
      },
    ],
    indexSql: [
      `CREATE INDEX IF NOT EXISTS "idx_notifications_user_read_created" ON "notifications" ("user_id", "is_read", "created_at")`,
    ],
  },
];

let schemaChecked = false;
let schemaCheckPromise: Promise<void> | null = null;

function asSqliteError(error: unknown): SqliteErrorShape {
  if (!error || typeof error !== 'object') return {};
  return error as SqliteErrorShape;
}

function isDuplicateColumnError(error: unknown): boolean {
  const normalized = asSqliteError(error);
  const code = String(normalized.code || normalized.driverError?.code || '');
  const message = String(
    normalized.message || normalized.driverError?.message || '',
  ).toLowerCase();
  return code === 'SQLITE_ERROR' && message.includes('duplicate column name');
}

async function tableExists(
  dataSource: DataSource,
  tableName: string,
): Promise<boolean> {
  const rows = (await dataSource.query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [tableName],
  )) as SqliteMasterRow[];
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureTable(
  dataSource: DataSource,
  patch: SqliteTablePatch,
): Promise<void> {
  const exists = await tableExists(dataSource, patch.name);
  if (!exists) {
    await dataSource.query(patch.createSql);
    console.warn(`[schema-compat] Created missing table: ${patch.name}`);
  }

  const tableInfo = (await dataSource.query(
    `PRAGMA table_info('${patch.name}')`,
  )) as SqliteTableInfoRow[];
  const columnNames = new Set(
    Array.isArray(tableInfo)
      ? tableInfo.map((row) => String(row?.name || ''))
      : [],
  );

  for (const columnPatch of patch.columnPatches) {
    if (columnNames.has(columnPatch.name)) continue;
    try {
      await dataSource.query(columnPatch.sql);
    } catch (error) {
      if (isDuplicateColumnError(error)) continue;
      throw error;
    }
    console.warn(`[schema-compat] Added ${patch.name}.${columnPatch.name}`);
  }

  for (const indexSql of patch.indexSql || []) {
    await dataSource.query(indexSql);
  }
}

export async function ensureLegacySqliteSchema(
  dataSource: DataSource,
): Promise<void> {
  const dbType = String(
    (dataSource.options as { type?: string }).type || '',
  ) as SqliteDbType;
  if (!SQLITE_TYPES.has(dbType)) {
    schemaChecked = true;
    return;
  }

  if (schemaChecked) return;
  if (schemaCheckPromise) {
    await schemaCheckPromise;
    return;
  }

  schemaCheckPromise = (async () => {
    for (const tablePatch of TABLE_PATCHES) {
      await ensureTable(dataSource, tablePatch);
    }
    schemaChecked = true;
  })();

  try {
    await schemaCheckPromise;
  } finally {
    schemaCheckPromise = null;
  }
}

export async function ensureLegacySqliteUsersColumns(
  dataSource: DataSource,
): Promise<void> {
  await ensureLegacySqliteSchema(dataSource);
}
