const Database = require("better-sqlite3");
const db = new Database("zero_trust.db");

// Inisialisasi Tabel
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    nim TEXT,
    nama TEXT
  );

  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    device_id TEXT UNIQUE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    token TEXT,
    revoked INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS kelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_kelas TEXT,
    dosen_id INTEGER,
    FOREIGN KEY(dosen_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS nilai (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kelas_id INTEGER,
    mahasiswa_id INTEGER,
    nilai_angka REAL,
    status TEXT DEFAULT 'draft',
    FOREIGN KEY(kelas_id) REFERENCES kelas(id),
    FOREIGN KEY(mahasiswa_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS transkrip (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mahasiswa_id INTEGER,
    mata_kuliah TEXT,
    nilai_akhir REAL,
    FOREIGN KEY(mahasiswa_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    subject TEXT,
    endpoint TEXT,
    device_id TEXT,
    result TEXT,
    reason TEXT
  );
`);

// Seed Data (Data Awal Sesuai Ketentuan Tugas)
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;

if (userCount === 0) {
  console.log("Menambahkan seed data...");

  // 1. Insert Users (1 Admin, 2 Dosen, 3 Mahasiswa)
  const insertUser = db.prepare(
    "INSERT INTO users (username, password, role, nim, nama) VALUES (?, ?, ?, ?, ?)",
  );

  const adminId = insertUser.run(
    "admin",
    "admin123",
    "Admin",
    null,
    "Bapak Admin",
  ).lastInsertRowid;

  const dosen1Id = insertUser.run(
    "dosen1",
    "dosen123",
    "Dosen",
    null,
    "Dr. Budi, M.T.",
  ).lastInsertRowid;
  const dosen2Id = insertUser.run(
    "dosen2",
    "dosen123",
    "Dosen",
    null,
    "Dr. Siti, M.T.",
  ).lastInsertRowid;

  const mhs1Id = insertUser.run(
    "mhs1",
    "mhs123",
    "Mahasiswa",
    "247006111030",
    "Sipa Nurul Azizah",
  ).lastInsertRowid;
  const mhs2Id = insertUser.run(
    "mhs2",
    "mhs123",
    "Mahasiswa",
    "247006111029",
    "Muthia Anggraeni Rukmawan",
  ).lastInsertRowid;
  const mhs3Id = insertUser.run(
    "mhs3",
    "mhs123",
    "Mahasiswa",
    "247006111028",
    "Nabila Aprilianti Nuravifah",
  ).lastInsertRowid;

  // 2. Insert Devices (Setiap user memiliki 1 device terdaftar)
  const insertDevice = db.prepare(
    "INSERT INTO devices (user_id, device_id) VALUES (?, ?)",
  );
  insertDevice.run(adminId, "device-admin-01");
  insertDevice.run(dosen1Id, "device-dosen-01");
  insertDevice.run(dosen2Id, "device-dosen-02");
  insertDevice.run(mhs1Id, "device-mhs-01");
  insertDevice.run(mhs2Id, "device-mhs-02");
  insertDevice.run(mhs3Id, "device-mhs-03");

  // 3. Insert Kelas (2 kelas diampu dosen berbeda)
  const insertKelas = db.prepare(
    "INSERT INTO kelas (nama_kelas, dosen_id) VALUES (?, ?)",
  );
  const kelas1Id = insertKelas.run("Pemrograman Web", dosen1Id).lastInsertRowid;
  const kelas2Id = insertKelas.run(
    "Keamanan Informasi",
    dosen2Id,
  ).lastInsertRowid;

  // 4. Insert Nilai Awal
  const insertNilai = db.prepare(
    "INSERT INTO nilai (kelas_id, mahasiswa_id, nilai_angka, status) VALUES (?, ?, ?, ?)",
  );
  insertNilai.run(kelas1Id, mhs1Id, 85, "draft");
  insertNilai.run(kelas1Id, mhs2Id, 90, "draft");
  insertNilai.run(kelas2Id, mhs3Id, 88, "draft");

  console.log("Seed data berhasil dimasukkan!");
}

module.exports = db;
