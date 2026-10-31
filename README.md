# Zero Trust Academic Microservices System (NIST SP 800-207)

Sistem akademik pengelolaan nilai mahasiswa yang dibangun menggunakan arsitektur **Zero Trust Microservices**, menerapkan prinsip _Never trust, always verify_, _least privilege_, dan _assume breach_ secara langsung di level aplikasi. Repositori ini dikembangkan untuk memenuhi tugas mata kuliah Keamanan Informasi.

---

## 🛠️ Tech Stack & Dependencies

- **Backend & Gateway:** Node.js + Express (`express`, `http-proxy-middleware`)
- **Database:** SQLite (`better-sqlite3`)
- **Autentikasi & Keamanan:** JSON Web Token (`jsonwebtoken`), `dotenv`
- **Komunikasi Antar-Service:** HTTP Fetch (`Node.js 18+`) dengan header `X-Gateway-Secret` & Service Token

---

## 🚀 Struktur Direktori & Port Layanan

Sistem ini berjalan di satu komputer dengan tiga layanan terpisah yang harus dinyalakan secara bersamaan:

1. **API Gateway (Port 3000):** Berperan sebagai _Policy Enforcement Point_ (PEP) & _Policy Engine_ (PE). Menjadi satu-satunya pintu masuk utama, memvalidasi token, memeriksa _device ID_, mencatat _audit logs_, dan meneruskan request.
2. **Service Nilai (Port 3001):** Mengelola data nilai dan kelas, memverifikasi gateway secret, serta menangani proses finalisasi nilai.
3. **Service Transkrip (Port 3002):** Mengelola data transkrip akhir mahasiswa yang menerima sinkronisasi dari Service Nilai menggunakan token service.

---

## ⚙️ Cara Menjalankan Aplikasi (Installation & Run)

### 1. Clone Repository

```bash
git clone https://github.com/bilaprl/028-Nabila-ZeroTrust.git
cd 028-Nabila-ZeroTrust
```

### 2. Install Dependencies

Jalankan perintah berikut di terminal pada root folder untuk menginstall seluruh modul yang dibutuhkan:

```bash
npm install
```

### 3. File Konfigurasi (.env)

File konfigurasi `.env` sudah disertakan di dalam repositori ini dengan pengaturan berikut:

```env
GATEWAY_PORT=3000
NILAI_PORT=3001
TRANSKRIP_PORT=3002
JWT_SECRET=rahasia_negara_kampus_2026
GATEWAY_SECRET=kunci_gerbang_gateway_xyz
JAM_MULAI=7
JAM_SELESAI=21
```

### 4. Jalankan Layanan

Buka **3 Terminal Berbeda** dan jalankan masing-masing perintah berikut:

- **Terminal 1 (API Gateway):**
  ```bash
  node gateway/server.js
  ```
- **Terminal 2 (Service Nilai):**
  ```bash
  node services/nilaiService.js
  ```
- **Terminal 3 (Service Transkrip):**
  ```bash
  node services/transkripService.js
  ```

---

## 👤 Daftar Akun Data Awal (Seed Data) & Device ID

Setiap pengguna di bawah ini telah terikat dengan 1 device terdaftar di database SQLite. Anda **wajib** menyertakan header `X-Device-ID` yang sesuai pada setiap request.

| Role            | Username / ID | Password   | Device ID (X-Device-ID) | Keterangan / Hak Akses                   |
| :-------------- | :------------ | :--------- | :---------------------- | :--------------------------------------- |
| **Admin**       | `admin`       | `admin123` | `device-admin-01`       | Mengakses audit logs & pengawasan sistem |
| **Dosen 1**     | `dosen1`      | `dosen123` | `device-dosen-01`       | Pengampu Kelas ID 1 (Pemrograman Web)    |
| **Dosen 2**     | `dosen2`      | `dosen123` | `device-dosen-02`       | Pengampu Kelas ID 2 (Keamanan Informasi) |
| **Mahasiswa 1** | `mhs1`        | `mhs123`   | `device-mhs-01`         | Mahasiswa Kelas 1 (Sipa)                 |
| **Mahasiswa 2** | `mhs2`        | `mhs123`   | `device-mhs-02`         | Mahasiswa Kelas 1 (Muthia)               |
| **Mahasiswa 3** | `mhs3`        | `mhs123`   | `device-mhs-03`         | Mahasiswa Kelas 2 (Nabila)               |

---

## 🧪 Panduan Pengujian (Step-by-Step Testing Guide)

Gunakan aplikasi **Postman** untuk menguji seluruh endpoint melalui API Gateway (Port `3000`).

### 📌 Ketentuan Header Wajib di Postman:

Setiap kali melakukan request ke endpoint (selain `/auth/login`), pastikan Anda melampirkan header berikut:

- `Authorization`: `Bearer <access_token>`
- `X-Device-ID`: `<device_id_sesuai_tabel_di_atas>`
- `Content-Type`: `application/json` _(jika mengirim body JSON)_

---

### Skenario 1: Pengujian Autentikasi & Validasi Device ID (Zero Trust)

#### 1. Login Sukses

- **Method & URL:** `POST http://localhost:3000/auth/login`
- **Header:** `X-Device-ID: device-dosen-01`
- **Body (JSON):**
  ```json
  {
    "username": "dosen1",
    "password": "dosen123"
  }
  ```
- **Hasil:** Berhasil mendapat `accessToken` (berlaku 10 menit).

#### 2. Gagal karena Device ID Tidak Terdaftar

- Ubah header `X-Device-ID` menjadi `device-palsu-99` (atau kosongkan).
- **Hasil:** Policy Engine menolak akses dengan respons _Deny_ dan alasan _"Device ID tidak terdaftar untuk pengguna ini"_.

---

### Skenario 2: Pengujian Hak Akses & Kepemilikan Data (Data Ownership)

#### 1. Dosen Mengubah Nilai di Kelas yang Diampunya (Diizinkan)

- **Method & URL:** `PUT http://localhost:3000/nilai/1`
- **Header:** Gunakan token `dosen1` & `X-Device-ID: device-dosen-01`
- **Body (JSON):**
  ```json
  {
    "nilai_akhir": 95
  }
  ```
- **Hasil:** Diizinkan (_Allow_) karena `dosen1` adalah pengampu sah dari kelas nilai tersebut.

#### 2. Dosen Mengubah Nilai di Kelas Dosen Lain (Ditolak)

- Masih menggunakan token `dosen1`, ubah ID nilai ke kelas milik `dosen2` (misal: `PUT http://localhost:3000/nilai/5`).
- **Hasil:** Ditolak (_Deny_) oleh Policy Engine dengan alasan _"Akses ditolak: Dosen tidak mengampu mata kuliah/kelas ini"_.

---

### Skenario 3: Pengujian Finalisasi & Komunikasi Antar-Service

#### 1. Finalisasi Kelas

- **Method & URL:** `POST http://localhost:3000/kelas/1/finalisasi`
- **Header:** Token `dosen1` & `X-Device-ID: device-dosen-01`
- **Hasil:** Service Nilai otomatis meminta token service lalu menyinkronkan data ke Service Transkrip menggunakan `X-Gateway-Secret`.

#### 2. Pengecekan Transkrip Mahasiswa

- **Method & URL:** `GET http://localhost:3000/transkrip/247006111030` _(atau NIM mahasiswa bersangkutan)_
- **Header:** Token Mahasiswa (`mhs1`) & `X-Device-ID: device-mhs-01`
- **Hasil:** Menampilkan data transkrip nilai akhir yang sukses tersinkronisasi tanpa duplikasi.
