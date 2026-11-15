// PHASE 2 DATA-QUALITY AUDIT — READ-ONLY / DRY RUN.
// Reads the production snapshot in .local-snapshot/ (taken read-only) and writes
// reports to ../reports/phase2/. It never connects to or modifies the database,
// except for HTTP checks of externally hosted images.
//
//   node scripts/audit/phase2_audit.mjs [--no-network]
import fs from "fs";
import path from "path";
import { EJSON } from "bson";
import { classifyLanguage } from "../../utils/questionLanguage.js";

const SNAP = path.resolve(".local-snapshot");
const OUT = path.resolve("../reports/phase2");
fs.mkdirSync(OUT, { recursive: true });
const load = (c) => (fs.existsSync(path.join(SNAP, `${c}.json`)) ? EJSON.parse(fs.readFileSync(path.join(SNAP, `${c}.json`), "utf8"), { relaxed: false }) : []);
const questions = load("questions");
const exams = load("exams");
const submissions = load("submissions");
const bookmarks = load("bookmarks");
const practice = load("practicesessions");
const id = (x) => String(x);
const NETWORK = !process.argv.includes("--no-network");
const write = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2));
const preview = (t, n = 140) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);

// ---------------------------------------------------------------- references
const refs = new Map();
const addRef = (qid, kind, ref) => {
  const k = id(qid);
  if (!refs.has(k)) refs.set(k, { exams: [], submissions: 0, bookmarks: 0, practice: 0 });
  const r = refs.get(k);
  if (kind === "exam") r.exams.push(ref);
  else r[kind] += 1;
};
exams.forEach((e) => (e.questions || []).forEach((q) => addRef(q, "exam", e.examCode)));
submissions.forEach((s) => Object.keys(s.answers || {}).forEach((q) => addRef(q, "submissions")));
bookmarks.forEach((b) => addRef(b.questionId, "bookmarks"));
practice.forEach((p) => (p.questions || []).forEach((q) => addRef(q.questionId, "practice")));
const refOf = (qid) => refs.get(id(qid)) || { exams: [], submissions: 0, bookmarks: 0, practice: 0 };

// ---------------------------------------------------------------- 1. language
const langCounts = {};
const langSamples = {};
const langByChapter = {};
for (const q of questions) {
  const c = classifyLanguage(q);
  langCounts[c] = (langCounts[c] || 0) + 1;
  (langSamples[c] ||= []).length < 15 && langSamples[c].push({ id: id(q._id), chapter: q.chapter, question: preview(q.question, 200), options: q.options });
  langByChapter[q.chapter] ||= {};
  langByChapter[q.chapter][c] = (langByChapter[q.chapter][c] || 0) + 1;
}
const mixedList = questions.filter((q) => classifyLanguage(q) === "mixed").map((q) => ({ id: id(q._id), chapter: q.chapter, question: preview(q.question, 300), options: q.options }));
write("language_audit.json", { counts: langCounts, byChapter: langByChapter, samples: langSamples, mixedOrMalformed: mixedList });

// ---------------------------------------------------------------- 2. difficulty
const diff = {};
for (const q of questions) {
  const edited = String(q.createdAt) !== String(q.updatedAt);
  const k = `${q.difficulty || "missing"}`;
  diff[k] ||= { total: 0, neverEdited: 0 };
  diff[k].total += 1;
  if (!edited) diff[k].neverEdited += 1;
}
write("difficulty_audit.json", {
  distribution: diff,
  note:
    "'medium' is the schema default. Questions still marked 'medium' that were never edited after import most likely never had a reviewed difficulty. Proposal (needs approval): mark them 'unclassified' until a teacher reviews them. No automatic re-labelling by length.",
  proposedToUnclassified: questions.filter((q) => q.difficulty === "medium" && String(q.createdAt) === String(q.updatedAt)).map((q) => id(q._id)),
});

// ---------------------------------------------------------------- 3. cross-subject
// Bengali has no \b, so short Bengali terms are wrapped in "not inside another Bengali word".
const bw = (t) => `(?<![\\u0980-\\u09FF])${t}(?![\\u0980-\\u09FF])`;
const SUBJECT_MARKERS = [
  {
    subject: "Chemistry",
    chapter: "Chemistry (to be chosen by teacher)",
    rx: new RegExp(
      String.raw`\b(mol dm|titration|enthalpy|exothermic|endothermic|ammonia|haber|redox|covalent|alkali|alkane|alkene|electrolysis|isotope|periodic table|manganate|sulfite|sulphate|precipitate)\b|বিক্রিয়ার বেগ|বিক্রিয়াটির|বিয়োজন ধ্রুবক|ঘনমাত্রা|অর্ধায়ু|দ্রবণে|জারণ সংখ্যা|পর্যায় সারণি|রাসায়নিক বন্ধন|তড়িৎ বিশ্লেষণ|এসিডের|` +
        [bw("অম্ল"), bw("ক্ষারের"), bw("ক্ষারক"), bw("মৃদু ক্ষার")].join("|"),
      "i"
    ),
  },
  { subject: "Biology", chapter: "Biology (to be chosen by teacher)", rx: /\b(aerobic|anaerobic|respiration|photosynthesis|mitochondri|chlorophyll|glucose|yeast|osmosis|chromosome)\b|সালোকসংশ্লেষণ|শ্বসন|ক্লোরোফিল|মাইটোকন্ড্রিয়া/i },
  {
    subject: "Physics",
    chapter: "Physics (to be chosen by teacher)",
    rx: /\b(focal length|convex lens|concave lens|velocity|acceleration|retardation|friction|joule|coulomb|gravitational|momentum)\b|মহাকর্ষীয় ধ্রুবক|অভিকর্ষজ ত্বরণ|কুলম্বের সূত্র|ফোকাস দূরত্ব|উত্তল লেন্স|অবতল লেন্স|প্রতিসরণাঙ্ক|সংকট কোণ|শব্দের বেগ|স্প্রিং ধ্রুবক|ভরশূন্য|বৃত্তীয় গতি|তড়িৎ চৌম্বক তরঙ্গ|গ্যাস অনুর|ভরবেগ/i,
  },
  { subject: "Mathematics / Statistics", chapter: "Mathematics (to be chosen by teacher)", rx: /দৈব চলক|সম্ভাবনা ঘনত্ব|aggregate marks|\bpercent(age)? of the\b/i },
  { subject: "Economics / Finance", chapter: "Economics (to be chosen by teacher)", rx: /বাণিজ্যিক ব্যাংক|কেন্দ্রীয় ব্যাংক|মুদ্রাস্ফীতি|চাহিদা ও জোগান|সুদের হার|\binflation\b|quantity demanded|\bdemand and supply\b/i },
];
// ICT vocabulary — a question that also contains these is very likely genuinely ICT.
const ICT_RX = /কম্পিউটার|প্রোগ্রাম|নেটওয়ার্ক|ডেটা|ডাটা|ইন্টারনেট|বাইনারি|লজিক|গেইট|html|সফটওয়্যার|হার্ডওয়্যার|ডিজিটাল|ক্রায়োসার্জারি|বায়োমেট্রিক|ন্যানো|জেনেটিক|রোবট|ভার্চুয়াল|ফাইবার|ওয়্যারলেস|মোবাইল|\b(computer|program|network|data|internet|binary|logic|gate|software|digital|cryo|biometric|nano|genetic|robot|virtual|fiber|wireless)\b/i;
const PREVIOUS_CROSS_10 = [
  "6ab9f910a15f24063b2c9537",
  "6ab9f910a15f24063b2c95de",
  "6af72ce7b3fef9f3900975f9",
  "6af733a111ee24af7b2db449",
  "6af733b311ee24af7b2db51b",
  "6af733b511ee24af7b2db545",
  "6af733b611ee24af7b2db56c",
  "6af733de11ee24af7b2db903",
  "6af733e411ee24af7b2db9a2",
  "6af73d35889b8ce675c04ae4",
];
let previous7 = [];
try {
  previous7 = JSON.parse(fs.readFileSync("data_quality_proposals.json", "utf8")).crossSubjectSummary.items.map((x) => x.qId);
} catch {}

function crossSubject(q) {
  const textQO = `${q.question || ""} ${(q.options || []).join(" ")}`;
  const hits = SUBJECT_MARKERS.filter((m) => m.rx.test(textQO)).map((m) => ({ ...m, terms: [...new Set((textQO.match(new RegExp(m.rx.source, "gi")) || []).map((t) => t.toLowerCase()))] }));
  if (!hits.length) return null;
  const ict = ICT_RX.test(textQO);
  const best = hits.sort((a, b) => b.terms.length - a.terms.length)[0];
  let confidence = "Low";
  if (!ict && best.terms.length >= 2) confidence = "High";
  else if (!ict) confidence = "Medium";
  return { suggestedSubject: best.subject, suggestedChapter: best.chapter, terms: best.terms, alsoHasIctTerms: ict, confidence };
}

const byId = new Map(questions.map((q) => [id(q._id), q]));
const crossAll = [];
for (const q of questions) {
  const r = crossSubject(q);
  if (r && r.confidence !== "Low") {
    crossAll.push({
      id: id(q._id),
      question: preview(q.question, 300),
      currentSubject: q.subject,
      currentChapter: q.chapter,
      currentTopic: q.topic,
      suggestedSubject: r.suggestedSubject,
      suggestedChapter: r.suggestedChapter,
      reason: `Contains ${r.suggestedSubject} terms: ${r.terms.join(", ")}${r.alsoHasIctTerms ? " (but also ICT terms)" : ""}`,
      confidence: r.confidence,
      references: refOf(q._id),
      status: r.confidence === "High" ? "propose-move (needs approval)" : "pending review",
    });
  }
}
const previousStatus = PREVIOUS_CROSS_10.map((qid) => {
  const q = byId.get(qid);
  const r = q ? crossSubject(q) : null;
  return {
    id: qid,
    exists: Boolean(q),
    inLatestPreviousList7: previous7.includes(qid),
    question: q ? preview(q.question, 220) : null,
    currentChapter: q?.chapter,
    myFinding: r ? `${r.suggestedSubject} (${r.confidence}) — terms: ${r.terms.join(", ")}${r.alsoHasIctTerms ? "; also contains ICT terms" : ""}` : "No non-ICT subject markers in question/options — genuinely ICT (false positive)",
    status: !q ? "missing from DB" : r && r.confidence === "High" ? "confirmed cross-subject → propose move (needs approval)" : r ? "uncertain → pending review" : "not a cross-subject error",
  };
});
write("cross_subject_audit.json", {
  explanation:
    "The first audit (10) matched keywords anywhere including explanations, so ICT questions about cryosurgery/biometrics whose explanations mention physics/biology were flagged. The second audit (7) tightened the rules. This audit only reads question text and options, and down-grades matches that also contain ICT vocabulary.",
  previouslyFlagged10: previousStatus,
  currentFindings: crossAll,
});

// ---------------------------------------------------------------- 4. duplicates
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const norm = (s) =>
  String(s || "")
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .toLowerCase()
    .replace(/[\s ]+/g, " ")
    .replace(/[।.,;:!?'"“”‘’()\[\]{}\-–—_/\\|*`~]+/g, "")
    .replace(/\s+/g, "")
    .trim();
const exactKey = (q) => JSON.stringify([q.question, q.options, q.correctAnswer]);
const normQ = (q) => norm(q.question);
const normOpts = (q) => (q.options || []).map(norm).sort().join("|");
const groups = new Map();
for (const q of questions) {
  const k = normQ(q);
  if (k.length < 8) continue;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(q);
}
const dupGroups = [];
for (const [, list] of groups) {
  if (list.length < 2) continue;
  // Original candidate: most referenced, then oldest.
  const sorted = [...list].sort((a, b) => {
    const ra = refOf(a._id), rb = refOf(b._id);
    const sa = ra.exams.length * 100 + ra.submissions + ra.bookmarks + ra.practice;
    const sb = rb.exams.length * 100 + rb.submissions + rb.bookmarks + rb.practice;
    return sb - sa || new Date(a.createdAt) - new Date(b.createdAt);
  });
  const orig = sorted[0];
  const items = sorted.slice(1).map((d) => {
    let kind;
    if (exactKey(d) === exactKey(orig) && (d.image || "") === (orig.image || "")) kind = "exact";
    else if (normOpts(d) !== normOpts(orig)) kind = "same-question-different-options";
    else if ((d.image || "") !== (orig.image || "")) kind = "same-question-different-image";
    else if (norm(d.correctAnswer) !== norm(orig.correctAnswer)) kind = "same-question-different-answer";
    else kind = "formatting-only";
    const sameChapter = d.chapter === orig.chapter;
    const recommended =
      kind === "exact" || kind === "formatting-only"
        ? sameChapter
          ? "hide duplicate (reversible flag), keep original; repoint references after approval"
          : "same text in two chapters — teacher decides which chapter is correct"
        : kind === "same-question-different-image"
          ? "review images — may be a corrected/uncorrected pair"
          : "keep both — meaningfully different (review)";
    return { id: id(d._id), kind, chapter: d.chapter, topic: d.topic, createdAt: d.createdAt, references: refOf(d._id), recommendedAction: recommended };
  });
  dupGroups.push({
    originalCandidate: { id: id(orig._id), chapter: orig.chapter, topic: orig.topic, createdAt: orig.createdAt, references: refOf(orig._id) },
    question: preview(orig.question, 200),
    subject: orig.subject,
    duplicates: items,
  });
}
// Near-duplicates: same chapter, token Jaccard ≥ 0.9 but different normalised text.
const tokens = (s) => new Set(String(s || "").toLowerCase().replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d))).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1));
const similar = [];
const byChapter = new Map();
questions.forEach((q) => {
  if (!byChapter.has(q.chapter)) byChapter.set(q.chapter, []);
  byChapter.get(q.chapter).push({ q, t: tokens(`${q.question} ${(q.options || []).join(" ")}`) });
});
for (const [, list] of byChapter) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (normQ(a.q) === normQ(b.q)) continue;
      const small = a.t.size < b.t.size ? a.t : b.t;
      const big = small === a.t ? b.t : a.t;
      if (small.size < 4 || big.size / small.size > 1.25) continue;
      let inter = 0;
      for (const t of small) if (big.has(t)) inter++;
      const jac = inter / (a.t.size + b.t.size - inter);
      if (jac >= 0.9) similar.push({ a: id(a.q._id), b: id(b.q._id), similarity: +jac.toFixed(3), chapter: a.q.chapter, aText: preview(a.q.question, 160), bText: preview(b.q.question, 160), kind: "similar-but-different", recommendedAction: "review only — do not merge automatically" });
    }
  }
}
const kindCounts = {};
dupGroups.forEach((g) => g.duplicates.forEach((d) => (kindCounts[d.kind] = (kindCounts[d.kind] || 0) + 1)));
write("duplicates_audit.json", {
  explanation:
    "Previous runs reported 306 duplicate records (first audit) and later 324 groups / 332 records. Groups here are built from the normalised question text only (whitespace, punctuation, zero-width characters and Bengali/ASCII digits ignored), then each extra record is classified against the original candidate by comparing options, answer and image. Differences between runs come from the normalisation used: the 306 run compared raw text, the 324/332 run normalised whitespace.",
  totals: { groups: dupGroups.length, duplicateRecords: dupGroups.reduce((a, g) => a + g.duplicates.length, 0), byKind: kindCounts, similarButDifferentPairs: similar.length },
  groups: dupGroups,
  similarButDifferent: similar,
});

// ---------------------------------------------------------------- 5. topics
const GENERIC_TOPICS = new Set([
  "",
  "বিশ্ব ও বাংলাদেশ প্রেক্ষিত",
  "কমিউনিকেশন ও নেটওয়ার্কিং",
  "ডিজিটাল ডিভাইস ও লজিক গেইট",
  "সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস",
  "ওয়েব ডিজাইন ও HTML",
  "সি প্রোগ্রামিং (C Language)",
  "ডাটাবেজ ম্যানেজমেন্ট (DBMS)",
  "তথ্য ও যোগাযোগ প্রযুক্তি",
  "উদ্দীপক ভিত্তিক প্রশ্ন",
]);
const SUSPECT_TOPICS = new Set(["লজিক গেইট (Logic Gates)"]); // 870 questions — whole chapter-3 import labelled as one topic

const T = (name, rx) => ({ name, rx });
const SYLLABUS = {
  1: [
    T("বিশ্বগ্রাম (Global Village)", /বিশ্বগ্রাম|global village|ম্যাকলুহান|ভিডিও কনফারেন্স|টেলিমেডিসিন|ই-লার্নিং|আউটসোর্সিং|ই-গভর্ন্যান্স/i),
    T("ভার্চুয়াল রিয়েলিটি (Virtual Reality)", /ভার্চুয়াল|ভার্চুয়াল|virtual reality|\bvr\b|হেড মাউন্টেড|ফ্লাইট সিমুলেটর/i),
    T("কৃত্রিম বুদ্ধিমত্তা (Artificial Intelligence) ও রোবোটিক্স (Robotics)", /কৃত্রিম বুদ্ধিমত্তা|artificial intelligence|রোবট|রোবোটিক্স|robot|এক্সপার্ট সিস্টেম|expert system|\bai\b/i),
    T("ক্রায়োসার্জারি (Cryosurgery)", /ক্রায়ো|ক্রায়ো|cryo|তরল নাইট্রোজেন|আর্গন গ্যাস|অতিশীতল/i),
    T("বায়োমেট্রিক্স (Biometrics)", /বায়োমেট্রিক|বায়োমেট্রিক|biometric|ফিঙ্গারপ্রিন্ট|আঙুলের ছাপ|রেটিনা|আইরিস|ফেস রিকগনিশন|হাতের রেখা|কণ্ঠস্বর|স্বাক্ষর/i),
    T("বায়োইনফরমেটিক্স (Bioinformatics)", /বায়োইনফরমেটিক্স|বায়োইনফরমেটিক্স|bioinformatics|ডিএনএ সিকোয়েন্স|প্রোটিন|জিনোম/i),
    T("জেনেটিক ইঞ্জিনিয়ারিং (Genetic Engineering)", /জেনেটিক ইঞ্জিনিয়ারিং|genetic engineering|জিএমও|\bgmo\b|রিকম্বিনেন্ট|প্লাজমিড|ক্লোন/i),
    T("ন্যানোটেকনোলজি (Nanotechnology)", /ন্যানো|nano/i),
    T("ই-কমার্স ও ই-বিজনেস", /ই-কমার্স|ই-বিজনেস|e-commerce|অনলাইন শপিং|মোবাইল ব্যাংকিং/i),
    T("ICT-এর নৈতিকতা, সামাজিক ও অর্থনৈতিক প্রভাব", /নৈতিকতা|হ্যাকিং|হ্যাকার|পাইরেসি|প্লেজিয়ারিজম|স্প্যাম|ফিশিং|কপিরাইট|সাইবার ক্রাইম|ethics|hacking|piracy/i),
  ],
  2: [
    T("ব্যান্ডউইথ (Bandwidth)", /ব্যান্ডউইথ|bandwidth|bps|ন্যারো ব্যান্ড|ভয়েস ব্যান্ড|ব্রডব্যান্ড|ডেটা ট্রান্সমিশন স্পিড/i),
    T("ডেটা ট্রান্সমিশন পদ্ধতি", /সিনক্রোনাস|অ্যাসিনক্রোনাস|অ্যাসিনক্রোনাস|আইসোক্রোনাস|synchronous|asynchronous|isochronous|স্টার্ট বিট|স্টপ বিট/i),
    T("ডেটা ট্রান্সমিশন মোড (Data Transmission Mode: Serial/Parallel, Simplex/Half Duplex/Full Duplex)", /সিমপ্লেক্স|হাফ.?ডুপ্লেক্স|ফুল.?ডুপ্লেক্স|simplex|duplex|ইউনিকাস্ট|ব্রডকাস্ট|মাল্টিকাস্ট|unicast|broadcast|multicast|ওয়াকিটকি|walkie/i),
    T("কমিউনিকেশন মিডিয়া: তারযুক্ত (Wired Media – Twisted Pair, Coaxial, Fiber Optic)", /টুইস্টেড|twisted|কো-?এক্সিয়াল|কোঅ্যাক্সিয়াল|coaxial|ফাইবার|fiber|fibre|অপটিক্যাল|কোর|ক্ল্যাডিং|জ্যাকেট|utp|stp/i),
    T("কমিউনিকেশন মিডিয়া: তারবিহীন (Wireless Media – Radio Wave, Microwave, Satellite, Bluetooth, Infrared, Wi-Fi, WiMAX)", /রেডিও ওয়েভ|মাইক্রোওয়েভ|স্যাটেলাইট|ব্লুটুথ|ইনফ্রারেড|ওয়াই-?ফাই|ওয়াইম্যাক্স|ওয়াইম্যাক্স|wi-?fi|wimax|bluetooth|infrared|microwave|satellite|পিকোনেট|piconet|802\.1[16]/i),
    T("মোবাইল ফোনের বিভিন্ন প্রজন্ম (Generations of Mobile Phone: 1G–5G)", /প্রজন্ম|[1-5১-৫]\s?g\b|জিএসএম|সিডিএমএ|gsm|cdma|lte|amps|রোমিং/i),
    T("কম্পিউটার নেটওয়ার্ক (Computer Network) ও নেটওয়ার্কের প্রকারভেদ (PAN, LAN, MAN, WAN)", /\b(pan|lan|man|wan)\b|পিয়ার টু পিয়ার|peer.to.peer|ক্লায়েন্ট.?সার্ভার|client.?server|ইন্ট্রানেট|এক্সট্রানেট/i),
    T("নেটওয়ার্ক টপোলজি (Network Topology: Bus, Ring, Star, Tree, Mesh, Hybrid)", /টপোলজি|topology|বাস টপোলজি|রিং|স্টার|ট্রি|মেশ|হাইব্রিড|ব্যাকবোন/i),
    T("নেটওয়ার্কিং ডিভাইস (Networking Devices: Modem, Hub, Switch, Router, Gateway, Repeater)", /মডেম|modem|হাব|\bhub\b|সুইচ|switch|রাউটার|router|গেটওয়ে|gateway|রিপিটার|repeater|ব্রিজ|\bbridge\b|নিক|\bnic\b/i),
    T("ক্লাউড কম্পিউটিং (Cloud Computing)", /ক্লাউড|cloud|saas|paas|iaas/i),
    T("ডেটা কমিউনিকেশনের উপাদান (Data Communication Components: Source, Transmitter, Media, Receiver, Destination)", /উৎস|প্রেরক|প্রাপক|ট্রান্সমিটার|রিসিভার|transmitter|receiver|কমিউনিকেশন সিস্টেমের উপাদান/i),
  ],
  3: [
    T("সংখ্যা পদ্ধতি ও রূপান্তর (Number System & Conversion)", /সংখ্যা পদ্ধতি|বাইনারি|অক্টাল|হেক্সাডেসিমেল|দশমিক|ডেসিমেল|ভিত্তি|বেজ|binary|octal|hexadecimal|decimal|\(\s*[0-9a-f.]+\s*\)\s*[₂₈₁₆0-9]{1,2}/i),
    T("চিহ্নযুক্ত সংখ্যা ও পরিপূরক (Signed Number & Complement)", /পরিপূরক|complement|চিহ্নযুক্ত|সাইন বিট|sign bit|signed/i),
    T("কোড (BCD, ASCII, Unicode, EBCDIC)", /\bbcd\b|অ্যাসকি|ascii|ইউনিকোড|unicode|ebcdic|গ্রে কোড|প্যারিটি|alphanumeric code/i),
    T("বুলিয়ান অ্যালজেবরা (Boolean Algebra)", /বুলিয়ান|boolean|ডি-?মরগান|de.?morgan|উপপাদ্য|theorem|সত্যক সারণি|truth table|কার্নো|k-?map/i),
    T("লজিক গেইট (Logic Gates)", /গেইট|গেট|gate|\band\b|\bor\b|\bnot\b|nand|nor|xor|x-?nor|সার্বজনীন|universal/i),
    T("এনকোডার ও ডিকোডার (Encoder & Decoder)", /এনকোডার|ডিকোডার|encoder|decoder|মাল্টিপ্লেক্সার|multiplexer/i),
    T("অ্যাডার (Half/Full Adder)", /অ্যাডার|অ্যাডার|adder|সাম|ক্যারি|carry/i),
    T("ফ্লিপ-ফ্লপ, রেজিস্টার ও কাউন্টার", /ফ্লিপ.?ফ্লপ|flip.?flop|রেজিস্টার|register|কাউন্টার|counter|শিফট/i),
  ],
  4: [
    T("ওয়েবসাইটের কাঠামো (Website Structure)", /কাঠামো|structure|লিনিয়ার|linear|হায়ারার্কিক্যাল|hierarchical|ওয়েব লিংকড|ট্রি কাঠামো/i),
    T("ডোমেইন, হোস্টিং ও ওয়েব পাবলিশিং", /ডোমেইন|domain|হোস্টিং|hosting|পাবলিশ|publish|\burl\b|ip অ্যাড্রেস|\bdns\b|\bftp\b|http/i),
    T("HTML ট্যাগ ও টেক্সট ফরম্যাটিং", /<\s*(b|i|u|p|br|h[1-6]|font|sup|sub|strong|em|hr)\b|ফরম্যাটিং|formatting|ট্যাগ|tag|এলিমেন্ট|element|অ্যাট্রিবিউট|attribute|head|body|title/i),
    T("হাইপারলিংক (Hyperlink)", /হাইপারলিংক|hyperlink|<\s*a\b|href|anchor|লিংক/i),
    T("ছবি যুক্তকরণ (Image)", /<\s*img|src=|\balt\b|ইমেজ|image|ছবি/i),
    T("টেবিল ও লিস্ট (Table & List)", /<\s*(table|tr|td|th|ol|ul|li)\b|টেবিল|table|rowspan|colspan|তালিকা|list/i),
  ],
  5: [
    T("প্রোগ্রামিং ভাষা ও অনুবাদক (Language & Translator)", /প্রজন্ম|মেশিন ভাষা|অ্যাসেম্বলি|উচ্চস্তরের|নিম্নস্তরের|কম্পাইলার|ইন্টারপ্রেটার|অ্যাসেম্বলার|অনুবাদক|compiler|interpreter|assembler|machine language|high.?level|low.?level/i),
    T("অ্যালগরিদম ও ফ্লোচার্ট (Algorithm & Flowchart)", /অ্যালগরিদম|algorithm|ফ্লোচার্ট|flowchart|সুডোকোড|pseudo/i),
    T("ডেটা টাইপ, চলক ও ধ্রুবক", /ডেটা টাইপ|data type|\b(int|float|char|double|long)\b|চলক|ধ্রুবক|variable|constant|কিওয়ার্ড|keyword|আইডেন্টিফায়ার|identifier/i),
    T("অপারেটর ও এক্সপ্রেশন (Operators)", /অপারেটর|operator|[%]|&&|\|\||\+\+|--|মডুলাস|modulus/i),
    T("কন্ডিশনাল স্টেটমেন্ট (if, switch)", /\bif\b|\belse\b|\bswitch\b|\bcase\b|শর্ত|কন্ডিশনাল|conditional/i),
    T("লুপ (for, while, do-while)", /\bfor\s*\(|\bwhile\b|\bdo\b|লুপ|loop|পুনরাবৃত্তি/i),
    T("অ্যারে ও স্ট্রিং (Array & String)", /অ্যারে|array|\[\s*\d+\s*\]|স্ট্রিং|string/i),
    T("ফাংশন ও ইনপুট-আউটপুট (Function, printf/scanf)", /ফাংশন|function|printf|scanf|main\s*\(|হেডার ফাইল|header file|#include/i),
  ],
  6: [
    T("কী ফিল্ড (Primary/Foreign Key)", /কী ফিল্ড|কি ফিল্ড|primary key|foreign key|প্রাইমারি|ফরেন|composite key|কম্পোজিট/i),
    T("এসকিউএল (SQL)", /\bsql\b|এসকিউএল|select|insert|update|delete|create table|query|কুয়েরি/i),
    T("ডেটাবেজ রিলেশন (Relationship)", /রিলেশন|relation|এক-এক|এক-বহু|বহু-বহু|one.to.one|one.to.many|many.to.many/i),
    T("সর্টিং ও ইনডেক্সিং", /সর্টিং|ইনডেক্সিং|sorting|indexing|ইনডেক্স/i),
    T("ডেটা নিরাপত্তা ও এনক্রিপশন", /নিরাপত্তা|সিকিউরিটি|security|এনক্রিপশন|encryption|ডিক্রিপশন|সাইফার|cipher/i),
    T("ডেটাবেজ ও DBMS ধারণা", /ডেটাবেজ|ডাটাবেজ|database|dbms|rdbms|রেকর্ড|ফিল্ড|টেবিল|record|field/i),
  ],
};
const chapterNo = (c) => {
  const m = String(c || "").match(/অধ্যায়\s*([১-৬1-6])/);
  if (m) return Number(String(BN_DIGITS.indexOf(m[1]) >= 0 ? BN_DIGITS.indexOf(m[1]) : m[1]));
  if (/Introduction to ICT/i.test(c)) return 1;
  if (/Communication/i.test(c)) return 2;
  if (/Number System/i.test(c)) return 3;
  if (/Web/i.test(c)) return 4;
  if (/Programming/i.test(c)) return 5;
  if (/Database/i.test(c)) return 6;
  return null;
};
function proposeTopic(q) {
  const ch = chapterNo(q.chapter);
  const text = `${q.question || ""} ${(q.options || []).join(" ")}`;
  const pools = ch ? [[ch, SYLLABUS[ch]]] : Object.entries(SYLLABUS).map(([k, v]) => [Number(k), v]);
  const scored = [];
  for (const [c, topics] of pools) {
    for (const t of topics) {
      const m = text.match(new RegExp(t.rx.source, "gi"));
      if (m) scored.push({ chapterNo: c, topic: t.name, hits: new Set(m.map((x) => x.toLowerCase())).size, terms: [...new Set(m.map((x) => x.toLowerCase()))].slice(0, 6) });
    }
  }
  scored.sort((a, b) => b.hits - a.hits);
  if (!scored.length) return { confidence: "None", reason: "No syllabus keywords in question/options" };
  const [best, second] = scored;
  let confidence = "Low";
  if (!second && best.hits >= 2) confidence = "High";
  else if (!second || best.hits >= second.hits + 2) confidence = "Medium";
  // Generic catch-words alone ("and", "or", "tag") never give high confidence.
  if (best.terms.every((t) => ["and", "or", "not", "tag", "ট্যাগ", "image", "ছবি", "লিংক"].includes(t))) confidence = "Low";
  return {
    suggestedTopic: best.topic,
    suggestedChapterNo: best.chapterNo,
    confidence,
    reason: `Matched ${best.terms.join(", ")}${second ? `; also matched "${second.topic}" (${second.terms.join(", ")})` : ""}`,
  };
}
let previousTopicProposals = new Map();
try {
  const p = JSON.parse(fs.readFileSync("data_quality_proposals.json", "utf8")).missingTopicSummary;
  (p.proposals || p.sampleProposals || []).forEach((x) => previousTopicProposals.set(x.qId, x.suggestedTopic));
} catch {}
const topicRows = [];
for (const q of questions) {
  const t = (q.topic || "").trim();
  const generic = GENERIC_TOPICS.has(t);
  const suspect = SUSPECT_TOPICS.has(t);
  if (!generic && !suspect) continue;
  const p = proposeTopic(q);
  if (suspect && p.suggestedTopic === "লজিক গেইট (Logic Gates)") continue; // label agrees
  topicRows.push({
    id: id(q._id),
    question: preview(q.question, 160),
    currentSubject: q.subject,
    currentChapter: q.chapter,
    currentTopic: t || "(empty)",
    issue: generic ? "generic-or-missing" : "suspected-mislabel",
    suggestedTopic: p.suggestedTopic || null,
    confidence: p.confidence,
    reason: p.reason,
    previousSuggestion: previousTopicProposals.get(id(q._id)) || null,
    status: p.confidence === "High" ? "propose (needs approval)" : "pending review",
  });
}
const tc = {};
topicRows.forEach((r) => {
  const k = `${r.issue}:${r.confidence}`;
  tc[k] = (tc[k] || 0) + 1;
});
const agree = topicRows.filter((r) => r.previousSuggestion && r.suggestedTopic && r.confidence === "High");
write("topics_audit.json", {
  explanation:
    "The earlier figure of 779 generic/missing topics counted only 'কমিউনিকেশন ও নেটওয়ার্কিং' (554) and empty topics (225). This audit also counts the other chapter-wide catch-all labels, and separately flags the 870 chapter-3 questions all labelled 'লজিক গেইট (Logic Gates)' (many are about number systems). Suggestions use syllabus keywords in the question and options only; 'High' means exactly one topic matched with at least two distinct terms.",
  genericLabelCounts: Object.fromEntries([...GENERIC_TOPICS].map((g) => [g || "(empty)", questions.filter((q) => (q.topic || "").trim() === g).length])),
  counts: tc,
  totalRows: topicRows.length,
  previousProposalsAvailableInFile: previousTopicProposals.size,
  previousProposalsWhereThisAuditAlsoHigh: agree.length,
  rows: topicRows,
});

// ---------------------------------------------------------------- 6. images
const uploadsDir = path.resolve("uploads");
const uploadFiles = new Set(fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : []);
const imgRows = [];
const imgUse = new Map();
for (const q of questions.filter((x) => (x.image || "").trim())) {
  const raw = q.image.trim();
  const row = { id: id(q._id), chapter: q.chapter, raw, kind: "", ok: null, detail: "" };
  if (/^https?:\/\//i.test(raw)) row.kind = "external";
  else {
    row.kind = "local";
    const file = path.basename(raw.replace(/^\/?uploads\//i, ""));
    row.doubleUploadsPrefix = /uploads\/.*uploads\//i.test(raw);
    row.ok = uploadFiles.has(file);
    row.detail = row.ok ? `uploads/${file} exists (${fs.statSync(path.join(uploadsDir, file)).size} bytes)` : `uploads/${file} missing`;
  }
  imgUse.set(raw, [...(imgUse.get(raw) || []), id(q._id)]);
  imgRows.push(row);
}
if (NETWORK) {
  for (const row of imgRows.filter((r) => r.kind === "external")) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(row.raw, { method: "GET", signal: ctrl.signal });
      clearTimeout(t);
      row.ok = r.ok && /^image\//.test(r.headers.get("content-type") || "");
      row.detail = `HTTP ${r.status} ${r.headers.get("content-type") || ""}`;
    } catch (e) {
      row.ok = false;
      row.detail = `request failed: ${e.name}`;
    }
  }
}
const sharedImages = [...imgUse.entries()].filter(([, ids]) => ids.length > 1).map(([img, ids]) => ({ image: img, questions: ids.map((x) => ({ id: x, question: preview(byId.get(x)?.question, 100) })) }));
const referencedFiles = new Set(imgRows.filter((r) => r.kind === "local").map((r) => path.basename(r.raw)));
write("images_audit.json", {
  totals: {
    questionsWithImage: imgRows.length,
    local: imgRows.filter((r) => r.kind === "local").length,
    external: imgRows.filter((r) => r.kind === "external").length,
    ok: imgRows.filter((r) => r.ok === true).length,
    broken: imgRows.filter((r) => r.ok === false).length,
    unchecked: imgRows.filter((r) => r.ok === null).length,
    doubleUploadsPrefix: imgRows.filter((r) => r.doubleUploadsPrefix).length,
    filesInUploads: uploadFiles.size,
    unreferencedUploadFiles: [...uploadFiles].filter((f) => !referencedFiles.has(f)).length,
  },
  broken: imgRows.filter((r) => r.ok === false).map((r) => ({ ...r, question: preview(byId.get(r.id)?.question, 200) })),
  sharedImages,
  all: imgRows,
});

// ---------------------------------------------------------------- summary
const summary = {
  generatedAt: new Date().toISOString(),
  source: "read-only snapshot of exam_db (.local-snapshot)",
  totalQuestions: questions.length,
  language: langCounts,
  difficulty: diff,
  crossSubject: { previouslyFlagged: previousStatus.length, confirmedHigh: crossAll.filter((x) => x.confidence === "High").length, pendingMedium: crossAll.filter((x) => x.confidence === "Medium").length },
  duplicates: { groups: dupGroups.length, records: dupGroups.reduce((a, g) => a + g.duplicates.length, 0), byKind: kindCounts, similarButDifferentPairs: similar.length },
  topics: { rows: topicRows.length, ...tc },
  images: JSON.parse(fs.readFileSync(path.join(OUT, "images_audit.json"), "utf8")).totals,
};
write("summary.json", summary);
console.log(JSON.stringify(summary, null, 2));
