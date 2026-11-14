import Question from "../models/Question.js";
import Bookmark from "../models/Bookmark.js";
import PracticeSession from "../models/PracticeSession.js";
import Submission from "../models/Submission.js";

// Helper for tenant context filter
const getTenantFilter = (req) => {
  if (req.tenant?.orgId) {
    return {
      $or: [
        { organizationId: req.tenant.orgId },
        { isPublic: true },
        { organizationId: null },
      ],
    };
  }
  return {
    $or: [{ isPublic: true }, { organizationId: null }],
  };
};

export const ENGLISH_CHAPTERS = [
  "Introduction to ICT",
  "Communication Systems",
  "Number System & Digital Device",
  "Web & HTML",
  "Programming & Language",
];

export const getTopicKeywordRegex = (topicStr) => {
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
};

export const buildTopicFilter = (topicInput) => {
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
};

export const getChapterQueryRegex = (chapter) => {
  if (!chapter || chapter === "All") return null;
  const lower = chapter.toLowerCase();
  if (/১|1|introduction/i.test(lower)) return /অধ্যায় ১|Introduction to ICT|বিশ্ব ও বাংলাদেশ/i;
  if (/২|2|communication/i.test(lower)) return /অধ্যায় ২|Communication Systems|কমিউনিকেশন/i;
  if (/৩|3|number system|ডিজিটাল/i.test(lower)) return /অধ্যায় ৩|Number System|সংখ্যা পদ্ধতি|ডিজিটাল ডিভাইস/i;
  if (/৪|4|html|web/i.test(lower)) return /অধ্যায় ৪|Web & HTML|HTML|ওয়েব ডিজাইন/i;
  if (/৫|5|programming|প্রোগ্রামিং/i.test(lower)) return /অধ্যায় ৫|Programming & Language|প্রোগ্রামিং ভাষা|সি প্রোগ্রামিং/i;
  if (/৬|6|database|ডাটাবেজ|ডেটাবেজ/i.test(lower)) return /অধ্যায় ৬|Database|ডাটাবেজ|ডেটাবেজ/i;
  return new RegExp(chapter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
};

export const applyVersionFilter = (filter, version, chapter) => {
  if (chapter && chapter !== "All") {
    filter.chapter = getChapterQueryRegex(chapter);
  } else if (version === "english") {
    filter.chapter = { $in: ENGLISH_CHAPTERS };
  } else if (version === "bangla") {
    filter.chapter = { $nin: ENGLISH_CHAPTERS };
  }
};

export const applyTopicFilter = (filter, topic) => {
  if (!topic || topic === "All") return;
  const topicFilter = buildTopicFilter(topic);
  if (!topicFilter) return;

  if (filter.$or) {
    const existingOr = filter.$or;
    delete filter.$or;
    filter.$and = filter.$and || [];
    filter.$and.push({ $or: existingOr }, topicFilter);
  } else if (filter.$and) {
    filter.$and.push(topicFilter);
  } else {
    Object.assign(filter, topicFilter);
  }
};

// ============================================================================
// 1. GET FILTER METADATA (Subjects, Chapters, Dependent Topics, Boards, Classes)
// ============================================================================
export const getFilterMetadata = async (req, res) => {
  try {
    const { version } = req.query;
    const tenantFilter = getTenantFilter(req);
    const matchFilter = { ...tenantFilter };

    if (version === "english") {
      matchFilter.chapter = { $in: ENGLISH_CHAPTERS };
    } else if (version === "bangla") {
      matchFilter.chapter = { $nin: ENGLISH_CHAPTERS };
    }

    // Aggregate distinct combinations of Subject, Chapter, Topic
    const metadata = await Question.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            subject: "$subject",
            chapter: "$chapter",
          },
          topics: { $addToSet: "$topic" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.subject",
          chapters: {
            $push: {
              chapter: "$_id.chapter",
              topics: "$topics",
              questionCount: "$count",
            },
          },
          totalQuestions: { $sum: "$count" },
        },
      },
    ]);

    // Distinct boards and classes
    const [boards, boardYears, classes] = await Promise.all([
      Question.distinct("boardName", { ...matchFilter, boardName: { $ne: "" } }),
      Question.distinct("boardYear", { ...matchFilter, boardYear: { $ne: "" } }),
      Question.distinct("className", { ...matchFilter, className: { $ne: "" } }),
    ]);

    // Format structure: { subjects: [{ name, total, chapters: [{ name, count, topics }] }], boards, boardYears, classes }
    const formattedSubjects = metadata.map((s) => ({
      name: s._id || "ICT",
      totalQuestions: s.totalQuestions,
      chapters: s.chapters.map((c) => ({
        name: c.chapter,
        questionCount: c.questionCount,
        topics: c.topics.filter(Boolean).sort(),
      })),
    }));

    return res.json({
      success: true,
      subjects: formattedSubjects,
      boards: boards.filter(Boolean).sort(),
      boardYears: boardYears.filter(Boolean).sort().reverse(),
      classes: classes.filter(Boolean).sort(),
    });
  } catch (error) {
    console.error("getFilterMetadata error:", error);
    return res.status(500).json({ success: false, message: "Failed to load metadata" });
  }
};

// ============================================================================
// 2. GET QUESTION BANK (Paginated with Search & Filters)
// ============================================================================
export const getQuestionBank = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 15,
      search = "",
      subject,
      chapter,
      topic,
      difficulty,
      boardName,
      boardYear,
      className,
      version,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = { ...getTenantFilter(req) };

    if (subject && subject !== "All") filter.subject = subject;
    applyVersionFilter(filter, version, chapter);
    applyTopicFilter(filter, topic);
    if (difficulty && difficulty !== "All") filter.difficulty = difficulty.toLowerCase();
    if (boardName && boardName !== "All") {
      filter.questionType = "board";
      filter.boardName = boardName;
    }
    if (boardYear && boardYear !== "All") {
      filter.questionType = "board";
      filter.boardYear = boardYear;
    }
    if (className && className !== "All") filter.className = className;

    if (search && search.trim()) {
      filter.question = { $regex: search.trim(), $options: "i" };
    }

    const [total, questions] = await Promise.all([
      Question.countDocuments(filter),
      Question.find(filter)
        .select("-__v")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    // Check bookmarks for authenticated student
    let bookmarkedIds = new Set();
    if (req.user?._id) {
      const bookmarks = await Bookmark.find({
        studentId: req.user._id,
        questionId: { $in: questions.map((q) => q._id) },
      }).select("questionId");
      bookmarkedIds = new Set(bookmarks.map((b) => b.questionId.toString()));
    }

    const questionsWithBookmarkStatus = questions.map((q) => ({
      ...q,
      isBookmarked: bookmarkedIds.has(q._id.toString()),
    }));

    return res.json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: questionsWithBookmarkStatus.length,
      questions: questionsWithBookmarkStatus,
    });
  } catch (error) {
    console.error("getQuestionBank error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch question bank" });
  }
};

// ============================================================================
// 3. GET AVAILABLE COUNT (Pre-check for Practice Test creation)
// ============================================================================
export const getAvailableCount = async (req, res) => {
  try {
    const { subject, chapter, topic, difficulty, version } = req.query;
    const filter = { ...getTenantFilter(req) };

    if (subject && subject !== "All") filter.subject = subject;
    applyVersionFilter(filter, version, chapter);
    applyTopicFilter(filter, topic);
    if (difficulty && difficulty !== "mixed" && difficulty !== "All") {
      filter.difficulty = difficulty.toLowerCase();
    }

    const count = await Question.countDocuments(filter);
    return res.json({ success: true, count });
  } catch (error) {
    console.error("getAvailableCount error:", error);
    return res.status(500).json({ success: false, message: "Failed to get question count" });
  }
};

// ============================================================================
// 4. CREATE / GENERATE PRACTICE TEST
// ============================================================================
export const generatePracticeTest = async (req, res) => {
  try {
    const {
      subject = "ICT",
      chapter = "All",
      topic = "All",
      questionCount = 20,
      difficulty = "mixed",
      mode = "practice", // 'practice' (immediate feedback) or 'test' (delayed grading)
      durationMinutes = 0,
      title,
      version = "bangla",
    } = req.body;

    const tenantFilter = getTenantFilter(req);
    const filter = { ...tenantFilter };

    if (subject && subject !== "All") filter.subject = subject;
    applyVersionFilter(filter, version, chapter);
    applyTopicFilter(filter, topic);

    const requestedCount = Math.max(5, Math.min(100, parseInt(questionCount) || 20));

    let selectedQuestions = [];

    if (difficulty === "mixed" || !difficulty) {
      // Pick balanced: 40% Easy, 40% Medium, 20% Hard
      const easyTarget = Math.round(requestedCount * 0.4);
      const medTarget = Math.round(requestedCount * 0.4);
      const hardTarget = requestedCount - easyTarget - medTarget;

      const [easy, med, hard] = await Promise.all([
        Question.aggregate([
          { $match: { ...filter, difficulty: "easy" } },
          { $sample: { size: easyTarget } },
        ]),
        Question.aggregate([
          { $match: { ...filter, difficulty: "medium" } },
          { $sample: { size: medTarget } },
        ]),
        Question.aggregate([
          { $match: { ...filter, difficulty: "hard" } },
          { $sample: { size: hardTarget } },
        ]),
      ]);

      selectedQuestions = [...easy, ...med, ...hard];

      // If we don't have enough balanced questions, fill remaining from any difficulty
      if (selectedQuestions.length < requestedCount) {
        const existingIds = selectedQuestions.map((q) => q._id);
        const fill = await Question.aggregate([
          { $match: { ...filter, _id: { $nin: existingIds } } },
          { $sample: { size: requestedCount - selectedQuestions.length } },
        ]);
        selectedQuestions.push(...fill);
      }
    } else {
      filter.difficulty = difficulty.toLowerCase();
      selectedQuestions = await Question.aggregate([
        { $match: filter },
        { $sample: { size: requestedCount } },
      ]);
    }

    if (!selectedQuestions || selectedQuestions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No questions found matching your selected criteria.",
      });
    }

    // Shuffle questions
    selectedQuestions.sort(() => Math.random() - 0.5);

    // Create session record if student is authenticated
    let session = null;
    if (req.user?._id) {
      session = await PracticeSession.create({
        studentId: req.user._id,
        title: title || `${subject} - ${chapter === "All" ? (version === "english" ? "English Medium All Chapters" : "বাংলা মাধ্যম সর্বমোট অধ্যায়") : chapter} Practice`,
        mode,
        subject,
        chapter,
        topic,
        difficulty,
        version: version || "bangla",
        durationMinutes: parseInt(durationMinutes) || 0,
        totalQuestions: selectedQuestions.length,
        questions: selectedQuestions.map((q) => ({
          questionId: q._id,
          correctAnswer: q.correctAnswer,
        })),
      });
    }

    // In 'test' mode, redact correct answers and explanations until submission!
    // In 'practice' mode, keep them available for immediate feedback on option select!
    const clientQuestions = selectedQuestions.map((q) => {
      const item = {
        _id: q._id,
        question: q.question,
        options: q.options,
        subject: q.subject,
        chapter: q.chapter,
        topic: q.topic,
        difficulty: q.difficulty,
        image: q.image || "",
      };
      if (mode === "practice") {
        item.correctAnswer = q.correctAnswer;
        item.explanation = q.explanation || "";
      }
      return item;
    });

    return res.status(201).json({
      success: true,
      sessionId: session?._id || `guest_${Date.now()}`,
      title: session?.title || `${subject} Practice Set`,
      mode,
      durationMinutes: parseInt(durationMinutes) || 0,
      totalQuestions: clientQuestions.length,
      questions: clientQuestions,
    });
  } catch (error) {
    console.error("generatePracticeTest error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate practice test" });
  }
};

// ============================================================================
// 5. SUBMIT PRACTICE TEST
// ============================================================================
export const submitPracticeTest = async (req, res) => {
  try {
    const { sessionId, answers = {}, timeSpentSeconds = 0 } = req.body;

    let session = null;
    if (sessionId && !sessionId.startsWith("guest_") && req.user?._id) {
      session = await PracticeSession.findOne({
        _id: sessionId,
        studentId: req.user._id,
      });
    }

    // Extract all question IDs from answers or session
    let questionIds = [];
    if (session && session.questions.length > 0) {
      questionIds = session.questions.map((q) => q.questionId);
    } else {
      questionIds = Object.keys(answers);
    }

    const realQuestions = await Question.find({ _id: { $in: questionIds } }).lean();
    const questionMap = new Map(realQuestions.map((q) => [q._id.toString(), q]));

    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;

    const evaluatedQuestions = [];
    const sessionQuestions = [];

    for (const q of realQuestions) {
      const qId = q._id.toString();
      const studentAnswer = answers[qId] !== undefined ? answers[qId] : "";
      const isAttempted = Boolean(studentAnswer && studentAnswer.trim());
      const isCorrect = isAttempted && studentAnswer === q.correctAnswer;

      if (!isAttempted) {
        unattemptedCount++;
      } else if (isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
      }

      evaluatedQuestions.push({
        _id: q._id,
        question: q.question,
        options: q.options,
        subject: q.subject,
        chapter: q.chapter,
        topic: q.topic,
        difficulty: q.difficulty,
        image: q.image || "",
        studentAnswer,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || "",
        isCorrect,
      });

      sessionQuestions.push({
        questionId: q._id,
        studentAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
      });
    }

    const score = correctCount; // Standard 1 mark per correct practice question

    if (session) {
      session.questions = sessionQuestions;
      session.score = score;
      session.correctCount = correctCount;
      session.wrongCount = wrongCount;
      session.unattemptedCount = unattemptedCount;
      session.timeSpentSeconds = parseInt(timeSpentSeconds) || 0;
      session.isCompleted = true;
      await session.save();
    }

    return res.json({
      success: true,
      score,
      totalQuestions: evaluatedQuestions.length,
      correctCount,
      wrongCount,
      unattemptedCount,
      accuracy: evaluatedQuestions.length > 0 ? Math.round((correctCount / (correctCount + wrongCount || 1)) * 100) : 0,
      timeSpentSeconds: parseInt(timeSpentSeconds) || 0,
      questions: evaluatedQuestions,
    });
  } catch (error) {
    console.error("submitPracticeTest error:", error);
    return res.status(500).json({ success: false, message: "Failed to submit practice test" });
  }
};

// ============================================================================
// 6. PRACTICE MISTAKES (Wrong Questions Drill)
// ============================================================================
export const getPracticeMistakes = async (req, res) => {
  try {
    const studentId = req.user?._id;
    if (!studentId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    // 1. Gather wrong question IDs from PracticeSessions
    const wrongPracticeSessions = await PracticeSession.find({
      studentId,
      "questions.isCorrect": false,
    }).select("questions");

    const wrongQuestionIds = new Set();
    wrongPracticeSessions.forEach((sess) => {
      sess.questions.forEach((q) => {
        if (q.studentAnswer && !q.isCorrect) {
          wrongQuestionIds.add(q.questionId.toString());
        }
      });
    });

    // 2. Also inspect regular Exam Submissions to find missed questions
    const submissions = await Submission.find({ studentId }).select("answers").lean();
    for (const sub of submissions) {
      if (sub.answers && typeof sub.answers === "object") {
        const attemptedIds = Object.keys(sub.answers);
        if (attemptedIds.length > 0) {
          const relatedQuestions = await Question.find({ _id: { $in: attemptedIds } }).select("_id correctAnswer").lean();
          relatedQuestions.forEach((rq) => {
            const studentAns = sub.answers[rq._id.toString()];
            if (studentAns && studentAns !== rq.correctAnswer) {
              wrongQuestionIds.add(rq._id.toString());
            }
          });
        }
      }
    }

    const wrongList = Array.from(wrongQuestionIds);

    const { version } = req.query;
    const mistakeFilter = {
      _id: { $in: wrongList },
      ...getTenantFilter(req),
    };
    if (version === "english") {
      mistakeFilter.chapter = { $in: ENGLISH_CHAPTERS };
    } else if (version === "bangla") {
      mistakeFilter.chapter = { $nin: ENGLISH_CHAPTERS };
    }

    const questions = await Question.find(mistakeFilter).lean();

    return res.json({
      success: true,
      totalMistakes: questions.length,
      questions,
    });
  } catch (error) {
    console.error("getPracticeMistakes error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch mistakes" });
  }
};

// ============================================================================
// 7. BOOKMARKS (Saved Questions)
// ============================================================================
export const getBookmarks = async (req, res) => {
  try {
    const studentId = req.user?._id;
    const { version } = req.query;
    if (!studentId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const questionMatch = { ...getTenantFilter(req) };
    if (version === "english") {
      questionMatch.chapter = { $in: ENGLISH_CHAPTERS };
    } else if (version === "bangla") {
      questionMatch.chapter = { $nin: ENGLISH_CHAPTERS };
    }

    const bookmarks = await Bookmark.find({ studentId })
      .populate({
        path: "questionId",
        match: questionMatch,
      })
      .sort({ createdAt: -1 })
      .lean();

    const validBookmarks = bookmarks
      .filter((b) => b.questionId)
      .map((b) => ({
        bookmarkId: b._id,
        savedAt: b.createdAt,
        question: b.questionId,
      }));

    return res.json({
      success: true,
      total: validBookmarks.length,
      bookmarks: validBookmarks,
    });
  } catch (error) {
    console.error("getBookmarks error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch bookmarks" });
  }
};

export const toggleBookmark = async (req, res) => {
  try {
    const studentId = req.user?._id;
    const { questionId } = req.params;

    if (!studentId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const existing = await Bookmark.findOne({ studentId, questionId });
    if (existing) {
      await Bookmark.deleteOne({ _id: existing._id });
      return res.json({ success: true, isBookmarked: false, message: "Question removed from bookmarks" });
    }

    await Bookmark.create({ studentId, questionId });
    return res.json({ success: true, isBookmarked: true, message: "Question saved to bookmarks" });
  } catch (error) {
    console.error("toggleBookmark error:", error);
    return res.status(500).json({ success: false, message: "Failed to toggle bookmark" });
  }
};

// ============================================================================
// 8. PRACTICE HISTORY & ANALYTICS
// ============================================================================
export const getPracticeHistory = async (req, res) => {
  try {
    const studentId = req.user?._id;
    if (!studentId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const sessions = await PracticeSession.find({ studentId, isCompleted: true })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    return res.json({
      success: true,
      count: sessions.length,
      sessions,
    });
  } catch (error) {
    console.error("getPracticeHistory error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch practice history" });
  }
};

export const getPracticeAnalytics = async (req, res) => {
  try {
    const studentId = req.user?._id;
    if (!studentId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const sessions = await PracticeSession.find({ studentId, isCompleted: true }).lean();

    let totalPracticeQuestions = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalTimeSpent = 0;

    const chapterStats = {};

    sessions.forEach((sess) => {
      totalPracticeQuestions += sess.totalQuestions || 0;
      totalCorrect += sess.correctCount || 0;
      totalWrong += sess.wrongCount || 0;
      totalTimeSpent += sess.timeSpentSeconds || 0;

      const ch = sess.chapter || "Mixed";
      if (!chapterStats[ch]) {
        chapterStats[ch] = { chapter: ch, total: 0, correct: 0 };
      }
      chapterStats[ch].total += sess.totalQuestions || 0;
      chapterStats[ch].correct += sess.correctCount || 0;
    });

    const chapterPerformance = Object.values(chapterStats).map((cs) => ({
      ...cs,
      accuracy: cs.total > 0 ? Math.round((cs.correct / cs.total) * 100) : 0,
    }));

    return res.json({
      success: true,
      totalSessions: sessions.length,
      totalPracticeQuestions,
      totalCorrect,
      totalWrong,
      overallAccuracy: (totalCorrect + totalWrong) > 0 ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : 0,
      totalTimeSpentMinutes: Math.round(totalTimeSpent / 60),
      chapterPerformance,
    });
  } catch (error) {
    console.error("getPracticeAnalytics error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch practice analytics" });
  }
};
