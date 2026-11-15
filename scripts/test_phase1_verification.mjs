import fetch from "node-fetch";

const API = "http://localhost:5000";

async function runTests() {
  console.log("==================================================");
  console.log("🧪 PHASE 1 VERIFICATION & TEST SUITE");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // TEST 1: Topic Counts API for Chapter 6 (Database)
  try {
    const res = await fetch(`${API}/api/practice/topic-counts?chapter=${encodeURIComponent("অধ্যায় ৬: ডাটাবেজ ম্যানেজমেন্ট সিস্টেম")}&topics=${encodeURIComponent("কী ফিল্ড,এসকিউএল (SQL),ডেটা টাইপ")}`);
    const data = await res.json();
    assert(data.success === true, "Topic Counts API returns success: true");
    assert(typeof data.topicCounts === "object", "Topic Counts object present");
    assert(data.topicCounts["কী ফিল্ড"] > 0, `কী ফিল্ড has real questions count: ${data.topicCounts["কী ফিল্ড"]}`);
    assert(data.topicCounts["এসকিউএল (SQL)"] > 0, `এসকিউএল (SQL) has real questions count: ${data.topicCounts["এসকিউএল (SQL)"]}`);
    assert(data.stats && typeof data.stats.total === "number", `Stats total present: ${data.stats.total}`);
  } catch (err) {
    assert(false, `Test 1 failed: ${err.message}`);
  }

  // TEST 2: Topic Counts API for Chapter 2 (Communication Systems)
  try {
    const ch2Topics = ["ব্যান্ডউইথ (Bandwidth)", "কম্পিউটার নেটওয়ার্ক (PAN, LAN, MAN, WAN)", "ক্লাউড কম্পিউটিং (Cloud Computing)"];
    const res = await fetch(`${API}/api/practice/topic-counts?chapter=${encodeURIComponent("অধ্যায় ২: কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং")}&topics=${encodeURIComponent(JSON.stringify(ch2Topics))}`);
    const data = await res.json();
    assert(data.success === true, "Chapter 2 Topic Counts API returns success: true");
    assert(data.topicCounts["ব্যান্ডউইথ (Bandwidth)"] > 0, `ব্যান্ডউইথ count: ${data.topicCounts["ব্যান্ডউইথ (Bandwidth)"]}`);
    assert(data.topicCounts["কম্পিউটার নেটওয়ার্ক (PAN, LAN, MAN, WAN)"] > 0, `কম্পিউটার নেটওয়ার্ক count: ${data.topicCounts["কম্পিউটার নেটওয়ার্ক (PAN, LAN, MAN, WAN)"]}`);
    assert(data.topicCounts["ক্লাউড কম্পিউটিং (Cloud Computing)"] > 0, `ক্লাউড কম্পিউটিং count: ${data.topicCounts["ক্লাউড কম্পিউটিং (Cloud Computing)"]}`);
  } catch (err) {
    assert(false, `Test 2 failed: ${err.message}`);
  }

  // TEST 3: Language Version Separation (Bangla vs English)
  try {
    const resBn = await fetch(`${API}/api/practice/question-bank?version=bangla&limit=5`);
    const dataBn = await resBn.json();
    assert(dataBn.success !== false && Array.isArray(dataBn.questions), "Bangla version returns question array");

    const resEn = await fetch(`${API}/api/practice/question-bank?version=english&limit=5`);
    const dataEn = await resEn.json();
    assert(dataEn.success !== false && Array.isArray(dataEn.questions), "English version returns question array");
    assert(dataEn.total > 0, `English version total questions in DB: ${dataEn.total}`);
  } catch (err) {
    assert(false, `Test 3 failed: ${err.message}`);
  }

  // TEST 4: Difficulty Filter
  try {
    const resEasy = await fetch(`${API}/api/practice/question-bank?difficulty=easy&limit=5`);
    const dataEasy = await resEasy.json();
    assert(dataEasy.total > 0, `Easy difficulty questions found: ${dataEasy.total}`);

    const resMed = await fetch(`${API}/api/practice/question-bank?difficulty=medium&limit=5`);
    const dataMed = await resMed.json();
    assert(dataMed.total > 0, `Medium difficulty questions found: ${dataMed.total}`);

    const resHard = await fetch(`${API}/api/practice/question-bank?difficulty=hard&limit=5`);
    const dataHard = await resHard.json();
    assert(dataHard.total > 0, `Hard difficulty questions found: ${dataHard.total}`);
  } catch (err) {
    assert(false, `Test 4 failed: ${err.message}`);
  }

  // TEST 5: Chapter & Topic Matching Integration
  try {
    const res = await fetch(`${API}/api/practice/question-bank?chapter=${encodeURIComponent("অধ্যায় ৬: ডাটাবেজ ম্যানেজমেন্ট সিস্টেম")}&topic=${encodeURIComponent("কী ফিল্ড")}`);
    const data = await res.json();
    assert(data.questions.length > 0, `Chapter 6 + কী ফিল্ড returns ${data.questions.length} questions`);
    assert(data.questions.every(q => /কী|কি|key|ফিল্ড|record|ইউনিক/i.test(q.question + " " + q.options.join(" "))), "Questions match semantic key field keywords");
  } catch (err) {
    assert(false, `Test 5 failed: ${err.message}`);
  }

  console.log("==================================================");
  console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
  console.log("==================================================");
  process.exit(failed === 0 ? 0 : 1);
}

runTests();
