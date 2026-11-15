// READ-ONLY production overview. No writes.
import mongoose from "mongoose";
import "../../config/env.js";
await mongoose.connect(process.env.MONGO_URI, { readPreference: "secondaryPreferred" });
const db = mongoose.connection.db;
const stats = await db.stats();
console.log("db", db.databaseName, "dataSizeMB", (stats.dataSize/1048576).toFixed(2), "storageMB", (stats.storageSize/1048576).toFixed(2), "indexMB", (stats.indexSize/1048576).toFixed(2));
for (const c of await db.listCollections().toArray()) {
  const col = db.collection(c.name);
  const n = await col.estimatedDocumentCount();
  const idx = (await col.indexes()).map(i => JSON.stringify(i.key) + (i.unique ? "U" : "")).join(" ");
  console.log(`${c.name}: ${n}  | ${idx}`);
}
const Q = db.collection("questions");
const agg = async (p) => (await Q.aggregate(p).toArray());
console.log("subjects", await agg([{ $group: { _id: "$subject", n: { $sum: 1 } } }, { $sort: { n: -1 } }]));
console.log("difficulty", await agg([{ $group: { _id: "$difficulty", n: { $sum: 1 } } }]));
console.log("version", await agg([{ $group: { _id: "$version", n: { $sum: 1 } } }]));
console.log("org/public", await agg([{ $group: { _id: { org: { $ne: ["$organizationId", null] }, pub: "$isPublic" }, n: { $sum: 1 } } }]));
console.log("has deleted/archived fields", await Q.countDocuments({ $or: [{ isDeleted: { $exists: true } }, { archived: { $exists: true } }, { status: { $exists: true } }] }));
console.log("image types", await agg([{ $project: { t: { $type: "$image" }, has: { $gt: [{ $strLenCP: { $ifNull: [{ $toString: "$image" }, ""] } }, 0] } } }, { $group: { _id: { t: "$t", has: "$has" }, n: { $sum: 1 } } }]));
console.log("other image fields", await Q.countDocuments({ $or: [{ images: { $exists: true } }, { imageUrl: { $exists: true } }] }));
const sample = await Q.findOne({ questionBn: { $ne: "" } });
console.log("sample keys", Object.keys(sample||{}));
const E = db.collection("exams");
console.log("exams", await E.find({}, { projection: { title: 1, examCode: 1, authorId: 1, organizationId: 1, examType: 1, isPublished: 1, createdAt: 1, nq: { $size: { $ifNull: ["$questions", []] } } } }).sort({createdAt:-1}).limit(40).toArray());
const U = db.collection("users");
console.log("users by role", await U.aggregate([{ $group: { _id: { r: "$role", g: "$globalRole" }, n: { $sum: 1 } } }]).toArray());
console.log("submissions", await db.collection("submissions").countDocuments(), "practice", await db.collection("practicesessions").countDocuments());
console.log("batches", await db.collection("batches").find().limit(10).toArray());
console.log("orgs", (await db.collection("organizations").find({}, { projection: { name: 1, slug: 1, ownerId: 1 } }).toArray()));
await mongoose.disconnect();
