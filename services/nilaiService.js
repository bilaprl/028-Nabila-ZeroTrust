const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../database");

const app = express();
app.use(express.json());

const JWT_SECRET = "KUNCI_RAHASIA_JWT_YANG_SANGAT_AMAN_123";
const GATEWAY_SECRET = "RAHASIA_GATEWAY_XYZ_987";

// Middleware Zero Trust untuk Service Nilai
const verifyZeroTrust = (req, res, next) => {
  const gatewaySecret = req.headers["x-gateway-secret"];
  if (!gatewaySecret || gatewaySecret !== GATEWAY_SECRET) {
    return res
      .status(403)
      .json({ error: "Akses ditolak: Missing atau Invalid Gateway Secret" });
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({
        error: "Akses ditolak: Missing atau Invalid Authorization Token",
      });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res
      .status(403)
      .json({ error: "Akses ditolak: Token tidak valid atau kedaluwarsa" });
  }
};

// Fungsi bantuan untuk memeriksa apakah waktu saat ini berada dalam jam akses (07.00 - 21.00)
const isWithinAccessHours = () => {
  const now = new Date();
  const hours = now.getHours();
  // Bisa disesuaikan dengan rentang jam akses (misal: 7 sampai 21)
  return hours >= 7 && hours < 21;
};

// 1. Endpoint GET /nilai
app.get("/nilai", verifyZeroTrust, (req, res) => {
  const { role, id: userId, nim } = req.user;

  if (role === "Mahasiswa") {
    // Mahasiswa hanya boleh melihat nilai miliknya sendiri
    const nilaiMhs = db
      .prepare(
        `
      kl.nama_kelas, n.nilai_angka, n.status 
      FROM nilai n 
      JOIN kelas kl ON n.kelas_id = kl.id 
      WHERE n.mahasiswa_id = ?
    `,
      )
      .all(userId);
    return res.json({ nilai: nilaiMhs });
  } else if (role === "Dosen") {
    // Dosen melihat nilai pada kelas yang diampunya
    const nilaiDosen = db
      .prepare(
        `
      SELECT n.id, kl.nama_kelas, n.mahasiswa_id, n.nilai_angka, n.status 
      FROM nilai n 
      JOIN kelas kl ON n.kelas_id = kl.id 
      WHERE kl.dosen_id = ?
    `,
      )
      .all(userId);
    return res.json({ nilai: nilaiDosen });
  } else if (role === "Admin") {
    const semuaNilai = db.prepare("SELECT * FROM nilai").all();
    return res.json({ nilai: semuaNilai });
  }

  return res.status(403).json({ error: "Forbidden" });
});

// 2. Endpoint PUT /nilai/:id (Diubah oleh Dosen, cek jam akses & kelas diampu)
app.put("/nilai/:id", verifyZeroTrust, (req, res) => {
  const { role, id: userId } = req.user;
  const { id } = req.params;
  const { nilai_angka } = req.body;

  if (role !== "Dosen") {
    return res
      .status(403)
      .json({ error: "Forbidden: Hanya dosen yang dapat mengubah nilai" });
  }

  // Cek jam akses (07.00 - 21.00)
  if (!isWithinAccessHours()) {
    return res
      .status(403)
      .json({
        error:
          "Akses ditolak: Perubahan nilai hanya diizinkan pukul 07.00 - 21.00",
      });
  }

  // Cek apakah nilai milik kelas yang diampu dosen tersebut dan status belum final
  const nilaiRecord = db
    .prepare(
      `
    SELECT n.*, kl.dosen_id FROM nilai n 
    JOIN kelas kl ON n.kelas_id = kl.id 
    WHERE n.id = ?
  `,
    )
    .get(id);

  if (!nilaiRecord) {
    return res.status(404).json({ error: "Data nilai tidak ditemukan" });
  }

  if (nilaiRecord.dosen_id !== userId) {
    return res
      .status(403)
      .json({ error: "Forbidden: Anda tidak mengampu kelas ini" });
  }

  if (nilaiRecord.status === "final") {
    return res
      .status(400)
      .json({ error: "Nilai sudah difinalisasi dan tidak dapat diubah" });
  }

  db.prepare("UPDATE nilai SET nilai_angka = ? WHERE id = ?").run(
    nilai_angka,
    id,
  );
  res.json({ message: "Nilai berhasil diperbarui" });
});

// 3. Endpoint POST /kelas/:id/finalisasi (Finalisasi nilai kelas oleh Dosen)
app.post("/kelas/:id/finalisasi", verifyZeroTrust, async (req, res) => {
  const { role, id: userId } = req.user;
  const { id: kelasId } = req.params;

  if (role !== "Dosen") {
    return res
      .status(403)
      .json({ error: "Forbidden: Hanya dosen yang dapat memfinalisasi kelas" });
  }

  if (!isWithinAccessHours()) {
    return res
      .status(403)
      .json({
        error:
          "Akses ditolak: Finalisasi nilai hanya diizinkan pukul 07.00 - 21.00",
      });
  }

  // Cek apakah dosen mengampu kelas ini
  const kelas = db
    .prepare("SELECT * FROM kelas WHERE id = ? AND dosen_id = ?")
    .get(kelasId, userId);
  if (!kelas) {
    return res
      .status(403)
      .json({
        error: "Forbidden: Kelas tidak ditemukan atau bukan yang Anda ampu",
      });
  }

  // Ubah status nilai di kelas tersebut menjadi final
  db.prepare("UPDATE nilai SET status = 'final' WHERE kelas_id = ?").run(
    kelasId,
  );

  // Ambil seluruh nilai mahasiswa di kelas tersebut untuk disinkronkan ke Service Transkrip
  const listNilai = db
    .prepare("SELECT * FROM nilai WHERE kelas_id = ?")
    .all(kelasId);

  try {
    // Langkah Zero Trust Antar-Service: Meminta token service ke Gateway terlebih dahulu
    const authResponse = await fetch("http://localhost:3000/auth/service", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: "service-nilai",
        client_secret: "secret-nilai-123",
      }),
    });

    const authData = await authResponse.json();
    if (!authResponse.ok) {
      throw new Error("Gagal mendapatkan token service dari gateway");
    }

    const serviceToken = authData.token;

    // Kirim data sinkronisasi satu per satu ke Service Transkrip di port 3002
    for (const item of listNilai) {
      await fetch("http://localhost:3002/transkrip/sinkron", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gateway-Secret": GATEWAY_SECRET,
          Authorization: `Bearer ${serviceToken}`,
        },
        body: JSON.stringify({
          mahasiswa_id: item.mahasiswa_id,
          mata_kuliah: kelas.nama_kelas,
          nilai_akhir: item.nilai_angka,
        }),
      });
    }

    res.json({
      message:
        "Kelas berhasil difinalisasi dan nilai disinkronkan ke transkrip!",
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Gagal sinkronisasi transkrip: " + err.message });
  }
});

// Jalankan Service Nilai di Port 3001
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Service Nilai berjalan di http://localhost:${PORT}`);
});
