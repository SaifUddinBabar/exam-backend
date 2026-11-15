// Standard NCTB HSC ICT Syllabus Definition & Intelligent Topic Matcher

export const SYLLABUS_DATA = [
  {
    chapterId: "ch1",
    chapterName: "অধ্যায় ১: তথ্য ও যোগাযোগ প্রযুক্তি: বিশ্ব ও বাংলাদেশ প্রেক্ষিত",
    shortName: "অধ্যায় ১",
    altNames: ["Introduction to ICT", "অধ্যায় ১", "বিশ্ব ও বাংলাদেশ প্রেক্ষিত", "তথ্য ও যোগাযোগ প্রযুক্তি"],
    topics: [
      { name: "বিশ্বগ্রাম ধারণা (Global Village)", rx: /বিশ্বগ্রাম|global village|ম্যাকলুহান|marshall mcluhan|টেলিমেডিসিন|telemedicine|ইন্টারনেট সংযোগ|বিশ্বের সকল মানুষ/i },
      { name: "ভার্চুয়াল রিয়েলিটি (Virtual Reality)", rx: /ভার্চুয়াল|ভার্চুয়াল|virtual reality|ভিআর|\bvr\b|সিমুলেশন|simulation|ত্রিমাত্রিক|3d|এইচএমডি|hmd|গুগল গ্লাস|google glass/i },
      { name: "কৃত্রিম বুদ্ধিমত্তা ও রোবোটিক্স (AI & Robotics)", rx: /কৃত্রিম বুদ্ধিমত্তা|artificial intelligence|\bai\b|রোবট|robot|রোবোটিক্স|robotics|ড্রোন|drone|অ্যাকচুয়েটর|actuator/i },
      { name: "ক্রায়োসার্জারি (Cryosurgery)", rx: /ক্রায়ো|ক্রায়ো|cryosurgery|ক্রায়োপ্রোব|তরল নাইট্রোজেন|লিকুইড নাইট্রোজেন|হিমায়িত|অর্গন গ্যাস|সাব-জিরো/i },
      { name: "বায়োমেট্রিক্স ও বায়োইনফরমেটিক্স", rx: /বায়োমেট্রিক্স|বায়োমেট্রিক্স|biometric|ফিঙ্গারপ্রিন্ট|রেটিনা|আইরিশ|iris|ডিএনএ|dna|জিনোম|বায়োইনফরমেটিক্স|বায়োইনফরমেটিক্স|bioinformatic|জৈব তথ্য|ফেস রিকগনিশন/i },
      { name: "জেনেটিক ইঞ্জিনিয়ারিং (Genetic Engineering)", rx: /জেনেটিক|genetic|জিএমও|gmo|রিকম্বিনেন্ট|প্লাজমিড|ট্রান্সজেনিক|জিনোম এডিটিং/i },
      { name: "ন্যানোটেকনোলজি (Nanotechnology)", rx: /ন্যানো|nano|আণবিক|পারমাণবিক স্কেল|ন্যানোমিটার/i },
      { name: "ই-কমার্স ও সমাজজীবনে প্রভাব", rx: /ই-কমার্স|e-commerce|অনলাইন শপিং|ই-মার্কেট|সাইবার ক্রাইম|প্লেজারিজম|হ্যাকিং|কপিরাইট/i },
    ],
  },
  {
    chapterId: "ch2",
    chapterName: "অধ্যায় ২: কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং",
    shortName: "অধ্যায় ২",
    altNames: ["Communication Systems", "অধ্যায় ২", "কমিউনিকেশন সিস্টেমস", "কমিউনিকেশন ও নেটওয়ার্কিং"],
    topics: [
      { name: "ডেটা কমিউনিকেশন ও ব্যান্ডউইথ (Bandwidth)", rx: /ব্যান্ডউইথ|bandwidth|\bbps\b|\bkbps\b|\bmbps\b|\bgbps\b|ন্যারোব্যান্ড|ভয়েসব্যান্ড|ব্রডব্যান্ড|কমিউনিকেশন উপাদান|মাধ্যম/i },
      { name: "ডেটা ট্রান্সমিশন মেথড (Asynchronous, Synchronous)", rx: /সিনক্রোনাস|অ্যাসিংক্রোনাস|আইসোক্রোনাস|asynchronous|synchronous|isochronous|ট্রান্সমিশন মেথড|স্টার্ট বিট|স্টপ বিট|ব্লক বা প্যাকেট/i },
      { name: "ডেটা ট্রান্সমিশন মোড (Simplex, Half/Full Duplex)", rx: /সিমপ্লেক্স|হাফ ডুপ্লেক্স|ফুল ডুপ্লেক্স|simplex|half duplex|full duplex|ইউনিকাস্ট|ব্রডকাস্ট|মাল্টিকাস্ট|unicast|broadcast|multicast|ট্রান্সমিশন মোড|ওয়াকি-টকি/i },
      { name: "তারযুক্ত মাধ্যম (Twisted Pair, Coaxial, Fiber Optic)", rx: /তারযুক্ত|twisted pair|coaxial|কোক্সিয়াল|টুইস্টেড পেয়ার|ফাইবার অপটিক|fiber optic|অপটিক্যাল ফাইবার|কোর|ক্লাডিং|জ্যাকেট|rj-45|stp|utp|আলোর গতি/i },
      { name: "তারবিহীন মাধ্যম (Wi-Fi, WiMAX, Bluetooth, Satellite)", rx: /তারবিহীন|wireless|ওয়াই-ফাই|wi-fi|wifi|ব্লুটুথ|bluetooth|wimax|ওয়াইম্যাক্স|রেڈیو|মাইক্রোওয়েভ|রেডিও ওয়েভ|স্যাটেলাইট|satellite|ieee 802/i },
      { name: "মোবাইল প্রজন্ম (1G, 2G, 3G, 4G, 5G)", rx: /মোবাইল|প্রজন্ম|\b1g\b|\b2g\b|\b3g\b|\b4g\b|\b5g\b|জিএসএম|সিডিএমএ|gsm|cdma|এলটিই|lte|সিম কার্ড|ভয়েস কল/i },
      { name: "কম্পিউটার নেটওয়ার্ক (PAN, LAN, MAN, WAN)", rx: /pan|lan|man|wan|প্যান|ল্যান|ম্যান|ওয়ান|লোকাল এরিয়া নেটওয়ার্ক|নেটওয়ার্কের প্রকার|মডেম|সুইচ|রাউটার|গেটওয়ে|হাব|modem|switch|router|gateway|hub|রিপিটার|nic|ম্যাক অ্যাড্রেস/i },
      { name: "নেটওয়ার্ক টপোলজি (Star, Bus, Ring, Tree, Mesh, Hybrid)", rx: /টপোলজি|topology|স্টার টপোলজি|বাস টপোলজি|রিং টপোলজি|ট্রি টপোলজি|মেশ টপোলজি|হাইব্রিড টপোলজি|ব্যাকবোন/i },
      { name: "ক্লাউড কম্পিউটিং (Cloud Computing)", rx: /ক্লাউড|cloud|saas|paas|iaas|ক্লাউড সার্ভিস|পাবলিক ক্লাউড|প্রাইভেট ক্লাউড/i },
    ],
  },
  {
    chapterId: "ch3",
    chapterName: "অধ্যায় ৩: সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস",
    shortName: "অধ্যায় ৩",
    altNames: ["Number System & Digital Device", "অধ্যায় ৩", "সংখ্যা পদ্ধতি", "ডিজিটাল ডিভাইস"],
    topics: [
      { name: "সংখ্যা পদ্ধতি পরিচিতি ও ভিত্তি (Base)", rx: /সংখ্যা পদ্ধতি|পজিশনাল|নন-পজিশনাল|ভিত্তি বা বেস|দশমিক|ডেসিমেল|অক্টাল|হেক্সাডেসিমেল|base 10|base 8|base 16|radix/i },
      { name: "সংখ্যা পদ্ধতির রূপান্তর (Conversion)", rx: /রূপান্তর|সমকক্ষ মান|বাইনারি মান|হেক্সাডেসিমেল মান|অক্টাল মান|\(\d+\)[২8৮১০১৬]/i },
      { name: "চিহ্নযুক্ত সংখ্যা ও ২-এর পরিপূরক (2's Complement)", rx: /পরিপূরক|2's complement|1's complement|চিহ্নযুক্ত সংখ্যা|sign magnitude|চিহ্ন বিট/i },
      { name: "বাইনারি যোগ ও বিয়োগ", rx: /বাইনারি যোগ|বাইনারি বিয়োগ|যোগফল|ক্যারি|carry|sum/i },
      { name: "কোড (BCD, EBCDIC, ASCII, Unicode)", rx: /বিসিডি|bcd|অ্যাসকি|ascii|ইবিসিডিআইসি|ebcdic|ইউনিকোড|unicode|কোড|জোন বিট|সংখ্যাসূচক কোড/i },
      { name: "বুলিয়ান অ্যালজেবরা ও ডি-মরগানের উপপাদ্য", rx: /বুলিয়ান|বুলিয়ান|boolean|ডি-মরগান|উপপাদ্য|দ্বৈত নীতি|সরলীকরণ|সত্যক সারণি|truth table|সার্বজনীন/i },
      { name: "মৌলিক ও সার্বজনীন লজিক গেইট (AND, OR, NOT, NAND, NOR)", rx: /and gate|or gate|not gate|nand|nor|মৌলিক গেইট|সার্বজনীন গেইট|ন্যান্ড|নর|অ্যান্ড|অর|নট|লজিক গেইট|logic gate/i },
      { name: "বিশেষ লজিক গেইট (XOR, XNOR)", rx: /xor|xnor|এক্স-অর|এক্স-নর|বিশেষ গেইট/i },
      { name: "এনকোডার ও ডিকোডার (Encoder, Decoder)", rx: /এনকোডার|ডিকোডার|encoder|decoder|২^n|2\^n/i },
      { name: "অ্যাডার (Half Adder, Full Adder)", rx: /অ্যাডার|adder|হাফ অ্যাডার|ফুল অ্যাডার|half adder|full adder/i },
      { name: "ফ্লিপ-ফ্লপ ও রেজিস্টার", rx: /ফ্লিপ-ফ্লপ|রেজিস্টার|কাউন্টার|flip-flop|register|counter/i },
    ],
  },
  {
    chapterId: "ch4",
    chapterName: "অধ্যায় ৪: ওয়েব ডিজাইন পরিচিতি ও HTML",
    shortName: "অধ্যায় ৪",
    altNames: ["Web & HTML", "অধ্যায় ৪", "ওয়েব ডিজাইন", "HTML"],
    topics: [
      { name: "ওয়েবসাইটের কাঠামো (Tree, Network, Linear)", rx: /কাঠামো|লিনিয়ার|ট্রি|হায়ারার্কিক্যাল|ওয়েব লিঙ্কড|নেটওয়ার্ক কাঠামো|হাইব্রিড কাঠামো|হোমপেজ/i },
      { name: "ডোমেইন নেইম ও আইপি অ্যাড্রেস (DNS & IP)", rx: /ডোমেইন|domain|\bdns\b|\burl\b|আইপি অ্যাড্রেস|ip address|\btld\b|\bhttp\b|\bhttps\b/i },
      { name: "HTML বেসিক ট্যাগ ও সিনট্যাক্স", rx: /html|ট্যাগ|tag|এলিমেন্ট|অ্যাট্রিবিউট|head|title|body|doctype|কন্টেইনার ট্যাগ|এম্পটি ট্যাগ/i },
      { name: "টেক্সট ফরম্যাটিং ও কালার কোড", rx: /ফরমেটিং|formatting|bold|<b>|<i>|<u>|<h1>|<h6>|<p>|<font>|কালার কোড|হেক্সাডেসিমেল কালার/i },
      { name: "হাইপারলিঙ্ক (Anchor Tag)", rx: /হাইপারলিঙ্ক|হাইপারলিংক|hyperlink|<a>|href|অ্যাঙ্কর/i },
      { name: "ইমেজ যুক্তকরণ (img tag)", rx: /ইমেজ|ছবি|image|<img>|src|alt/i },
      { name: "টেবিল তৈরি (table, tr, th, td)", rx: /টেবিল|table|<tr>|<td>|<th>|rowspan|colspan|সেল/i },
      { name: "ফর্ম তৈরি (Form, Input, Button)", rx: /ফর্ম|form|<input>|<button>|রেডিও বাটন|চেকবক্স|সাবমিট/i },
      { name: "ওয়েবসাইট পাবলিশিং", rx: /পাবলিশিং|publishing|হোস্টিং|hosting|ওয়েব সার্ভার|ftp/i },
    ],
  },
  {
    chapterId: "ch5",
    chapterName: "অধ্যায় ৫: প্রোগ্রামিং ভাষা (সি প্রোগ্রামিং)",
    shortName: "অধ্যায় ৫",
    altNames: ["Programming & Language", "অধ্যায় ৫", "প্রোগ্রামিং ভাষা", "সি প্রোগ্রামিং"],
    topics: [
      { name: "প্রোগ্রামিং ভাষার স্তর ও প্রজন্ম", rx: /প্রজন্ম|১ম প্রজন্ম|২য় প্রজন্ম|৩য় প্রজন্ম|মেশিন ভাষা|অ্যাসেম্বলি ভাষা|উচ্চতর ভাষা|হাই লেভেল ল্যাঙ্গুয়েজ|লো লেভেল/i },
      { name: "অনুবাদক প্রোগ্রাম (Compiler, Interpreter)", rx: /অনুবাদক|কম্পাইলার|ইন্টারপ্রেটার|অ্যাসেম্বলার|compiler|interpreter|assembler/i },
      { name: "অ্যালগরিদম ও ফ্লোচার্ট", rx: /অ্যালগরিদম|ফ্লোচার্ট|algorithm|flowchart|সিউডোকোড|প্রতীক|ডায়মন্ড|সামান্তরিক|ডিম্বক/i },
      { name: "সি প্রোগ্রামের গঠন (Structure)", rx: /সি প্রোগ্রাম|c language|main\(\)|হেডার ফাইল|#include|<stdio\.h>|কেস সেনসিটিভ/i },
      { name: "চলক, ধ্রুবক ও ডেটা টাইপ (int, float, char)", rx: /চলক|ধ্রুবক|variable|constant|\bint\b|\bfloat\b|\bchar\b|\bdouble\b|ডেটা টাইপ|ফরম্যাট স্পেসিফায়ার|%d|%f|%c|কীওয়ার্ড|keyword/i },
      { name: "অপারেটর ও এক্সপ্রেশন", rx: /অপারেটর|operator|\+\+|\-\-|রিলেশনাল|লজিক্যাল|বিটওয়াইজ|অ্যাসাইনমেন্ট/i },
      { name: "ইনপুট ও আউটপুট ফাংশন (printf, scanf)", rx: /printf|scanf|getchar|putchar|ইনপুট|আউটপুট ফাংশন/i },
      { name: "কন্ডিশনাল স্টেটমেন্ট (if, if-else, switch)", rx: /\bif\b|\belse\b|\bswitch\b|\bcase\b|কন্ডিশনাল|শর্তসাপেক্ষ/i },
      { name: "লুপ কন্ট্রোল স্টেটমেন্ট (for, while, do-while)", rx: /\bfor\b|\bwhile\b|do-while|লুপ|পুনরাবৃত্তি|ইটারেশন|break|continue/i },
      { name: "অ্যারে ও স্ট্রিং (Array & String)", rx: /অ্যারে|array|স্ট্রিং|string|দ্বিমাত্রিক অ্যারে|সূচক|ইনডেক্স/i },
      { name: "ফাংশন (Function)", rx: /ফাংশন|function|রিটার্ন টাইপ|প্যারামিটার|ইউজার ডিফাইনড/i },
    ],
  },
  {
    chapterId: "ch6",
    chapterName: "অধ্যায় ৬: ডাটাবেজ ম্যানেজমেন্ট সিস্টেম",
    shortName: "অধ্যায় ৬",
    altNames: ["Database", "অধ্যায় ৬", "ডাটাবেজ", "ডেটাবেজ"],
    topics: [
      { name: "এসকিউএল (SQL)", rx: /\bsql\b|query|কুয়েরি|কুয়েরি|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|where|ddl|dml|dcl|structured query/i },
      { name: "কী ফিল্ড", rx: /কী ফিল্ড|কি ফিল্ড|primary key|foreign key|composite key|প্রাইমারি কী|ফরেন কী|কম্পোজিট|ইউনিক|রেকর্ড|ফিল্ড|রেকর্ডকে ইউনিকভাবে/i },
      { name: "প্রাইমারি কি", rx: /প্রাইমারি কি|প্রাইমারি কী|primary key/i },
      { name: "ডেটা টাইপ", rx: /ডেটা টাইপ|data type|ole object|text|memo|number|তারিখ|মুদ্রা|অটোনাম্বার|কারেন্সি/i },
      { name: "সর্টিং এবং ইনডেক্সিং", rx: /সর্টিং|ইনডেক্সিং|sorting|indexing|ক্রমানুসারে|asc|desc/i },
      { name: "ডেটাবেজ রিলেশন", rx: /রিলেশন|relation|1:1|1:m|m:n|এক-এক|এক-বহু|বহু-বহু|রিলেশনশিপ/i },
      { name: "RDBMS-এর বৈশিষ্ট্য RDBMS-এর ব্যবহার", rx: /rdbms|বৈশিষ্ট্য|ব্যবহার|ms-access|mysql/i },
      { name: "রিলেশনাল ডেটাবেজ", rx: /রিলেশনাল|rdbms|ই-আর ডায়াগ্রাম|er diagram/i },
      { name: "রিলেশনাল ডেটাবেজ ম্যানেজমেন্ট সিস্টেম", rx: /rdbms|ms-access|mysql|oracle|রিলেশনাল ডেটাবেজ|ডাটাবেজ সফটওয়্যার/i },
      { name: "ডেটা সিকিউরিটি", rx: /সিকিউরিটি|নিরাপত্তা|পাসওয়ার্ড|এনক্রিপশন|ডেটা সুরক্ষা|ব্যাকআপ/i },
      { name: "ডেটাবেজ তৈরি", rx: /টেবিল তৈরি|ডেটাবেজ তৈরি|ডাটাবেজ তৈরি|ক্রিয়েট টেবিল|create table/i },
      { name: "ডেটাবেজ ম্যানেজমেন্ট", rx: /ম্যানেজমেন্ট|সংরক্ষণ|নিয়ন্ত্রণ|ডাটাবেজ এর কাজ/i },
      { name: "ডেটাবেজ ম্যানেজমেন্ট সিস্টেম", rx: /dbms|ডাটাবেজ ম্যানেজমেন্ট|ডেটাবেজ ম্যানেজমেন্ট|ডেটাবেজ তৈরি|ডাটাবেজ/i },
    ],
  },
  {
    chapterId: "board",
    chapterName: "Board Questions",
    shortName: "বোর্ড প্রশ্ন",
    altNames: ["Board Questions", "বোর্ড প্রশ্ন"],
    topics: [
      { name: "ঢাকা বোর্ড (Dhaka Board)", rx: /dhaka|ঢাকা/i },
      { name: "চট্টগ্রাম বোর্ড (Chattogram Board)", rx: /chittagong|chattogram|চট্টগ্রাম/i },
      { name: "রাজশাহী বোর্ড (Rajshahi Board)", rx: /rajshahi|রাজশাহী/i },
      { name: "যশোর বোর্ড (Jashore Board)", rx: /jessore|jashore|যশোর/i },
      { name: "কুমিল্লা বোর্ড (Cumilla Board)", rx: /cumilla|comilla|কুমিল্লা/i },
      { name: "দিনাজপুর বোর্ড (Dinajpur Board)", rx: /dinajpur|দিনাজপুর/i },
      { name: "সিলেট বোর্ড (Sylhet Board)", rx: /sylhet|সিলেট/i },
      { name: "বরিশাল বোর্ড (Barishal Board)", rx: /barishal|barisal|বরিশাল/i },
      { name: "ময়মনসিংহ বোর্ড (Mymensingh Board)", rx: /mymensingh|ময়মনসিংহ/i },
    ],
  },
];

export function findChapterConfig(chapterName) {
  if (!chapterName || chapterName === "All") return null;
  const clean = String(chapterName).trim();
  return SYLLABUS_DATA.find(
    (c) =>
      c.chapterName.toLowerCase() === clean.toLowerCase() ||
      c.chapterId.toLowerCase() === clean.toLowerCase() ||
      c.altNames.some((alt) => clean.toLowerCase().includes(alt.toLowerCase()) || alt.toLowerCase().includes(clean.toLowerCase()))
  );
}

export function buildChapterRegex(chapterName) {
  if (!chapterName || chapterName === "All") return null;
  const found = findChapterConfig(chapterName);
  if (found) {
    const tokens = [...new Set([...found.altNames, found.chapterName, found.shortName])];
    return new RegExp(tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  }
  return new RegExp(String(chapterName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

export function buildTopicQuery(chapterName, topicStr) {
  if (!topicStr || topicStr === "All") return null;
  const topics = (Array.isArray(topicStr) ? topicStr : String(topicStr).split("||"))
    .map((t) => String(t).trim())
    .filter(Boolean);
  if (!topics.length) return null;

  const foundCh = findChapterConfig(chapterName);

  const orList = [];

  for (const t of topics) {
    if (t === "__none__") {
      orList.push({ topic: { $in: ["", null] } }, { topic: { $exists: false } });
      continue;
    }

    // Exact topic match always included
    const exactClause = { topic: t };

    // Try finding matching topic rule in syllabus
    let rule = foundCh?.topics?.find((x) => x.name.toLowerCase() === t.toLowerCase());
    if (!rule) {
      // Fuzzy rule match
      rule = foundCh?.topics?.find((x) => x.name.includes(t) || t.includes(x.name) || x.rx.test(t));
    }
    // Also check across all chapters if chapter wasn't specified
    if (!rule) {
      for (const ch of SYLLABUS_DATA) {
        rule = ch.topics.find((x) => x.name.toLowerCase() === t.toLowerCase() || x.name.includes(t) || t.includes(x.name));
        if (rule) break;
      }
    }

    if (rule) {
      orList.push({
        $or: [
          exactClause,
          { topic: rule.rx },
          { question: rule.rx },
          { options: rule.rx },
          { explanation: rule.rx },
        ],
      });
    } else {
      orList.push(exactClause);
    }
  }

  if (orList.length === 1) return orList[0];
  return { $or: orList };
}
