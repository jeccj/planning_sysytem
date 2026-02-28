const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { USER_HEADERS, VENUE_HEADERS } = require('./import-structured');

const DEFAULT_DB_PATH = path.resolve(process.cwd(), '..', 'campus.db');
const IMMUTABLE_ADMIN_ROLE = 'sys_admin';
const EXPORTABLE_VENUE_ADMIN_ROLES = new Set(['venue_admin']);

function printUsage() {
  console.log(`\nStructured Export\n\nUsage:\n  node scripts/export-structured.js --users-out <users.csv> --venues-out <venues.csv> [--db <db-path>]\n\nExamples:\n  node scripts/export-structured.js --users-out ../users.csv --venues-out ../venues.csv\n  node scripts/export-structured.js --venues-out ../venues.csv --db ../campus.db\n`);
}

function parseArgs(argv) {
  const args = {
    usersOutPath: '',
    venuesOutPath: '',
    dbPath: DEFAULT_DB_PATH,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--users-out') {
      args.usersOutPath = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (item === '--venues-out') {
      args.venuesOutPath = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (item === '--db') {
      args.dbPath = path.resolve(process.cwd(), argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (item === '-h' || item === '--help') {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${item}`);
  }
  return args;
}

function openDb(dbPath) {
  const db = new sqlite3.Database(dbPath);
  db.configure('busyTimeout', Number(process.env.SQLITE_BUSY_TIMEOUT_MS || 10000));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return db;
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function normalizeText(value) {
  return String(value || '').trim();
}

function parseSimpleJsonArray(raw) {
  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeText(item)).filter(Boolean);
  }

  const text = normalizeText(raw);
  if (!text) return [];

  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => normalizeText(item)).filter(Boolean);
      }
    } catch (error) {
      // Ignore parse errors and fallback to splitter.
    }
  }

  return text
    .split(/[;,|，]/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    const line = headers.map((header) => csvEscape(row[header] ?? '')).join(',');
    lines.push(line);
  }
  return `${lines.join('\n')}\n`;
}

async function withDb(dbPath, runner) {
  const db = openDb(dbPath);
  try {
    return await runner(db);
  } finally {
    db.close();
  }
}

async function buildUsersRows(db) {
  const rows = await all(
    db,
    `SELECT
        username,
        role,
        IFNULL(contact_info, '') AS contact_info,
        IFNULL(identity_last6, '') AS identity_last6,
        IFNULL(managed_building, '') AS managed_building,
        IFNULL(managed_floor, '') AS managed_floor
     FROM users
     WHERE role != ?
     ORDER BY
       CASE role
         WHEN 'venue_admin' THEN 0
         WHEN 'student_teacher' THEN 1
         ELSE 9
       END,
       username ASC`,
    [IMMUTABLE_ADMIN_ROLE],
  );

  return rows
    .map((row) => {
      const rawRole = normalizeText(row.role);
      if (!['venue_admin', 'student_teacher'].includes(rawRole)) {
        return null;
      }
      const role = rawRole;
      const managedBuilding = role === 'venue_admin'
        ? normalizeText(row.managed_building)
        : '';
      const managedFloor = role === 'venue_admin'
        ? normalizeText(row.managed_floor)
        : '';

      return {
        username: normalizeText(row.username),
        password: '',
        role,
        contact_info: normalizeText(row.contact_info),
        identity_last6: normalizeText(row.identity_last6),
        managed_building: managedBuilding,
        managed_floor: managedFloor,
      };
    })
    .filter(Boolean);
}

async function buildVenuesRows(db) {
  const rows = await all(
    db,
    `SELECT
        v.name,
        v.type,
        v.capacity,
        IFNULL(v.building_name, '') AS building_name,
        IFNULL(v.floor_label, '') AS floor_label,
        IFNULL(v.room_code, '') AS room_code,
        IFNULL(v.location, '') AS location,
        IFNULL(v.facilities, '[]') AS facilities,
        IFNULL(v.status, 'available') AS status,
        IFNULL(v.open_hours, '') AS open_hours,
        IFNULL(v.description, '') AS description,
        IFNULL(v.image_url, '') AS image_url,
        IFNULL(v.photos, '[]') AS photos,
        u.username AS admin_username,
        IFNULL(u.role, '') AS admin_role
     FROM venues v
     LEFT JOIN users u ON u.id = v.admin_id
     ORDER BY
       IFNULL(v.building_name, '') ASC,
       IFNULL(v.floor_label, '') ASC,
       IFNULL(v.room_code, '') ASC,
       v.id ASC`,
  );

  const invalidSysAdminVenues = [];
  const invalidMissingAdminVenues = [];
  const invalidRoleVenues = [];

  for (const row of rows) {
    const name = normalizeText(row.name);
    const adminUsername = normalizeText(row.admin_username);
    const adminRole = normalizeText(row.admin_role);
    if (!adminUsername) {
      invalidMissingAdminVenues.push(name || '(unknown)');
      continue;
    }
    if (adminRole === IMMUTABLE_ADMIN_ROLE) {
      invalidSysAdminVenues.push(name || adminUsername);
      continue;
    }
    if (!EXPORTABLE_VENUE_ADMIN_ROLES.has(adminRole)) {
      invalidRoleVenues.push(`${name || '(unknown)'}:${adminRole || 'empty-role'}`);
    }
  }

  if (invalidMissingAdminVenues.length > 0) {
    throw new Error(`cannot export venues.csv: ${invalidMissingAdminVenues.length} venues missing admin user`);
  }
  if (invalidSysAdminVenues.length > 0) {
    const preview = invalidSysAdminVenues.slice(0, 5).join(', ');
    throw new Error(`cannot export venues.csv: ${invalidSysAdminVenues.length} venues managed by sys_admin, please reassign first (${preview})`);
  }
  if (invalidRoleVenues.length > 0) {
    const preview = invalidRoleVenues.slice(0, 5).join(', ');
    throw new Error(`cannot export venues.csv: invalid admin role on venues -> ${preview}`);
  }

  return rows.map((row) => {
    const buildingName = normalizeText(row.building_name);
    const floorLabel = normalizeText(row.floor_label);
    const roomCode = normalizeText(row.room_code);
    const fallbackLocation = [buildingName, floorLabel, roomCode].filter(Boolean).join(' ');

    return {
      name: normalizeText(row.name),
      type: normalizeText(row.type),
      capacity: Number.isFinite(Number(row.capacity)) ? Math.max(1, Math.floor(Number(row.capacity))) : 1,
      building_name: buildingName,
      floor_label: floorLabel,
      room_code: roomCode,
      location: normalizeText(row.location) || fallbackLocation,
      facilities: parseSimpleJsonArray(row.facilities).join(';'),
      status: normalizeText(row.status) || 'available',
      open_hours: normalizeText(row.open_hours),
      description: normalizeText(row.description),
      admin_username: normalizeText(row.admin_username),
      image_url: normalizeText(row.image_url),
      photos: parseSimpleJsonArray(row.photos).join(';'),
    };
  });
}

async function exportStructuredUsersCsv({ dbPath = DEFAULT_DB_PATH } = {}) {
  return withDb(dbPath, async (db) => {
    const rows = await buildUsersRows(db);
    return {
      dbPath,
      rows: rows.length,
      csvText: toCsv(USER_HEADERS, rows),
    };
  });
}

async function exportStructuredVenuesCsv({ dbPath = DEFAULT_DB_PATH } = {}) {
  return withDb(dbPath, async (db) => {
    const rows = await buildVenuesRows(db);
    return {
      dbPath,
      rows: rows.length,
      csvText: toCsv(VENUE_HEADERS, rows),
    };
  });
}

async function exportStructuredData({ dbPath = DEFAULT_DB_PATH } = {}) {
  return withDb(dbPath, async (db) => {
    const userRows = await buildUsersRows(db);
    const venueRows = await buildVenuesRows(db);
    return {
      dbPath,
      users: {
        rows: userRows.length,
        csvText: toCsv(USER_HEADERS, userRows),
      },
      venues: {
        rows: venueRows.length,
        csvText: toCsv(VENUE_HEADERS, venueRows),
      },
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  if (!args.usersOutPath && !args.venuesOutPath) {
    printUsage();
    throw new Error('at least one of --users-out or --venues-out is required');
  }

  if (args.usersOutPath) {
    const usersRes = await exportStructuredUsersCsv({ dbPath: args.dbPath });
    const targetPath = path.resolve(process.cwd(), args.usersOutPath);
    fs.writeFileSync(targetPath, usersRes.csvText, 'utf8');
    console.log(`[export-structured] users exported: ${usersRes.rows} -> ${targetPath}`);
  }

  if (args.venuesOutPath) {
    const venuesRes = await exportStructuredVenuesCsv({ dbPath: args.dbPath });
    const targetPath = path.resolve(process.cwd(), args.venuesOutPath);
    fs.writeFileSync(targetPath, venuesRes.csvText, 'utf8');
    console.log(`[export-structured] venues exported: ${venuesRes.rows} -> ${targetPath}`);
  }
}

module.exports = {
  exportStructuredUsersCsv,
  exportStructuredVenuesCsv,
  exportStructuredData,
};

if (require.main === module) {
  main().catch((error) => {
    console.error('[export-structured] fatal:', error.message);
    process.exit(1);
  });
}
