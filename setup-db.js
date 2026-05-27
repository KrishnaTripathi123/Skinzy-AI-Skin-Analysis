// ── setup-db.js ──────────────────────────────────────────────────────────
// Run ONCE to create the skinzy_db database and all tables.
// Usage: node setup-db.js

require('dotenv').config();
const mysql = require('mysql2/promise');

async function setup() {
  // Connect without specifying a database first
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST || 'localhost',
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
  });

  const db = process.env.DB_NAME || 'skinzy_db';

  console.log(`\n🛠  Setting up Skinzy database...\n`);

  // Create DB
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\``);
  await conn.query(`USE \`${db}\``);
  console.log(`✅ Database '${db}' ready`);

  // ── Users ────────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(120) NOT NULL,
      email      VARCHAR(180) NOT NULL UNIQUE,
      password   VARCHAR(255) NOT NULL,
      age        INT,
      gender     VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log(`✅ Table 'users' ready`);

  // ── Quiz Results ─────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS quiz_results (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT NOT NULL,
      answers    JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);
  console.log(`✅ Table 'quiz_results' ready`);

  // ── Skin Analyses ─────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS skin_analyses (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT NOT NULL,
      result     JSON NOT NULL,
      mode       VARCHAR(30),
      budget     VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);
  console.log(`✅ Table 'skin_analyses' ready`);

  // ── Routines ──────────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS routines (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT NOT NULL,
      data       JSON NOT NULL,
      mode       VARCHAR(30),
      budget     VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);
  console.log(`✅ Table 'routines' ready`);

  // ── Appointments ──────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      user_id          INT NOT NULL,
      doctor_name      VARCHAR(255) NOT NULL,
      clinic           VARCHAR(255) NOT NULL,
      appointment_date DATETIME NOT NULL,
      mode             VARCHAR(50) NOT NULL,
      status           VARCHAR(50) DEFAULT 'confirmed',
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);
  console.log(`✅ Table 'appointments' ready`);

  // ── Daily Progress ────────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS daily_progress (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      user_id        INT NOT NULL,
      date           DATE NOT NULL,
      completed_steps JSON NOT NULL,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY user_date (user_id, date),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);
  console.log(`✅ Table 'daily_progress' ready`);

  await conn.end();
  console.log(`\n🎉 Skinzy database setup complete! All 5 tables created.\n`);
}

setup().catch(err => {
  console.error('\n❌ Setup failed:', err.message);
  process.exit(1);
});
