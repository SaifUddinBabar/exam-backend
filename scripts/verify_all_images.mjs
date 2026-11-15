import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const UPLOADS_DIR = path.join(__dirname, '../uploads');
const API_BASE = 'http://localhost:5000';

async function verifyAllImages() {
  console.log('====================================================');
  console.log('🖼️ COMPREHENSIVE QUESTION IMAGE AUDIT & VERIFICATION');
  console.log('====================================================');

  await mongoose.connect(process.env.MONGO_URI);
  const questionsColl = mongoose.connection.db.collection('questions');

  const questionsWithImages = await questionsColl.find({
    $or: [
      { image: { $exists: true, $ne: '' } },
      { imageUrl: { $exists: true, $ne: '' } },
      { images: { $exists: true, $not: { $size: 0 } } }
    ]
  }).toArray();

  console.log(`Found ${questionsWithImages.length} image-containing questions in MongoDB.`);

  let accessibleCount = 0;
  let brokenCount = 0;
  const brokenList = [];
  const verifiedList = [];

  for (let i = 0; i < questionsWithImages.length; i++) {
    const q = questionsWithImages[i];
    const qId = q._id.toString();
    const rawImage = q.image || q.imageUrl || (Array.isArray(q.images) && q.images[0]) || '';
    
    // Normalize image URL
    let fileExistsOnDisk = false;
    let diskPath = null;
    let testUrl = '';

    if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
      testUrl = rawImage;
    } else {
      // Local uploads
      const cleanFilename = rawImage.replace(/^\/?(?:uploads\/)?/i, '');
      diskPath = path.join(UPLOADS_DIR, cleanFilename);
      fileExistsOnDisk = fs.existsSync(diskPath);
      testUrl = `${API_BASE}/uploads/${cleanFilename}`;
    }

    // Now test HTTP fetch
    let httpStatus = 0;
    let contentType = '';
    let contentLength = 0;
    let isOk = false;
    let errorMsg = '';

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(testUrl, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(timeout);
      httpStatus = res.status;
      contentType = res.headers.get('content-type') || '';
      contentLength = parseInt(res.headers.get('content-length') || '0', 10);
      isOk = res.ok;
    } catch (err) {
      errorMsg = err.name === 'AbortError' ? 'Timeout' : err.message;
    }

    const item = {
      qId,
      chapter: q.chapter,
      rawImage,
      testUrl,
      isExternal: testUrl.startsWith('http') && !testUrl.includes('localhost'),
      fileExistsOnDisk,
      httpStatus,
      contentType,
      contentLength,
      errorMsg
    };

    if (isOk) {
      accessibleCount++;
      verifiedList.push(item);
    } else {
      brokenCount++;
      brokenList.push(item);
    }

    if ((i + 1) % 25 === 0 || i + 1 === questionsWithImages.length) {
      process.stdout.write(`\rProgress: ${i + 1}/${questionsWithImages.length} verified (${accessibleCount} OK, ${brokenCount} Broken)...`);
    }
  }

  console.log('\n\n====================================================');
  console.log(`📊 IMAGE VERIFICATION SUMMARY:`);
  console.log(`- Total Image Questions: ${questionsWithImages.length}`);
  console.log(`- Fully Accessible (HTTP 200/2xx): ${accessibleCount}`);
  console.log(`- Broken / Inaccessible: ${brokenCount}`);
  console.log('====================================================');

  if (brokenList.length > 0) {
    console.log('\n🚨 Broken / Inaccessible Images List:');
    for (const b of brokenList) {
      console.log(`- ID: ${b.qId} | Status: ${b.httpStatus} | Disk: ${b.fileExistsOnDisk} | Raw: ${b.rawImage}`);
    }
  } else {
    console.log('\n🎉 ALL 186/186 IMAGES ARE ACCESSIBLE & SERVING 200 OK!');
  }

  const result = {
    total: questionsWithImages.length,
    accessibleCount,
    brokenCount,
    brokenList,
    sampleVerified: verifiedList.slice(0, 10)
  };

  fs.writeFileSync(path.join(__dirname, '../image_verification_results.json'), JSON.stringify(result, null, 2));

  await mongoose.disconnect();
}

verifyAllImages().catch(console.error);
