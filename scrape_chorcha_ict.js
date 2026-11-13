
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const UPLOADS_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function fetchUrl(url, headers = {}, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers, timeout: timeoutMs },
      (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => resolve(data));
        res.on("error", reject);
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request Timeout"));
    });

    req.on("error", reject);
  });
}

function downloadImage(imgUrl, destPath) {
  return new Promise((resolve) => {
    try {
      const file = fs.createWriteStream(destPath);

      const req = https.get(
        imgUrl,
        { timeout: 15000 },
        (res) => {
          if (res.statusCode === 200) {
            res.pipe(file);

            file.on("finish", () => {
              file.close(() => resolve(true));
            });
          } else {
            file.close();
            fs.unlink(destPath, () => {});
            resolve(false);
          }
        }
      );

      req.on("timeout", () => {
        req.destroy();
        file.close();
        fs.unlink(destPath, () => {});
        resolve(false);
      });

      req.on("error", () => {
        file.close();
        fs.unlink(destPath, () => {});
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

function stripTags(html) {
  if (!html) return "";

  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

const ICT_REGEX =
  /(^|[-_/])(hsc-ict|ict|আইসিটি|gate|গেইট|binary|বাইনারি|octal|অক্টাল|hexadecimal|হেক্সাডেসিমেল|সংখ্যা-পদ্ধতি|লজিক|logic|boolean|বুলিয়ান|ডি-মরগান|টপোলজি|topology|html|css|সি-প্রোগ্রামিং|c-programming|ডাটাবেজ|database|ক্লাউড|cloud|রোবোটিক্স|robotics|ক্রায়োসার্জারি|cryosurgery|বায়োমেট্রিক্স|biometrics|network|নেটওয়ার্ক)([-_/]|$)/i;

const TOPIC_RULES = [
  {
    topic: "লজিক গেইট (Logic Gates)",
    chapter: "অধ্যায় ৩: সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস",
    regex: /গেইট|gate|and|or|not|nand|nor|xor|xnor/i,
  },
  {
    topic: "সংখ্যা পদ্ধতি (Number Systems)",
    chapter: "অধ্যায় ৩: সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস",
    regex:
      /বাইনারি|binary|অক্টাল|octal|দশমিক|decimal|হেক্সাডেসিমেল|hexadecimal|২-এর পরিপূরক|কম্প্লিমেন্ট|কোড|bcd|ascii/i,
  },
  {
    topic: "HTML ও ওয়েব ডিজাইন",
    chapter: "অধ্যায় ৪: ওয়েব ডিজাইন পরিচিতি ও HTML",
    regex: /html|ওয়েব|web|css|tag|হাইপারলিংক|টেবিল|iframe|url/i,
  },
  {
    topic: "সি প্রোগ্রামিং (C Programming)",
    chapter: "অধ্যায় ৫: প্রোগ্রামিং ভাষা",
    regex:
      /প্রোগ্রাম|সি ভাষা|printf|scanf|variable|লুপ|loop|array|অ্যালগরিদম|ফ্লোচার্ট|কম্পাইলার/i,
  },
  {
    topic: "ডাটাবেজ ম্যানেজমেন্ট (DBMS)",
    chapter: "অধ্যায় ৬: ডাটাবেজ ম্যানেজমেন্ট সিস্টেম",
    regex:
      /ডাটাবেজ|database|dbms|sql|primary key|foreign key|কুয়েরি|রিলেশন|ইনডেক্সিং/i,
  },
  {
    topic: "কমিউনিকেশন ও নেটওয়ার্কিং",
    chapter: "অধ্যায় ২: কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং",
    regex:
      /নেটওয়ার্ক|network|টপোলজি|topology|ক্লাউড|cloud|ওয়াইফাই|wifi|ব্লুটুথ|bluetooth|মডেম|রাউটার|অপটিক্যাল ফাইবার/i,
  },
  {
    topic: "বিশ্ব ও বাংলাদেশ প্রেক্ষিত",
    chapter:
      "অধ্যায় ১: তথ্য ও যোগাযোগ প্রযুক্তি: বিশ্ব ও বাংলাদেশ প্রেক্ষিত",
    regex:
      /রোবোটিক্স|robotics|ক্রায়োসার্জারি|cryosurgery|বায়োমেট্রিক্স|biometrics|কৃত্রিম বুদ্ধিমত্তা|ai|ভার্চুয়াল রিয়েলিটি|vr|ন্যানোটেকনোলজি/i,
  },
];

const BOARD_MAP = {
  "ঢাকা": "Dhaka",
  "চট্টগ্রাম": "Chittagong",
  "রাজশাহী": "Rajshahi",
  "কুমিল্লা": "Cumilla",
  "যশোর": "Jessore",
  "বরিশাল": "Barishal",
  "সিলেট": "Sylhet",
  "দিনাজপুর": "Dinajpur",
  "ময়মনসিংহ": "Mymensingh",
};

export async function parseQuestion(url) {
  try {
    const html = await fetchUrl(url, {}, 15000);

    if (!html || html.length < 500) return null;

    const ogTitle = html.match(
      /property="og:title" content="([^"]+)"/
    );

    let questionText = ogTitle ? stripTags(ogTitle[1]) : "";

    if (!questionText) {
      const tMatch = html.match(/<title>([^<]+)<\/title>/);

      questionText = tMatch
        ? stripTags(tMatch[1].replace(" - চর্চা", ""))
        : "";
    }

    if (!questionText || questionText.length < 4) return null;

    questionText = questionText.replace(/^[0-9১-৯]+[\.\-\)]\s*/, "");

    const decodedUrl = decodeURIComponent(url);

    const isActuallyIct =
      ICT_REGEX.test(decodedUrl) ||
      TOPIC_RULES.some((rule) => rule.regex.test(questionText));

    if (!isActuallyIct) return null;

    const ansMatch = html.match(/"answer":"([A-D])"/);
    const answerKey = ansMatch ? ansMatch[1] : "";

    const btnRegex =
      /<button disabled="" class="flex items-center gap-3 p-2 rounded-xl transition-all([^"]*)"[\s\S]*?<span[^>]*>([ক-হA-D])<\/span>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/button>/gi;

    const options = [];
    let correctAnswer = "";
    let match;

    while ((match = btnRegex.exec(html)) !== null) {
      const cls = match[1];
      const optText = stripTags(match[3]);

      const isCorrect =
        cls.includes("#017A47") ||
        cls.includes("bg-[#017A471A]");

      options.push(optText);

      if (isCorrect) {
        correctAnswer = optText;
      }
    }

    if (options.length === 0) {
      const pRegex =
        /<span[^>]*>([ক-হA-D])<\/span>[\s\S]*?<p[^>]*class="[^"]*text-lg[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;

      while ((match = pRegex.exec(html)) !== null) {
        options.push(stripTags(match[2]));
      }
    }

    if (!correctAnswer && answerKey && options.length === 4) {
      const idx = answerKey.charCodeAt(0) - 65;
      correctAnswer = options[idx] || "";
    }

    if (options.length !== 4 || !correctAnswer) return null;

    const boardRegex =
      /(ঢাকা|চট্টগ্রাম|রাজশাহী|কুমিল্লা|যশোর|বরিশাল|সিলেট|দিনাজপুর|ময়মনসিংহ)\s*বোর্ড\s*[-_]?\s*(২০[০-৯]{2}|20[0-9]{2})/i;

    const bMatch =
      decodedUrl.match(boardRegex) ||
      html.match(boardRegex);

    let boardName = "";
    let boardYear = "";

    if (bMatch) {
      boardName = BOARD_MAP[bMatch[1]] || "";

      boardYear = bMatch[2].replace(/[০-৯]/g, (d) =>
        "০১২৩৪৫৬৭৮৯".indexOf(d)
      );
    }

    let chapter =
      "অধ্যায় ৩: সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস";

    let topic = "ডিজিটাল ডিভাইস";

    for (const rule of TOPIC_RULES) {
      if (
        rule.regex.test(questionText) ||
        rule.regex.test(decodedUrl)
      ) {
        chapter = rule.chapter;
        topic = rule.topic;
        break;
      }
    }

    let localImagePath = "";

    const imgMatches = [
      ...html.matchAll(
        /src="(https:\/\/assets\.chorcha\.net\/[^"]+\.(?:png|jpg|jpeg|webp|svg))"/gi
      ),
    ];

    const questionImg = imgMatches.find(
      (m) =>
        !m[1].includes("banner") &&
        !m[1].includes("favicon") &&
        !m[1].includes("logo") &&
        !m[1].includes("avatar")
    );

    if (questionImg) {
      const ext =
        path.extname(new URL(questionImg[1]).pathname) || ".png";

      const filename = `ict_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}${ext}`;

      const destPath = path.join(UPLOADS_DIR, filename);

      const downloaded = await downloadImage(
        questionImg[1],
        destPath
      );

      if (downloaded) {
        localImagePath = `/uploads/${filename}`;
      } else {
        localImagePath = questionImg[1];
      }
    }

    return {
      className: "HSC",
      subject: "ICT",
      chapter,
      topic,
      difficulty: "medium",
      questionType:
        boardName && boardYear ? "board" : "normal",
      boardName,
      boardYear,
      question: questionText,
      options,
      correctAnswer,
      image: localImagePath,
      explanation: "",
      isPublic: true,
    };
  } catch (err) {
    return null;
  }
}

async function startScraper() {
  const isTest = process.argv.includes("--test");

  console.log(
    `🚀 Starting Chorcha HSC ICT MCQ Scraper ${
      isTest ? "(TEST MODE: 50 Questions)" : ""
    }...`
  );

  const sitemaps = [
    "https://chorcha.net/sitemaps/sitemap/1.xml",
    "https://chorcha.net/sitemaps/sitemap/2.xml",
    "https://chorcha.net/sitemaps/sitemap/3.xml",
    "https://chorcha.net/sitemaps/sitemap/4.xml",
    "https://chorcha.net/sitemaps/sitemap/5.xml",
    "https://chorcha.net/sitemaps/sitemap/6.xml",
    "https://chorcha.net/sitemaps/sitemap/7.xml",
    "https://chorcha.net/sitemaps/sitemap/8.xml",
    "https://chorcha.net/sitemaps/sitemap/9.xml",
  ];

  const outPath = path.join(__dirname, "ict_questions.json");

  let existingQuestions = [];

  try {
    if (fs.existsSync(outPath)) {
      existingQuestions = JSON.parse(
        fs.readFileSync(outPath, "utf-8")
      );
    }
  } catch {}

  const alreadySavedQuestions = new Set(
    existingQuestions.map((q) => q.question)
  );

  console.log(
    `ℹ️ Already saved in local JSON: ${alreadySavedQuestions.size} questions`
  );

  const candidateUrls = new Set();

  console.log("🔍 Scanning sitemaps for ICT questions...");

  for (let i = 0; i < (isTest ? 2 : sitemaps.length); i++) {
    try {
      const smContent = await fetchUrl(
        sitemaps[i],
        {},
        25000
      );

      const matches = [
        ...smContent.matchAll(
          /<loc>(https:\/\/chorcha\.net\/question\/[^<]+)<\/loc>/g
        ),
      ].map((m) => m[1]);

      let matchedCount = 0;

      for (const u of matches) {
        const dec = decodeURIComponent(u).toLowerCase();

        if (ICT_REGEX.test(dec)) {
          candidateUrls.add(u);
          matchedCount++;
        }
      }

      console.log(
        `  Sitemap ${i + 1}: Found ${matchedCount} verified ICT questions`
      );

      if (isTest && candidateUrls.size >= 50) break;
    } catch (e) {
      console.error(
        `  ⚠️ Sitemap ${i + 1} timeout or skipped:`,
        e.message
      );
    }
  }

  let urlList = Array.from(candidateUrls);

  if (isTest) {
    urlList = urlList.slice(0, 50);
  }

  console.log(
    `\n📦 Total candidate questions to scrape: ${urlList.length}`
  );

  const scrapedQuestions = [...existingQuestions];

  const BATCH_SIZE = 6;

  for (let i = 0; i < urlList.length; i += BATCH_SIZE) {
    const batch = urlList.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map((u) => parseQuestion(u))
    );

    for (const q of results) {
      if (q && !alreadySavedQuestions.has(q.question)) {
        alreadySavedQuestions.add(q.question);
        scrapedQuestions.push(q);
      }
    }

    // Incremental autosave every batch
    if (scrapedQuestions.length % 20 === 0) {
      fs.writeFileSync(
        outPath,
        JSON.stringify(scrapedQuestions, null, 2),
        "utf-8"
      );
    }

    const pct = Math.round(
      ((i + batch.length) / urlList.length) * 100
    );

    process.stdout.write(
      `\rProgress: ${scrapedQuestions.length} saved | Processed: ${
        i + batch.length
      }/${urlList.length} (${pct}%)`
    );
  }

  // Final save
  fs.writeFileSync(
    outPath,
    JSON.stringify(scrapedQuestions, null, 2),
    "utf-8"
  );

  console.log(
    `\n\n✅ Finished! Total ICT questions saved: ${scrapedQuestions.length}`
  );

  // Auto import to MongoDB
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error(
      "MONGO_URI is not configured in environment variables."
    );
  }

  try {
    console.log("Connecting to MongoDB for auto-import...");

    await mongoose.connect(mongoUri);

    const QuestionModel = (
      await import("./models/Question.js")
    ).default;

    let imported = 0;

    for (const q of scrapedQuestions) {
      const exists = await QuestionModel.findOne({
        question: q.question,
      });

      if (!exists) {
        await QuestionModel.create(q);
        imported++;
      }
    }

    console.log(
      `🎉 Successfully synced ${imported} new questions into MongoDB!`
    );

    await mongoose.disconnect();
  } catch (err) {
    console.error("MongoDB import error:", err.message);

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startScraper().catch(console.error);
}
