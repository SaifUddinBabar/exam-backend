// Standard NCTB HSC ICT syllabus (six chapters + board questions) and a
// deterministic topic resolver.
//
// Every question is placed in EXACTLY ONE standard topic of its chapter, or in
// "Uncategorised", so topic counts always add up to the chapter total:
//   1. If its stored `topic` is already specific, it is mapped to the standard
//      topic through `aliases` (method "stored").
//   2. If the stored topic is generic/empty, the question text and options (never the
//      explanation) are matched against word-safe keyword patterns; the topic with
//      the most distinct matched terms wins (method "keyword"). Ties or no match →
//      Uncategorised. Nothing is written to the database.
// Board questions are grouped by their real `boardName` field.
//
// Bengali has no \b word boundary, so short Bengali words go through bw(), which
// refuses matches inside a longer Bengali word (e.g. "নট" inside "কোনটি").

const BN = "\\u0980-\\u09FF";
const bw = (...words) => words.map((w) => `(?<![${BN}])${w}(?![${BN}])`).join("|");
const rx = (...parts) => new RegExp(parts.filter(Boolean).join("|"), "i");

export const UNCATEGORISED = "অশ্রেণীকৃত (Uncategorised)";

export const SYLLABUS_DATA = [
  {
    chapterId: "ch1",
    chapterName: "অধ্যায় ১: তথ্য ও যোগাযোগ প্রযুক্তি: বিশ্ব ও বাংলাদেশ প্রেক্ষিত",
    shortName: "অধ্যায় ১",
    chapterAliases: ["অধ্যায় ১: তথ্য ও যোগাযোগ প্রযুক্তি: বিশ্ব ও বাংলাদেশ প্রেক্ষিত", "Introduction to ICT"],
    topics: [
      { name: "বিশ্বগ্রাম ধারণা (Global Village)", aliases: ["বিশ্বগ্রাম (Global Village)"], rx: rx("বিশ্বগ্রাম", "global village", "ম্যাকলুহান", "mcluhan", "টেলিমেডিসিন", "telemedicine", "ভিডিও কনফারেন্সিং", "আউটসোর্সিং", "outsourcing", "ই-লার্নিং", "e-learning") },
      { name: "ভার্চুয়াল রিয়েলিটি (Virtual Reality)", aliases: ["ভার্চুয়াল রিয়েলিটি (Virtual Reality)"], rx: rx("ভার্চুয়াল রিয়েলিটি", "ভার্চুয়াল রিয়েলিটি", "virtual reality", "\\bvr\\b", "হেড মাউন্টেড", "head mounted", "ফ্লাইট সিমুলেটর", "flight simulator", "\\bhmd\\b") },
      { name: "কৃত্রিম বুদ্ধিমত্তা ও রোবোটিক্স (AI & Robotics)", aliases: ["কৃত্রিম বুদ্ধিমত্তা (Artificial Intelligence) ও রোবোটিক্স (Robotics)"], rx: rx("কৃত্রিম বুদ্ধিমত্তা", "artificial intelligence", "\\bai\\b", "রোবট", "রোবোটিক্স", "robot", "এক্সপার্ট সিস্টেম", "expert system", "অ্যাকচুয়েটর", "actuator") },
      { name: "ক্রায়োসার্জারি (Cryosurgery)", aliases: ["ক্রায়োসার্জারি (Cryosurgery)"], rx: rx("ক্রায়ো", "ক্রায়ো", "cryo", "তরল নাইট্রোজেন", "লিকুইড নাইট্রোজেন", "আর্গন গ্যাস") },
      { name: "বায়োমেট্রিক্স ও বায়োইনফরমেটিক্স", aliases: ["বায়োমেট্রিক্স (Biometrics)", "বায়োইনফরমেটিক্স (Bioinformatics)"], rx: rx("বায়োমেট্রিক", "বায়োমেট্রিক", "biometric", "ফিঙ্গারপ্রিন্ট", "fingerprint", "আঙুলের ছাপ", "রেটিনা", "আইরিশ", "\\biris\\b", "ফেস রিকগনিশন", "face recognition", "বায়োইনফরমেটিক্স", "বায়োইনফরমেটিক্স", "bioinformatic") },
      { name: "জেনেটিক ইঞ্জিনিয়ারিং (Genetic Engineering)", aliases: ["জেনেটিক ইঞ্জিনিয়ারিং (Genetic Engineering)"], rx: rx("জেনেটিক", "genetic", "জিএমও", "\\bgmo\\b", "রিকম্বিনেন্ট", "recombinant", "প্লাজমিড", "plasmid", "ট্রান্সজেনিক", "transgenic") },
      { name: "ন্যানোটেকনোলজি (Nanotechnology)", aliases: ["ন্যানোটেকনোলজি (Nanotechnology)"], rx: rx("ন্যানো", "nano") },
      { name: "ই-কমার্স ও সমাজজীবনে প্রভাব", aliases: ["ই-কমার্স ও ই-বিজনেস"], rx: rx("ই-কমার্স", "e-commerce", "ই-বিজনেস", "অনলাইন শপিং", "মোবাইল ব্যাংকিং", "ই-গভর্ন্যান্স") },
      { name: "আইসিটির নৈতিকতা ও সাইবার অপরাধ (ICT Ethics)", aliases: ["ICT-এর নৈতিকতা, সামাজিক ও অর্থনৈতিক প্রভাব"], rx: rx("নৈতিকতা", "ethics", "হ্যাকিং", "হ্যাকার", "hacking", "hacker", "পাইরেসি", "piracy", "প্লেজিয়ারিজম", "plagiarism", "স্প্যাম", "spam", "ফিশিং", "phishing", "সাইবার ক্রাইম", "সাইবার অপরাধ", "cyber crime", "কপিরাইট", "copyright") },
    ],
  },
  {
    chapterId: "ch2",
    chapterName: "অধ্যায় ২: কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং",
    shortName: "অধ্যায় ২",
    chapterAliases: ["অধ্যায় ২: কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং", "Communication Systems"],
    topics: [
      { name: "ডেটা কমিউনিকেশন ও ব্যান্ডউইথ (Bandwidth)", aliases: ["ব্যান্ডউইথ (Bandwidth)", "ব্যান্ডউইথ", "কমিউনিকেশন সিস্টেম (Communication System)", "কমিউনিকেশন সিস্টেম ও উপাদান", "ডেটা কমিউনিকেশনের উপাদান (Data Communication Components: Source, Transmitter, Media, Receiver, Destination)"], rx: rx("ব্যান্ডউইথ", "bandwidth", "\\b[kmg]?bps\\b", "ন্যারো ?ব্যান্ড", "ভয়েস ?ব্যান্ড", "ব্রড ?ব্যান্ড", "narrow ?band", "voice ?band", "broad ?band", "ডেটা ট্রান্সমিশন স্পিড", "ট্রান্সমিটার", "রিসিভার", "transmitter", "receiver") },
      { name: "ডেটা ট্রান্সমিশন মেথড (Asynchronous, Synchronous)", aliases: ["ডেটা ট্রান্সমিশন পদ্ধতি"], rx: rx("সিনক্রোনাস", "অ্যাসিনক্রোনাস", "অ্যাসিনক্রোনাস", "অ্যাসিংক্রোনাস", "আইসোক্রোনাস", "synchronous", "asynchronous", "isochronous", "স্টার্ট বিট", "স্টপ বিট", "start bit", "stop bit") },
      { name: "ডেটা ট্রান্সমিশন মোড (Simplex, Half/Full Duplex)", aliases: ["ডেটা ট্রান্সমিশন মোড (Data Transmission Mode: Serial/Parallel, Simplex/Half Duplex/Full Duplex)", "ডেটা ট্রান্সমিশন মোড"], rx: rx("সিমপ্লেক্স", "হাফ.?ডুপ্লেক্স", "ফুল.?ডুপ্লেক্স", "simplex", "duplex", "ইউনিকাস্ট", "ব্রডকাস্ট", "মাল্টিকাস্ট", "unicast", "broadcast", "multicast", "ওয়াকি.?টকি", "walkie") },
      { name: "তারযুক্ত মাধ্যম (Twisted Pair, Coaxial, Fiber Optic)", aliases: ["কমিউনিকেশন মাধ্যম (ক্যাবল)", "কমিউনিকেশন মিডিয়া: তারযুক্ত (Wired Media – Twisted Pair, Coaxial, Fiber Optic)"], rx: rx("তারযুক্ত", "টুইস্টেড", "twisted", "কো-?অ্যাক্সিয়াল", "কো-?এক্সিয়াল", "কোঅ্যাক্সিয়াল", "coaxial", "ফাইবার", "fiber", "fibre", "অপটিক্যাল", "ক্ল্যাডিং", "cladding", "\\butp\\b", "\\bstp\\b", "\\brj-?45\\b", "থিননেট", "thinnet", "থিকনেট", "thicknet") },
      { name: "তারবিহীন মাধ্যম (Wi-Fi, WiMAX, Bluetooth, Satellite)", aliases: ["কমিউনিকেশন মিডিয়া: তারবিহীন (Wireless Media – Radio Wave, Microwave, Satellite, Bluetooth, Infrared, Wi-Fi, WiMAX)", "ওয়্যারলেস কমিউনিকেশন সিস্টেম"], rx: rx("তারবিহীন", "wireless", "ওয়াই-?ফাই", "wi-?fi", "ওয়াইম্যাক্স", "ওয়াইম্যাক্স", "wimax", "ব্লুটুথ", "bluetooth", "ইনফ্রারেড", "infrared", "মাইক্রোওয়েভ", "microwave", "রেডিও ওয়েভ", "radio wave", "স্যাটেলাইট", "satellite", "কৃত্রিম উপগ্রহ", "পিকোনেট", "piconet", "802\\.1[16]") },
      { name: "মোবাইল প্রজন্ম (1G, 2G, 3G, 4G, 5G)", aliases: ["মোবাইল কমিউনিকেশন সিস্টেম (Mobile Communication System)", "মোবাইল ফোনের বিভিন্ন প্রজন্ম (Generations of Mobile Phone: 1G–5G)", "মোবাইল যোগাযোগ"], rx: rx("মোবাইল", "mobile", "\\b[1-5]g\\b", "[১-৫]জি", "জিএসএম", "\\bgsm\\b", "সিডিএমএ", "\\bcdma\\b", "\\blte\\b", "\\bamps\\b", "রোমিং", "roaming", "\\bgprs\\b", "\\bedge\\b", "\\bmimo\\b") },
      { name: "কম্পিউটার নেটওয়ার্ক (PAN, LAN, MAN, WAN)", aliases: ["কম্পিউটার নেটওয়ার্ক (Computer Network) ও নেটওয়ার্কের প্রকারভেদ (PAN, LAN, MAN, WAN)", "কম্পিউটার নেটওয়ার্ক ও প্রকার"], rx: rx("\\b(w?pan|w?lan|w?man|w?wan)\\b", bw("প্যান", "ল্যান", "ম্যান", "ওয়ান"), "পিয়ার.?টু.?পিয়ার", "peer.?to.?peer", "ক্লায়েন্ট.?সার্ভার", "client.?server", "ইন্ট্রানেট", "এক্সট্রানেট", "intranet", "extranet") },
      { name: "নেটওয়ার্ক ডিভাইস (Modem, Hub, Switch, Router, Gateway)", aliases: ["নেটওয়ার্কিং ডিভাইস (Networking Devices: Modem, Hub, Switch, Router, Gateway, Repeater)"], rx: rx("মডেম", "modem", bw("হাব", "সুইচ"), "\\bhub\\b", "\\bswitch\\b", "রাউটার", "router", "গেটওয়ে", "gateway", "রিপিটার", "repeater", "\\bbridge\\b", bw("ব্রিজ"), "\\bnic\\b", "ল্যান কার্ড", "ম্যাক অ্যাড্রেস", "mac address") },
      { name: "নেটওয়ার্ক টপোলজি (Star, Bus, Ring, Tree, Mesh, Hybrid)", aliases: ["নেটওয়ার্ক টপোলজি (Network Topology: Bus, Ring, Star, Tree, Mesh, Hybrid)", "নেটওয়ার্ক টপোলজি ও প্রকার"], rx: rx("টপোলজি", "topology", "ব্যাকবোন", "backbone") },
      { name: "ক্লাউড কম্পিউটিং (Cloud Computing)", aliases: ["ক্লাউড কম্পিউটিং (Cloud Computing)"], rx: rx("ক্লাউড", "cloud", "\\bsaas\\b", "\\bpaas\\b", "\\biaas\\b") },
    ],
  },
  {
    chapterId: "ch3",
    chapterName: "অধ্যায় ৩: সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস",
    shortName: "অধ্যায় ৩",
    chapterAliases: ["অধ্যায় ৩: সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস", "Number System & Digital Device"],
    topics: [
      { name: "সংখ্যা পদ্ধতি ও রূপান্তর (Number System & Conversion)", aliases: ["সংখ্যা পদ্ধতি পরিচিতি", "বাইনারি সংখ্যা পদ্ধতি"], rx: rx("সংখ্যা পদ্ধতি", "number system", "বাইনারি", "binary", "অক্টাল", "octal", "হেক্সাডেসিমেল", "হেক্সাডেসিমাল", "hexadecimal", "ডেসিমাল", "ডেসিমেল", "decimal", "দশমিক", "ভিত্তি", bw("বেজ"), "\\bbase\\b", "রূপান্তর", "রুপান্তর", "সমকক্ষ", "সমতুল্য", "সমমান", "পজিশনাল", "positional", "\\(\\s*[0-9A-F.]+\\s*\\)\\s*_?\\s*(2|8|10|16|₂|₈|₁₀|₁₆)"), broad: true },
      { name: "চিহ্নযুক্ত সংখ্যা ও ২-এর পরিপূরক (2's Complement)", aliases: [], rx: rx("পরিপূরক", "complement", "চিহ্নযুক্ত", "সাইন বিট", "sign bit", "signed") },
      { name: "কোড (BCD, ASCII, Unicode, EBCDIC)", aliases: ["কোডিং সিস্টেম"], rx: rx("\\bbcd\\b", "বিসিডি", "অ্যাসকি", "\\bascii\\b", "ইউনিকোড", "unicode", "\\bebcdic\\b", "ইবিসিডিআইসি", "গ্রে কোড", "gray code", "প্যারিটি", "parity", "আলফানিউমেরিক কোড") },
      { name: "বুলিয়ান অ্যালজেবরা ও ডি-মরগানের উপপাদ্য", aliases: ["বুলিয়ান বীজগণিত"], rx: rx("বুলিয়ান", "বুলিয়ান", "boolean", "ডি-?মরগান", "de.?morgan", "উপপাদ্য", "theorem", "সত্যক সারণি", "সত্য সারণি", "truth table", "কার্নো", "k-?map", "সরলীকরণ") },
      { name: "লজিক গেইট (AND, OR, NOT, NAND, NOR, XOR, XNOR)", aliases: ["লজিক গেট"], rx: rx("গেইট", "(?<!বিল )গেট(?!স)", "(?<!bill )\\bgates?\\b", bw("অ্যান্ড", "ন্যান্ড", "এক্স-অর", "এক্স-নর"), "সার্বজনীন গেইট", "universal gate", "ইনভার্টার", "inverter"), rxCs: /\b(AND|OR|NOT|NAND|NOR|XOR|XNOR|X-OR|X-NOR)\b/ }, // gate names only in capitals, so English prose ("and", "not") does not match
      { name: "এনকোডার ও ডিকোডার (Encoder, Decoder)", aliases: [], rx: rx("এনকোডার", "ডিকোডার", "encoder", "decoder", "মাল্টিপ্লেক্সার", "multiplexer") },
      { name: "অ্যাডার (Half Adder, Full Adder)", aliases: [], rx: rx("অ্যাডার", "অ্যাডার", "\\badder\\b", "হাফ অ্যাডার", "ফুল অ্যাডার") },
      { name: "ফ্লিপ-ফ্লপ, রেজিস্টার ও কাউন্টার", aliases: [], rx: rx("ফ্লিপ.?ফ্লপ", "flip.?flop", "রেজিস্টার", "register", "কাউন্টার", "counter", "শিফট রেজিস্টার", "shift register") },
    ],
  },
  {
    chapterId: "ch4",
    chapterName: "অধ্যায় ৪: ওয়েব ডিজাইন পরিচিতি ও HTML",
    shortName: "অধ্যায় ৪",
    chapterAliases: ["অধ্যায় ৪: ওয়েব ডিজাইন পরিচিতি ও HTML", "Web & HTML"],
    topics: [
      { name: "ওয়েবসাইটের কাঠামো (Tree, Network, Linear)", aliases: ["ওয়েবসাইট কাঠামো"], rx: rx("কাঠামো", "structure", "লিনিয়ার", "linear", "হায়ারার্কিক্যাল", "hierarchical", "ওয়েব লিংকড", "ওয়েব লিঙ্কড") },
      { name: "ডোমেইন নেইম, আইপি ও ওয়েব পাবলিশিং", aliases: ["URL ও ডোমেইন"], rx: rx("ডোমেইন", "domain", "\\bdns\\b", "\\burl\\b", "আইপি অ্যাড্রেস", "ip address", "হোস্টিং", "hosting", "পাবলিশ", "publish", "\\bftp\\b", "ওয়েব সার্ভার", "web server") },
      { name: "HTML ট্যাগ, এলিমেন্ট ও টেক্সট ফরম্যাটিং", aliases: ["HTML ট্যাগ ও ফরম্যাটিং"], rx: rx("<\\s*/?\\s*(html|head|body|title|p|br|hr|b|i|u|h[1-6]|font|sup|sub|strong|em|marquee|center)\\b", "ট্যাগ", "\\btag\\b", "এলিমেন্ট", "element", "অ্যাট্রিবিউট", "attribute", "ফরম্যাটিং", "ফরমেটিং", "formatting", "কালার কোড", "color code"), broad: true },
      { name: "হাইপারলিংক (Anchor Tag)", aliases: [], rx: rx("হাইপারলিংক", "হাইপারলিঙ্ক", "hyperlink", "<\\s*a\\b", "\\bhref\\b", "অ্যাংকর", "anchor") },
      { name: "ইমেজ যুক্তকরণ (img tag)", aliases: [], rx: rx("<\\s*img\\b", "\\bsrc\\s*=", "\\balt\\s*=") },
      { name: "টেবিল ও তালিকা (table, list)", aliases: [], rx: rx("<\\s*/?\\s*(table|tr|td|th|ol|ul|li)\\b", "টেবিল", "\\btable\\b", "rowspan", "colspan", "তালিকা", "\\blist\\b") },
      { name: "ফর্ম তৈরি (Form, Input, Button)", aliases: [], rx: rx("<\\s*(form|input|button|select|textarea)\\b", "ফর্ম", "\\bform\\b") },
    ],
  },
  {
    chapterId: "ch5",
    chapterName: "অধ্যায় ৫: প্রোগ্রামিং ভাষা (সি প্রোগ্রামিং)",
    shortName: "অধ্যায় ৫",
    chapterAliases: ["অধ্যায় ৫: প্রোগ্রামিং ভাষা (সি প্রোগ্রামিং)", "Programming & Language"],
    topics: [
      { name: "প্রোগ্রামিং ভাষার স্তর ও প্রজন্ম", aliases: ["প্রোগ্রামিং ভাষার প্রজন্ম"], rx: rx("প্রজন্ম", "generation", "মেশিন ভাষা", "machine language", "অ্যাসেম্বলি ভাষা", "assembly language", "উচ্চস্তরের", "নিম্নস্তরের", "high.?level", "low.?level", "\\b4gl\\b", "মধ্যম স্তরের") },
      { name: "অনুবাদক প্রোগ্রাম (Compiler, Interpreter)", aliases: ["অনুবাদক প্রোগ্রাম"], rx: rx("অনুবাদক", "কম্পাইলার", "compiler", "ইন্টারপ্রেটার", "interpreter", "অ্যাসেম্বলার", "assembler", "সোর্স প্রোগ্রাম", "অবজেক্ট প্রোগ্রাম", "source code", "object code") },
      { name: "অ্যালগরিদম ও ফ্লোচার্ট", aliases: ["প্রোগ্রাম উন্নয়ন ধাপ"], rx: rx("অ্যালগরিদম", "algorithm", "ফ্লোচার্ট", "flowchart", "flow chart", "সিউডোকোড", "সুডোকোড", "pseudo") },
      { name: "চলক, ধ্রুবক ও ডেটা টাইপ (int, float, char)", aliases: [], rx: rx("চলক", "ধ্রুবক", "variable", "constant", "\\b(int|float|char|double|long|short|unsigned)\\b", "ডেটা টাইপ", "data type", "কীওয়ার্ড", "কিওয়ার্ড", "keyword", "আইডেন্টিফায়ার", "identifier", "ফরম্যাট স্পেসিফায়ার", "%[dfcs]"), broad: true },
      { name: "অপারেটর ও এক্সপ্রেশন", aliases: [], rx: rx("অপারেটর", "operator", "এক্সপ্রেশন", "expression", "মডুলাস", "modulus", "==|!=|&&|\\|\\||\\+\\+|--|<=|>=") },
      { name: "ইনপুট ও আউটপুট ফাংশন (printf, scanf)", aliases: [], rx: rx("\\bprintf\\b", "\\bscanf\\b", "\\bgetchar\\b", "\\bputchar\\b", "\\bgets\\b", "\\bputs\\b", "হেডার ফাইল", "header file", "#include", "stdio") },
      { name: "কন্ডিশনাল স্টেটমেন্ট (if, if-else, switch)", aliases: [], rx: rx("\\bif\\b", "\\belse\\b", "\\bswitch\\b", "\\bcase\\b", "কন্ডিশনাল", "conditional", "শর্তযুক্ত", "শর্তসাপেক্ষ") },
      { name: "লুপ (for, while, do-while)", aliases: [], rx: rx("\\bfor\\s*\\(", "\\bwhile\\b", "\\bdo\\b", "লুপ", "\\bloop\\b", "পুনরাবৃত্তি", "\\bbreak\\b", "\\bcontinue\\b") },
      { name: "অ্যারে ও স্ট্রিং (Array & String)", aliases: [], rx: rx("অ্যারে", "\\barray\\b", "স্ট্রিং", "\\bstring\\b", "\\w\\[\\s*\\d+\\s*\\]") },
      { name: "ফাংশন (Function)", aliases: [], rx: rx("ফাংশন", "function", "রিটার্ন", "\\breturn\\b", "প্যারামিটার", "parameter", "রিকার্সন", "recursion", "\\bmain\\s*\\(") },
    ],
  },
  {
    chapterId: "ch6",
    chapterName: "অধ্যায় ৬: ডাটাবেজ ম্যানেজমেন্ট সিস্টেম",
    shortName: "অধ্যায় ৬",
    chapterAliases: ["অধ্যায় ৬: ডাটাবেজ ম্যানেজমেন্ট সিস্টেম", "Database"],
    topics: [
      { name: "ডেটাবেজ ও DBMS ধারণা", aliases: ["ডেটাবেজ ম্যানেজমেন্ট সিস্টেম", "ডেটাবেজ ম্যানেজমেন্ট"], rx: rx("\\bdbms\\b", "ডিবিএমএস", "ডেটাবেজ ম্যানেজমেন্ট", "ডাটাবেজ ম্যানেজমেন্ট", "ডেটাবেজের উপাদান", "ডাটাবেজের উপাদান", "ডাটাবেজ এর উপাদান", "ডেটাবেজ সফটওয়্যার", "ডাটাবেজ সফটওয়্যার", "রেকর্ড", bw("ফিল্ড"), "\\brecord\\b", "\\bfield\\b"), broad: true },
      { name: "ডেটাবেজ তৈরি ও ডেটা টাইপ", aliases: ["ডেটাবেজ তৈরি", "ডেটা টাইপ"], rx: rx("ডেটা টাইপ", "ডাটা টাইপ", "data type", "\\bole object\\b", "\\bmemo\\b", "অটোনাম্বার", "autonumber", "কারেন্সি", "currency", "ডেটাবেজ তৈরি", "ডাটাবেজ তৈরি", "টেবিল তৈরি") },
      { name: "কী ফিল্ড (Primary, Foreign, Composite)", aliases: ["কী ফিল্ড", "প্রাইমারি কি"], rx: rx("কী ফিল্ড", "কি ফিল্ড", "primary key", "foreign key", "composite key", "candidate key", "প্রাইমারি কী", "প্রাইমারি কি", "ফরেন কী", "ফরেন কি", "কম্পোজিট কী", "কম্পোজিট কি", "ক্যান্ডিডেট") },
      { name: "সর্টিং ও ইনডেক্সিং", aliases: ["সর্টিং এবং ইনডেক্সিং"], rx: rx("সর্টিং", "sorting", "ইনডেক্সিং", "indexing", "ইনডেক্স", "\\bindex\\b", "ক্রমানুসারে", "ascending", "descending") },
      { name: "এসকিউএল ও কুয়েরি (SQL)", aliases: ["এসকিউএল (SQL)"], rx: rx("\\bsql\\b", "এসকিউএল", "কুয়েরি", "কুয়েরি", "\\bquery\\b", "\\bselect\\b", "\\binsert\\b", "\\bupdate\\b", "\\bdelete\\b", "\\bwhere\\b", "\\bddl\\b", "\\bdml\\b") },
      { name: "রিলেশনাল ডেটাবেজ ও রিলেশন", aliases: ["রিলেশনাল ডেটাবেজ ম্যানেজমেন্ট সিস্টেম", "ডেটাবেজ রিলেশন", "রিলেশনাল ডেটাবেজ", "RDBMS-এর বৈশিষ্ট্য RDBMS-এর ব্যবহার"], rx: rx("\\brdbms\\b", "রিলেশন", "relation", "এক-এক", "এক-বহু", "বহু-বহু", "one.to.one", "one.to.many", "many.to.many", "\\bms-?access\\b", "\\bmysql\\b", "\\boracle\\b", "ই-আর ডায়াগ্রাম", "e-?r diagram") },
      { name: "ডেটা নিরাপত্তা ও এনক্রিপশন", aliases: ["ডেটা সিকিউরিটি"], rx: rx("নিরাপত্তা", "সিকিউরিটি", "security", "এনক্রিপশন", "encryption", "ডিক্রিপশন", "decryption", "সাইফার", "cipher", "পাসওয়ার্ড", "password") },
    ],
  },
];

// Stored topics that only restate the chapter (or are known to be bulk-assigned)
// and therefore need keyword classification.
export const GENERIC_STORED_TOPICS = new Set([
  "",
  "বিশ্ব ও বাংলাদেশ প্রেক্ষিত",
  "কমিউনিকেশন ও নেটওয়ার্কিং",
  "ডিজিটাল ডিভাইস ও লজিক গেইট",
  "সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস",
  "লজিক গেইট (Logic Gates)", // bulk label on 870 chapter-3 questions
  "ওয়েব ডিজাইন ও HTML",
  "সি প্রোগ্রামিং (C Language)",
  "ডাটাবেজ ম্যানেজমেন্ট (DBMS)",
  "তথ্য ও যোগাযোগ প্রযুক্তি",
  "উদ্দীপক ভিত্তিক প্রশ্ন",
  "ডিজিটাল ইলেকট্রনিক্স",
]);

export const BOARD_CHAPTER = { chapterId: "board", chapterName: "Board Questions", shortName: "বোর্ড প্রশ্ন", chapterAliases: ["Board Questions"], topics: [] };

// Bengali nukta letters (ড় ঢ় য়) exist both precomposed (U+09DC/09DD/09DF) and as letter +
// nukta. They look identical but are different strings, and Unicode NFC does not unify them.
// Compare in NFD; query MongoDB with both spellings.
const norm = (s) => String(s || "").normalize("NFD").trim();
// Escapes on purpose: editors silently normalise literal nukta letters, which once made this a no-op.
// U+09DC/09DD/09DF are Unicode composition exclusions, so NFC never produces them; build them explicitly.
const composeNukta = (s) => s.replace(/ড়/g, "ড়").replace(/ঢ়/g, "ঢ়").replace(/য়/g, "য়");
/** Every stored spelling of a string (decomposed and precomposed nukta forms). */
// Stored data mixes forms: e.g. composed vowel signs (NFC, U+09CB) with precomposed U+09DF.
export const spellings = (s) => {
  const nfc = String(s).normalize("NFC");
  return [...new Set([String(s), norm(s), nfc, composeNukta(norm(s)), composeNukta(nfc)])];
};

const CHAPTER_BY_ALIAS = new Map();
[...SYLLABUS_DATA, BOARD_CHAPTER].forEach((c) => {
  c.chapterAliases.forEach((a) => CHAPTER_BY_ALIAS.set(norm(a), c));
  c.storedChapterNames = c.chapterAliases.flatMap(spellings);
});

/** Standard chapter for a stored chapter name (exact alias match only). */
export function chapterForStored(chapterName) {
  return CHAPTER_BY_ALIAS.get(norm(chapterName)) || null;
}

/** Standard chapter config by its display name, id or any alias. */
export function findChapterConfig(name) {
  if (!name || name === "All") return null;
  const n = norm(name);
  return [...SYLLABUS_DATA, BOARD_CHAPTER].find((c) => c.chapterId === n || norm(c.chapterName) === n) || CHAPTER_BY_ALIAS.get(n) || null;
}

const BOARD_LABEL = {
  Dhaka: "ঢাকা বোর্ড (Dhaka)",
  Chittagong: "চট্টগ্রাম বোর্ড (Chattogram)",
  Rajshahi: "রাজশাহী বোর্ড (Rajshahi)",
  Cumilla: "কুমিল্লা বোর্ড (Cumilla)",
  Jessore: "যশোর বোর্ড (Jashore)",
  Barishal: "বরিশাল বোর্ড (Barishal)",
  Sylhet: "সিলেট বোর্ড (Sylhet)",
  Dinajpur: "দিনাজপুর বোর্ড (Dinajpur)",
  Mymensingh: "ময়মনসিংহ বোর্ড (Mymensingh)",
};
export const BOARD_TOPICS = Object.values(BOARD_LABEL);

function distinctHits(t, text) {
  const terms = new Set((text.match(new RegExp(t.rx.source, "gi")) || []).map((m) => m.toLowerCase()));
  if (t.rxCs) (text.match(new RegExp(t.rxCs.source, "g")) || []).forEach((m) => terms.add(m));
  return terms.size;
}

/** Resolve one question to { chapterId, topic, method } — method: stored | keyword | board | none. */
export function resolveQuestionTopic(q) {
  const ch = chapterForStored(q.chapter);
  if (!ch) return { chapterId: null, topic: UNCATEGORISED, method: "none" };
  if (ch.chapterId === "board") {
    const label = BOARD_LABEL[q.boardName];
    return { chapterId: "board", topic: label || UNCATEGORISED, method: label ? "board" : "none" };
  }
  const stored = norm(q.topic);
  if (!GENERIC_STORED_TOPICS.has(stored)) {
    const t = ch.topics.find((x) => norm(x.name) === stored || x.aliases.some((a) => norm(a) === stored));
    if (t) return { chapterId: ch.chapterId, topic: t.name, method: "stored" };
  }
  const text = `${q.question || ""}\n${(q.options || []).join("\n")}`;
  // Most distinct matched terms wins. On a tie a specific topic beats a broad one
  // ("broad: true"); anything still ambiguous stays Uncategorised.
  const scored = ch.topics.map((t) => ({ t, h: distinctHits(t, text) })).filter((x) => x.h > 0);
  const max = Math.max(0, ...scored.map((x) => x.h));
  let top = scored.filter((x) => x.h === max);
  if (top.length > 1) top = top.filter((x) => !x.t.broad);
  if (top.length === 1) return { chapterId: ch.chapterId, topic: top[0].t.name, method: "keyword" };
  return { chapterId: ch.chapterId, topic: UNCATEGORISED, method: "none" };
}

/** Standard topic names of a chapter, including the Uncategorised bucket. */
export function chapterTopicNames(chapterId) {
  if (chapterId === "board") return [...BOARD_TOPICS, UNCATEGORISED];
  const c = SYLLABUS_DATA.find((x) => x.chapterId === chapterId);
  return c ? [...c.topics.map((t) => t.name), UNCATEGORISED] : [];
}

export const ALL_CHAPTERS = [...SYLLABUS_DATA, BOARD_CHAPTER];

/**
 * Suggestions for a teacher reviewing an Uncategorised question: every standard topic
 * (any chapter) whose terms appear in the question or options, strongest first.
 * Suggestions only — the resolver never applies them.
 */
export function topicHints(q, limit = 4) {
  const text = `${q.question || ""}\n${(q.options || []).join("\n")}`;
  const out = [];
  for (const c of SYLLABUS_DATA) {
    for (const t of c.topics) {
      const hits = distinctHits(t, text);
      if (hits > 0) out.push({ chapterId: c.chapterId, chapterName: c.chapterName, topic: t.name, hits });
    }
  }
  return out.sort((a, b) => b.hits - a.hits).slice(0, limit);
}
