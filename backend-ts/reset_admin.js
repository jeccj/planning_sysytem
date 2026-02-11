
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../campus.db');
const db = new sqlite3.Database(dbPath);

const SALT_ROUNDS = 10;
const PASSWORD = 'admin123';

async function resetAdmin() {
    console.log(`Hashing password '${PASSWORD}'...`);
    const hashedPassword = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

    db.serialize(() => {
        // Check if admin exists
        db.get("SELECT id FROM users WHERE username = 'admin'", (err, row) => {
            if (err) {
                console.error("Error checking user:", err);
                return;
            }

            if (row) {
                console.log("Admin user exists. Updating password...");
                const stmt = db.prepare("UPDATE users SET hashed_password = ? WHERE username = 'admin'");
                stmt.run(hashedPassword, (err) => {
                    if (err) console.error("Update failed:", err);
                    else console.log("✅ Admin password reset to: " + PASSWORD);
                });
                stmt.finalize();
            } else {
                console.log("Admin user does NOT exist. Creating...");
                const stmt = db.prepare("INSERT INTO users (username, hashed_password, role, is_first_login) VALUES (?, ?, ?, ?)");
                stmt.run('admin', hashedPassword, 'sys_admin', 0, (err) => {
                    if (err) console.error("Insert failed:", err);
                    else console.log("✅ Admin user created with password: " + PASSWORD);
                });
                stmt.finalize();
            }
        });
    });

    // Close DB after a short delay to allow queries to finish
    setTimeout(() => {
        db.close();
        console.log("Database connection closed.");
    }, 1000);
}

resetAdmin();
