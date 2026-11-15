import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const questions = await mongoose.connection.db.collection('questions').find({
    $or: [
      { image: { $exists: true, $ne: '' } },
      { imageUrl: { $exists: true, $ne: '' } },
      { images: { $exists: true, $not: { $size: 0 } } }
    ]
  }).toArray();
  console.log('Total questions with image fields:', questions.length);
  const pathTypes = {};
  const sampleLinks = [];
  for (const q of questions) {
    const img = q.image || q.imageUrl || (q.images && q.images[0]) || '';
    let type = 'other';
    if (img.startsWith('http')) type = 'http';
    else if (img.startsWith('/uploads')) type = 'slash-uploads';
    else if (img.startsWith('uploads/')) type = 'uploads-rel';
    else if (img.startsWith('/')) type = 'slash-root';
    else if (img.startsWith('data:')) type = 'data-uri';
    else type = 'bare-filename';
    pathTypes[type] = (pathTypes[type] || 0) + 1;
    if (sampleLinks.length < 10) sampleLinks.push({ id: q._id, img, type });
  }
  console.log('Path types distribution:', pathTypes);
  console.log('Sample links:', sampleLinks);
  const slashUploads = await mongoose.connection.db.collection('questions').find({ image: { $regex: '^/uploads' } }).limit(5).toArray();
  console.log('Sample slash-uploads:', slashUploads.map(x => ({ id: x._id, img: x.image })));
  await mongoose.disconnect();
}
run();
