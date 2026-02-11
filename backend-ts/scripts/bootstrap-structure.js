const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), '..', 'campus.db');

const DEFAULT_BUILDING = '未分区';
const DEFAULT_FLOOR = '未知楼层';
const DEFAULT_FLOOR_ADMIN_PASSWORD = process.env.FLOOR_ADMIN_PASSWORD || 'Floor@123456';

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseVenueLocation(location, fallbackName) {
  const raw = normalizeText(location) || normalizeText(fallbackName);
  if (!raw) {
    return { buildingName: DEFAULT_BUILDING, floorLabel: DEFAULT_FLOOR, roomCode: '' };
  }

  const buildingMatch =
    raw.match(/((?:Building|Block|Tower)\s*[A-Za-z0-9-]+)/i) ||
    raw.match(/([A-Za-z0-9\u4e00-\u9fa5-]+(?:楼|栋|馆|中心|大楼))/) ||
    raw.match(/^([A-Za-z]+(?:-?[A-Za-z0-9]+)?)/);
  const floorMatch = raw.match(/((?:B\d+|\d+)[F层]|(?:地上|地下)?\d+层|[一二三四五六七八九十]+层)/);

  const buildingName = buildingMatch && buildingMatch[1] ? buildingMatch[1].trim() : DEFAULT_BUILDING;
  const floorLabel = floorMatch && floorMatch[1] ? floorMatch[1].trim() : DEFAULT_FLOOR;

  let roomCode = '';
  if (buildingMatch && buildingMatch[1]) {
    roomCode = raw.replace(buildingMatch[1], '').replace(/^[\s,，:/\-]+/, '').trim();
  }
  if (floorMatch && floorMatch[1]) {
    roomCode = roomCode.replace(floorMatch[1], '').replace(/^[\s,，:/\-]+/, '').trim();
  }
  if (!roomCode) {
    const roomMatch = raw.match(/([A-Za-z]?\d{2,4}[A-Za-z]?室?)/);
    roomCode = roomMatch ? roomMatch[1] : '';
  }
  if (!roomCode) {
    roomCode = normalizeText(fallbackName);
  }

  return { buildingName, floorLabel, roomCode };
}

function buildLocation(buildingName, floorLabel, roomCode, fallback) {
  const parts = [normalizeText(buildingName), normalizeText(floorLabel), normalizeText(roomCode)].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' ');
  }
  return normalizeText(fallback);
}

function slugify(input) {
  return normalizeText(input)
    .replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function buildSlotWindows(start, end, slotMinutes = 5) {
  const slotMs = slotMinutes * 60 * 1000;
  const fromMs = Math.floor(start.getTime() / slotMs) * slotMs;
  const toMs = Math.ceil(end.getTime() / slotMs) * slotMs;
  const windows = [];
  for (let ms = fromMs; ms < toMs; ms += slotMs) {
    windows.push({
      start: new Date(ms),
      end: new Date(ms + slotMs),
    });
  }
  return windows;
}

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function ensureColumns(db) {
  const alterSql = [
    "ALTER TABLE users ADD COLUMN managed_building varchar",
    "ALTER TABLE users ADD COLUMN managed_floor varchar",
    "ALTER TABLE venues ADD COLUMN building_name varchar",
    "ALTER TABLE venues ADD COLUMN floor_label varchar",
    "ALTER TABLE venues ADD COLUMN room_code varchar",
  ];

  for (const sql of alterSql) {
    try {
      await run(db, sql);
    } catch (error) {
      const msg = String(error.message || '');
      if (!msg.includes('duplicate column name')) {
        throw error;
      }
    }
  }

  await run(
    db,
    `CREATE TABLE IF NOT EXISTS reservation_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER NOT NULL,
      reservation_id INTEGER NOT NULL,
      slot_start datetime NOT NULL,
      slot_end datetime NOT NULL,
      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
    )`
  );

  await run(
    db,
    'CREATE UNIQUE INDEX IF NOT EXISTS IDX_reservation_slots_venue_start ON reservation_slots (venue_id, slot_start)'
  );
}

async function backfillVenues(db) {
  const venues = await all(db, 'SELECT id, name, location, building_name, floor_label, room_code, type FROM venues');
  for (const venue of venues) {
    const parsed = parseVenueLocation(venue.location, venue.name);
    const buildingName = normalizeText(venue.building_name) || parsed.buildingName;
    const floorLabel = normalizeText(venue.floor_label) || parsed.floorLabel;
    const roomCode = normalizeText(venue.room_code) || parsed.roomCode || venue.name;
    const location = buildLocation(buildingName, floorLabel, roomCode, venue.location);

    await run(
      db,
      'UPDATE venues SET building_name = ?, floor_label = ?, room_code = ?, location = ? WHERE id = ?',
      [buildingName, floorLabel, roomCode, location, venue.id]
    );
  }

  return venues.length;
}

async function ensureStructuredDemoVenues(db) {
  const manager = await all(
    db,
    "SELECT id FROM users WHERE role IN ('venue_admin', 'sys_admin') ORDER BY CASE role WHEN 'venue_admin' THEN 0 ELSE 1 END, id LIMIT 1"
  );
  if (manager.length < 1) {
    return 0;
  }
  const adminId = manager[0].id;

  const templates = [
    { building: '明德楼', floor: '1层', room: '101', capacity: 48 },
    { building: '明德楼', floor: '1层', room: '102', capacity: 48 },
    { building: '明德楼', floor: '2层', room: '201', capacity: 56 },
    { building: '明德楼', floor: '2层', room: '202', capacity: 56 },
    { building: '知行楼', floor: '1层', room: '110', capacity: 40 },
    { building: '知行楼', floor: '3层', room: '301', capacity: 42 },
    { building: '知行楼', floor: '3层', room: '302', capacity: 42 },
  ];

  let inserted = 0;
  for (const item of templates) {
    const found = await all(
      db,
      "SELECT id FROM venues WHERE type = 'Classroom' AND IFNULL(building_name, '') = ? AND IFNULL(floor_label, '') = ? AND IFNULL(room_code, '') = ? LIMIT 1",
      [item.building, item.floor, item.room]
    );
    if (found.length > 0) {
      continue;
    }

    const name = `${item.building}${item.room}`;
    const location = buildLocation(item.building, item.floor, item.room, '');
    await run(
      db,
      `INSERT INTO venues (name, type, capacity, location, facilities, status, admin_id, open_hours, description, building_name, floor_label, room_code)
       VALUES (?, 'Classroom', ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?)`,
      [
        name,
        item.capacity,
        location,
        JSON.stringify(['投影仪', '白板']),
        adminId,
        '周一至周日 08:00-22:00',
        '结构化示例教室',
        item.building,
        item.floor,
        item.room,
      ]
    );
    inserted += 1;
  }

  return inserted;
}

async function ensureFloorAdmins(db) {
  const classrooms = await all(
    db,
    "SELECT DISTINCT building_name, floor_label FROM venues WHERE type = 'Classroom' AND IFNULL(building_name, '') <> ''"
  );

  const existingUsers = await all(db, 'SELECT username FROM users');
  const usernameSet = new Set(existingUsers.map((item) => item.username));
  const passwordHash = await bcrypt.hash(DEFAULT_FLOOR_ADMIN_PASSWORD, 10);
  const activeScopes = new Set(classrooms.map((row) => `${normalizeText(row.building_name) || DEFAULT_BUILDING}||${normalizeText(row.floor_label) || DEFAULT_FLOOR}`));

  let created = 0;
  for (const row of classrooms) {
    const building = normalizeText(row.building_name) || DEFAULT_BUILDING;
    const floor = normalizeText(row.floor_label) || DEFAULT_FLOOR;

    const base = `floor_${slugify(building)}_${slugify(floor)}`.slice(0, 40) || `floor_admin_${created + 1}`;
    let username = base;
    let seq = 1;
    while (usernameSet.has(username)) {
      seq += 1;
      username = `${base}_${seq}`.slice(0, 50);
    }

    const alreadyScoped = await all(
      db,
      "SELECT id FROM users WHERE role = 'floor_admin' AND IFNULL(managed_building, '') = ? AND IFNULL(managed_floor, '') = ? LIMIT 1",
      [building, floor]
    );
    if (alreadyScoped.length > 0) {
      continue;
    }

    await run(
      db,
      `INSERT INTO users (username, hashed_password, role, is_first_login, contact_info, managed_building, managed_floor)
       VALUES (?, ?, 'floor_admin', 1, ?, ?, ?)`,
      [username, passwordHash, `floor-admin:${building}/${floor}`, building, floor]
    );
    usernameSet.add(username);
    created += 1;
  }

  const existingFloorAdmins = await all(
    db,
    "SELECT id, managed_building, managed_floor, contact_info FROM users WHERE role = 'floor_admin'"
  );

  for (const account of existingFloorAdmins) {
    const scopeKey = `${normalizeText(account.managed_building) || DEFAULT_BUILDING}||${normalizeText(account.managed_floor) || DEFAULT_FLOOR}`;
    const autoCreated = String(account.contact_info || '').startsWith('floor-admin:');
    if (autoCreated && !activeScopes.has(scopeKey)) {
      await run(db, 'DELETE FROM users WHERE id = ?', [account.id]);
    }
  }

  return created;
}

async function backfillReservationSlots(db) {
  await run(db, 'DELETE FROM reservation_slots');

  const reservations = await all(
    db,
    "SELECT id, venue_id, start_time, end_time FROM reservations WHERE status IN ('approved', 'maintenance') ORDER BY start_time ASC"
  );

  let inserted = 0;
  let conflicts = 0;
  for (const item of reservations) {
    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      continue;
    }

    const windows = buildSlotWindows(start, end);
    for (const window of windows) {
      try {
        await run(
          db,
          'INSERT INTO reservation_slots (venue_id, reservation_id, slot_start, slot_end) VALUES (?, ?, ?, ?)',
          [
            item.venue_id,
            item.id,
            window.start.toISOString(),
            window.end.toISOString(),
          ]
        );
        inserted += 1;
      } catch (error) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('unique constraint failed')) {
          conflicts += 1;
          continue;
        }
        throw error;
      }
    }
  }

  return { inserted, conflicts };
}

async function upsertTimezonePolicy(db) {
  await run(
    db,
    `INSERT INTO system_config (key, value, description)
     VALUES ('system_timezone', 'UTC', 'System-wide canonical timezone')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );

  await run(
    db,
    `INSERT INTO system_config (key, value, description)
     VALUES ('timezone_policy', 'require_explicit_offset', 'Datetimes must include timezone offset')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function main() {
  const db = openDb();
  try {
    await ensureColumns(db);
    const venueCount = await backfillVenues(db);
    const insertedDemoVenues = await ensureStructuredDemoVenues(db);
    const createdFloorAdmins = await ensureFloorAdmins(db);
    const slotBackfill = await backfillReservationSlots(db);
    await upsertTimezonePolicy(db);

    console.log('[bootstrap-structure] done');
    console.log(`- db: ${DB_PATH}`);
    console.log(`- venues backfilled: ${venueCount}`);
    console.log(`- structured demo venues inserted: ${insertedDemoVenues}`);
    console.log(`- floor_admin created: ${createdFloorAdmins}`);
    console.log(`- reservation slots backfilled: ${slotBackfill.inserted} (conflicts skipped: ${slotBackfill.conflicts})`);
    console.log(`- floor_admin default password: ${DEFAULT_FLOOR_ADMIN_PASSWORD}`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error('[bootstrap-structure] failed:', error);
  process.exit(1);
});
