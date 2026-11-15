import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const q = await mongoose.connection.db.collection('questions').find({
    _id: { $in: [
      new mongoose.Types.ObjectId('6ab9f910a15f24063b2c9466'),
      new mongoose.Types.ObjectId('6ab9f910a15f24063b2c9468'),
      new mongoose.Types.ObjectId('6ab9f910a15f24063b2c945f')
    ]}
  }).toArray();
  console.log(JSON.stringify(q.map(x => ({ id: x._id, chapter: x.chapter, topic: x.topic, question: x.question, image: x.image })), null, 2));
  await mongoose.disconnect();
}
run();
