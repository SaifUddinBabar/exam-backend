import fs from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";
import config from "../config/env.js";

import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BACKUP_ROOT = path.resolve(__dirname, "../backups");
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10);
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

// Generate or derive a 32-byte backup encryption key
const getBackupKey = () => {
  const secret = process.env.BACKUP_ENCRYPTION_KEY || config.jwt.secret;
  return crypto.createHash("sha256").update(secret).digest();
};

/**
 * Encrypts a Buffer using AES-256-GCM
 */
export const encryptBuffer = (buffer, key) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: [IV (16 bytes)] [AuthTag (16 bytes)] [Ciphertext]
  return Buffer.concat([iv, authTag, encrypted]);
};

/**
 * Decrypts an AES-256-GCM encrypted Buffer
 */
export const decryptBuffer = (encryptedBuffer, key) => {
  const iv = encryptedBuffer.subarray(0, 16);
  const authTag = encryptedBuffer.subarray(16, 32);
  const ciphertext = encryptedBuffer.subarray(32);

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

/**
 * Executes a full encrypted database backup with integrity verification
 */
export const performBackup = async (options = {}) => {
  const backupRoot = options.backupDir || DEFAULT_BACKUP_ROOT;
  const key = getBackupKey();

  if (!fs.existsSync(backupRoot)) {
    fs.mkdirSync(backupRoot, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sessionDir = path.join(backupRoot, `backup_${timestamp}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  if (mongoose.connection.readyState !== 1) {
    if (mongoose.connection.readyState === 2) {
      await new Promise((resolve) => mongoose.connection.once("open", resolve));
    } else {
      await mongoose.connect(config.mongoUri);
    }
  }

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Cannot perform backup: Database not connected.");
  }

  const collections = await db.listCollections().toArray();
  const manifest = {
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    database: db.databaseName,
    encryption: ENCRYPTION_ALGORITHM,
    collections: {},
  };

  console.log(`🔒 Starting Encrypted Backup for [${db.databaseName}] -> ${sessionDir}`);

  for (const col of collections) {
    const colName = col.name;
    const count = await db.collection(colName).countDocuments();
    const docs = await db.collection(colName).find({}).toArray();

    const jsonString = JSON.stringify(docs);
    const sha256 = crypto.createHash("sha256").update(jsonString).digest("hex");

    const rawBuffer = Buffer.from(jsonString, "utf8");
    const encryptedData = encryptBuffer(rawBuffer, key);

    const fileName = `${colName}.enc`;
    const filePath = path.join(sessionDir, fileName);
    fs.writeFileSync(filePath, encryptedData);

    manifest.collections[colName] = {
      count,
      fileName,
      sha256,
      sizeBytes: encryptedData.length,
    };

    console.log(`  ✓ Backed up & encrypted [${colName}]: ${count} docs (${encryptedData.length} bytes)`);
  }

  // Write Manifest (plaintext JSON with integrity hashes)
  const manifestPath = path.join(sessionDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Enforce retention policy
  await pruneOldBackups(backupRoot, RETENTION_DAYS);

  return { sessionDir, manifest };
};

/**
 * Prunes backups older than retention window
 */
export const pruneOldBackups = async (backupRoot, retentionDays) => {
  try {
    const entries = fs.readdirSync(backupRoot, { withFileTypes: true });
    const now = Date.now();
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("backup_")) {
        const dirPath = path.join(backupRoot, entry.name);
        const stats = fs.statSync(dirPath);
        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          console.log(`🧹 Pruning expired backup: ${entry.name} (${Math.round(age / (1000 * 60 * 60 * 24))} days old)`);
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      }
    }
  } catch (err) {
    console.error("Prune Backups Error:", err);
  }
};

/**
 * Verifies and restores a backup into an isolated test target
 */
export const verifyAndRestoreBackup = async (sessionDir, targetDb) => {
  const manifestPath = path.join(sessionDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found in ${sessionDir}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const key = getBackupKey();
  const verificationResults = {
    valid: true,
    collections: {},
  };

  for (const colName of Object.keys(manifest.collections)) {
    const meta = manifest.collections[colName];
    const encPath = path.join(sessionDir, meta.fileName);
    if (!fs.existsSync(encPath)) {
      throw new Error(`Missing backup file: ${encPath}`);
    }

    const encryptedData = fs.readFileSync(encPath);
    const decryptedBuffer = decryptBuffer(encryptedData, key);
    const decryptedJson = decryptedBuffer.toString("utf8");

    // Verify SHA-256 integrity
    const calculatedHash = crypto.createHash("sha256").update(decryptedJson).digest("hex");
    const hashMatch = calculatedHash === meta.sha256;

    if (!hashMatch) {
      verificationResults.valid = false;
    }

    const docs = JSON.parse(decryptedJson);

    // If targetDb provided, restore into targetDb
    if (targetDb && docs.length > 0) {
      const convertedDocs = docs.map((d) => {
        if (d._id) d._id = new mongoose.Types.ObjectId(d._id);
        return d;
      });
      await targetDb.collection(colName).insertMany(convertedDocs);
    }

    verificationResults.collections[colName] = {
      expectedCount: meta.count,
      actualCount: docs.length,
      hashMatch,
    };
  }

  return verificationResults;
};
