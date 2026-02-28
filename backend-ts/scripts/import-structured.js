const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const DEFAULT_DB_PATH = path.resolve(process.cwd(), '..', 'campus.db');

const USER_REQUIRED_HEADERS = [
  'username',
  'password',
  'role',
  'contact_info',
  'identity_last6',
  'managed_building',
  'managed_floor',
];

const VENUE_REQUIRED_HEADERS = [
  'name',
  'type',
  'capacity',
  'facilities',
  'status',
  'open_hours',
  'description',
  'admin_username',
];

const VENUE_OPTIONAL_HEADERS = [
  'building_name',
  'floor_label',
  'room_code',
  'location',
  'image_url',
  'photos',
];

const USER_HEADERS = [...USER_REQUIRED_HEADERS];
const VENUE_HEADERS = [...VENUE_REQUIRED_HEADERS, ...VENUE_OPTIONAL_HEADERS];

const ROLE_MAP = {
  sys_admin: 'sys_admin',
  venue_admin: 'venue_admin',
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

const ADMIN_ROLES = new Set(['venue_admin']);
const DEFAULT_BUILDING = '未分区';
const DEFAULT_FLOOR = '未知楼层';
const IMMUTABLE_ADMIN_ROLE = 'sys_admin';

function printUsage() {
  console.log(`\nStructured Import\n\nUsage:\n  node scripts/import-structured.js --users <users.csv> --venues <venues.csv> [--dry-run] [--replace-classrooms] [--prune-missing-users] [--prune-missing-venues] [--db <db-path>]\n\nExamples:\n  node scripts/import-structured.js --users ../data/users.csv --venues ../data/venues.csv --dry-run\n  node scripts/import-structured.js --users ../data/users.csv --venues ../data/venues.csv --replace-classrooms --prune-missing-users --prune-missing-venues\n`);
}

function parseArgs(argv) {
  const args = {
    usersPath: '',
    venuesPath: '',
    dryRun: false,
    replaceClassrooms: false,
    pruneMissingUsers: false,
    pruneMissingVenues: false,
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
    if (item === '--prune-missing-users') {
      args.pruneMissingUsers = true;
      continue;
    }
    if (item === '--prune-missing-venues') {
      args.pruneMissingVenues = true;
      continue;
    }
    if (item === '--keep-missing-users') {
      args.pruneMissingUsers = false;
      continue;
    }
    if (item === '--keep-missing-venues') {
      args.pruneMissingVenues = false;
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

function createProgressReporter(onProgress) {
  if (typeof onProgress !== 'function') {
    return () => {};
  }
  return (payload) => {
    try {
      onProgress({
        timestamp: new Date().toISOString(),
        ...payload,
      });
    } catch (error) {
      // Keep import flow stable even if observer fails.
    }
  };
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

function toRecords(csvText, headerSchema, fileLabel) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    throw new Error(`${fileLabel}: file is empty`);
  }

  const requiredHeaders = Array.isArray(headerSchema)
    ? headerSchema
    : (headerSchema.requiredHeaders || []);
  const optionalHeaders = Array.isArray(headerSchema)
    ? []
    : (headerSchema.optionalHeaders || []);
  const allowedHeaders = new Set([...requiredHeaders, ...optionalHeaders]);

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

  const unexpected = headers.filter((item) => item && !allowedHeaders.has(item));
  if (unexpected.length > 0) {
    throw new Error(`${fileLabel}: unexpected headers -> ${unexpected.join(', ')}`);
  }

  const missing = requiredHeaders.filter((item) => !headers.includes(item));
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
  const value = normalizeText(raw);
  const key = value.toLowerCase();
  if (!value) return '';
  return TYPE_MAP[key] || value;
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

function parseStringArray(raw, fieldName) {
  const value = normalizeText(raw);
  if (!value) return [];

  if (value.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error(`invalid ${fieldName} JSON: ${value}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`${fieldName} JSON must be array: ${value}`);
    }
    return parsed.map((item) => normalizeText(item)).filter(Boolean);
  }

  return value
    .split(/[;,|，]/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function parsePhotos(raw) {
  return parseStringArray(raw, 'photos');
}

function parseVenueLocation(location, fallbackName) {
  const raw = normalizeText(location) || normalizeText(fallbackName);
  if (!raw) {
    return {
      buildingName: DEFAULT_BUILDING,
      floorLabel: DEFAULT_FLOOR,
      roomName: '',
    };
  }

  const buildingMatch =
    raw.match(/((?:Building|Block|Tower)\s*[A-Za-z0-9-]+)/i)
    || raw.match(/([A-Za-z0-9\u4e00-\u9fa5-]+(?:楼|栋|馆|中心|大楼))/)
    || raw.match(/^([A-Za-z]+(?:-?[A-Za-z0-9]+)?)/);

  const buildingName = buildingMatch && buildingMatch[1]
    ? normalizeText(buildingMatch[1])
    : DEFAULT_BUILDING;
  const floorMatch = raw.match(/((?:B\d+|\d+)[F层]|(?:地上|地下)?\d+层|[一二三四五六七八九十]+层)/);
  const floorLabel = floorMatch && floorMatch[1]
    ? normalizeText(floorMatch[1])
    : DEFAULT_FLOOR;

  let roomName = '';
  if (buildingMatch && buildingMatch[1]) {
    roomName = normalizeText(
      raw.replace(buildingMatch[1], '').replace(/^[\s,，:/\-]+/, '')
    );
  } else {
    const splitParts = raw.split(/[\s,，:/]+/).filter(Boolean);
    roomName = splitParts.length > 1 ? normalizeText(splitParts.slice(1).join(' ')) : '';
  }

  if (!roomName) {
    const roomMatch = raw.match(/([A-Za-z]?\d{2,4}[A-Za-z]?室?)/);
    roomName = roomMatch && roomMatch[1] ? normalizeText(roomMatch[1]) : '';
  }

  return {
    buildingName,
    floorLabel,
    roomName,
  };
}

function buildLocation(buildingName, floorLabel, roomCode, fallback) {
  const pieces = [buildingName, floorLabel, roomCode].map((item) => normalizeText(item)).filter(Boolean);
  if (pieces.length > 0) return pieces.join(' ');
  return normalizeText(fallback);
}

function resolveVenueLocationFields({
  buildingNameRaw,
  floorLabelRaw,
  roomCodeRaw,
  locationRaw,
  fallbackName,
}) {
  const parsed = parseVenueLocation(locationRaw, fallbackName);
  const buildingName = normalizeText(buildingNameRaw) || parsed.buildingName || DEFAULT_BUILDING;
  const floorLabel = normalizeText(floorLabelRaw) || parsed.floorLabel || DEFAULT_FLOOR;
  const roomCode = normalizeText(roomCodeRaw) || parsed.roomName || normalizeText(fallbackName);
  const location = buildLocation(buildingName, floorLabel, roomCode, locationRaw || fallbackName);

  return {
    buildingName,
    floorLabel,
    roomCode,
    location,
  };
}

function normalizeNullable(value) {
  const text = normalizeText(value);
  return text || null;
}

function buildVenueIdentityKey(buildingName, floorLabel, roomCode) {
  return [buildingName, floorLabel, roomCode]
    .map((item) => normalizeText(item).toLowerCase())
    .join('||');
}

function chunkArray(items, chunkSize = 300) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const size = Math.max(1, Number(chunkSize || 300));
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function inClause(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('inClause requires non-empty values');
  }
  return values.map(() => '?').join(', ');
}

function assertAdminScopeForVenue(admin, buildingName, floorLabel, rowLine) {
  if (!admin) return;
  const role = normalizeText(admin.role);
  const managedBuilding = normalizeText(admin.managedBuilding);
  const managedFloor = normalizeText(admin.managedFloor);

  if (role === IMMUTABLE_ADMIN_ROLE) {
    throw new Error(`venues.csv line ${rowLine}: admin user "${admin.username}" cannot be ${IMMUTABLE_ADMIN_ROLE}`);
  }

  if (!ADMIN_ROLES.has(role)) {
    throw new Error(`venues.csv line ${rowLine}: admin user role must be venue_admin`);
  }

  if (!managedBuilding && !managedFloor) {
    throw new Error(`venues.csv line ${rowLine}: admin user "${admin.username}" has empty managed scope`);
  }

  if (managedBuilding && managedBuilding !== buildingName) {
    throw new Error(`venues.csv line ${rowLine}: admin user "${admin.username}" managed_building mismatch -> ${buildingName}`);
  }
  if (managedFloor && managedFloor !== floorLabel) {
    throw new Error(`venues.csv line ${rowLine}: admin user "${admin.username}" managed_floor mismatch -> ${floorLabel}`);
  }
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

async function deleteVenuesCascade(db, venueIds) {
  if (!Array.isArray(venueIds) || venueIds.length === 0) {
    return {
      deleted: 0,
      reservationsDeleted: 0,
      slotsDeleted: 0,
    };
  }

  let deleted = 0;
  let reservationsDeleted = 0;
  let slotsDeleted = 0;

  const chunks = chunkArray(venueIds, 300);
  for (const ids of chunks) {
    const clause = inClause(ids);
    const slotByVenue = await run(
      db,
      `DELETE FROM reservation_slots WHERE venue_id IN (${clause})`,
      ids,
    );
    slotsDeleted += slotByVenue.changes || 0;

    const slotByReservation = await run(
      db,
      `DELETE FROM reservation_slots
       WHERE reservation_id IN (
         SELECT id FROM reservations WHERE venue_id IN (${clause})
       )`,
      ids,
    );
    slotsDeleted += slotByReservation.changes || 0;

    const reservationDelete = await run(
      db,
      `DELETE FROM reservations WHERE venue_id IN (${clause})`,
      ids,
    );
    reservationsDeleted += reservationDelete.changes || 0;

    const venueDelete = await run(
      db,
      `DELETE FROM venues WHERE id IN (${clause})`,
      ids,
    );
    deleted += venueDelete.changes || 0;
  }

  return {
    deleted,
    reservationsDeleted,
    slotsDeleted,
  };
}

async function pruneMissingVenues(db, importedIdentityKeys) {
  const currentVenues = await all(
    db,
    `SELECT id, IFNULL(building_name, '') AS building_name, IFNULL(floor_label, '') AS floor_label, IFNULL(room_code, '') AS room_code
     FROM venues`,
  );
  const staleVenueIds = [];
  for (const row of currentVenues) {
    const identityKey = buildVenueIdentityKey(row.building_name, row.floor_label, row.room_code);
    if (!importedIdentityKeys.has(identityKey)) {
      staleVenueIds.push(Number(row.id));
    }
  }
  return deleteVenuesCascade(db, staleVenueIds);
}

async function loadUserProfiles(db) {
  const rows = await all(
    db,
    `SELECT id, username, role, IFNULL(managed_building, '') AS managed_building, IFNULL(managed_floor, '') AS managed_floor
     FROM users`
  );

  const userByUsername = new Map();
  for (const row of rows) {
    const username = normalizeText(row.username);
    if (!username) continue;
    userByUsername.set(username, {
      id: row.id,
      username,
      role: normalizeText(row.role),
      managedBuilding: normalizeText(row.managed_building),
      managedFloor: normalizeText(row.managed_floor),
    });
  }
  return userByUsername;
}

async function loadImmutableAdmin(db) {
  const rows = await all(
    db,
    `SELECT id, username
     FROM users
     WHERE role = ?
     ORDER BY id ASC`,
    [IMMUTABLE_ADMIN_ROLE],
  );
  if (rows.length !== 1) {
    throw new Error(`users table must contain exactly 1 ${IMMUTABLE_ADMIN_ROLE} account, got: ${rows.length}`);
  }
  return {
    id: Number(rows[0].id),
    username: normalizeText(rows[0].username),
  };
}

async function importUsers(db, records, options = {}) {
  const userByUsername = await loadUserProfiles(db);
  const immutableAdmin = await loadImmutableAdmin(db);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const progressTick = Math.max(1, Number(options.progressTick || 50));
  const importedUsernames = new Set();
  const seenUsernamesInCsv = new Set();

  let created = 0;
  let updated = 0;
  let processed = 0;

  if (onProgress) {
    onProgress({ processed, total: records.length, created, updated });
  }

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
    if (seenUsernamesInCsv.has(username)) {
      throw new Error(`users.csv line ${row.line}: duplicate username -> ${username}`);
    }
    seenUsernamesInCsv.add(username);
    importedUsernames.add(username);
    if (username === immutableAdmin.username) {
      throw new Error(`users.csv line ${row.line}: immutable ${IMMUTABLE_ADMIN_ROLE} account "${immutableAdmin.username}" must not appear in users.csv`);
    }
    if (!role) {
      throw new Error(`users.csv line ${row.line}: invalid role -> ${data.role}`);
    }
    if (role === IMMUTABLE_ADMIN_ROLE) {
      throw new Error(`users.csv line ${row.line}: ${IMMUTABLE_ADMIN_ROLE} is managed by system and must not appear in users.csv`);
    }

    if (role !== 'venue_admin') {
      managedBuilding = '';
      managedFloor = '';
    }

    if (role === 'venue_admin' && !managedBuilding && !managedFloor) {
      throw new Error(`users.csv line ${row.line}: venue_admin requires managed_building or managed_floor`);
    }

    const existingUser = userByUsername.get(username);

    if (existingUser && normalizeText(existingUser.role) === IMMUTABLE_ADMIN_ROLE) {
      throw new Error(`users.csv line ${row.line}: immutable ${IMMUTABLE_ADMIN_ROLE} account "${immutableAdmin.username}" cannot be modified`);
    }

    if (existingUser && existingUser.id) {
      if (password) {
        const hashed = await bcrypt.hash(password, 10);
        await run(
          db,
          `UPDATE users
           SET hashed_password = ?, role = ?, contact_info = ?, identity_last6 = ?, managed_building = ?, managed_floor = ?
           WHERE id = ?`,
          [hashed, role, contactInfo, identityLast6, managedBuilding, managedFloor, existingUser.id]
        );
      } else {
        await run(
          db,
          `UPDATE users
           SET role = ?, contact_info = ?, identity_last6 = ?, managed_building = ?, managed_floor = ?
           WHERE id = ?`,
          [role, contactInfo, identityLast6, managedBuilding, managedFloor, existingUser.id]
        );
      }
      userByUsername.set(username, {
        id: existingUser.id,
        username,
        role,
        managedBuilding,
        managedFloor,
      });
      updated += 1;
      processed += 1;
      if (onProgress && (processed % progressTick === 0 || processed === records.length)) {
        onProgress({ processed, total: records.length, created, updated });
      }
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

    userByUsername.set(username, {
      id: insertRes.lastID,
      username,
      role,
      managedBuilding,
      managedFloor,
    });
    created += 1;
    processed += 1;
    if (onProgress && (processed % progressTick === 0 || processed === records.length)) {
      onProgress({ processed, total: records.length, created, updated });
    }
  }

  return {
    created,
    updated,
    importedUsernames,
    userByUsername,
  };
}

async function importVenues(db, records, userByUsername, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const progressTick = Math.max(1, Number(options.progressTick || 20));
  let created = 0;
  let updated = 0;
  let processed = 0;
  const seenIdentityKeys = new Set();

  if (onProgress) {
    onProgress({ processed, total: records.length, created, updated });
  }

  for (const row of records) {
    const data = row.data;
    const name = normalizeText(data.name);
    const type = normalizeType(data.type);
    const capacity = parseCapacity(data.capacity);
    const locationInput = normalizeText(data.location);
    const locationFields = resolveVenueLocationFields({
      buildingNameRaw: data.building_name,
      floorLabelRaw: data.floor_label,
      roomCodeRaw: data.room_code,
      locationRaw: locationInput,
      fallbackName: name,
    });
    const buildingName = locationFields.buildingName;
    const floorLabel = locationFields.floorLabel;
    const roomCode = locationFields.roomCode;
    const location = locationFields.location;
    const facilities = parseFacilities(data.facilities);
    const status = normalizeStatus(data.status);
    const openHours = normalizeText(data.open_hours);
    const description = normalizeText(data.description);
    const imageUrl = normalizeNullable(data.image_url);
    const photos = parsePhotos(data.photos);
    const adminUsername = normalizeText(data.admin_username);

    if (!name) throw new Error(`venues.csv line ${row.line}: name is required`);
    if (!type) throw new Error(`venues.csv line ${row.line}: invalid type -> ${data.type}`);
    if (!status) throw new Error(`venues.csv line ${row.line}: invalid status -> ${data.status}`);
    if (!adminUsername) throw new Error(`venues.csv line ${row.line}: admin_username is required`);

    if (!buildingName || buildingName === DEFAULT_BUILDING) {
      throw new Error(`venues.csv line ${row.line}: missing building_name and unable to resolve from location/name`);
    }
    if (!floorLabel || floorLabel === DEFAULT_FLOOR) {
      throw new Error(`venues.csv line ${row.line}: missing floor_label and unable to resolve from location`);
    }
    if (!roomCode) {
      throw new Error(`venues.csv line ${row.line}: room_code is required (or resolvable from location/name)`);
    }

    const identityKey = buildVenueIdentityKey(buildingName, floorLabel, roomCode);
    if (seenIdentityKeys.has(identityKey)) {
      throw new Error(`venues.csv line ${row.line}: duplicate building/floor/room in file -> ${buildingName} ${floorLabel} ${roomCode}`);
    }
    seenIdentityKeys.add(identityKey);

    const admin = userByUsername.get(adminUsername);
    if (!admin || !admin.id) {
      throw new Error(`venues.csv line ${row.line}: admin_username not found -> ${adminUsername}`);
    }
    assertAdminScopeForVenue(admin, buildingName, floorLabel, row.line);

    const existing = await get(
      db,
      `SELECT id
       FROM venues
       WHERE IFNULL(building_name, '') = ?
         AND IFNULL(floor_label, '') = ?
         AND IFNULL(room_code, '') = ?
       LIMIT 1`,
      [buildingName, floorLabel, roomCode]
    );

    if (existing && existing.id) {
      await run(
        db,
        `UPDATE venues
         SET name = ?, type = ?, capacity = ?, location = ?, facilities = ?, status = ?, admin_id = ?, open_hours = ?, description = ?,
             building_name = ?, floor_label = ?, room_code = ?, image_url = ?, photos = ?
         WHERE id = ?`,
        [
          name,
          type,
          capacity,
          location,
          JSON.stringify(facilities),
          status,
          admin.id,
          openHours,
          description,
          buildingName,
          floorLabel,
          roomCode,
          imageUrl,
          JSON.stringify(photos),
          existing.id,
        ]
      );
      updated += 1;
    } else {
      await run(
        db,
        `INSERT INTO venues (
          name, type, capacity, location, facilities, status, admin_id, open_hours, description,
          building_name, floor_label, room_code, image_url, photos
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          type,
          capacity,
          location,
          JSON.stringify(facilities),
          status,
          admin.id,
          openHours,
          description,
          buildingName,
          floorLabel,
          roomCode,
          imageUrl,
          JSON.stringify(photos),
        ]
      );
      created += 1;
    }

    processed += 1;
    if (onProgress && (processed % progressTick === 0 || processed === records.length)) {
      onProgress({ processed, total: records.length, created, updated });
    }
  }

  return { created, updated, importedIdentityKeys: seenIdentityKeys };
}

async function pruneMissingUsers(db, importedUsernames, options = {}) {
  const protectedUsernames = new Set(
    Array.isArray(options.protectedUsernames)
      ? options.protectedUsernames.map((item) => normalizeText(item)).filter(Boolean)
      : [],
  );
  const immutableAdminRows = await all(
    db,
    `SELECT username FROM users WHERE role = ?`,
    [IMMUTABLE_ADMIN_ROLE],
  );
  for (const row of immutableAdminRows) {
    const username = normalizeText(row.username);
    if (username) {
      protectedUsernames.add(username);
    }
  }

  const userRows = await all(
    db,
    `SELECT id, username FROM users`,
  );

  const staleUserIds = [];
  const userById = new Map();
  for (const row of userRows) {
    const username = normalizeText(row.username);
    const userId = Number(row.id);
    userById.set(userId, username);
    if (protectedUsernames.has(username)) continue;
    if (!importedUsernames.has(username)) {
      staleUserIds.push(userId);
    }
  }

  if (staleUserIds.length === 0) {
    return {
      deleted: 0,
      blocked: 0,
      blockedUsernames: [],
      reservationsDeleted: 0,
      slotsDeleted: 0,
      notificationsDeleted: 0,
    };
  }

  const blockedUserIds = new Set();
  for (const ids of chunkArray(staleUserIds, 300)) {
    const clause = inClause(ids);
    const rows = await all(
      db,
      `SELECT DISTINCT admin_id AS id FROM venues WHERE admin_id IN (${clause})`,
      ids,
    );
    for (const row of rows) {
      blockedUserIds.add(Number(row.id));
    }
  }

  const deletableUserIds = staleUserIds.filter((id) => !blockedUserIds.has(id));

  let deleted = 0;
  let reservationsDeleted = 0;
  let slotsDeleted = 0;
  let notificationsDeleted = 0;

  for (const ids of chunkArray(deletableUserIds, 300)) {
    const clause = inClause(ids);
    const slotDelete = await run(
      db,
      `DELETE FROM reservation_slots
       WHERE reservation_id IN (
         SELECT id FROM reservations WHERE user_id IN (${clause})
       )`,
      ids,
    );
    slotsDeleted += slotDelete.changes || 0;

    const reservationDelete = await run(
      db,
      `DELETE FROM reservations WHERE user_id IN (${clause})`,
      ids,
    );
    reservationsDeleted += reservationDelete.changes || 0;

    const notificationDelete = await run(
      db,
      `DELETE FROM notifications WHERE user_id IN (${clause})`,
      ids,
    );
    notificationsDeleted += notificationDelete.changes || 0;

    const userDelete = await run(
      db,
      `DELETE FROM users WHERE id IN (${clause})`,
      ids,
    );
    deleted += userDelete.changes || 0;
  }

  const blockedUsernames = Array.from(blockedUserIds)
    .map((id) => userById.get(id))
    .filter(Boolean);

  return {
    deleted,
    blocked: blockedUserIds.size,
    blockedUsernames,
    reservationsDeleted,
    slotsDeleted,
    notificationsDeleted,
  };
}

async function runStructuredImport({
  dbPath = DEFAULT_DB_PATH,
  usersCsvText = null,
  venuesCsvText = null,
  dryRun = false,
  replaceClassrooms: shouldReplaceClassrooms = false,
  pruneMissingUsers: shouldPruneMissingUsers = false,
  pruneMissingVenues: shouldPruneMissingVenues = false,
  protectedUsernames = [],
  onProgress = null,
} = {}) {
  const report = createProgressReporter(onProgress);
  let lastPercent = 0;
  const emitProgress = (payload) => {
    const rawPercent = Number(payload?.percent || 0);
    const nextPercent = Math.max(lastPercent, Math.min(100, Math.floor(rawPercent)));
    lastPercent = nextPercent;
    report({ ...payload, percent: nextPercent });
  };

  const hasUsersFile = usersCsvText !== null && usersCsvText !== undefined;
  const hasVenuesFile = venuesCsvText !== null && venuesCsvText !== undefined;

  if (!hasUsersFile && !hasVenuesFile) {
    throw new Error('at least one of usersCsvText or venuesCsvText is required');
  }

  emitProgress({
    phase: 'prepare',
    status: 'running',
    message: '开始解析 CSV 文件',
    percent: 1,
  });

  const userRecords = hasUsersFile
    ? toRecords(
      String(usersCsvText),
      { requiredHeaders: USER_REQUIRED_HEADERS },
      'users.csv'
    )
    : [];

  const venueRecords = hasVenuesFile
    ? toRecords(
      String(venuesCsvText),
      {
        requiredHeaders: VENUE_REQUIRED_HEADERS,
        optionalHeaders: VENUE_OPTIONAL_HEADERS,
      },
      'venues.csv'
    )
    : [];

  emitProgress({
    phase: 'prepare',
    status: 'running',
    message: `CSV 解析完成：users ${userRecords.length} 行，venues ${venueRecords.length} 行`,
    percent: 8,
  });

  const usersSpan = hasUsersFile ? 37 : 0;
  const replaceSpan = shouldReplaceClassrooms ? 8 : 0;
  const venuesSpan = hasVenuesFile ? 27 : 0;
  const cleanupVenuesSpan = hasVenuesFile && shouldPruneMissingVenues ? 10 : 0;
  const cleanupUsersSpan = hasUsersFile && shouldPruneMissingUsers ? 10 : 0;
  const afterUsers = 8 + usersSpan;
  const afterReplace = afterUsers + replaceSpan;
  const afterVenues = afterReplace + venuesSpan;
  const afterCleanupVenues = afterVenues + cleanupVenuesSpan;
  const afterCleanupUsers = afterCleanupVenues + cleanupUsersSpan;
  const finalizeBase = afterCleanupUsers;

  const db = openDb(dbPath);
  try {
    await run(db, 'BEGIN TRANSACTION');
    emitProgress({
      phase: 'transaction',
      status: 'running',
      message: '已开始数据库事务',
      percent: 10,
    });

    let userStats = { created: 0, updated: 0, importedUsernames: new Set(), userByUsername: new Map() };
    if (hasUsersFile) {
      emitProgress({
        phase: 'users',
        status: 'running',
        message: '正在导入 users.csv',
        percent: 10,
      });
      userStats = await importUsers(db, userRecords, {
        onProgress: ({ processed, total }) => {
          const ratio = total > 0 ? (processed / total) : 1;
          emitProgress({
            phase: 'users',
            status: 'running',
            message: `正在导入 users.csv (${processed}/${total})`,
            percent: 8 + usersSpan * ratio,
          });
        },
      });
    } else {
      userStats.userByUsername = await loadUserProfiles(db);
    }

    emitProgress({
      phase: 'users',
      status: 'running',
      message: hasUsersFile ? 'users.csv 导入完成' : '未上传 users.csv，已加载现有用户',
      percent: afterUsers,
    });

    let deletedClassrooms = 0;
    if (shouldReplaceClassrooms) {
      emitProgress({
        phase: 'replace_classrooms',
        status: 'running',
        message: '正在清空全部 Classroom 场馆及关联预约',
        percent: afterUsers + 1,
      });
      deletedClassrooms = await replaceClassrooms(db);
      emitProgress({
        phase: 'replace_classrooms',
        status: 'running',
        message: `Classroom 清理完成，共删除 ${deletedClassrooms} 条`,
        percent: afterReplace,
      });
    }

    let venueStats = { created: 0, updated: 0, importedIdentityKeys: new Set() };
    if (hasVenuesFile) {
      emitProgress({
        phase: 'venues',
        status: 'running',
        message: '正在导入 venues.csv',
        percent: afterReplace + 1,
      });
      venueStats = await importVenues(db, venueRecords, userStats.userByUsername, {
        onProgress: ({ processed, total }) => {
          const ratio = total > 0 ? (processed / total) : 1;
          emitProgress({
            phase: 'venues',
            status: 'running',
            message: `正在导入 venues.csv (${processed}/${total})`,
            percent: afterReplace + venuesSpan * ratio,
          });
        },
      });
    }

    let venueCleanupStats = { deleted: 0, reservationsDeleted: 0, slotsDeleted: 0 };
    if (hasVenuesFile && shouldPruneMissingVenues) {
      emitProgress({
        phase: 'cleanup_venues',
        status: 'running',
        message: '正在清理 CSV 中不存在的历史场馆',
        percent: afterVenues + 1,
      });
      venueCleanupStats = await pruneMissingVenues(db, venueStats.importedIdentityKeys);
      emitProgress({
        phase: 'cleanup_venues',
        status: 'running',
        message: `历史场馆清理完成，删除 ${venueCleanupStats.deleted} 条`,
        percent: afterCleanupVenues,
      });
    }

    let userCleanupStats = {
      deleted: 0,
      blocked: 0,
      blockedUsernames: [],
      reservationsDeleted: 0,
      slotsDeleted: 0,
      notificationsDeleted: 0,
    };
    if (hasUsersFile && shouldPruneMissingUsers) {
      emitProgress({
        phase: 'cleanup_users',
        status: 'running',
        message: '正在清理 CSV 中不存在的历史用户',
        percent: afterCleanupVenues + 1,
      });
      userCleanupStats = await pruneMissingUsers(db, userStats.importedUsernames, {
        protectedUsernames,
      });
      const blockedHint = userCleanupStats.blocked > 0
        ? `，保留 ${userCleanupStats.blocked} 个仍被场馆引用的管理员`
        : '';
      emitProgress({
        phase: 'cleanup_users',
        status: 'running',
        message: `历史用户清理完成，删除 ${userCleanupStats.deleted} 条${blockedHint}`,
        percent: afterCleanupUsers,
      });
    }

    emitProgress({
      phase: 'finalize',
      status: 'running',
      message: dryRun ? '准备回滚事务（dry-run）' : '准备提交事务',
      percent: Math.max(finalizeBase, 96),
    });

    if (dryRun) {
      await run(db, 'ROLLBACK');
    } else {
      await run(db, 'COMMIT');
    }

    emitProgress({
      phase: 'done',
      status: 'completed',
      message: dryRun ? 'dry-run 完成（未落库）' : '导入完成',
      percent: 100,
    });

    return {
      dbPath,
      dryRun,
      users: {
        created: userStats.created,
        updated: userStats.updated,
        deleted: userCleanupStats.deleted,
        blocked: userCleanupStats.blocked,
        blockedUsernames: userCleanupStats.blockedUsernames,
        reservationsDeleted: userCleanupStats.reservationsDeleted,
        slotsDeleted: userCleanupStats.slotsDeleted,
        notificationsDeleted: userCleanupStats.notificationsDeleted,
      },
      venues: {
        created: venueStats.created,
        updated: venueStats.updated,
        deleted: venueCleanupStats.deleted,
        reservationsDeleted: venueCleanupStats.reservationsDeleted,
        slotsDeleted: venueCleanupStats.slotsDeleted,
      },
      classroomsDeleted: deletedClassrooms,
    };
  } catch (error) {
    try {
      await run(db, 'ROLLBACK');
    } catch (rollbackError) {
      // no-op
    }
    emitProgress({
      phase: 'failed',
      status: 'failed',
      message: error?.message || '导入失败',
      percent: 100,
    });
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
    pruneMissingUsers: args.pruneMissingUsers,
    pruneMissingVenues: args.pruneMissingVenues,
  });

  if (summary.dryRun) {
    console.log('[import-structured] dry-run complete (no data persisted)');
  } else {
    console.log('[import-structured] import complete');
  }
  console.log(`- db: ${summary.dbPath}`);
  console.log(`- users created: ${summary.users.created}, updated: ${summary.users.updated}`);
  console.log(`- users deleted: ${summary.users.deleted}, blocked: ${summary.users.blocked}`);
  if (args.replaceClassrooms) {
    console.log(`- classrooms deleted before import: ${summary.classroomsDeleted}`);
  }
  console.log(`- venues created: ${summary.venues.created}, updated: ${summary.venues.updated}`);
  console.log(`- venues deleted: ${summary.venues.deleted}`);
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
