const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const DEFAULT_DB_PATH = path.resolve(process.cwd(), '..', 'campus.db');

const USER_HEADERS = [
  'username',
  'password',
  'role',
  'contact_info',
  'identity_last6',
  'managed_building',
  'managed_floor',
];

const VENUE_HEADERS = [
  'name',
  'type',
  'capacity',
  'building_name',
  'floor_label',
  'room_code',
  'facilities',
  'status',
  'open_hours',
  'description',
  'admin_username',
];

const ROLE_MAP = {
  sys_admin: 'sys_admin',
  venue_admin: 'venue_admin',
  floor_admin: 'floor_admin',
  student_teacher: 'student_teacher',
};

const TYPE_MAP = {
  classroom: 'Classroom',
  hall: 'Hall',
  lab: 'Lab',
  '教室': 'Classroom',
  '礼堂': 'Hall',
  '实验室': 'Lab',
};

const STATUS_MAP = {
  available: 'available',
  maintenance: 'maintenance',
  '可用': 'available',
  '维护中': 'maintenance',
};

function printUsage() {
  console.log(`\nStructured Import\n\nUsage:\n  node scripts/import-structured.js --users <users.csv> --venues <venues.csv> [--dry-run] [--replace-classrooms] [--db <db-path>]\n\nExamples:\n  node scripts/import-structured.js --users ../data/users.csv --venues ../data/venues.csv --dry-run\n  node scripts/import-structured.js --users ../data/users.csv --venues ../data/venues.csv --replace-classrooms\n`);
}

function parseArgs(argv) {
  const args = {
    usersPath: '',
    venuesPath: '',
    dryRun: false,
    replaceClassrooms: false,
    dbPath: DEFAULT_DB_PATH,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--users') {
      args.usersPath = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (item === '--venues') {
      args.venuesPath = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (item === '--db') {
      args.dbPath = path.resolve(process.cwd(), argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (item === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (item === '--replace-classrooms') {
      args.replaceClassrooms = true;
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
  return new sqlite3.Database(dbPath);
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
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

function parseCsv(text) {
  const rows = [];
  const input = String(text || '').replace(/^\uFEFF/, '');
  let currentField = '';
  let currentRow = [];
  let inQuotes = false;

  const pushField = () => {
    currentRow.push(currentField);
    currentField = '';
  };

  const pushRow = () => {
    const isEmpty = currentRow.every((cell) => String(cell || '').trim() === '');
    if (!isEmpty) rows.push(currentRow);
    currentRow = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ',') {
      pushField();
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      pushField();
      pushRow();
      if (ch === '\r' && next === '\n') i += 1;
      continue;
    }

    currentField += ch;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    pushField();
    pushRow();
  }

  return rows;
}

function toRecords(csvText, expectedHeaders, fileLabel) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    throw new Error(`${fileLabel}: file is empty`);
  }

  const headers = rows[0].map((item) => normalizeText(item));

  if (headers.some((item) => !item)) {
    throw new Error(`${fileLabel}: empty header name is not allowed`);
  }

  const duplicateHeaders = headers.filter((header, idx) => {
    if (!header) return false;
    return headers.indexOf(header) !== idx;
  });
  if (duplicateHeaders.length > 0) {
    throw new Error(`${fileLabel}: duplicate headers -> ${Array.from(new Set(duplicateHeaders)).join(', ')}`);
  }

  const unexpected = headers.filter((item) => item && !expectedHeaders.includes(item));
  if (unexpected.length > 0) {
    throw new Error(`${fileLabel}: unexpected headers -> ${unexpected.join(', ')}`);
  }

  const missing = expectedHeaders.filter((item) => !headers.includes(item));
  if (missing.length > 0) {
    throw new Error(`${fileLabel}: missing headers -> ${missing.join(', ')}`);
  }

  const records = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = normalizeText(row[idx]);
    });
    records.push({
      line: i + 1,
      data: obj,
    });
  }
  return records;
}

function normalizeRole(raw) {
  const role = normalizeText(raw).toLowerCase();
  return ROLE_MAP[role] || '';
}

function normalizeType(raw) {
  const key = normalizeText(raw).toLowerCase();
  return TYPE_MAP[key] || '';
}

function normalizeStatus(raw) {
  const key = normalizeText(raw).toLowerCase();
  if (!key) return 'available';
  return STATUS_MAP[key] || '';
}

function parseIdentityLast6(raw) {
  const value = normalizeText(raw);
  if (!value) return '';
  if (!/^\d{6}$/.test(value)) {
    throw new Error(`identity_last6 must be exactly 6 digits, got: ${value}`);
  }
  return value;
}

function parseCapacity(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`invalid capacity: ${raw}`);
  }
  return Math.floor(value);
}

function parseFacilities(raw) {
  const value = normalizeText(raw);
  if (!value) return [];

  if (value.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error(`invalid facilities JSON: ${value}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`facilities JSON must be array: ${value}`);
    }
    return parsed.map((item) => normalizeText(item)).filter(Boolean);
  }

  return value
    .split(/[;,|，]/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function buildLocation(buildingName, floorLabel, roomCode) {
  return [buildingName, floorLabel, roomCode].map((item) => normalizeText(item)).filter(Boolean).join(' ');
}

async function replaceClassrooms(db) {
  await run(
    db,
    `DELETE FROM reservation_slots
     WHERE venue_id IN (SELECT id FROM venues WHERE type = 'Classroom')
        OR reservation_id IN (SELECT id FROM reservations WHERE venue_id IN (SELECT id FROM venues WHERE type = 'Classroom'))`
  );

  await run(db, `DELETE FROM reservations WHERE venue_id IN (SELECT id FROM venues WHERE type = 'Classroom')`);
  const deleted = await run(db, `DELETE FROM venues WHERE type = 'Classroom'`);
  return deleted.changes || 0;
}

async function importUsers(db, records) {
  const userRows = await all(db, `SELECT id, username FROM users`);
  const userIdByUsername = new Map(userRows.map((item) => [item.username, item.id]));

  let created = 0;
  let updated = 0;

  for (const row of records) {
    const data = row.data;
    const username = normalizeText(data.username);
    const password = normalizeText(data.password);
    const role = normalizeRole(data.role);
    const contactInfo = normalizeText(data.contact_info);
    const identityLast6 = parseIdentityLast6(data.identity_last6);
    let managedBuilding = normalizeText(data.managed_building);
    let managedFloor = normalizeText(data.managed_floor);

    if (!username) {
      throw new Error(`users.csv line ${row.line}: username is required`);
    }
    if (!role) {
      throw new Error(`users.csv line ${row.line}: invalid role -> ${data.role}`);
    }

    if (!['venue_admin', 'floor_admin'].includes(role)) {
      managedBuilding = '';
      managedFloor = '';
    }

    if (role === 'floor_admin' && !managedBuilding && !managedFloor) {
      throw new Error(`users.csv line ${row.line}: floor_admin requires managed_building or managed_floor`);
    }

    const existingId = userIdByUsername.get(username);
    if (existingId) {
      if (password) {
        const hashed = await bcrypt.hash(password, 10);
        await run(
          db,
          `UPDATE users
           SET hashed_password = ?, role = ?, contact_info = ?, identity_last6 = ?, managed_building = ?, managed_floor = ?
           WHERE id = ?`,
          [hashed, role, contactInfo, identityLast6, managedBuilding, managedFloor, existingId]
        );
      } else {
        await run(
          db,
          `UPDATE users
           SET role = ?, contact_info = ?, identity_last6 = ?, managed_building = ?, managed_floor = ?
           WHERE id = ?`,
          [role, contactInfo, identityLast6, managedBuilding, managedFloor, existingId]
        );
      }
      updated += 1;
      continue;
    }

    if (!password) {
      throw new Error(`users.csv line ${row.line}: new user requires password`);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const insertRes = await run(
      db,
      `INSERT INTO users (username, hashed_password, role, is_first_login, contact_info, identity_last6, managed_building, managed_floor)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
      [username, hashedPassword, role, contactInfo, identityLast6, managedBuilding, managedFloor]
    );

    userIdByUsername.set(username, insertRes.lastID);
    created += 1;
  }

  return {
    created,
    updated,
    userIdByUsername,
  };
}

async function importVenues(db, records, userIdByUsername) {
  let created = 0;
  let updated = 0;

  for (const row of records) {
    const data = row.data;
    const name = normalizeText(data.name);
    const type = normalizeType(data.type);
    const capacity = parseCapacity(data.capacity);
    const buildingName = normalizeText(data.building_name);
    const floorLabel = normalizeText(data.floor_label);
    const roomCode = normalizeText(data.room_code);
    const facilities = parseFacilities(data.facilities);
    const status = normalizeStatus(data.status);
    const openHours = normalizeText(data.open_hours);
    const description = normalizeText(data.description);
    const adminUsername = normalizeText(data.admin_username);

    if (!name) throw new Error(`venues.csv line ${row.line}: name is required`);
    if (!type) throw new Error(`venues.csv line ${row.line}: invalid type -> ${data.type}`);
    if (!buildingName) throw new Error(`venues.csv line ${row.line}: building_name is required`);
    if (!floorLabel) throw new Error(`venues.csv line ${row.line}: floor_label is required`);
    if (!roomCode) throw new Error(`venues.csv line ${row.line}: room_code is required`);
    if (!status) throw new Error(`venues.csv line ${row.line}: invalid status -> ${data.status}`);
    if (!adminUsername) throw new Error(`venues.csv line ${row.line}: admin_username is required`);

    const adminId = userIdByUsername.get(adminUsername);
    if (!adminId) {
      throw new Error(`venues.csv line ${row.line}: admin_username not found -> ${adminUsername}`);
    }

    const location = buildLocation(buildingName, floorLabel, roomCode);

    const existing = await get(
      db,
      `SELECT id
       FROM venues
       WHERE type = ?
         AND IFNULL(building_name, '') = ?
         AND IFNULL(floor_label, '') = ?
         AND IFNULL(room_code, '') = ?
       LIMIT 1`,
      [type, buildingName, floorLabel, roomCode]
    );

    if (existing && existing.id) {
      await run(
        db,
        `UPDATE venues
         SET name = ?, capacity = ?, location = ?, facilities = ?, status = ?, admin_id = ?, open_hours = ?, description = ?,
             building_name = ?, floor_label = ?, room_code = ?
         WHERE id = ?`,
        [
          name,
          capacity,
          location,
          JSON.stringify(facilities),
          status,
          adminId,
          openHours,
          description,
          buildingName,
          floorLabel,
          roomCode,
          existing.id,
        ]
      );
      updated += 1;
    } else {
      await run(
        db,
        `INSERT INTO venues (
          name, type, capacity, location, facilities, status, admin_id, open_hours, description,
          building_name, floor_label, room_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          type,
          capacity,
          location,
          JSON.stringify(facilities),
          status,
          adminId,
          openHours,
          description,
          buildingName,
          floorLabel,
          roomCode,
        ]
      );
      created += 1;
    }
  }

  return { created, updated };
}

async function runStructuredImport({
  dbPath = DEFAULT_DB_PATH,
  usersCsvText = null,
  venuesCsvText = null,
  dryRun = false,
  replaceClassrooms: shouldReplaceClassrooms = false,
} = {}) {
  const hasUsersFile = usersCsvText !== null && usersCsvText !== undefined;
  const hasVenuesFile = venuesCsvText !== null && venuesCsvText !== undefined;

  if (!hasUsersFile && !hasVenuesFile) {
    throw new Error('at least one of usersCsvText or venuesCsvText is required');
  }

  const db = openDb(dbPath);
  try {
    await run(db, 'BEGIN TRANSACTION');

    let userStats = { created: 0, updated: 0, userIdByUsername: new Map() };
    if (hasUsersFile) {
      const userRecords = toRecords(String(usersCsvText), USER_HEADERS, 'users.csv');
      userStats = await importUsers(db, userRecords);
    } else {
      const rows = await all(db, 'SELECT id, username FROM users');
      userStats.userIdByUsername = new Map(rows.map((item) => [item.username, item.id]));
    }

    let deletedClassrooms = 0;
    if (shouldReplaceClassrooms) {
      deletedClassrooms = await replaceClassrooms(db);
    }

    let venueStats = { created: 0, updated: 0 };
    if (hasVenuesFile) {
      const venueRecords = toRecords(String(venuesCsvText), VENUE_HEADERS, 'venues.csv');
      venueStats = await importVenues(db, venueRecords, userStats.userIdByUsername);
    }

    if (dryRun) {
      await run(db, 'ROLLBACK');
    } else {
      await run(db, 'COMMIT');
    }

    return {
      dbPath,
      dryRun,
      users: { created: userStats.created, updated: userStats.updated },
      venues: { created: venueStats.created, updated: venueStats.updated },
      classroomsDeleted: deletedClassrooms,
    };
  } catch (error) {
    try {
      await run(db, 'ROLLBACK');
    } catch (rollbackError) {
      // no-op
    }
    throw error;
  } finally {
    db.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.usersPath && !args.venuesPath) {
    printUsage();
    throw new Error('at least one of --users or --venues is required');
  }

  const usersCsvText = args.usersPath
    ? fs.readFileSync(path.resolve(process.cwd(), args.usersPath), 'utf8')
    : null;
  const venuesCsvText = args.venuesPath
    ? fs.readFileSync(path.resolve(process.cwd(), args.venuesPath), 'utf8')
    : null;

  const summary = await runStructuredImport({
    dbPath: args.dbPath,
    usersCsvText,
    venuesCsvText,
    dryRun: args.dryRun,
    replaceClassrooms: args.replaceClassrooms,
  });

  if (summary.dryRun) {
    console.log('[import-structured] dry-run complete (no data persisted)');
  } else {
    console.log('[import-structured] import complete');
  }
  console.log(`- db: ${summary.dbPath}`);
  console.log(`- users created: ${summary.users.created}, updated: ${summary.users.updated}`);
  if (args.replaceClassrooms) {
    console.log(`- classrooms deleted before import: ${summary.classroomsDeleted}`);
  }
  console.log(`- venues created: ${summary.venues.created}, updated: ${summary.venues.updated}`);
}

module.exports = {
  runStructuredImport,
  USER_HEADERS,
  VENUE_HEADERS,
};

if (require.main === module) {
  main().catch((error) => {
    console.error('[import-structured] fatal:', error.message);
    process.exit(1);
  });
}
