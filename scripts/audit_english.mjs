import mongoose from "mongoose";

const uri = "mongodb+srv://exam_app:XTXGXLD4BXRp44B6@cluster0.p6esi4j.mongodb.net/exam_db?appName=Cluster0";

async function main() {
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");

  const bnRegex = /[\u0980-\u09FF]/;
  const enOnlySample = await Q.find({}).toArray();
  const pureEnglish = enOnlySample.filter(q => !bnRegex.test(q.question) && !bnRegex.test((q.options || []).join(" ")));

  console.log("Total Pure English Questions:", pureEnglish.length);
  pureEnglish.slice(0, 5).forEach((q, i) => {
    console.log(`\n--- English [${i+1}] (${q.chapter}) ---`);
    console.log(q.question);
    console.log("Options:", q.options);
    console.log("Answer:", q.correctAnswer);
  });

  await mongoose.disconnect();
}
main();
