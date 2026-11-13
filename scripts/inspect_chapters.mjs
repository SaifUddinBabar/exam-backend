import mongoose from "mongoose";
import config from "../config/env.js";

await mongoose.connect(config.mongoUri);
const chapters = await mongoose.connection.db.collection("questions").aggregate([
  { $group: { _id: "$chapter", count: { $sum: 1 } } }
]).toArray();
console.log("Question counts by chapter:", JSON.stringify(chapters, null, 2));
await mongoose.disconnect();
