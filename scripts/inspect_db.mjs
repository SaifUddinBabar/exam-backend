import mongoose from "mongoose";

const uri = "mongodb+srv://exam_app:XTXGXLD4BXRp44B6@cluster0.p6esi4j.mongodb.net/exam_db?appName=Cluster0";

function getTopicKeywordRegex(topicStr) {
  if (!topicStr) return null;
  const clean = topicStr.split("(")[0].trim();
  const lower = clean.toLowerCase();

  // Chapter 1
  if (/বিশ্বগ্রাম/i.test(lower)) return /বিশ্বগ্রাম|global village|ম্যাকলুহান/i;
  if (/ভার্চুয়াল|ভার্চুয়াল|vr/i.test(lower)) return /ভার্চুয়াল|ভার্চুয়াল|virtual reality|ভিআর|vr/i;
  if (/কৃত্রিম বুদ্ধিমত্তা|রোবট|ai/i.test(lower)) return /কৃত্রিম বুদ্ধিমত্তা|artificial intelligence|ai|রোবট|robot|রোবোটিক্স/i;
  if (/ক্রায়ো|ক্রায়ো|cryo/i.test(lower)) return /ক্রায়ো|ক্রায়ো|cryosurgery|তরল নাইট্রোজেন|হিমায়িত/i;
  if (/বায়োমেট্রিক্স|বায়োমেট্রিক্স|biometric/i.test(lower)) return /বায়োমেট্রিক্স|বায়োমেট্রিক্স|ফিঙ্গারপ্রিন্ট|রেটিনা|আইরিশ/i;
  if (/বায়োইনফরমেটিক্স|বায়োইনফরমেটিক্স|bioinformatic/i.test(lower)) return /বায়োইনফরমেটিক্স|বায়োইনফরমেটিক্স|ডিএনএ|dna|জিনোম/i;
  if (/জেনেটিক|genetic/i.test(lower)) return /জেনেটিক|genetic|জিএমও|gmo|রিকম্বিনেন্ট|প্লাজমিড/i;
  if (/ন্যানো|nano/i.test(lower)) return /ন্যানো|nano/i;
  if (/ই-কমার্স|e-commerce/i.test(lower)) return /ই-কমার্স|e-commerce|অনলাইন শপিং/i;

  // Chapter 2
  if (/ব্যান্ডউইথ|bandwidth/i.test(lower)) return /ব্যান্ডউইথ|bandwidth|bps|kbps|mbps|ন্যারো|ভয়েস|ব্রডব্যান্ড/i;
  if (/ট্রান্সমিশন মেথড|মেথড/i.test(lower)) return /সিনক্রোনাস|অ্যাসিংক্রোনাস|আইসোক্রোনাস|asynchronous|synchronous|ট্রান্সমিশন মেথড/i;
  if (/ট্রান্সমিশন মোড|মোড/i.test(lower)) return /সিমপ্লেক্স|হাফ ডুপ্লেক্স|ফুল ডুপ্লেক্স|simplex|half duplex|full duplex|ইউনিকাস্ট|ব্রডকাস্ট|মাল্টিকাস্ট|ট্রান্সমিশন মোড/i;
  if (/তারযুক্ত|ক্যাবল|cable/i.test(lower)) return /তারযুক্ত|twisted pair|coaxial|কোক্সিয়াল|ফাইবার অপটিক|fiber optic|অপটিক্যাল ফাইবার/i;
  if (/তারবিহীন|wireless/i.test(lower)) return /তারবিহীন|ওয়াই-ফাই|wi-fi|wifi|ব্লুটুথ|bluetooth|wimax|ওয়াইম্যাক্স|রেডিও|মাইক্রোওয়েভ|স্যাটেলাইট/i;
  if (/মোবাইল|প্রজন্ম/i.test(lower)) return /মোবাইল|প্রজন্ম|1g|2g|3g|4g|5g|জিএসএম|সিডিএমএ/i;
  if (/কম্পিউটার নেটওয়ার্ক|নেটওয়ার্ক/i.test(lower)) return /কম্পিউটার নেটওয়ার্ক|pan|lan|man|wan|নেটওয়ার্ক/i;
  if (/টপোলজি|topology/i.test(lower)) return /টপোলজি|topology|স্টার|বাস|রিং|ট্রি|মেশ|হাইব্রিড/i;
  if (/ক্লাউড|cloud/i.test(lower)) return /ক্লাউড কম্পিউটিং|cloud computing|saas|paas|iaas/i;
  if (/ডিভাইস|device/i.test(lower)) return /মডেম|modem|হাব|hub|সুইচ|switch|রাউটার|router|গেটওয়ে|gateway|রিপিটার/i;

  // Chapter 3
  if (/সংখ্যা পদ্ধতি|number system/i.test(lower)) return /সংখ্যা পদ্ধতি|বাইনারি|অক্টাল|হেক্সাডেসিমেল|দশমিক|binary|octal|hexadecimal/i;
  if (/পরিপূরক|complement/i.test(lower)) return /পরিপূরক|2's complement|চিহ্নযুক্ত/i;
  if (/কোড|code/i.test(lower)) return /বিসিডি|bcd|অ্যাসকি|ascii|ইবিসিডিআইসি|ebcdic|ইউনিকোড|unicode|কোড/i;
  if (/লজিক গেইট|logic gate/i.test(lower)) return /লজিক গেইট|logic gate|and gate|or gate|not gate|nand|nor|xor|xnor/i;
  if (/বুলিয়ান|boolean/i.test(lower)) return /বুলিয়ান|boolean|ডি-মরগান|সরলীকরণ|মৌলিক উপপাদ্য/i;
  if (/এনকোডার|ডিকোডার|encoder/i.test(lower)) return /এনকোডার|ডিকোডার|encoder|decoder/i;
  if (/অ্যাডার|adder/i.test(lower)) return /অ্যাডার|adder|হাফ অ্যাডার|ফুল অ্যাডার/i;
  if (/রেজিস্টার|কাউন্টার|ফ্লিপ/i.test(lower)) return /রেজিস্টার|কাউন্টার|ফ্লিপ-ফ্লপ|register|counter|flip-flop/i;

  // Chapter 4
  if (/ট্যাগ|tag|html/i.test(lower)) return /html|ট্যাগ|tag|এলিমেন্ট|অ্যাট্রিবিউট/i;
  if (/ফরমেটিং|formatting/i.test(lower)) return /ফরমেটিং|formatting|bold|italic|underline|paragraph/i;
  if (/হাইপারলিংক|hyperlink/i.test(lower)) return /হাইপারলিংক|hyperlink|<a>|href/i;
  if (/ইমেজ|ছবি|image/i.test(lower)) return /ইমেজ|ছবি|image|<img>|src/i;
  if (/টেবিল|table/i.test(lower)) return /টেবিল|table|<tr>|<td>|<th>|rowspan|colspan/i;
  if (/কাঠামো|structure/i.test(lower)) return /ওয়েবসাইট কাঠামো|লিনিয়ার|ট্রি|হায়ারার্কিক্যাল|ওয়েব লিঙ্কড|হাইব্রিড/i;
  if (/হোস্টিং|ডোমেইন/i.test(lower)) return /হোস্টিং|ডোমেইন|ip address|url|ftp|পাবলিশিং/i;

  // Chapter 5
  if (/প্রোগ্রামিং|programming/i.test(lower)) return /প্রোগ্রামিং|অ্যালগরিদম|ফ্লোচার্ট|অনুবাদক|কম্পাইলার|ইন্টারপ্রেটার|অ্যাসেম্বলার/i;
  if (/চলক|ধ্রুবক|ভেরিয়েবল|variable/i.test(lower)) return /int|float|char|double|ডেটা টাইপ|চলক|ধ্রুবক|ভেরিয়েবল/i;
  if (/অপারেটর|operator/i.test(lower)) return /অপারেটর|যোগ|ভাগ|মডুলাস|অ্যারিথমেটিক|রিলেশনাল|লজিক্যাল/i;
  if (/কন্ডিশনাল|if|switch/i.test(lower)) return /if|else|switch|case|শর্তযুক্ত/i;
  if (/লুপ|loop/i.test(lower)) return /for|while|do while|লুপ|পুনরাবৃত্তি/i;
  if (/অ্যারে|array/i.test(lower)) return /অ্যারে|array|সূচক/i;
  if (/ফাংশন|function/i.test(lower)) return /ফাংশন|function|main|printf|scanf/i;

  // Chapter 6
  if (/কী ফিল্ড|কি ফিল্ড|primary|key/i.test(lower)) return /কী ফিল্ড|কি ফিল্ড|primary key|foreign key|composite|প্রাইমারি কী|ফরেন কী|ইউনিক|রেকর্ড|ফিল্ড/i;
  if (/sql|এসকিউএল/i.test(lower)) return /sql|query|select|insert|update|delete|ক্রিয়েট/i;
  if (/রিলেশন|relation/i.test(lower)) return /রিলেশন|relation|1:1|1:m|m:n|এক-এক|এক-বহু|বহু-বহু/i;
  if (/সর্ট|ইনডেক্স|sort|index/i.test(lower)) return /সর্টিং|ইনডেক্সিং|sorting|indexing|ক্রমানুসারে/i;
  if (/ডেটা টাইপ|data type/i.test(lower)) return /ডেটা টাইপ|data type|ole object|text|memo|number|তারিখ|মুদ্রা/i;
  if (/rdbms/i.test(lower)) return /rdbms|ms-access|mysql|oracle|রিলেশনাল ডেটাবেজ/i;
  if (/নিরাপত্তা|সিকিউরিটি|security/i.test(lower)) return /নিরাপত্তা|সিকিউরিটি|security|password|এনক্রিপশন/i;

  return new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function buildTopicFilter(topicInput) {
  if (!topicInput || topicInput === "All") return null;
  const topics = (Array.isArray(topicInput) ? topicInput : String(topicInput).split(","))
    .map((t) => t.trim())
    .filter(Boolean);
  if (!topics.length) return null;

  const orClauses = [];
  topics.forEach((t) => {
    const rx = getTopicKeywordRegex(t);
    if (rx) {
      orClauses.push(
        { topic: rx },
        { question: rx },
        { options: rx },
        { explanation: rx }
      );
    }
  });

  return orClauses.length > 0 ? { $or: orClauses } : null;
}

function getChapterQueryRegex(chapter) {
  if (!chapter || chapter === "All") return null;
  const lower = chapter.toLowerCase();
  if (/১|1|introduction/i.test(lower)) return /অধ্যায় ১|Introduction to ICT|বিশ্ব ও বাংলাদেশ/i;
  if (/২|2|communication/i.test(lower)) return /অধ্যায় ২|Communication Systems|কমিউনিকেশন/i;
  if (/৩|3|number system|ডিজিটাল/i.test(lower)) return /অধ্যায় ৩|Number System|সংখ্যা পদ্ধতি|ডিজিটাল ডিভাইস/i;
  if (/৪|4|html|web/i.test(lower)) return /অধ্যায় ৪|Web & HTML|HTML|ওয়েব ডিজাইন/i;
  if (/৫|5|programming|প্রোগ্রামিং/i.test(lower)) return /অধ্যায় ৫|Programming & Language|প্রোগ্রামিং ভাষা|সি প্রোগ্রামিং/i;
  if (/৬|6|database|ডাটাবেজ|ডেটাবেজ/i.test(lower)) return /অধ্যায় ৬|Database|ডাটাবেজ|ডেটাবেজ/i;
  return new RegExp(chapter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

async function main() {
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");

  const chRegex = getChapterQueryRegex("অধ্যায় ৬ - ডেটাবেজ ম্যানেজমেন্ট সিস্টেম");
  const topicFilterSingle = buildTopicFilter("কী ফিল্ড");
  const count1 = await Q.countDocuments({ chapter: chRegex, ...topicFilterSingle });
  console.log("Chapter 6 + 'কী ফিল্ড':", count1);

  const topicFilterMulti = buildTopicFilter(["কী ফিল্ড", "এসকিউএল (SQL)"]);
  const count2 = await Q.countDocuments({ chapter: chRegex, ...topicFilterMulti });
  console.log("Chapter 6 + ['কী ফিল্ড', 'এসকিউএল (SQL)']:", count2);

  await mongoose.disconnect();
}
main();
