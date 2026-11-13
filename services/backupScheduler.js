import crypto from "crypto";
import mongoose from "mongoose";
import { performBackup, verifyAndRestoreBackup } from "./backupService.js";

let schedulerTimer = null;
const INSTANCE_ID = `node_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
const LOCK_COLLECTION = "system_locks";
const LOCK_ID = "scheduled_backup_lock";
const LOCK_TTL_MS = 60 * 60 * 1000; // 1 hour lease window

/**
 * Attempts to acquire an atomic distributed lease to prevent multiple server instances
 * from triggering simultaneous duplicate backups.
 */
async function acquireDistributedLock() {
  try {
    const db = mongoose.connection.db;
    if (!db) return true; // fallback if db is not ready

    const now = new Date();
    const expiry = new Date(now.getTime() + LOCK_TTL_MS);

    const result = await db.collection(LOCK_COLLECTION).findOneAndUpdate(
      {
        _id: LOCK_ID,
        $or: [
          { lockedUntil: { $lt: now } },
          { lockedUntil: { $exists: false } },
        ],
      },
      {
        $set: {
          lockedUntil: expiry,
          lockedBy: INSTANCE_ID,
          updatedAt: now,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      }
    );

    return !!result;
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key: another instance acquired the lock first
      return false;
    }
    console.warn("[BackupScheduler] Lock acquisition check warning:", err.message);
    return true; // fail-open for local dev if permissions restricted
  }
}

/**
 * Releases the distributed lock after completion
 */
async function releaseDistributedLock() {
  try {
    const db = mongoose.connection.db;
    if (!db) return;

    await db.collection(LOCK_COLLECTION).deleteOne({
      _id: LOCK_ID,
      lockedBy: INSTANCE_ID,
    });
  } catch (err) {
    console.warn("[BackupScheduler] Error releasing lock:", err.message);
  }
}

export const startBackupScheduler = (intervalMs = 24 * 60 * 60 * 1000) => {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }

  const intervalHours = (intervalMs / (1000 * 60 * 60)).toFixed(1);
  console.log(`[BackupScheduler] 🕒 Automatic Backup Scheduler initialized. Running every ${intervalHours}h on instance [${INSTANCE_ID}].`);

  const runScheduledJob = async () => {
    const timestamp = new Date().toISOString();
    console.log(`\n[BackupScheduler] [${timestamp}] ⚙️ Scheduled backup timer triggered...`);

    // Guard against multiple instances executing simultaneous duplicate backups
    const lockAcquired = await acquireDistributedLock();
    if (!lockAcquired) {
      console.log(`[BackupScheduler] [${timestamp}] ⏭️ Duplicate Protection: Another instance holds the backup lease. Skipping duplicate run.`);
      return;
    }

    try {
      const { sessionDir, manifest } = await performBackup();
      console.log(`[BackupScheduler] [${new Date().toISOString()}] ✅ Scheduled backup written to: ${sessionDir}`);

      // Verify backup integrity immediately
      const verifyReport = await verifyAndRestoreBackup(sessionDir, null);
      if (verifyReport.valid) {
        console.log(`[BackupScheduler] [${new Date().toISOString()}] 🔒 Scheduled backup verified: 100% SHA-256 match across all collections.`);
      } else {
        console.error(`[BackupScheduler] [${new Date().toISOString()}] ❌ Backup verification failed! Checksum mismatch detected.`);
      }
    } catch (err) {
      console.error(`[BackupScheduler] [${new Date().toISOString()}] ❌ CRITICAL: Scheduled backup failed! Alert logged:`, err.message);
    } finally {
      await releaseDistributedLock();
    }
  };

  // Set recurring interval
  schedulerTimer = setInterval(runScheduledJob, intervalMs);

  return {
    instanceId: INSTANCE_ID,
    runNow: runScheduledJob,
    stop: () => {
      if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
        console.log("[BackupScheduler] 🛑 Automatic Backup Scheduler stopped.");
      }
    },
  };
};

export { INSTANCE_ID, acquireDistributedLock, releaseDistributedLock };
