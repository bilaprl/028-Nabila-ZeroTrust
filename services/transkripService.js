const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../database");

const app = express();
app.use(express.json());

// Secret key untuk verifikasi JWT (pastikan sama dengan yang ada di gateway nantinya)
const JWT_SECRET = "KUNCI_RAHASIA_JWT_YANG_SANGAT_AMAN_123";
const GATEWAY_SECRET = "RAHASIA_GATEWAY_XYZ_987";

// Middleware Zero Trust untuk Service Transkrip
const verifyZeroTrust = (req, res, next) => {
  // 1. Periksa Gateway Secret
  const gatewaySecret = req.headers["x-gateway-secret"];
  if (!gatewaySecret || gatewaySecret !== GATEWAY_SECRET) {
    return res
      .status(403)
      .json({ error: "Akses ditolak: Missing atau Invalid Gateway Secret" });
  }

  // 2. Periksa Token (Bearer Token)
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Akses ditolak: Missing atau Invalid Authorization Token",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Menyimpan data user/service dari token ke request
    next();
  } catch (err) {
    return res
      .status(403)
      .json({ error: "Akses ditolak: Token tidak valid atau kedaluwarsa" });
  }
};

// 1. Endpoint GET /transkrip/:nim (Diakses oleh Mahasiswa atau Admin)
app.get("/transkrip", verifyZeroTrust, (req, res) => {
  const { role, id: userId, nim: userNim } = req.user;

  // Jika Mahasiswa, ambil NIM dari token miliknya sendiri
  // Jika Admin, bisa sediakan opsi query param atau batasi sesuai kebutuhan
  let nimTarget = userNim;

  if (role !== "Mahasiswa" && role !== "Admin") {
    return res.status(403).json({
      error: "Forbidden: Role Anda tidak diizinkan melihat transkrip",
    });
  }

  // Ambil data mahasiswa berdasarkan NIM
  const mahasiswa = db
    .prepare("SELECT id, nama, nim FROM users WHERE nim = ?")
    .get(nimTarget);

  if (!mahasiswa) {
    return res.status(404).json({ error: "Mahasiswa tidak ditemukan" });
  }

  // Ambil data transkrip
  const transkrip = db
    .prepare(
      "SELECT mata_kuliah, nilai_akhir FROM transkrip WHERE mahasiswa_id = ?",
    )
    .all(mahasiswa.id);

  res.json({
    mahasiswa: {
      nama: mahasiswa.nama,
      nim: mahasiswa.nim,
    },
    transkrip: transkrip,
  });
});

// 2. Endpoint POST /transkrip/sinkron (Hanya boleh dipanggil oleh Service Nilai menggunakan token service)
app.post("/transkrip/sinkron", verifyZeroTrust, (req, res) => {
  // Pastikan yang memanggil adalah service (bukan user biasa)
  if (req.user.role !== "service") {
    return res
      .status(403)
      .json({ error: "Forbidden: Endpoint ini khusus untuk Service Nilai" });
  }

  const { mahasiswa_id, mata_kuliah, nilai_akhir } = req.body;

  try {
    const insertTranskrip = db.prepare(
      "INSERT INTO transkrip (mahasiswa_id, mata_kuliah, nilai_akhir) VALUES (?, ?, ?)",
    );
    insertTranskrip.run(mahasiswa_id, mata_kuliah, nilai_akhir);

    return res.json({ message: "Transkrip berhasil disinkronkan!" });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Gagal menyinkronkan transkrip: " + err.message });
  }
});

// Jalankan Service Transkrip di Port 3002
const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Service Transkrip berjalan di http://localhost:${PORT}`);
});
