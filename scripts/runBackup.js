import connectDB from "../config/db.js";
import { performBackup, verifyAndRestoreBackup } from "../services/backupService.js";
import mongoose from "mongoose";

async function main() {
  try {
    await connectDB();
    console.log("Database connected. Initiating backup job...");

    const { sessionDir, manifest } = await performBackup();
    console.log(`\nBackup successfully written to: ${sessionDir}`);
    console.log("Summary:", manifest.collections);

    // Run self-verification
    console.log("\nVerifying encrypted backup integrity...");
    const verifyReport = await verifyAndRestoreBackup(sessionDir, null);
    console.log("Verification Report:", verifyReport);

    if (verifyReport.valid) {
      console.log("🎉 Backup Verified: All collection checksums match 100%!");
    } else {
      console.error("❌ BACKUP CORRUPTION DETECTED!");
      process.exit(1);
    }
  } catch (err) {
    console.error("Backup Job Failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
