import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API = 'http://localhost:5000';

async function runComprehensiveTests() {
  console.log('====================================================');
  console.log('🧪 EXAMINO — PHASE 1 + PHASE 2 COMPREHENSIVE VERIFICATION');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, desc) {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. Image Serving Test
  try {
    const res = await fetch(`${API}/uploads/ict_1794583776798_6jnnwp.png`);
    assert(res.status === 200, `Image serving status is 200 (Got: ${res.status})`);
    assert(res.headers.get('content-type')?.includes('image'), `Content-Type is image (Got: ${res.headers.get('content-type')})`);
    assert(parseInt(res.headers.get('content-length') || '0', 10) > 1000, `Image content length > 1KB (${res.headers.get('content-length')} bytes)`);
  } catch (e) {
    assert(false, `Image serving failed: ${e.message}`);
  }

  // 2. Topic Counts & Difficulty Stats API Test
  try {
    const res = await fetch(`${API}/api/practice/topic-counts?chapter=${encodeURIComponent('অধ্যায় ৬: ডাটাবেজ ম্যানেজমেন্ট সিস্টেম')}&topics=${encodeURIComponent(JSON.stringify(['কী ফিল্ড', 'এসকিউএল (SQL)']))}`);
    const data = await res.json();
    assert(data.success === true, 'Topic Counts API returns success: true');
    assert(data.stats && typeof data.stats.total === 'number', `Stats total present (${data.stats.total})`);
    assert(typeof data.stats.unclassified === 'number', `Unclassified difficulty stat present (${data.stats.unclassified})`);
    assert(data.topicCounts['কী ফিল্ড'] === 7, `কী ফিল্ড real question count is 7 (Got: ${data.topicCounts['কী ফিল্ড']})`);
  } catch (e) {
    assert(false, `Topic counts test failed: ${e.message}`);
  }

  // 3. Question Bank Version Separation API Test
  try {
    const resBn = await fetch(`${API}/api/practice/question-bank?version=bangla&limit=3`);
    const dataBn = await resBn.json();
    assert(dataBn.success !== false && dataBn.questions.length > 0, 'Bangla version query returns valid questions');

    const resEn = await fetch(`${API}/api/practice/question-bank?version=english&limit=3`);
    const dataEn = await resEn.json();
    assert(dataEn.success !== false && dataEn.questions.length > 0, 'English version query returns valid questions');
  } catch (e) {
    assert(false, `Question bank version test failed: ${e.message}`);
  }

  // 4. Database Integrity Test
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const totalQ = await db.collection('questions').countDocuments();
    assert(totalQ === 2752, `Production questions preserved exactly at 2,752 (Found: ${totalQ})`);

    const totalExams = await db.collection('exams').countDocuments();
    assert(totalExams > 0, `Existing exams preserved (Found: ${totalExams})`);

    await mongoose.disconnect();
  } catch (e) {
    assert(false, `Database integrity test failed: ${e.message}`);
  }

  console.log('====================================================');
  console.log(`📊 FINAL TEST SUITE RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================');
}

runComprehensiveTests().catch(console.error);
