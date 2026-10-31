const express = require("express");
const jwt = require("jsonwebtoken");
const { createProxyMiddleware } = require("http-proxy-middleware");
const db = require("../database");
const { logAudit } = require("./logger");
const { evaluatePolicy } = require("./policy");

const app = express();
app.use(express.json());

const JWT_SECRET = "KUNCI_RAHASIA_JWT_YANG_SANGAT_AMAN_123";
const GATEWAY_SECRET = "RAHASIA_GATEWAY_XYZ_987";

// --- AUTHENTICATION ENDPOINTS  ---

// Login User
app.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  const deviceId = req.headers["x-device-id"];

  if (!deviceId) {
    logAudit(
      username || "ANONYMOUS",
      "/auth/login",
      null,
      "DENY",
      "Missing X-Device-ID",
    );
    return res
      .status(400)
      .json({ error: "Device ID wajib disertakan dalam header (X-Device-ID)" });
  }

  const user = db
    .prepare("SELECT * FROM users WHERE username = ? AND password = ?")
    .get(username, password);
  if (!user) {
    logAudit(username, "/auth/login", deviceId, "DENY", "Kredensial salah");
    return res.status(401).json({ error: "Username atau password salah" });
  }

  // Cek apakah device terdaftar
  const device = db
    .prepare("SELECT * FROM devices WHERE user_id = ? AND device_id = ?")
    .get(user.id, deviceId);
  if (!device) {
    logAudit(
      username,
      "/auth/login",
      deviceId,
      "DENY",
      "Device tidak terdaftar",
    );
    return res
      .status(403)
      .json({ error: "Device tidak terdaftar untuk akun ini" });
  }

  const accessToken = jwt.sign(
    { id: user.id, username: user.username, role: user.role, nim: user.nim },
    JWT_SECRET,
    { expiresIn: "10m" },
  );

  const refreshToken = jwt.sign({ id: user.id }, JWT_SECRET, {
    expiresIn: "1d",
  });
  db.prepare("INSERT INTO refresh_tokens (user_id, token) VALUES (?, ?)").run(
    user.id,
    refreshToken,
  );

  logAudit(user.username, "/auth/login", deviceId, "ALLOW", "Login sukses");
  res.json({ access_token: accessToken, refresh_token: refreshToken });
});

// Endpoint Token Service 
app.post("/auth/service", (req, res) => {
  const { client_id, client_secret } = req.body;

  // Simulasi validasi client credentials service
  if (client_id === "service-nilai" && client_secret === "secret-nilai-123") {
    const serviceToken = jwt.sign(
      { role: "service", service_name: "NilaiService" },
      JWT_SECRET,
      { expiresIn: "5m" },
    );
    return res.json({ token: serviceToken });
  }

  res.status(401).json({ error: "Client ID atau Secret salah" });
});

// --- POLICY ENFORCEMENT POINT (PEP) & PROXY ---

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    logAudit(
      "ANONYMOUS",
      req.path,
      req.headers["x-device-id"],
      "DENY",
      "Missing Token",
    );
    return res.status(401).json({ error: "Token akses tidak ditemukan" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      logAudit(
        "ANONYMOUS",
        req.path,
        req.headers["x-device-id"],
        "DENY",
        "Token invalid/expired",
      );
      return res
        .status(403)
        .json({ error: "Token tidak valid atau kedaluwarsa" });
    }
    req.user = user;
    next();
  });
};

// Middleware Proxy yang Dilengkapi Policy Engine & Audit Log
const gatewayMiddleware = (targetServiceUrl, prefixPath) => {
  return [
    authenticateToken,
    (req, res, next) => {
      const evaluation = evaluatePolicy(req, req.user);

      logAudit(
        req.user.username || req.user.service_name,
        req.path,
        req.headers["x-device-id"],
        evaluation.allow ? "ALLOW" : "DENY",
        evaluation.reason,
      );

      if (!evaluation.allow) {
        return res.status(403).json({
          error: "Akses ditolak oleh Policy Engine",
          reason: evaluation.reason,
        });
      }

      req.headers["x-gateway-secret"] = GATEWAY_SECRET;
      next();
    },
    createProxyMiddleware({
      target: targetServiceUrl,
      changeOrigin: true,
      pathRewrite: (path, req) => {
        return prefixPath + path;
      },
      on: {
        proxyReq: (proxyReq, req, res) => {
          if (req.body && Object.keys(req.body).length > 0) {
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader("Content-Type", "application/json");
            proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        },
      },
    }),
  ];
};

app.use("/nilai", gatewayMiddleware("http://localhost:3001", "/nilai"));
app.use("/kelas", gatewayMiddleware("http://localhost:3001", "/kelas"));
app.use("/transkrip", gatewayMiddleware("http://localhost:3002", "/transkrip"));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API Gateway berjalan di http://localhost:${PORT}`);
});
