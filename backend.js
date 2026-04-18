require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.text({ type: "text/plain", limit: "10mb" }));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

async function initDB() {
  const conn = await pool.getConnection();

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_state (
      user_id INT PRIMARY KEY,
      state_data LONGTEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Check and add missing columns to users table
  const [columns] = await conn.query(`SHOW COLUMNS FROM users`);
  const existing = columns.map(c => c.Field);

  if (!existing.includes("phone"))
    await conn.query(`ALTER TABLE users ADD COLUMN phone VARCHAR(30) DEFAULT '' AFTER email`);
  if (!existing.includes("credits"))
    await conn.query(`ALTER TABLE users ADD COLUMN credits DECIMAL(10,2) DEFAULT 0.00`);
  if (!existing.includes("member_id"))
    await conn.query(`ALTER TABLE users ADD COLUMN member_id VARCHAR(50) DEFAULT ''`);
  if (!existing.includes("role"))
    await conn.query(`ALTER TABLE users ADD COLUMN role ENUM('user','admin') DEFAULT 'user'`);
  if (!existing.includes("joined_at"))
    await conn.query(`ALTER TABLE users ADD COLUMN joined_at BIGINT DEFAULT NULL`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS investment_requests (
      id VARCHAR(64) PRIMARY KEY,
      user_id INT NOT NULL,
      package_id INT NOT NULL,
      package_code VARCHAR(20) NOT NULL,
      units INT NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      status ENUM('pending','approved','declined') DEFAULT 'pending',
      sender_account_number VARCHAR(100) DEFAULT NULL,
      proof_of_payment LONGTEXT,
      created_at BIGINT NOT NULL,
      reviewed_at BIGINT DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Check and add missing columns to investment_requests
  const [invColumns] = await conn.query(`SHOW COLUMNS FROM investment_requests`);
  const existingInv = invColumns.map(c => c.Field);
  if (!existingInv.includes("sender_account_number"))
    await conn.query(`ALTER TABLE investment_requests ADD COLUMN sender_account_number VARCHAR(100) DEFAULT NULL AFTER proof_of_payment`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id VARCHAR(64) PRIMARY KEY,
      user_id INT NOT NULL,
      package_id INT NOT NULL,
      package_code VARCHAR(20) NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      status ENUM('pending','approved','declined') DEFAULT 'pending',
      created_at BIGINT NOT NULL,
      reviewed_at BIGINT DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await conn.query(`
    INSERT IGNORE INTO users (username, email, phone, password, member_id, role, joined_at)
    VALUES ('Admin', 'admin@cgi.com', '', 'dummy', 'ADMIN-001', 'admin', UNIX_TIMESTAMP() * 1000)
  `);

  conn.release();
}

function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

app.post("/api/register", async (req, res) => {
  const { username, email, password, phone } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: "All fields required" });
  try {
    const hashed = await bcrypt.hash(password, 12);
    const memberId = `CGI-PK-${Date.now().toString().slice(-6)}`;
    const joinedAt = Date.now();
    const [result] = await pool.query(
      "INSERT INTO users (username, email, phone, password, member_id, joined_at) VALUES (?, ?, ?, ?, ?, ?)",
      [username, email, phone || "", hashed, memberId, joinedAt]
    );
    res.json({ message: "Registered successfully", userId: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "Username or email already exists" });
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "All fields required" });

  if (email === "admin@cgi.com" && password === "CGIAdmin2024!") {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length) {
      const user = rows[0];
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      return res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      });
    }
  }

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        credits: parseFloat(user.credits),
        memberId: user.member_id,
        joinedAt: user.joined_at,
        role: user.role,
      },
    });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/me", authMiddleware, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, username, email, phone, credits, member_id, role, joined_at, created_at FROM users WHERE id = ?",
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: "User not found" });
  res.json(rows[0]);
});

app.get("/api/user/state", authMiddleware, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT state_data FROM user_state WHERE user_id = ?",
    [req.user.id]
  );
  if (!rows.length) return res.json({ state: null });
  try {
    const state = JSON.parse(rows[0].state_data);
    const now = Date.now();
    const monthlyRate = 0.04;
    const msPerMonth = 30 * 24 * 60 * 60 * 1000;
    
    if (state.holdings) {
      for (const pkgId in state.holdings) {
        const holding = state.holdings[pkgId];
        if (holding.invested <= 0) continue;
        
        let approvedAt = holding.approvedAt || holding.reviewedAt;
        if (!approvedAt && state.investmentRequests) {
          const approvedReq = state.investmentRequests.find(r => r.packageId == pkgId && r.status === "approved");
          if (approvedReq) approvedAt = approvedReq.approvedAt || approvedReq.reviewedAt;
        }
        
        if (approvedAt) {
          const elapsedMs = now - approvedAt;
          const elapsedMonths = elapsedMs / msPerMonth;
          holding.profit = holding.invested * monthlyRate * elapsedMonths;
        }
      }
    }
    
    res.json({ state });
  } catch {
    res.json({ state: null });
  }
});

app.put("/api/user/state", authMiddleware, async (req, res) => {
  // sendBeacon sends Content-Type: text/plain — parse body manually if needed
  let state = req.body?.state;
  if (!state && typeof req.body === "string") {
    try { state = JSON.parse(req.body).state; } catch {}
  }
  if (!state) return res.status(400).json({ error: "State required" });
  const stateJson = JSON.stringify(state);
  await pool.query(
    "INSERT INTO user_state (user_id, state_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_data = ?",
    [req.user.id, stateJson, stateJson]
  );
  res.json({ message: "State saved" });
});

app.get("/api/admin/users", authMiddleware, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const [rows] = await pool.query(
    "SELECT id, username, email, phone, credits, member_id, role, joined_at, created_at FROM users ORDER BY created_at DESC"
  );
  res.json(rows);
});

app.patch("/api/admin/credits/:userId", authMiddleware, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const { credits } = req.body;
  if (credits === undefined) return res.status(400).json({ error: "Credits required" });
  await pool.query("UPDATE users SET credits = ? WHERE id = ?", [credits, req.params.userId]);
  res.json({ message: "Credits updated" });
});

// Submit investment request
app.post("/api/investments", authMiddleware, async (req, res) => {
  const { packageId, packageCode, units, amount, senderAccountNumber, proofOfPayment } = req.body;
  if (!packageId || !units || !amount) {
    return res.status(400).json({ error: "packageId, units, and amount are required" });
  }
  if (!senderAccountNumber || !String(senderAccountNumber).trim()) {
    return res.status(400).json({ error: "senderAccountNumber is required" });
  }
  const id = `INV-${req.user.id}-${Date.now()}`;
  try {
    await pool.query(
      `INSERT INTO investment_requests (id, user_id, package_id, package_code, units, amount, status, sender_account_number, proof_of_payment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [
        id,
        req.user.id,
        packageId,
        packageCode || `Package ${String(packageId).padStart(2, "0")}`,
        units,
        amount,
        String(senderAccountNumber).trim(),
        proofOfPayment || null,
        Date.now()
      ]
    );
    res.json({ message: "Investment request submitted", id });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: list all investment requests
app.get("/api/admin/investments", authMiddleware, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const [rows] = await pool.query(
    `SELECT ir.id, ir.package_id, ir.package_code, ir.units, ir.amount, ir.status,
            ir.sender_account_number, ir.created_at, ir.reviewed_at,
            u.username, u.email, u.member_id
     FROM investment_requests ir
     JOIN users u ON u.id = ir.user_id
     ORDER BY ir.created_at DESC`
  );
  res.json(rows);
});

// Admin: approve or decline an investment request
app.patch("/api/admin/investments/:id", authMiddleware, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const { action } = req.body; // 'approve' or 'decline'
  if (!["approve", "decline"].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve' or 'decline'" });
  }

  const [rows] = await pool.query("SELECT * FROM investment_requests WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Investment request not found" });
  const inv = rows[0];
  if (inv.status !== "pending") return res.status(409).json({ error: "Request is no longer pending" });

  const newStatus = action === "approve" ? "approved" : "declined";
  await pool.query(
    "UPDATE investment_requests SET status = ?, reviewed_at = ? WHERE id = ?",
    [newStatus, Date.now(), req.params.id]
  );

  // If approved, update the user's state (holdings) in user_state
  if (action === "approve") {
    const now = Date.now();
    const [stateRows] = await pool.query("SELECT state_data FROM user_state WHERE user_id = ?", [inv.user_id]);
    let state = stateRows.length ? JSON.parse(stateRows[0].state_data) : {};

    if (!state.holdings) state.holdings = {};
    if (!state.holdings[inv.package_id]) {
      state.holdings[inv.package_id] = { units: 0, invested: 0, profit: 0 };
    }
    state.holdings[inv.package_id].units += inv.units;
    state.holdings[inv.package_id].invested += parseFloat(inv.amount);
    state.holdings[inv.package_id].approvedAt = now;

    if (!state.investmentRequests) state.investmentRequests = [];
    const reqIdx = state.investmentRequests.findIndex(r => r.id === inv.id);
    if (reqIdx >= 0) {
      state.investmentRequests[reqIdx].status = "approved";
      state.investmentRequests[reqIdx].approvedAt = now;
      state.investmentRequests[reqIdx].reviewedAt = now;
    }

    if (!state.activities) state.activities = [];
    state.activities.unshift({
      tone: "success",
      message: `${inv.package_code} was approved for PKR ${inv.amount}.`,
      at: new Date().toLocaleString("en-PK"),
      createdAt: now
    });

    const stateJson = JSON.stringify(state);
    await pool.query(
      "INSERT INTO user_state (user_id, state_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_data = ?",
      [inv.user_id, stateJson, stateJson]
    );
  }

  res.json({ message: `Investment ${newStatus}` });
});

// Submit withdrawal request
app.post("/api/withdrawals", authMiddleware, async (req, res) => {
  const { packageId, packageCode, amount } = req.body;
  if (!packageId || !amount) return res.status(400).json({ error: "packageId and amount are required" });
  const id = `WDR-${req.user.id}-${Date.now()}`;
  try {
    await pool.query(
      `INSERT INTO withdrawal_requests (id, user_id, package_id, package_code, amount, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [id, req.user.id, packageId, packageCode || `Package ${String(packageId).padStart(2,"0")}`, amount, Date.now()]
    );
    res.json({ message: "Withdrawal request submitted", id });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: list all withdrawal requests
app.get("/api/admin/withdrawals", authMiddleware, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const [rows] = await pool.query(
    `SELECT wr.id, wr.package_id, wr.package_code, wr.amount, wr.status,
            wr.created_at, wr.reviewed_at,
            u.username, u.email, u.member_id
     FROM withdrawal_requests wr
     JOIN users u ON u.id = wr.user_id
     ORDER BY wr.created_at DESC`
  );
  res.json(rows);
});

// Admin: approve or decline a withdrawal request
app.patch("/api/admin/withdrawals/:id", authMiddleware, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const { action } = req.body;
  if (!["approve", "decline"].includes(action)) return res.status(400).json({ error: "action must be 'approve' or 'decline'" });

  const [rows] = await pool.query("SELECT * FROM withdrawal_requests WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Withdrawal request not found" });
  if (rows[0].status !== "pending") return res.status(409).json({ error: "Request is no longer pending" });

  const reviewedAt = Date.now();
  const newStatus = action === "approve" ? "approved" : "declined";
  await pool.query(
    "UPDATE withdrawal_requests SET status = ?, reviewed_at = ? WHERE id = ?",
    [newStatus, reviewedAt, req.params.id]
  );

  // Update user state so dashboard reflects the change
  const wr = rows[0];
  const [stateRows] = await pool.query("SELECT state_data FROM user_state WHERE user_id = ?", [wr.user_id]);
  if (stateRows.length) {
    try {
      const state = JSON.parse(stateRows[0].state_data);
      const reqIdx = (state.withdrawalRequests || []).findIndex(r => r.id === wr.id);
      if (reqIdx >= 0) {
        state.withdrawalRequests[reqIdx].status = newStatus;
        state.withdrawalRequests[reqIdx].reviewedAt = reviewedAt;
        if (action === "approve" && state.holdings?.[wr.package_id]) {
          const paid = parseFloat(wr.amount);
          state.holdings[wr.package_id].pendingWithdrawal = Math.max(0, (state.holdings[wr.package_id].pendingWithdrawal || 0) - paid);
          state.holdings[wr.package_id].paidOut = (state.holdings[wr.package_id].paidOut || 0) + paid;
        }
      }
      const stateJson = JSON.stringify(state);
      await pool.query(
        "INSERT INTO user_state (user_id, state_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_data = ?",
        [wr.user_id, stateJson, stateJson]
      );
    } catch {}
  }

  res.json({ message: `Withdrawal ${newStatus}`, reviewedAt });
});

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
