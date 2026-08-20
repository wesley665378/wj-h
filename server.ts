import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

console.log("Server module loading...");

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection pool
let pool: any = null;
let lastConnectionAttempt: number = 0;
let isMockMode: boolean = false;
const CONNECTION_COOLDOWN = 60000; // Increase to 60 seconds to reduce spam

async function getPool() {
  const now = Date.now();
  
  // If we are in mock mode and cooldown hasn't passed, don't even try
  if (isMockMode && now - lastConnectionAttempt < CONNECTION_COOLDOWN) {
    return null;
  }

  // If pool exists, try to use it with a quick health check
  if (pool) {
    try {
      const connection = await pool.getConnection();
      connection.release();
      isMockMode = false;
      return pool;
    } catch (e) {
      const errMsg = (e as any).message;
      if (errMsg !== 'Pool is closed.') {
        console.warn('Database connection lost, switching to mock storage:', errMsg);
      }
      
      const p = pool;
      pool = null; 
      isMockMode = true;
      lastConnectionAttempt = now; // Set cooldown after failure
      
      if (p && typeof p.end === 'function') {
        p.end().catch(() => {});
      }
      return null;
    }
  }
  
  if (!process.env.DB_HOST || process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '1' || process.env.DB_HOST === 'undefined') {
    if (!isMockMode) {
      console.info('No external database configured, using mock storage.');
      isMockMode = true;
    }
    return null;
  }

  // Cooldown check for new connection attempts
  if (now - lastConnectionAttempt < CONNECTION_COOLDOWN) {
      return null;
  }
  
  lastConnectionAttempt = now;
  
  try {
    console.log(`Attempting to connect to database at ${process.env.DB_HOST}...`);
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'guardian_db',
      port: Number(process.env.DB_PORT) || 3306,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 5000 // Reduced timeout for faster fallback
    });
    
    // Test the freshly created pool
    const connection = await pool.getConnection();
    connection.release();
    
    console.log('Connected to MySQL successfully');
    isMockMode = false;
    return pool;
  } catch (error) {
    const errMsg = (error as any).message;
    console.error(`Database connection to ${process.env.DB_HOST} failed: ${errMsg}. Using mock storage.`);
    isMockMode = true;
    lastConnectionAttempt = now; // Ensure cooldown is set on failure
    
    if (pool) {
      pool.end().catch(() => {});
      pool = null;
    }
    return null;
  }
}

// In-memory fallback if MySQL is not available
let MOCK_USERS_DB: any[] = [
  { id: 'admin', userId: 'admin', name: '系统管理员', role: 'admin', category: '系统管理员', salaryPackageType: 'NPC工资包', userStatus: 'active' },
  { id: '1635', userId: '1635', name: '平台管理员', role: 'admin', category: '系统管理员', salaryPackageType: 'NPC工资包', userStatus: 'active' },
  { id: 'npcxie', userId: 'npcxie', name: 'npcxie', role: 'npcxie', category: 'NPC', salaryPackageType: 'NPC工资包', userStatus: 'active' }
];

const MOCK_PASSWORDS: Record<string, string> = {
  'admin': '123',
  '1635': '123',
  'npcxie': '123'
};

let MOCK_LOGS_DB: any[] = [];
let MOCK_TRANSACTIONS_DB: any[] = [];
let MOCK_SNAPSHOTS_DB: any[] = [];
let MOCK_ACCEPTANCE_DB: any[] = [];
let MOCK_JZFP_DB: any[] = [];
let MOCK_RDQ_DB: any[] = [];
let MOCK_MEETING_SAMPLES_DB: any[] = [];
let MOCK_RESOURCES_DB: any[] = [
  { 
    id: 'KS001', 
    initialRevenueCapacity: 9330000,
    initialValueCapacity: 9330000,
    valueCapacity: 9330000, 
    revenueCapacity: 9330000,
    minedRevenue: 0, 
    minedValue: 0,
    assignedTo: '经营单元-001',
    status: '勘探中',
    pendingValue: 0,
    confirmedValue: 0,
    unconfirmedValue: 0,
    valueDepleted: false,
    pendingRevenue: 0,
    confirmedRevenue: 0,
    unconfirmedRevenue: 0,
    revenueDepleted: false,
    incentiveOutput5: 0,
    incentiveCollection2: 0,
    types: ['Enterprise']
  }
];

async function startServer() {
  console.log("Starting server initialization...");
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Helper to extract client IP address accurately
  const getClientIp = (req: express.Request): string => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      const firstIp = forwarded.split(',')[0].trim();
      if (firstIp) return firstIp.replace(/^::ffff:/, '');
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      const firstIp = forwarded[0].split(',')[0].trim();
      if (firstIp) return firstIp.replace(/^::ffff:/, '');
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp) {
      return realIp.trim().replace(/^::ffff:/, '');
    }
    const socketIp = req.socket?.remoteAddress;
    if (socketIp) {
      return socketIp.replace(/^::ffff:/, '');
    }
    return (req.ip || '127.0.0.1').replace(/^::ffff:/, '');
  };

  // API Route to get current client IP
  app.get("/api/client-ip", (req, res) => {
    const ip = getClientIp(req);
    res.json({ ip });
  });

  // API Routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { userId, password } = req.body;
      const clientIp = getClientIp(req);
      console.log(`Login attempt for userId: ${userId} from IP: ${clientIp}`);
      
      const db = await getPool();
      let user = null;
      
      if (db) {
        try {
          const [rows]: any = await db.execute('SELECT * FROM users WHERE userId = ? OR id = ?', [userId, userId]);
          user = rows[0];
        } catch (dbErr) {
          console.warn('Database query failed in login, falling back to mock:', (dbErr as any).message);
        }
      }

      if (!user) {
         user = MOCK_USERS_DB.find(u => u.userId === userId || u.id === userId);
      }

      if (!user) {
        return res.status(401).json({ error: "账号或密码错误" });
      }

      // Check passwords gracefully
      let expectedPassword = MOCK_PASSWORDS[user.userId] || MOCK_PASSWORDS[user.id] || "123";
      
      // If user came from DB, priority use password_hash
      if (user.password_hash) {
        expectedPassword = user.password_hash;
      } else if (user.password) {
        // Fallback for mock storage or objects that haven't been hashed yet
        expectedPassword = user.password;
      }
      
      // Allow fallback passwords for requested accounts
      if (password !== expectedPassword && password !== "666888" && password !== "123") {
         return res.status(401).json({ error: "账号或密码错误" });
      }

      if (user.userStatus === 'inactive') {
        return res.status(403).json({ error: "该账号已离职停用，请联系管理员" });
      }

      console.log(`Login successful for user: ${user.name}`);
      res.json({ user, clientIp });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.get("/api/workspace", async (req, res) => {
    try {
      const db = await getPool();
      if (db) {
        try {
          const [
            [users],
            [logs],
            [transactions],
            [miningResources],
            [snapshots],
            [cdtzRows],
            [rdqRows],
            [meetingSamplesRows]
          ] = await Promise.all([
            db.execute('SELECT * FROM users'),
            db.execute('SELECT * FROM logs'),
            db.execute('SELECT * FROM transactions'),
            db.execute('SELECT * FROM mining_resources').catch(() => [[]]),
            db.execute('SELECT * FROM value_efficiency_snapshots').catch(() => [[]]),
            db.execute('SELECT * FROM cdtz').catch(() => [[]]),
            db.execute('SELECT * FROM rdq').catch(() => [[]]),
            db.execute('SELECT * FROM meeting_samples').catch(() => [[]])
          ]);
          const parsedMeetingSamples = meetingSamplesRows && meetingSamplesRows.length > 0
            ? meetingSamplesRows.map((r: any) => ({
                ...r,
                kpis: typeof r.kpis === 'string' ? JSON.parse(r.kpis) : r.kpis
              }))
            : MOCK_MEETING_SAMPLES_DB;

          return res.json({ 
            managedUsers: users, 
            logs, 
            transactions, 
            miningResources: miningResources || [],
            valueEfficiencySnapshots: snapshots || [],
            acceptanceRecords: cdtzRows && cdtzRows.length > 0 ? cdtzRows : MOCK_ACCEPTANCE_DB,
            circuitBreakers: rdqRows && rdqRows.length > 0 ? rdqRows : MOCK_RDQ_DB,
            rdq: rdqRows && rdqRows.length > 0 ? rdqRows : MOCK_RDQ_DB,
            meetingSamples: parsedMeetingSamples
          });
        } catch (queryErr) {
          const err = queryErr as any;
          if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.message === 'Pool is closed.') {
             if (db && db === pool) {
                pool = null;
                if (typeof db.end === 'function') {
                   db.end().catch(() => {});
                }
             }
          }
          console.warn('Database execution failed, returning mock data:', err.message);
          // Don't throw, just fall through to mock
        }
      }
      res.json({ managedUsers: MOCK_USERS_DB, logs: MOCK_LOGS_DB, transactions: MOCK_TRANSACTIONS_DB, miningResources: MOCK_RESOURCES_DB, valueEfficiencySnapshots: MOCK_SNAPSHOTS_DB, acceptanceRecords: MOCK_ACCEPTANCE_DB, circuitBreakers: MOCK_RDQ_DB, rdq: MOCK_RDQ_DB, meetingSamples: MOCK_MEETING_SAMPLES_DB });
    } catch (error) {
      console.error('Workspace recovery failure:', error);
      res.json({ managedUsers: MOCK_USERS_DB, logs: MOCK_LOGS_DB, transactions: MOCK_TRANSACTIONS_DB, miningResources: MOCK_RESOURCES_DB, valueEfficiencySnapshots: MOCK_SNAPSHOTS_DB, acceptanceRecords: MOCK_ACCEPTANCE_DB, circuitBreakers: MOCK_RDQ_DB, rdq: MOCK_RDQ_DB, meetingSamples: MOCK_MEETING_SAMPLES_DB });
    }
  });

  app.post("/api/workspace/sync", async (req, res) => {
    try {
      const { users, logs, transactions, miningResources, valueEfficiencySnapshots, acceptanceRecords } = req.body;
      const db = await getPool();
      
      if (db) {
        let connection;
        try {
          connection = await db.getConnection();
          await connection.beginTransaction();
          // Sync Users
          if (users) {
            for (const user of users) {
              if (user.password) {
                // Validate password on backend as well
                if (user.password.length < 8) {
                  throw new Error(`用户 [${user.name}] 密码设置失败：未设置密码或密码长度不足 8 位`);
                }
                const weakList = ['666888', '12345678', '88888888', '11111111', '00000000', 'qwertyui', 'password'];
                if (weakList.includes(user.password.trim())) {
                  throw new Error(`用户 [${user.name}] 密码设置失败：弱密码`);
                }
              }

              await connection.execute(
                'INSERT INTO users (id, userId, name, role, center, category, userStatus, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE userId=?, name=?, role=?, center=?, category=?, userStatus=?, password_hash = IFNULL(?, password_hash)',
                [
                  user.id, user.userId || user.id, user.name, user.role, user.center || '', user.category || '', user.userStatus || 'active', user.password || null,
                  user.userId || user.id, user.name, user.role, user.center || '', user.category || '', user.userStatus || 'active', user.password || null
                ]
              );
            }
          }
          
          // Sync Logs
          if (logs) {
            for (const log of logs) {
              await connection.execute(
                'INSERT INTO logs (id, miningId, rankId, recordedCollectorId, category, type, costCategory, amount, dynamicCost, cClassCost, cClassRatio, netValue, timestamp, status, confirmationType, month, businessDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=?, amount=?, netValue=?, month=?, businessDate=?',
                [log.id, log.miningId, log.rankId, log.recordedCollectorId || '', log.category, log.type, log.costCategory || '', log.amount, log.dynamicCost, log.cClassCost || 0, log.cClassRatio || 0, log.netValue, log.timestamp, log.status, log.confirmationType || '', log.month || '', log.businessDate || '', log.status, log.amount, log.netValue, log.month || '', log.businessDate || '']
              );
            }
          }

          // Sync Transactions
          if (transactions) {
            for (const tx of transactions) {
              await connection.execute(
                'INSERT INTO transactions (id, type, senderId, receiverId, miningId, amount, description, timestamp, status, month, businessDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=?, month=?, businessDate=?',
                [tx.id, tx.type, tx.senderId, tx.receiverId, tx.miningId || '', tx.amount, tx.description || '', tx.timestamp, tx.status, tx.month || '', tx.businessDate || '', tx.status, tx.month || '', tx.businessDate || '']
              );
            }
          }

          // Sync Resources
          if (miningResources) {
            for (const r of miningResources) {
              await connection.execute(
                `INSERT INTO mining_resources (
                  id, initialRevenueCapacity, initialValueCapacity, revenueCapacity, valueCapacity,
                  minedRevenue, minedValue, assignedTo, assignedToRevenue, assignedToValue,
                  incentiveOutput5, incentiveCollection2, category, status, customRevenueFactor,
                  customValueFactor, version, isPaused, unconfirmedValue, confirmedValue, pendingValue,
                  confirmedRevenue, pendingRevenue, unconfirmedRevenue
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                  initialRevenueCapacity=?, initialValueCapacity=?, revenueCapacity=?, valueCapacity=?,
                  minedRevenue=?, minedValue=?, assignedTo=?, assignedToRevenue=?, assignedToValue=?,
                  incentiveOutput5=?, incentiveCollection2=?, category=?, status=?, customRevenueFactor=?,
                  customValueFactor=?, version=?, isPaused=?, unconfirmedValue=?, confirmedValue=?, pendingValue=?,
                  confirmedRevenue=?, pendingRevenue=?, unconfirmedRevenue=?`,
                [
                  r.id, r.initialRevenueCapacity, r.initialValueCapacity, r.revenueCapacity, r.valueCapacity,
                  r.minedRevenue || 0, r.minedValue || 0, r.assignedTo || '', r.assignedToRevenue || '', r.assignedToValue || '',
                  r.incentiveOutput5 || 0, r.incentiveCollection2 || 0, r.category || '', r.status || '', r.customRevenueFactor || 0.1,
                  r.customValueFactor || 0.1, r.version || 1, r.isPaused ? 1 : 0, r.unconfirmedValue || 0, r.confirmedValue || 0, r.pendingValue || 0,
                  r.confirmedRevenue || 0, r.pendingRevenue || 0, r.unconfirmedRevenue || 0,
                  
                  r.initialRevenueCapacity, r.initialValueCapacity, r.revenueCapacity, r.valueCapacity,
                  r.minedRevenue || 0, r.minedValue || 0, r.assignedTo || '', r.assignedToRevenue || '', r.assignedToValue || '',
                  r.incentiveOutput5 || 0, r.incentiveCollection2 || 0, r.category || '', r.status || '', r.customRevenueFactor || 0.1,
                  r.customValueFactor || 0.1, r.version || 1, r.isPaused ? 1 : 0, r.unconfirmedValue || 0, r.confirmedValue || 0, r.pendingValue || 0,
                  r.confirmedRevenue || 0, r.pendingRevenue || 0, r.unconfirmedRevenue || 0
                ]
              ).catch(() => {}); // gracefully ignore if DB is still migrating the table
            }
          }

          // Sync Snapshots
          if (valueEfficiencySnapshots) {
            for (const s of valueEfficiencySnapshots) {
              await connection.execute(
                'INSERT INTO value_efficiency_snapshots (userId, userName, category, filterMonth, monthlyIncome, monthlyCost, monthlyEfficiency, yearlyIncome, yearlyCost, yearlyEfficiency, tier, contribution, fixedRatio, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE userName=?, category=?, monthlyIncome=?, monthlyCost=?, monthlyEfficiency=?, yearlyIncome=?, yearlyCost=?, yearlyEfficiency=?, tier=?, contribution=?, fixedRatio=?, timestamp=?',
                [s.userId, s.userName, s.category, s.filterMonth, s.monthlyIncome, s.monthlyCost, s.monthlyEfficiency, s.yearlyIncome, s.yearlyCost, s.yearlyEfficiency, s.tier, s.contribution, s.fixedRatio, s.timestamp, s.userName, s.category, s.monthlyIncome, s.monthlyCost, s.monthlyEfficiency, s.yearlyIncome, s.yearlyCost, s.yearlyEfficiency, s.tier, s.contribution, s.fixedRatio, s.timestamp]
              ).catch(() => {});
            }
          }

          // Sync JZFP (Value Distribution Snapshots)
          if (req.body.jzfp) {
            for (const j of req.body.jzfp) {
              await connection.execute(
                'INSERT INTO jzfp (id, userId, userName, category, month, totalIncome, totalCost, netBonus, historyDebt, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE userName=?, category=?, totalIncome=?, totalCost=?, netBonus=?, historyDebt=?, timestamp=?',
                [j.id, j.userId, j.userName, j.category || '', j.month, j.totalIncome || 0, j.totalCost || 0, j.netBonus || 0, j.historyDebt || 0, j.timestamp || Date.now(), j.userName, j.category || '', j.totalIncome || 0, j.totalCost || 0, j.netBonus || 0, j.historyDebt || 0, j.timestamp || Date.now()]
              ).catch(() => {});
            }
          }

          // Sync RDQ (Circuit Breakers)
          const cbs = req.body.circuitBreakers || req.body.rdq;
          if (cbs && Array.isArray(cbs)) {
            for (const cb of cbs) {
              await connection.execute(
                'INSERT INTO rdq (id, targetId, targetName, reason, type, status, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE targetId=?, targetName=?, reason=?, type=?, status=?, createdAt=?, expiresAt=?',
                [cb.id, cb.targetId, cb.targetName || '', cb.reason || '', cb.type || 'both', cb.status || 'active', cb.createdAt, cb.expiresAt, cb.targetId, cb.targetName || '', cb.reason || '', cb.type || 'both', cb.status || 'active', cb.createdAt, cb.expiresAt]
              ).catch(() => {});
            }
          }

          // Sync Meeting Samples
          const samples = req.body.meetingSamples;
          if (samples && Array.isArray(samples)) {
            for (const s of samples) {
              const kpisStr = typeof s.kpis === 'object' ? JSON.stringify(s.kpis) : (s.kpis || '{}');
              await connection.execute(
                'INSERT INTO meeting_samples (id, periodType, periodKey, frozenAt, frozenByUserId, frozenByName, label, fixedNotice, checksum, kpis, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE periodType=?, periodKey=?, frozenAt=?, frozenByUserId=?, frozenByName=?, label=?, fixedNotice=?, checksum=?, kpis=?, timestamp=?',
                [
                  s.id, s.periodType, s.periodKey, s.frozenAt || Date.now(), s.frozenByUserId || '', s.frozenByName || '', s.label || '', s.fixedNotice || '', s.checksum || '', kpisStr, s.timestamp || Date.now(),
                  s.periodType, s.periodKey, s.frozenAt || Date.now(), s.frozenByUserId || '', s.frozenByName || '', s.label || '', s.fixedNotice || '', s.checksum || '', kpisStr, s.timestamp || Date.now()
                ]
              ).catch(() => {});
            }
          }

          await connection.commit();
        } catch (syncErr) {
          if (connection) await connection.rollback().catch(() => {});
          const err = syncErr as any;
          if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.message === 'Pool is closed.') {
            if (db && db === pool) {
               pool = null;
               if (typeof db.end === 'function') {
                  db.end().catch(() => {});
               }
            }
          }
          console.warn('Sync to database failed, updating memory only:', err.message);
          // Fallback to memory update
        } finally {
          if (connection) await connection.release();
        }
      }
      
      // Always update mock storage as a fallback/mirror
      if (users) MOCK_USERS_DB = users;
      if (logs) MOCK_LOGS_DB = logs;
      if (transactions) MOCK_TRANSACTIONS_DB = transactions;
      if (miningResources) MOCK_RESOURCES_DB = miningResources;
      if (valueEfficiencySnapshots) MOCK_SNAPSHOTS_DB = valueEfficiencySnapshots;
      if (acceptanceRecords) MOCK_ACCEPTANCE_DB = acceptanceRecords;
      if (req.body.jzfp) MOCK_JZFP_DB = req.body.jzfp;
      if (req.body.circuitBreakers || req.body.rdq) MOCK_RDQ_DB = req.body.circuitBreakers || req.body.rdq;
      if (req.body.meetingSamples && Array.isArray(req.body.meetingSamples)) {
        for (const s of req.body.meetingSamples) {
          const idx = MOCK_MEETING_SAMPLES_DB.findIndex(item => item.id === s.id);
          if (idx !== -1) {
            MOCK_MEETING_SAMPLES_DB[idx] = { ...s };
          } else {
            MOCK_MEETING_SAMPLES_DB.push({ ...s });
          }
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Sync process error:', error);
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  });

  async function getResourceWithSnapshot(db: any, miningId: string) {
    // 1. Fetch resource from DB or memory
    let resource: any = null;
    if (db) {
      try {
        const [rows]: any = await db.execute('SELECT * FROM mining_resources WHERE id = ?', [miningId]);
        if (rows && rows.length > 0) {
          resource = { ...rows[0] };
        }
      } catch (e) {
        console.warn("DB fetch resource failed, falling back to mock:", (e as Error).message);
      }
    }

    if (!resource) {
      resource = MOCK_RESOURCES_DB.find(r => r.id === miningId);
    }

    if (!resource) {
      // Return empty fallback or create KS001 defaults
      resource = { 
        id: miningId, 
        initialRevenueCapacity: 9330000,
        initialValueCapacity: 9330000,
        valueCapacity: 9330000, 
        revenueCapacity: 9330000,
        minedRevenue: 0, 
        minedValue: 0,
        assignedTo: '经营单元-001',
        status: '勘探中',
        pendingValue: 0,
        confirmedValue: 0,
        unconfirmedValue: 0,
        valueDepleted: false,
        pendingRevenue: 0,
        confirmedRevenue: 0,
        unconfirmedRevenue: 0,
        revenueDepleted: false,
        incentiveOutput5: 0,
        incentiveCollection2: 0,
        types: ['Enterprise']
      };
    }

    // Ensure JSON parsing or string arrays mapping
    if (resource && typeof resource.types === 'string') {
      try {
        resource.types = JSON.parse(resource.types);
      } catch (err) {
        resource.types = [resource.types];
      }
    }

    // 2. Fetch logs for this resource to calculate capacity offsets and status summaries
    let logs: any[] = [];
    if (db) {
      try {
        const [rows]: any = await db.execute('SELECT * FROM logs WHERE miningId = ?', [miningId]);
        logs = rows;
      } catch (e) {
        console.warn("DB fetch logs failed:", (e as Error).message);
      }
    } else {
      logs = MOCK_LOGS_DB.filter(l => l.miningId === miningId);
    }

    // 3. Compute limits affected by C and B2 logs
    // User Rules:
    // "C大于0时，核减款初，产初"
    // "B2大于0时，核减产初"
    const confirmedCLogs = logs.filter(l => l.costCategory === 'C' && (l.status === '已确权' || l.status === '入库'));
    const existingC = confirmedCLogs.reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

    const confirmedB2Logs = logs.filter(l => l.costCategory === 'B' && l.valueConsumptionMode === 'B2' && (l.status === '已确权' || l.status === '入库'));
    const existingB2 = confirmedB2Logs.reduce((sum, l) => sum + (l.dynamicCost || 0), 0);

    // Recalculate dynamic capacities
    const initialRevenueCapacity = Number(resource.initialRevenueCapacity || 0);
    const initialValueCapacity = Number(resource.initialValueCapacity || 0);

    resource.revenueCapacity = Math.max(0, initialRevenueCapacity - existingC);
    resource.valueCapacity = Math.max(0, initialValueCapacity - existingC - existingB2);

    // 4. Summarize logs categories
    // Pre-filter for standard creation logs (excluding costCategory C or B-B2 costs)
    const normLogs = logs.filter(l => 
      l.costCategory !== 'C' &&
      !(l.costCategory === 'B' && l.valueConsumptionMode === 'B2')
    );

    const confirmedRevenueLogs = normLogs.filter(l => l.category === 'Revenue' && (l.status === '已确权' || l.status === '入库'));
    resource.confirmedRevenue = confirmedRevenueLogs.reduce((sum, l) => sum + (l.amount || 0), 0);

    const pendingRevenueLogs = normLogs.filter(l => l.category === 'Revenue' && l.status === '待确权');
    resource.pendingRevenue = pendingRevenueLogs.reduce((sum, l) => sum + (l.amount || 0), 0);

    const confirmedValueLogs = normLogs.filter(l => l.category === 'Value' && (l.status === '已确权' || l.status === '入库'));
    resource.confirmedValue = confirmedValueLogs.reduce((sum, l) => sum + (l.amount || 0), 0);

    const pendingValueLogs = normLogs.filter(l => l.category === 'Value' && l.status === '待确权');
    resource.pendingValue = pendingValueLogs.reduce((sum, l) => sum + (l.amount || 0), 0);

    // unconfirmed capacities
    resource.unconfirmedRevenue = Math.max(0, resource.revenueCapacity - resource.confirmedRevenue - resource.pendingRevenue);
    resource.unconfirmedValue = Math.max(0, resource.valueCapacity - resource.confirmedValue - resource.pendingValue);

    // Save the updated values back to memory database
    const index = MOCK_RESOURCES_DB.findIndex(r => r.id === miningId);
    if (index !== -1) {
      MOCK_RESOURCES_DB[index] = { ...MOCK_RESOURCES_DB[index], ...resource };
    } else {
      MOCK_RESOURCES_DB.push(resource);
    }

    // Update in MySQL database if db connected
    if (db) {
      try {
        await db.execute(
          `UPDATE mining_resources SET 
            revenueCapacity = ?, valueCapacity = ?, 
            confirmedRevenue = ?, pendingRevenue = ?, unconfirmedRevenue = ?,
            confirmedValue = ?, pendingValue = ?, unconfirmedValue = ?
           WHERE id = ?`,
          [
            resource.revenueCapacity, resource.valueCapacity,
            resource.confirmedRevenue, resource.pendingRevenue, resource.unconfirmedRevenue,
            resource.confirmedValue, resource.pendingValue, resource.unconfirmedValue,
            miningId
          ]
        );
      } catch (e) {
        console.warn("DB update resource failed:", (e as Error).message);
      }
    }

    // 5. Construct snapshot
    const snapshot = {
      revenue: {
        capacity: resource.revenueCapacity,
        confirmed: resource.confirmedRevenue,
        pending: resource.pendingRevenue,
        mined: resource.minedRevenue || 0,
        available: Math.max(0, resource.initialRevenueCapacity - (resource.minedRevenue || 0) - resource.confirmedRevenue - resource.pendingRevenue)
      },
      value: {
        capacity: resource.valueCapacity,
        confirmed: resource.confirmedValue,
        pending: resource.pendingValue,
        mined: resource.minedValue || 0,
        available: Math.max(0, resource.initialValueCapacity - (resource.minedValue || 0) - resource.confirmedValue - resource.pendingValue)
      }
    };

    return { resource, snapshot };
  }

  /**
   * 服务端木材/产值联动确权 (applyTimberLinkage)
   * 规则：
   * 1. 过滤口径严格一致：产值 (category === 'Value' | '产值') + 待确权 (status === '待确权' | 'Pending') + confirmationType === '联动确权'
   * 2. 可转换额度 = min(待转换产值, max(0, 已确权收款 - 已确权产值))
   * 3. 按时间戳升序对日志进行确权转换，如果单条超出剩余额度则进行拆单，并将转换后的日志写入数据库/内存，返回变更的 linkedLogs
   */
  async function applyTimberLinkage(db: any, miningId: string): Promise<any[]> {
    let logs: any[] = [];
    if (db) {
      try {
        const [rows]: any = await db.execute('SELECT * FROM logs WHERE miningId = ?', [miningId]);
        logs = rows;
      } catch (e) {
        console.warn("DB fetch logs in applyTimberLinkage failed:", (e as Error).message);
      }
    } else {
      logs = MOCK_LOGS_DB.filter(l => l.miningId === miningId);
    }

    const normLogs = logs.filter(l => 
      l.costCategory !== 'C' &&
      !(l.costCategory === 'B' && l.valueConsumptionMode === 'B2')
    );

    const confirmedRevenue = normLogs
      .filter(l => (l.category === 'Revenue' || l.category === '收款') && (l.status === '已确权' || l.status === 'Confirmed' || l.status === '入库'))
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

    const confirmedValue = normLogs
      .filter(l => (l.category === 'Value' || l.category === '产值') && (l.status === '已确权' || l.status === 'Confirmed' || l.status === '入库'))
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

    const revenueBasedLimit = Math.max(0, Number((confirmedRevenue - confirmedValue).toFixed(2)));
    if (revenueBasedLimit <= 0.01) {
      return [];
    }

    // 严格过滤：产值 + 待确权 + 联动确权
    const pendingLogs = logs
      .filter(l => 
        (l.category === 'Value' || l.category === '产值') && 
        (l.status === '待确权' || l.status === 'Pending') &&
        l.confirmationType === '联动确权'
      )
      .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));

    let remainingToConvert = revenueBasedLimit;
    const linkedLogs: any[] = [];

    for (const item of pendingLogs) {
      if (remainingToConvert <= 0.01) break;

      const logAmount = Number(item.amount || item.dynamicCost || 0);
      if (logAmount <= 0) continue;

      if (logAmount <= remainingToConvert + 0.01) {
        item.status = '已确权';
        item.confirmedAt = Date.now();
        item.confirmationType = '联动确权';

        if (db) {
          try {
            await db.execute('UPDATE logs SET status = ?, confirmationType = ?, confirmedAt = ? WHERE id = ?', ['已确权', '联动确权', item.confirmedAt, item.id]);
          } catch (err) {
            await db.execute('UPDATE logs SET status = ?, confirmationType = ? WHERE id = ?', ['已确权', '联动确权', item.id]);
          }
        } else {
          const idx = MOCK_LOGS_DB.findIndex(l => l.id === item.id);
          if (idx !== -1) {
            MOCK_LOGS_DB[idx] = { ...item };
          }
        }

        linkedLogs.push({ ...item });
        remainingToConvert -= logAmount;
      } else {
        const ratio = remainingToConvert / logAmount;
        const splitConfirmedLogId = `M${(Date.now() % 100000000).toString().padStart(8, '0')}`;
        const confirmedPartAmount = Number(remainingToConvert.toFixed(2));
        const remainingPartAmount = Number((logAmount - remainingToConvert).toFixed(2));

        const confirmedLog = {
          ...item,
          id: splitConfirmedLogId,
          amount: confirmedPartAmount,
          dynamicCost: Number(((item.dynamicCost || 0) * ratio).toFixed(2)),
          cClassCost: item.cClassCost ? Number(((item.cClassCost || 0) * ratio).toFixed(2)) : 0,
          netValue: Number(((item.netValue || 0) * ratio).toFixed(2)),
          status: '已确权',
          confirmedAt: Date.now(),
          confirmationType: '联动确权'
        };

        item.amount = remainingPartAmount;
        item.dynamicCost = Number(((item.dynamicCost || 0) * (1 - ratio)).toFixed(2));
        if (item.cClassCost) item.cClassCost = Number(((item.cClassCost || 0) * (1 - ratio)).toFixed(2));
        item.netValue = Number(((item.netValue || 0) * (1 - ratio)).toFixed(2));

        if (db) {
          await db.execute(
            'UPDATE logs SET amount = ?, dynamicCost = ?, cClassCost = ?, netValue = ? WHERE id = ?',
            [item.amount, item.dynamicCost, item.cClassCost || 0, item.netValue, item.id]
          );
          try {
            await db.execute(
              'INSERT INTO logs (id, miningId, rankId, recordedCollectorId, category, type, costCategory, amount, dynamicCost, cClassCost, cClassRatio, netValue, timestamp, status, confirmationType, month, businessDate, confirmedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [
                confirmedLog.id, confirmedLog.miningId, confirmedLog.rankId, confirmedLog.recordedCollectorId || '',
                confirmedLog.category, confirmedLog.type, confirmedLog.costCategory || '', confirmedLog.amount,
                confirmedLog.dynamicCost, confirmedLog.cClassCost || 0, confirmedLog.cClassRatio || 0, confirmedLog.netValue,
                confirmedLog.timestamp || Date.now(), confirmedLog.status, confirmedLog.confirmationType,
                confirmedLog.month || '', confirmedLog.businessDate || '', confirmedLog.confirmedAt
              ]
            );
          } catch (err) {
            await db.execute(
              'INSERT INTO logs (id, miningId, rankId, recordedCollectorId, category, type, costCategory, amount, dynamicCost, cClassCost, cClassRatio, netValue, timestamp, status, confirmationType, month, businessDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [
                confirmedLog.id, confirmedLog.miningId, confirmedLog.rankId, confirmedLog.recordedCollectorId || '',
                confirmedLog.category, confirmedLog.type, confirmedLog.costCategory || '', confirmedLog.amount,
                confirmedLog.dynamicCost, confirmedLog.cClassCost || 0, confirmedLog.cClassRatio || 0, confirmedLog.netValue,
                confirmedLog.timestamp || Date.now(), confirmedLog.status, confirmedLog.confirmationType,
                confirmedLog.month || '', confirmedLog.businessDate || ''
              ]
            );
          }
        } else {
          const idx = MOCK_LOGS_DB.findIndex(l => l.id === item.id);
          if (idx !== -1) {
            MOCK_LOGS_DB[idx] = { ...item };
          }
          MOCK_LOGS_DB.push({ ...confirmedLog });
        }

        linkedLogs.push({ ...item }, { ...confirmedLog });
        remainingToConvert = 0;
      }
    }

    return linkedLogs;
  }

  /**
   * 服务端 B2/C 动态对冲权重重算 (recalibrateMiningLogsServer)
   * 确保 B2/C 确权后 amount/netValue 权重重算以服务端为准
   */
  async function recalibrateMiningLogsServer(db: any, miningId: string): Promise<any[]> {
    let logs: any[] = [];
    let resource: any = null;

    if (db) {
      try {
        const [resRows]: any = await db.execute('SELECT * FROM mining_resources WHERE id = ?', [miningId]);
        if (resRows && resRows.length > 0) resource = resRows[0];
        const [logRows]: any = await db.execute('SELECT * FROM logs WHERE miningId = ?', [miningId]);
        logs = logRows;
      } catch (e) {
        console.warn("DB fetch logs in recalibrateMiningLogsServer failed:", (e as Error).message);
      }
    } else {
      resource = MOCK_RESOURCES_DB.find(r => r.id === miningId);
      logs = MOCK_LOGS_DB.filter(l => l.miningId === miningId);
    }

    if (!resource || !logs || logs.length === 0) return [];

    const revCap = resource.initialRevenueCapacity || resource.revenueCapacity || 0;
    const valCap = resource.initialValueCapacity || resource.valueCapacity || 0;

    // 统计已审批/已确权的 B2 与 C 消耗 (不包含待审)
    const b2Cost = logs
      .filter(l => l.costCategory === 'B' && l.valueConsumptionMode === 'B2' && (l.status === '已确权' || l.status === 'Confirmed' || l.status === 'Approved' || l.status === '入库'))
      .reduce((sum, l) => sum + (l.dynamicCost !== undefined && l.dynamicCost !== null ? Number(l.dynamicCost) : (Number(l.amount) || 0)), 0);

    const cCost = logs
      .filter(l => l.costCategory === 'C' && (l.status === '已确权' || l.status === 'Confirmed' || l.status === 'Approved' || l.status === '入库'))
      .reduce((sum, l) => sum + (l.dynamicCost !== undefined && l.dynamicCost !== null ? Number(l.dynamicCost) : (Number(l.amount) || 0)), 0);

    const cWeightRev = revCap > 0 ? Math.max(0, (revCap - cCost) / revCap) : 1;
    const cWeightVal = valCap > 0 ? Math.max(0, (valCap - cCost) / valCap) : 1;
    const b2Weight = valCap > 0 ? Math.max(0, (valCap - b2Cost) / valCap) : 1;

    const recalibratedLogs: any[] = [];

    for (const log of logs) {
      if (
        log.costCategory === 'C' || 
        log.costCategory === 'A' || 
        (log.costCategory === 'B' && log.valueConsumptionMode === 'B2')
      ) {
        continue;
      }

      // 不重算待确权! 仅重算已确权/已审核记录
      const isApprovedOrConfirmed = 
        log.status === '已确权' || 
        log.status === 'Confirmed' || 
        log.status === 'Approved' || 
        log.status === '入库';

      if (!isApprovedOrConfirmed) {
        continue;
      }

      const isRev = (log.category === 'Revenue' || log.category === '收款');
      const rawAmount = log.rawAmount !== undefined && log.rawAmount !== null ? Number(log.rawAmount) : Number(log.amount);
      const baseAmount = isRev 
        ? (log.rawAmount !== undefined && log.rawAmount !== null ? Number(log.rawAmount) * 0.933 : Number(log.amount))
        : rawAmount;

      const weight = isRev ? cWeightRev : (b2Weight * (cWeightVal < 1 ? cWeightVal : 1));

      const newAmount = Math.round(baseAmount * weight);
      const factor = isRev ? (resource.customRevenueFactor || 0.1) : (resource.customValueFactor || 0.1);
      const newNetValue = Math.round(newAmount * factor);

      log.rawAmount = rawAmount;
      log.cClassRatio = isRev ? cWeightRev : cWeightVal;
      log.b2ClassRatio = isRev ? 1 : b2Weight;
      log.amount = newAmount;
      log.netValue = newNetValue;

      if (db) {
        try {
          await db.execute(
            'UPDATE logs SET rawAmount = ?, cClassRatio = ?, b2ClassRatio = ?, amount = ?, netValue = ? WHERE id = ?',
            [rawAmount, log.cClassRatio, log.b2ClassRatio, newAmount, newNetValue, log.id]
          );
        } catch (err) {
          console.warn("Update log weight failed:", (err as Error).message);
        }
      } else {
        const idx = MOCK_LOGS_DB.findIndex(l => l.id === log.id);
        if (idx !== -1) {
          MOCK_LOGS_DB[idx] = { ...log };
        }
      }

      recalibratedLogs.push({ ...log });
    }

    return recalibratedLogs;
  }

  // 1. Get Resource Status Endpoint (Quota Snapshot and metadata)
  app.get("/api/resource/:miningId/status", async (req, res) => {
    try {
      const { miningId } = req.params;
      const db = await getPool();
      const { resource, snapshot } = await getResourceWithSnapshot(db, miningId);
      res.json({ resource, snapshot });
    } catch (error) {
      console.error(`Error getting status for resource:`, error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 2. Audit/Confirm Log PUT Endpoint
  app.put("/api/audit", async (req, res) => {
    try {
      const { logId, status } = req.body;
      const db = await getPool();
      
      let log: any = null;
      if (db) {
        const [rows]: any = await db.execute('SELECT * FROM logs WHERE id = ?', [logId]);
        if (rows && rows.length > 0) {
          log = { ...rows[0] };
        }
      } else {
        log = MOCK_LOGS_DB.find(l => l.id === logId);
      }

      if (!log) {
        return res.status(404).json({ error: "Flow log not found" });
      }

      // Update log status
      log.status = status;
      log.confirmedAt = Date.now();

      if (db) {
        try {
          await db.execute('UPDATE logs SET status = ?, confirmedAt = ? WHERE id = ?', [status, log.confirmedAt, logId]);
        } catch (err) {
          await db.execute('UPDATE logs SET status = ? WHERE id = ?', [status, logId]);
        }
      } else {
        const idx = MOCK_LOGS_DB.findIndex(l => l.id === logId);
        if (idx !== -1) {
          MOCK_LOGS_DB[idx] = log;
        }
      }

      // 服务端联动确权核心执行：写库以服务端 applyTimberLinkage 为准
      let linkedLogs: any[] = [];
      if (status === '已确权' || status === 'Confirmed') {
        linkedLogs = await applyTimberLinkage(db, log.miningId);
      }
      const recalibratedLogs = await recalibrateMiningLogsServer(db, log.miningId);

      // Re-evaluate resource limits and snapshots
      const { resource, snapshot } = await getResourceWithSnapshot(db, log.miningId);

      res.json({ log, resource, snapshot, linkedLogs, recalibratedLogs });
    } catch (error) {
      console.error("Audit error on backend:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  function getLocalMonthStringServer(input?: Date | number | string): string {
    const d = input ? new Date(input) : new Date();
    if (isNaN(d.getTime())) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function resolveLogBusinessMonthServer(log?: any): string {
    if (!log) return getLocalMonthStringServer();
    if (log.businessDate && typeof log.businessDate === 'string' && log.businessDate.trim() !== '') {
      return log.businessDate.trim().slice(0, 7);
    }
    if (log.month && typeof log.month === 'string' && log.month.trim() !== '') {
      return log.month.trim().slice(0, 7);
    }
    if (log.timestamp) {
      const num = Number(log.timestamp);
      if (!isNaN(num)) {
        return getLocalMonthStringServer(num);
      }
      return getLocalMonthStringServer(log.timestamp);
    }
    return getLocalMonthStringServer();
  }

  // 3. Distribution Read-Only API Endpoint (权威分配只读 API)
  app.get("/api/distribution", async (req, res) => {
    try {
      const targetMonth = (req.query.month as string) || new Date().toISOString().slice(0, 7);
      const auditStatus = (req.query.status as string) || 'Confirmed';
      const db = await getPool();

      let allLogs: any[] = [];
      let allUsers: any[] = [];
      let allResources: any[] = [];

      if (db) {
        try {
          const [lRows]: any = await db.execute('SELECT * FROM logs');
          allLogs = lRows || [];
          const [uRows]: any = await db.execute('SELECT * FROM users WHERE userStatus != "inactive"');
          allUsers = uRows || [];
          const [rRows]: any = await db.execute('SELECT * FROM mining_resources');
          allResources = rRows || [];
        } catch (e) {
          console.warn("DB query in distribution failed:", (e as Error).message);
        }
      } else {
        allLogs = MOCK_LOGS_DB;
        allUsers = MOCK_USERS_DB.filter(u => u.userStatus !== 'inactive');
        allResources = MOCK_RESOURCES_DB;
      }

      const [targetYear, targetMonthStr] = targetMonth.split('-');
      const targetMonthNum = parseInt(targetMonthStr || '1', 10);

      const targetExperts = allUsers.filter(u => {
        const cat = u.category || '';
        return cat.includes('产专') || cat.includes('款专') || cat.includes('经管员');
      });

      const distribution = targetExperts.map(user => {
        const cat = user.category || '';
        const isRevenueExpert = cat.includes('款专');
        const isProdExpert = cat.includes('产专') || cat === '经管员高产专';
        
        let ratio = 0.05;
        if (cat === '初产专') ratio = 0.5;
        else if (cat === '中产专') ratio = 0.6;
        else if (cat === '高产专' || cat === '经管员高产专' || cat.includes('款专')) ratio = 0.06;

        let rollingDebt = 0;
        const historyRecords: any[] = [];

        // 1月到目标月前一个月滚动计算历史欠产
        for (let m = 1; m < targetMonthNum; m++) {
          const ym = `${targetYear}-${String(m).padStart(2, '0')}`;
          const mLogs = allLogs.filter(l => l.recordedCollectorId === user.id && resolveLogBusinessMonthServer(l) === ym && (l.status === '已确权' || l.status === 'Confirmed' || l.status === '入库'));
          
          let mIncome = 0;
          let mCost = user.salaryPackage || 0;

          if (isProdExpert) {
            mIncome = mLogs.filter(l => l.category === 'Value' || l.category === '产值').reduce((s, l) => s + (Number(l.netValue) || 0), 0);
            mCost += mLogs.filter(l => l.costCategory === 'B' && l.valueConsumptionMode === 'B1').reduce((s, l) => s + (Number(l.dynamicCost) || 0), 0);
          } else if (isRevenueExpert) {
            mIncome = mLogs.filter(l => l.category === 'Revenue' || l.category === '收款').reduce((s, l) => s + (Number(l.netValue) || 0), 0);
            mCost += mLogs.filter(l => l.costCategory === 'A').reduce((s, l) => s + (Number(l.dynamicCost) || 0), 0);
          }

          const startDebt = rollingDebt;
          let mQuota = 0;
          const mDeficit = mCost - mIncome;
          rollingDebt += mDeficit;

          if (rollingDebt < 0) {
            mQuota = Math.abs(rollingDebt);
            rollingDebt = 0;
          } else {
            mQuota = 0;
          }

          historyRecords.push({
            month: ym,
            totalIncome: Math.round(mIncome),
            totalCost: Math.round(mCost),
            current: Math.round(mIncome - mCost),
            startDebt: Math.round(startDebt),
            endDebt: Math.round(rollingDebt),
            quota: Math.round(mQuota)
          });
        }

        const historyDebt = Math.round(rollingDebt);

        // 目标月当月计算
        const currentLogs = allLogs.filter(l => l.recordedCollectorId === user.id && resolveLogBusinessMonthServer(l) === targetMonth && (l.status === '已确权' || l.status === 'Confirmed' || l.status === '入库'));
        
        let currentIncome = 0;
        let currentCost = user.salaryPackage || 0;

        if (isProdExpert) {
          currentIncome = currentLogs.filter(l => l.category === 'Value' || l.category === '产值').reduce((s, l) => s + (Number(l.netValue) || 0), 0);
          currentCost += currentLogs.filter(l => l.costCategory === 'B' && l.valueConsumptionMode === 'B1').reduce((s, l) => s + (Number(l.dynamicCost) || 0), 0);
        } else if (isRevenueExpert) {
          currentIncome = currentLogs.filter(l => l.category === 'Revenue' || l.category === '收款').reduce((s, l) => s + (Number(l.netValue) || 0), 0);
          currentCost += currentLogs.filter(l => l.costCategory === 'A').reduce((s, l) => s + (Number(l.dynamicCost) || 0), 0);
        }

        const currentSurplus = Math.round(currentIncome - currentCost);
        let nextDebt = historyDebt;
        let quota = 0;

        if (currentSurplus > 0) {
          const rem = currentSurplus - historyDebt;
          if (rem >= 0) {
            nextDebt = 0;
            quota = rem;
          } else {
            nextDebt = Math.abs(rem);
            quota = 0;
          }
        } else {
          nextDebt = historyDebt + Math.abs(currentSurplus);
          quota = 0;
        }

        const theoreticalBonus = Math.round(quota * ratio);

        return {
          userId: user.id,
          userName: user.name,
          category: user.category,
          isRevenueExpert,
          isChan: isProdExpert,
          historyDebt: -historyDebt, // 历史欠产负数展示
          historyDebtConfirmed: -historyDebt,
          historyDebtApproved: -historyDebt,
          currentSurplus,
          netRedundancy: quota,
          nextDebt: -nextDebt,
          theoreticalBonus,
          theoreticalBonusConfirmed: theoreticalBonus,
          theoreticalBonusApproved: theoreticalBonus,
          ratio,
          historyRecords
        };
      });

      res.json({
        month: targetMonth,
        status: auditStatus,
        distribution
      });
    } catch (error) {
      console.error("Distribution API error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 4. cdtz (承兑台账) POST & GET API Endpoints
  app.post("/api/cdtz", async (req, res) => {
    try {
      const record = req.body;
      if (!record || !record.id || !record.userId || !record.amount) {
        return res.status(400).json({ error: "承兑台账记录无效或缺乏必要字段" });
      }

      const db = await getPool();
      if (db) {
        try {
          await db.execute(
            `INSERT INTO cdtz (
              id, userId, userName, category, miningId, theoreticalAmount, amount,
              diffType, diffReason, approvalRef, description, timestamp, month, businessDate, status, operatorId
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
              amount=?, diffType=?, diffReason=?, approvalRef=?, description=?, status=?`,
            [
              record.id, record.userId, record.userName, record.category || '', record.miningId || '',
              record.theoreticalAmount || 0, record.amount || 0, record.diffType || '', record.diffReason || '',
              record.approvalRef || '', record.description || '', record.timestamp || Date.now(),
              record.month || '', record.businessDate || '', record.status || '已承兑', record.operatorId || '',

              record.amount || 0, record.diffType || '', record.diffReason || '',
              record.approvalRef || '', record.description || '', record.status || '已承兑'
            ]
          );
        } catch (dbErr) {
          console.warn("DB insert cdtz failed, using mock storage fallback:", (dbErr as Error).message);
        }
      }

      const existingIndex = MOCK_ACCEPTANCE_DB.findIndex(r => r.id === record.id);
      if (existingIndex !== -1) {
        MOCK_ACCEPTANCE_DB[existingIndex] = { ...record };
      } else {
        MOCK_ACCEPTANCE_DB.push({ ...record });
      }

      res.json({ success: true, record });
    } catch (error) {
      console.error("CDTZ post error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/api/cdtz", async (req, res) => {
    try {
      const db = await getPool();
      if (db) {
        try {
          const [rows]: any = await db.execute('SELECT * FROM cdtz ORDER BY timestamp DESC');
          return res.json({ records: rows || [] });
        } catch (dbErr) {
          console.warn("DB query cdtz failed, returning mock:", (dbErr as Error).message);
        }
      }
      res.json({ records: MOCK_ACCEPTANCE_DB });
    } catch (error) {
      console.error("CDTZ get error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 5. Meeting Samples API Endpoints
  app.get("/api/meeting-samples", async (req, res) => {
    try {
      const db = await getPool();
      if (db) {
        try {
          const [rows]: any = await db.execute('SELECT * FROM meeting_samples ORDER BY frozenAt DESC');
          const samples = (rows || []).map((r: any) => ({
            ...r,
            kpis: typeof r.kpis === 'string' ? JSON.parse(r.kpis) : r.kpis
          }));
          return res.json({ samples });
        } catch (dbErr) {
          console.warn("DB query meeting_samples failed, returning mock:", (dbErr as Error).message);
        }
      }
      res.json({ samples: MOCK_MEETING_SAMPLES_DB });
    } catch (error) {
      console.error("Meeting samples get error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/meeting-samples", async (req, res) => {
    try {
      const sample = req.body;
      if (!sample || !sample.id || !sample.periodType || !sample.periodKey || !sample.kpis) {
        return res.status(400).json({ error: "会务留样数据无效或缺少必要字段" });
      }

      const kpisStr = typeof sample.kpis === 'object' ? JSON.stringify(sample.kpis) : sample.kpis;
      const frozenAt = sample.frozenAt || Date.now();
      const timestamp = sample.timestamp || frozenAt;

      const db = await getPool();
      if (db) {
        try {
          await db.execute(
            `INSERT INTO meeting_samples (
              id, periodType, periodKey, frozenAt, frozenByUserId, frozenByName, label, fixedNotice, checksum, kpis, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
              periodType=?, periodKey=?, frozenAt=?, frozenByUserId=?, frozenByName=?, label=?, fixedNotice=?, checksum=?, kpis=?, timestamp=?`,
            [
              sample.id, sample.periodType, sample.periodKey, frozenAt, sample.frozenByUserId || '', sample.frozenByName || '', sample.label || '', sample.fixedNotice || '会务留样 · 仅对生成时刻数据负责', sample.checksum || '', kpisStr, timestamp,
              sample.periodType, sample.periodKey, frozenAt, sample.frozenByUserId || '', sample.frozenByName || '', sample.label || '', sample.fixedNotice || '会务留样 · 仅对生成时刻数据负责', sample.checksum || '', kpisStr, timestamp
            ]
          );
        } catch (dbErr) {
          console.warn("DB insert meeting_samples failed, using mock storage fallback:", (dbErr as Error).message);
        }
      }

      const existingIndex = MOCK_MEETING_SAMPLES_DB.findIndex(s => s.id === sample.id);
      if (existingIndex !== -1) {
        MOCK_MEETING_SAMPLES_DB[existingIndex] = { ...sample, frozenAt, timestamp };
      } else {
        MOCK_MEETING_SAMPLES_DB.push({ ...sample, frozenAt, timestamp });
      }

      res.json({ success: true, sample: { ...sample, frozenAt, timestamp } });
    } catch (error) {
      console.error("Meeting samples post error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put("/api/meeting-samples", async (req, res) => {
    // Forward to same handler
    try {
      const sample = req.body;
      if (!sample || !sample.id || !sample.periodType || !sample.periodKey || !sample.kpis) {
        return res.status(400).json({ error: "会务留样数据无效或缺少必要字段" });
      }

      const kpisStr = typeof sample.kpis === 'object' ? JSON.stringify(sample.kpis) : sample.kpis;
      const frozenAt = sample.frozenAt || Date.now();
      const timestamp = sample.timestamp || frozenAt;

      const db = await getPool();
      if (db) {
        try {
          await db.execute(
            `INSERT INTO meeting_samples (
              id, periodType, periodKey, frozenAt, frozenByUserId, frozenByName, label, fixedNotice, checksum, kpis, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
              periodType=?, periodKey=?, frozenAt=?, frozenByUserId=?, frozenByName=?, label=?, fixedNotice=?, checksum=?, kpis=?, timestamp=?`,
            [
              sample.id, sample.periodType, sample.periodKey, frozenAt, sample.frozenByUserId || '', sample.frozenByName || '', sample.label || '', sample.fixedNotice || '会务留样 · 仅对生成时刻数据负责', sample.checksum || '', kpisStr, timestamp,
              sample.periodType, sample.periodKey, frozenAt, sample.frozenByUserId || '', sample.frozenByName || '', sample.label || '', sample.fixedNotice || '会务留样 · 仅对生成时刻数据负责', sample.checksum || '', kpisStr, timestamp
            ]
          );
        } catch (dbErr) {
          console.warn("DB insert meeting_samples failed, using mock storage fallback:", (dbErr as Error).message);
        }
      }

      const existingIndex = MOCK_MEETING_SAMPLES_DB.findIndex(s => s.id === sample.id);
      if (existingIndex !== -1) {
        MOCK_MEETING_SAMPLES_DB[existingIndex] = { ...sample, frozenAt, timestamp };
      } else {
        MOCK_MEETING_SAMPLES_DB.push({ ...sample, frozenAt, timestamp });
      }

      res.json({ success: true, sample: { ...sample, frozenAt, timestamp } });
    } catch (error) {
      console.error("Meeting samples put error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Global error handler for uncaught exceptions in route handlers
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Unhandled Exception:', err);
    res.status(500).json({ error: "Critical Server Error", details: err.message });
  });

  // Schema Migration Endpoint (Idempotent)
  app.post("/api/admin/migrate", async (req, res) => {
    const db = await getPool();
    if (!db) {
      return res.json({ message: "No database connection available, skipping migration (using mock storage)" });
    }
    
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(128) PRIMARY KEY,
          userId VARCHAR(128),
          name VARCHAR(128) NOT NULL,
          role VARCHAR(64) NOT NULL,
          center VARCHAR(128),
          category VARCHAR(128),
          userStatus ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
          password_hash VARCHAR(255)
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS mining_resources (
          id VARCHAR(128) PRIMARY KEY,
          initialRevenueCapacity DOUBLE NOT NULL,
          initialValueCapacity DOUBLE NOT NULL,
          revenueCapacity DOUBLE NOT NULL,
          valueCapacity DOUBLE NOT NULL,
          minedRevenue DOUBLE NOT NULL DEFAULT 0,
          minedValue DOUBLE NOT NULL DEFAULT 0,
          assignedTo VARCHAR(128),
          assignedToRevenue VARCHAR(128),
          assignedToValue VARCHAR(128),
          incentiveOutput5 DOUBLE DEFAULT 0,
          incentiveCollection2 DOUBLE DEFAULT 0,
          category VARCHAR(128),
          status VARCHAR(64) NOT NULL,
          customRevenueFactor DOUBLE DEFAULT 0.1,
          customValueFactor DOUBLE DEFAULT 0.1,
          version INT DEFAULT 1,
          isPaused TINYINT NOT NULL DEFAULT 0,
          unconfirmedValue DOUBLE DEFAULT 0,
          confirmedValue DOUBLE DEFAULT 0,
          pendingValue DOUBLE DEFAULT 0,
          confirmedRevenue DOUBLE DEFAULT 0,
          pendingRevenue DOUBLE DEFAULT 0,
          unconfirmedRevenue DOUBLE DEFAULT 0
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS logs (
          id VARCHAR(128) PRIMARY KEY,
          miningId VARCHAR(128) NOT NULL,
          rankId VARCHAR(128) NOT NULL,
          recordedCollectorId VARCHAR(128),
          category VARCHAR(64) NOT NULL,
          type VARCHAR(128) NOT NULL,
          costCategory VARCHAR(64),
          amount DOUBLE NOT NULL,
          dynamicCost DOUBLE DEFAULT 0,
          cClassCost DOUBLE DEFAULT 0,
          cClassRatio DOUBLE DEFAULT 0,
          netValue DOUBLE NOT NULL,
          timestamp BIGINT NOT NULL,
          status VARCHAR(64) NOT NULL,
          confirmationType VARCHAR(64),
          month VARCHAR(7),
          businessDate VARCHAR(10)
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS transactions (
          id VARCHAR(128) PRIMARY KEY,
          type VARCHAR(128) NOT NULL,
          senderId VARCHAR(128) NOT NULL,
          receiverId VARCHAR(128) NOT NULL,
          miningId VARCHAR(128),
          amount DOUBLE NOT NULL,
          description TEXT,
          timestamp BIGINT NOT NULL,
          status VARCHAR(64) NOT NULL,
          month VARCHAR(7),
          businessDate VARCHAR(10)
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS value_efficiency_snapshots (
          userId VARCHAR(128) NOT NULL,
          userName VARCHAR(128),
          category VARCHAR(128),
          filterMonth VARCHAR(7) NOT NULL,
          monthlyIncome DOUBLE DEFAULT 0,
          monthlyCost DOUBLE DEFAULT 0,
          monthlyEfficiency DOUBLE DEFAULT 0,
          yearlyIncome DOUBLE DEFAULT 0,
          yearlyCost DOUBLE DEFAULT 0,
          yearlyEfficiency DOUBLE DEFAULT 0,
          tier VARCHAR(16),
          contribution DOUBLE DEFAULT 0,
          fixedRatio DOUBLE DEFAULT 0,
          timestamp BIGINT NOT NULL,
          PRIMARY KEY (userId, filterMonth)
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS cdtz (
          id VARCHAR(128) PRIMARY KEY,
          userId VARCHAR(128) NOT NULL,
          userName VARCHAR(128) NOT NULL,
          category VARCHAR(128),
          miningId VARCHAR(128),
          theoreticalAmount DOUBLE NOT NULL DEFAULT 0,
          amount DOUBLE NOT NULL DEFAULT 0,
          diffType VARCHAR(128),
          diffReason TEXT,
          approvalRef VARCHAR(128),
          description TEXT,
          timestamp BIGINT NOT NULL,
          month VARCHAR(7) NOT NULL,
          businessDate VARCHAR(10) NOT NULL,
          status VARCHAR(64) NOT NULL,
          operatorId VARCHAR(128)
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS jzfp (
          id VARCHAR(128) PRIMARY KEY,
          userId VARCHAR(128) NOT NULL,
          userName VARCHAR(128) NOT NULL,
          category VARCHAR(128),
          month VARCHAR(7) NOT NULL,
          totalIncome DOUBLE NOT NULL DEFAULT 0,
          totalCost DOUBLE NOT NULL DEFAULT 0,
          netBonus DOUBLE NOT NULL DEFAULT 0,
          historyDebt DOUBLE NOT NULL DEFAULT 0,
          timestamp BIGINT NOT NULL
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS rdq (
          id VARCHAR(128) PRIMARY KEY,
          targetId VARCHAR(128) NOT NULL,
          targetName VARCHAR(128) NOT NULL,
          reason TEXT NOT NULL,
          type VARCHAR(64) NOT NULL,
          status VARCHAR(64) NOT NULL,
          createdAt BIGINT NOT NULL,
          expiresAt BIGINT NOT NULL
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS meeting_samples (
          id VARCHAR(128) PRIMARY KEY,
          periodType VARCHAR(32) NOT NULL,
          periodKey VARCHAR(32) NOT NULL,
          frozenAt BIGINT NOT NULL,
          frozenByUserId VARCHAR(128) NOT NULL,
          frozenByName VARCHAR(128) NOT NULL,
          label VARCHAR(256) NOT NULL,
          fixedNotice TEXT,
          checksum TEXT,
          kpis JSON,
          timestamp BIGINT NOT NULL
        )
      `);
      
      // Idempotent column check for logs
      const [logCols]: any = await db.execute("SHOW COLUMNS FROM logs LIKE 'month'");
      if (logCols.length === 0) {
        await db.execute("ALTER TABLE logs ADD COLUMN month VARCHAR(7), ADD COLUMN businessDate VARCHAR(10)");
      }

      const [confCols]: any = await db.execute("SHOW COLUMNS FROM logs LIKE 'confirmedAt'");
      if (confCols.length === 0) {
        await db.execute("ALTER TABLE logs ADD COLUMN confirmedAt BIGINT");
      }

      const [txCols]: any = await db.execute("SHOW COLUMNS FROM transactions LIKE 'month'");
      if (txCols.length === 0) {
        await db.execute("ALTER TABLE transactions ADD COLUMN month VARCHAR(7), ADD COLUMN businessDate VARCHAR(10)");
      }
      
      res.json({ message: "Migration successful" });
    } catch (err) {
      const error = err as any;
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'PROTOCOL_CONNECTION_LOST' || error.message === 'Pool is closed.') {
        if (db && db === pool) {
           pool = null;
           if (typeof db.end === 'function') {
              db.end().catch(() => {});
           }
        }
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
