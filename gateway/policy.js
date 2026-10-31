require("dotenv").config();
const db = require("../database");

// Fungsi cek jam akses (07.00 - 21.00)
const isWithinAccessHours = () => {
  const hours = new Date().getHours();
  return hours >= 7 && hours < 21;
};

const evaluatePolicy = (req, user) => {
  const fullUrl = req.originalUrl || req.url;
  const method = req.method;
  const deviceId = req.headers["x-device-id"];

  // 1. Validasi Device ID untuk request dari user 
  if (user && user.role !== "service") {
    if (!deviceId) {
      return {
        allow: false,
        reason: "Device ID tidak disertakan (Missing X-Device-ID)",
      };
    }
    const deviceCheck = db
      .prepare("SELECT * FROM devices WHERE user_id = ? AND device_id = ?")
      .get(user.id, deviceId);
    if (!deviceCheck) {
      return {
        allow: false,
        reason: "Device ID tidak terdaftar untuk pengguna ini",
      };
    }
  }

  // 2. Evaluasi Endpoint /nilai 
  if (fullUrl.startsWith("/nilai")) {
    // Mahasiswa melihat nilainya sendiri
    if (user.role === "Mahasiswa") {
      return { allow: true, reason: "Mahasiswa diizinkan melihat nilai" };
    }

    // Dosen mengubah/melihat nilai, validasi apakah kelas tersebut diampunya
    if (user.role === "Dosen") {
      if (method === "PUT") {
        if (!isWithinAccessHours()) {
          return {
            allow: false,
            reason: "Perubahan nilai ditolak: Diluar jam akses (07.00-21.00)",
          };
        }

        // Ekstrak ID nilai dari URL 
        const parts = fullUrl.split("/");
        const nilaiId = parts[2];

        if (nilaiId) {
          // Cek apakah nilai ini milik kelas yang diampu oleh dosen yang sedang login
          const kelasCheck = db
            .prepare(
              `
            SELECT k.dosen_id 
            FROM nilai n 
            JOIN kelas k ON n.kelas_id = k.id 
            WHERE n.id = ?
          `,
            )
            .get(nilaiId);

          if (!kelasCheck || kelasCheck.dosen_id !== user.id) {
            return {
              allow: false,
              reason:
                "Akses ditolak: Dosen tidak mengampu mata kuliah/kelas ini",
            };
          }
        }
      }
      return {
        allow: true,
        reason: "Akses nilai diizinkan untuk dosen pengampu",
      };
    }

    if (user.role === "Admin") {
      return { allow: true, reason: "Admin diizinkan mengakses data nilai" };
    }
  }

  // 3. Evaluasi Endpoint 
  if (fullUrl.startsWith("/kelas") && fullUrl.includes("/finalisasi")) {
    if (user.role === "Dosen") {
      if (!isWithinAccessHours()) {
        return {
          allow: false,
          reason: "Finalisasi ditolak: Diluar jam akses (07.00-21.00)",
        };
      }

      // Ekstrak ID kelas dari URL 
      const parts = fullUrl.split("/");
      const kelasId = parts[2];

      if (kelasId) {
        // Validasi apakah dosen yang login adalah pengampu kelas tersebut
        const kelasCheck = db
          .prepare("SELECT * FROM kelas WHERE id = ? AND dosen_id = ?")
          .get(kelasId, user.id);
        if (!kelasCheck) {
          return {
            allow: false,
            reason: "Finalisasi ditolak: Dosen tidak mengampu kelas ini",
          };
        }
      }

      return {
        allow: true,
        reason: "Dosen diizinkan memfinalisasi kelas yang diampunya",
      };
    }
    return {
      allow: false,
      reason: "Hanya dosen yang dapat memfinalisasi kelas",
    };
  }

  // 4. Evaluasi Endpoint /transkrip
  if (fullUrl.startsWith("/transkrip")) {
    if (
      user.role === "Mahasiswa" ||
      user.role === "Admin" ||
      user.role === "service"
    ) {
      return {
        allow: true,
        reason: "Akses transkrip diizinkan berdasarkan role",
      };
    }
  }

  return {
    allow: false,
    reason: "Kebijakan akses tidak ditemukan atau ditolak",
  };
};

module.exports = { evaluatePolicy };
