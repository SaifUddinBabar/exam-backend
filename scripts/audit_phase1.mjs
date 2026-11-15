import mongoose from "mongoose";

const uri = "mongodb+srv://exam_app:XTXGXLD4BXRp44B6@cluster0.p6esi4j.mongodb.net/exam_db?appName=Cluster0";

async function main() {
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");
  const total = await Q.countDocuments();
  console.log("Total Questions:", total);

  // 1. Difficulty Distribution
  const diffAgg = await Q.aggregate([
    { $group: { _id: "$difficulty", count: { $sum: 1 } } }
  ]).toArray();
  console.log("\n--- Difficulty Distribution ---");
  console.log(diffAgg);

  // 2. Language / Character Set Audit
  const sample = await Q.find({}).limit(50).toArray();
  let bnOnly = 0, enOnly = 0, mixed = 0, other = 0;
  const bnRegex = /[\u0980-\u09FF]/;
  const enRegex = /[a-zA-Z]/;

  const allQs = await Q.find({}, { projection: { question: 1, chapter: 1, topic: 1, difficulty: 1, options: 1 } }).toArray();
  for (const q of allQs) {
    const text = (q.question || "") + " " + (q.options || []).join(" ");
    const hasBn = bnRegex.test(text);
    const hasEn = enRegex.test(text);
    if (hasBn && hasEn) mixed++;
    else if (hasBn) bnOnly++;
    else if (hasEn) enOnly++;
    else other++;
  }
  console.log("\n--- Language Character Audit (Question + Options) ---");
  console.log({ total: allQs.length, bnOnly, enOnly, mixed, other });

  // 3. Check if any language / version field exists in DB
  const versionAgg = await Q.aggregate([
    { $group: { _id: "$version", count: { $sum: 1 } } }
  ]).toArray();
  console.log("\n--- Version Field Aggregation ---");
  console.log(versionAgg);

  // 4. Sample mixed questions
  const mixedSample = allQs.filter(q => bnRegex.test(q.question) && enRegex.test(q.question)).slice(0, 5);
  console.log("\n--- Sample Mixed Questions ---");
  mixedSample.forEach((q, i) => {
    console.log(`[${i+1}] ${q.question.slice(0, 100)}...`);
  });

  await mongoose.disconnect();
}
main();
