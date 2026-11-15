import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  // Bengali Unicode variants:
  // রাসায়নিক vs রাসায়নিক (য় vs য়)
  const regex = /C6H12|Haber|ammonia|NH3|H2SO4|রাস[ায]়নিক|বিক্রি[ায]়া|সালোক|গ্লুকোজ|অর্থনীতি|মুদ্রা|মাইটোকন|পরমাণু|অণু|ইলেকট্রন বিন্যাস/i;

  const questions = await db.collection('questions').find({}).toArray();
  const hits = [];

  for (const q of questions) {
    const fullContent = [
      q.questionText || '',
      ...(Array.isArray(q.options) ? q.options.map(o => (typeof o === 'string' ? o : o.text || '')) : []),
      q.explanation || ''
    ].join(' ');

    if (regex.test(fullContent)) {
      const match = fullContent.match(regex)[0];
      hits.push({
        id: q._id.toString(),
        chapter: q.chapter,
        topic: q.topic,
        subject: q.subject,
        matchedKeyword: match,
        questionText: q.questionText,
        options: q.options,
        explanation: q.explanation
      });
    }
  }

  console.log(`Found ${hits.length} matches:`);
  for (const h of hits) {
    console.log(`\n-----------------------------------------`);
    console.log(`ID: ${h.id}`);
    console.log(`Chapter: ${h.chapter} | Topic: ${h.topic}`);
    console.log(`Matched: ${h.matchedKeyword}`);
    console.log(`Question: ${h.questionText}`);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
