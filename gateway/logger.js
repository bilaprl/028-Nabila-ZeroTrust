const db = require("../database");

const logAudit = (subject, endpoint, deviceId, result, reason) => {
  const timestamp = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO audit_logs (timestamp, subject, endpoint, device_id, result, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(timestamp, subject, endpoint, deviceId || "UNKNOWN", result, reason);
};

module.exports = { logAudit };
