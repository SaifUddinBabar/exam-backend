import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const q = await mongoose.connection.db.collection('questions').findOne({ _id: new mongoose.Types.ObjectId('6af72ce7b3fef9f3900975f9') });
  console.log('KEYS in document:', Object.keys(q));
  console.log('FULL DOC:', JSON.stringify(q, null, 2));
  await mongoose.disconnect();
}
run();
