// READ-ONLY: copies every production collection into a local EJSON snapshot
// (.local-snapshot/, gitignored) so tests never touch production.
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { EJSON } from "bson";
import "../../config/env.js";
const out = path.resolve(".local-snapshot");
fs.mkdirSync(out, { recursive: true });
await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
for (const c of await db.listCollections().toArray()) {
  const docs = await db.collection(c.name).find({}).toArray();
  fs.writeFileSync(path.join(out, c.name + ".json"), EJSON.stringify(docs, { relaxed: false }));
  console.log(c.name, docs.length);
}
await mongoose.disconnect();
