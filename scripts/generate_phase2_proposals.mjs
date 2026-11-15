import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function generateProposals() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  const questions = await mongoose.connection.db.collection('questions').find({}).toArray();
  console.log(`Total questions loaded: ${questions.length}`);

  // ==========================================
  // 1. CROSS-SUBJECT ERROR DETECTION
  // ==========================================
  console.log('Auditing cross-subject errors...');
  const chemBioStrict = [
    { pattern: /aerobic respiration|C6H12O6/i, name: 'Aerobic Respiration / Glucose equation', subject: 'Biology / Chemistry', chapter: 'Bioenergetics / Respiration' },
    { pattern: /reaction between nitrogen and hydrogen produces ammonia|N2.*3H2.*NH3|Haber/i, name: 'Haber process ammonia synthesis', subject: 'Chemistry', chapter: 'Chemical Equilibrium & Industrial Chemistry' },
    { pattern: /anaerobic respiration in yeast/i, name: 'Anaerobic respiration in yeast', subject: 'Biology', chapter: 'Cellular Respiration' },
    { pattern: /titration.*sodium sulfite.*potassium manganate|0\.0200 mol dm-3/i, name: 'Redox Titration & Stoichiometry', subject: 'Chemistry', chapter: 'Quantitative Chemistry' },
    { pattern: /production of ammonia involves the exothermic.*kJ \/ mol/i, name: 'Thermochemistry & Enthalpy of reaction', subject: 'Chemistry', chapter: 'Chemical Energetics' }
  ];

  const physicsStrict = [
    { pattern: /convex lens of focal length|concave lens of focal length/i, name: 'Geometrical Optics & Lenses', subject: 'Physics', chapter: 'Geometrical Optics' },
    { pattern: /মহাকর্ষীয় ধ্রুবক|অভিকর্ষজ ত্বরণ g এর মান|কুলম্বের সূত্র/i, name: 'Gravitation / Coulomb Law', subject: 'Physics', chapter: 'Classical Mechanics & Electrostatics' }
  ];

  const econStrict = [
    { pattern: /বাণিজ্যিক ব্যাংক|কেন্দ্রীয় ব্যাংক.*১,০০,০০০ টাকা নিকটস্থ ব্যাংকে জমা/i, name: 'Commercial Banking & Money Markets', subject: 'Finance & Banking', chapter: 'Commercial Banks' },
    { pattern: /মুদ্রা ও বৈদেশিক বিনিময়|মুদ্রাস্ফীতি|চাহিদা ও জোগান/i, name: 'Macroeconomics & Inflation', subject: 'Economics', chapter: 'Money and Banking' }
  ];

  const crossSubjectResults = [];

  for (const q of questions) {
    const text = (q.question || q.questionBn || q.questionEn || '').trim();
    const opts = Array.isArray(q.options) ? q.options.join(' ') : '';
    const full = `${text} ${opts} ${q.explanation || ''}`;
    const chapter = q.chapter || '';
    const subject = q.subject || 'ICT';

    let matched = null;
    let confidence = 'High';

    for (const rule of chemBioStrict) {
      if (rule.pattern.test(full)) {
        matched = { ...rule, category: 'Chemistry / Biology' };
        break;
      }
    }
    if (!matched) {
      for (const rule of physicsStrict) {
        if (rule.pattern.test(full)) {
          matched = { ...rule, category: 'Physics' };
          break;
        }
      }
    }
    if (!matched) {
      for (const rule of econStrict) {
        if (rule.pattern.test(full)) {
          matched = { ...rule, category: 'Economics / Finance' };
          break;
        }
      }
    }

    if (matched) {
      crossSubjectResults.push({
        qId: q._id.toString(),
        question: text.slice(0, 100),
        fullQuestion: text,
        currentSubject: subject,
        currentChapter: chapter,
        currentTopic: q.topic || '',
        suggestedSubject: matched.subject,
        suggestedChapter: matched.chapter,
        reason: `Matched non-ICT domain pattern: ${matched.name}`,
        confidence
      });
    }
  }

  // ==========================================
  // 2. DUPLICATE AUDIT
  // ==========================================
  console.log('Auditing duplicate questions...');
  const normalizedMap = new Map();
  const duplicateGroups = [];

  for (const q of questions) {
    const qId = q._id.toString();
    const rawText = (q.question || q.questionBn || q.questionEn || '').trim();
    const norm = rawText
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/[\s\p{P}]+/gu, '')
      .toLowerCase();

    if (norm.length < 15) continue;

    if (!normalizedMap.has(norm)) {
      normalizedMap.set(norm, [q]);
    } else {
      normalizedMap.get(norm).push(q);
    }
  }

  let totalDuplicateQuestions = 0;
  for (const [norm, group] of normalizedMap.entries()) {
    if (group.length > 1) {
      totalDuplicateQuestions += (group.length - 1);
      const original = group.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))[0];
      const duplicates = group.filter(x => x._id.toString() !== original._id.toString());

      // Classify duplicate type
      const firstText = (original.question || '').trim();
      const firstOpts = JSON.stringify(original.options || []);
      const firstImg = original.image || '';

      const items = duplicates.map(dup => {
        const dupText = (dup.question || '').trim();
        const dupOpts = JSON.stringify(dup.options || []);
        const dupImg = dup.image || '';

        let type = 'Exact Duplicate';
        if (dupText === firstText && dupOpts === firstOpts && dupImg === firstImg) {
          type = 'Exact Duplicate';
        } else if (dupText === firstText && dupOpts === firstOpts && dupImg !== firstImg) {
          type = 'Same Question Different Image';
        } else if (dupText === firstText && dupOpts !== firstOpts) {
          type = 'Same Question Different Options';
        } else {
          type = 'Formatting-only Duplicate';
        }

        return {
          duplicateId: dup._id.toString(),
          chapter: dup.chapter,
          type,
          createdAt: dup.createdAt
        };
      });

      duplicateGroups.push({
        originalId: original._id.toString(),
        originalText: firstText.slice(0, 100),
        chapter: original.chapter,
        createdAt: original.createdAt,
        duplicateCount: duplicates.length,
        items
      });
    }
  }

  // ==========================================
  // 3. MISSING & GENERIC TOPIC AUDIT
  // ==========================================
  console.log('Auditing missing and generic topics...');
  const topicTaxonomy = {
    'অধ্যায় ১: তথ্য ও যোগাযোগ প্রযুক্তি: বিশ্ব ও বাংলাদেশ প্রেক্ষিত': [
      { pattern: /ভার্চুয়াল রিয়েলিটি|VR|ভিআর/i, topic: 'ভার্চুয়াল রিয়েলিটি (Virtual Reality)' },
      { pattern: /কৃত্রিম বুদ্ধিমত্তা|AI|এআই|রোবট|রোবোটিক্স/i, topic: 'কৃত্রিম বুদ্ধিমত্তা ও রোবোটিক্স' },
      { pattern: /ক্রায়োসার্জারি|ক্রায়োজেনিক/i, topic: 'ক্রায়োসার্জারি (Cryosurgery)' },
      { pattern: /বায়োমেট্রিক্স|আঙুলের ছাপ|আইরিশ|রেটিনা/i, topic: 'বায়োমেট্রিক্স (Biometrics)' },
      { pattern: /বায়োইনফরমেটিক্স/i, topic: 'বায়োইনফরমেটিক্স (Bioinformatics)' },
      { pattern: /জেনেটিক ইঞ্জিনিয়ারিং|জিএমও|GMO/i, topic: 'জেনেটিক ইঞ্জিনিয়ারিং (Genetic Engineering)' },
      { pattern: /ন্যানোটেকনোলজি|ন্যানো/i, topic: 'ন্যানোটেকনোলজি (Nanotechnology)' },
      { pattern: /ই-কমার্স|ই-লার্নিং|টেলিমেডিসিন|ই-গভর্ন্যান্স/i, topic: 'ইন্টারনেট ও বিশ্বগ্রামের সেবা' }
    ],
    'অধ্যায় ২: কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং': [
      { pattern: /ব্যান্ডউইথ|bps|bps|ব্যান্ডউইডথ/i, topic: 'ব্যান্ডউইথ (Bandwidth)' },
      { pattern: /সিনক্রোনাস|অ্যাসিনক্রোনাস|আইসোক্রোনাস/i, topic: 'ডেটা ট্রান্সমিশন মেথড' },
      { pattern: /সিমপ্লেক্স|হাফ ডুপ্লেক্স|ফুল ডুপ্লেক্স/i, topic: 'ডেটা ট্রান্সমিশন মোড' },
      { pattern: /টুইস্টেড পেয়ার|কো-অ্যাক্সিয়াল|অপটিক্যাল ফাইবার/i, topic: 'তারযুক্ত মাধ্যম (Cable Media)' },
      { pattern: /ওয়াইফাই|ওয়াইম্যাক্স|ব্লুটুথ|রেডিও ওয়েভ|মাইক্রোওয়েভ/i, topic: 'তারবিহীন মাধ্যম (Wireless Media)' },
      { pattern: /PAN|LAN|MAN|WAN|প্যান|ল্যান|ম্যান|ওয়ান/i, topic: 'কম্পিউটার নেটওয়ার্ক (PAN, LAN, MAN, WAN)' },
      { pattern: /স্টার|বাস|রিং|ট্রি|মেশ|হাইব্রিড|টপোলজি/i, topic: 'নেটওয়ার্ক টপোলজি' },
      { pattern: /ক্লাউড কম্পিউটিং|SaaS|PaaS|IaaS/i, topic: 'ক্লাউড কম্পিউটিং (Cloud Computing)' }
    ],
    'অধ্যায় ৩: সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস': [
      { pattern: /দশমিক|বাইনারি|অক্টাল|হেক্সাডেসিমেল|বেস|Radix/i, topic: 'সংখ্যা পদ্ধতি ও রূপান্তর' },
      { pattern: /১ এর পরিপূরক|২ এর পরিপূরক|2's complement/i, topic: 'চিহ্নযুক্ত সংখ্যা ও ২-এর পরিপূরক' },
      { pattern: /BCD|ASCII|EBCDIC|Unicode|ইউনিকোড/i, topic: 'কোড (BCD, ASCII, Unicode)' },
      { pattern: /বুলিয়ান অ্যালজেবরা|ডিমরগান|De Morgan/i, topic: 'বুলিয়ান অ্যালজেবরা ও উপপাদ্য' },
      { pattern: /AND|OR|NOT|NAND|NOR|XOR|XNOR|লজিক গেট/i, topic: 'মৌলিক ও যৌগিক লজিক গেইট' },
      { pattern: /এনকোডার|ডিকোডার|অ্যাডার|হাফ অ্যাডার|ফুল অ্যাডার/i, topic: 'এনকোডার, ডিকোডার ও অ্যাডার' },
      { pattern: /ফ্লিপ-ফ্লপ|রেজিস্টার|কাউন্টার/i, topic: 'রেজিস্টার ও কাউন্টার' }
    ],
    'অধ্যায় ৪: ওয়েব ডিজাইন পরিচিতি ও HTML': [
      { pattern: /IP অ্যাড্রেস|ডোমেইন নেম|DNS|URL/i, topic: 'আইপি অ্যাড্রেস ও ডোমেইন নেম' },
      { pattern: /লিনিয়ার|ট্রি|নেটওয়ার্ক|ওয়েবসাইট কাঠামো/i, topic: 'ওয়েবসাইটের কাঠামো' },
      { pattern: /<p>|<h\d>|<b>|<i>|<br>|<hr>|HTML ট্যাগ/i, topic: 'এইচটিএমএল মৌলিক ট্যাগ (HTML Tags)' },
      { pattern: /<a\s|href|হাইপারলিংক/i, topic: 'হাইপারলিংক তৈরি (Anchor Tag)' },
      { pattern: /<img\s|src|ইমেজ/i, topic: 'ইমেজ যুক্তকরণ (Image Tag)' },
      { pattern: /<table>|<tr>|<td>|<th>|টেবিল/i, topic: 'টেবিল তৈরি (HTML Table)' }
    ],
    'অধ্যায় ৫: প্রোগ্রামিং ভাষা (সি প্রোগ্রামিং)': [
      { pattern: /অ্যালগরিদম|ফ্লোচার্ট/i, topic: 'অ্যালগরিদম ও ফ্লোচার্ট' },
      { pattern: /কম্পাইলার|ইন্টারপ্রেটার|অ্যাসেম্বলার/i, topic: 'অনুবাদক প্রোগ্রাম (Compiler, Interpreter)' },
      { pattern: /int|float|char|ডাবল|ডেটা টাইপ|ভেরিয়েবল/i, topic: 'সি ভাষার চলক ও ডেটা টাইপ' },
      { pattern: /if|else|switch|কন্ডিশন/i, topic: 'কন্ডিশনাল স্টেটমেন্ট (if, else)' },
      { pattern: /for|while|do while|লুপ/i, topic: 'লুপ কন্ট্রোল স্টেটমেন্ট (for, while)' },
      { pattern: /array|অ্যারে/i, topic: 'অ্যারে (Array)' },
      { pattern: /function|ফাংশন/i, topic: 'ফাংশন (Function)' }
    ],
    'অধ্যায় ৬: ডাটাবেজ ম্যানেজমেন্ট সিস্টেম': [
      { pattern: /DBMS|RDBMS|ডিবিএমএস/i, topic: 'ডাটাবেজ ম্যানেজমেন্ট সিস্টেম পরিচিতি' },
      { pattern: /প্রাইমারি কি|ফরেন কি|কম্পোজিট কি|কী ফিল্ড/i, topic: 'কী ফিল্ড (Primary, Foreign Key)' },
      { pattern: /ওয়ান-টু-ওয়ান|ওয়ান-টু-মেনি|মেনি-টু-মেনি|রিলেশন/i, topic: 'ডাটাবেজ রিলেশন' },
      { pattern: /SQL|SELECT|INSERT|UPDATE|DELETE|কোয়েরি/i, topic: 'এসকিউএল (SQL) কোয়েরি' },
      { pattern: /সর্টিং|ইনডেক্সিং/i, topic: 'ডাটা সর্টিং ও ইনডেক্সিং' }
    ]
  };

  const missingOrGenericTopicProposals = [];

  for (const q of questions) {
    const topic = (q.topic || '').trim();
    const chapter = (q.chapter || '').trim();
    const isGeneric = !topic || topic === 'General' || topic === 'সাধারণ' || topic === 'কমিউনিকেশন ও নেটওয়ার্কিং' || topic.startsWith('অধ্যায়') || topic === chapter;

    if (isGeneric) {
      const qText = (q.question || q.questionBn || q.questionEn || '').trim();
      const opts = Array.isArray(q.options) ? q.options.join(' ') : '';
      const fullText = `${qText} ${opts} ${q.explanation || ''}`;

      // Find matching taxonomy
      let matchedTaxonomy = null;
      for (const [chKey, rules] of Object.entries(topicTaxonomy)) {
        if (chapter.includes(chKey.split(':')[0]) || chKey.includes(chapter.slice(0, 10))) {
          for (const r of rules) {
            if (r.pattern.test(fullText)) {
              matchedTaxonomy = r.topic;
              break;
            }
          }
        }
      }

      if (matchedTaxonomy) {
        missingOrGenericTopicProposals.push({
          qId: q._id.toString(),
          preview: qText.slice(0, 70),
          currentChapter: chapter,
          currentTopic: topic || '[None/Empty]',
          suggestedTopic: matchedTaxonomy,
          confidence: 'High',
          reason: `Matched characteristic syllabus keywords in question text`
        });
      }
    }
  }

  const finalOutput = {
    generatedAt: new Date().toISOString(),
    totalQuestionsScanned: questions.length,
    crossSubjectSummary: {
      count: crossSubjectResults.length,
      items: crossSubjectResults
    },
    duplicateSummary: {
      totalDuplicateGroups: duplicateGroups.length,
      totalDuplicateQuestions,
      groups: duplicateGroups.slice(0, 30) // top 30 representative groups
    },
    missingTopicSummary: {
      totalFoundWithSpecificResolution: missingOrGenericTopicProposals.length,
      sampleProposals: missingOrGenericTopicProposals.slice(0, 40)
    }
  };

  const outputPath = path.join(__dirname, '../data_quality_proposals.json');
  fs.writeFileSync(outputPath, JSON.stringify(finalOutput, null, 2), 'utf-8');
  console.log(`Saved detailed proposals to ${outputPath}`);
  console.log(`- Cross-subject identified: ${crossSubjectResults.length}`);
  console.log(`- Duplicate groups: ${duplicateGroups.length} (${totalDuplicateQuestions} duplicate records)`);
  console.log(`- Generic topics with high-confidence suggested resolutions: ${missingOrGenericTopicProposals.length}`);

  await mongoose.disconnect();
}

generateProposals().catch(console.error);
