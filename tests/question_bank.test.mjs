// Question Bank regression across all six HSC ICT chapters, on the read-only production
// snapshot (isolated test database). Every assertion compares two independent paths
// (topic-count endpoint vs. bank listing vs. the resolver) so a broken filter cannot
// pass by returning the same wrong number twice. Non-empty guards stop "0 = 0" passes.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { startApp, stopApp, makeUser } from "./harness.mjs";
import { ALL_CHAPTERS, resolveQuestionTopic } from "../utils/syllabusTopics.js";

let app, teacher, student;
const enc = encodeURIComponent;
const get = (url, who = teacher) => request(app).get(url).set(who.auth);
const bankTotal = async (q) => {
  const r = await get(`/api/practice/question-bank?limit=1&${q}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.total;
};

before(async () => {
  app = await startApp();
  teacher = await makeUser("tutor");
  student = await makeUser("student");
});
after(stopApp);

describe("chapter spellings (unit)", () => {
  test("every stored form of a Bengali chapter name is queried", async () => {
    const { spellings } = await import("../utils/syllabusTopics.js");
    const name = "অধ্যায় ৫: প্রোগ্রামিং ভাষা";
    const forms = spellings(name);
    const decomposed = name.normalize("NFD");
    // composed vowel signs (NFC) + precomposed য় (U+09DF): the form most production rows use
    const mixed = name.normalize("NFC").replace(/য়/g, "য়");
    for (const f of [decomposed, name.normalize("NFC"), mixed]) assert.ok(forms.includes(f), [...f].map((c) => c.codePointAt(0).toString(16)).join(" "));
  });
});

describe("question bank — every standard chapter", () => {
  let expected; // chapterId → number of visible questions, computed independently with the resolver
  before(async () => {
    const qs = await mongoose.model("Question").find({ hidden: { $ne: true }, $or: [{ isPublic: true }, { organizationId: null }] }).select("chapter topic question options boardName").lean();
    expected = {};
    for (const q of qs) {
      const r = resolveQuestionTopic(q);
      if (r.chapterId) expected[r.chapterId] = (expected[r.chapterId] || 0) + 1;
    }
  });

  for (const ch of ALL_CHAPTERS) {
    describe(ch.chapterName, () => {
      let counts;
      before(async () => {
        const r = await get(`/api/practice/topic-counts?chapter=${enc(ch.chapterName)}`);
        assert.equal(r.status, 200);
        counts = r.body;
      });

      test("chapter total matches the resolver, the bank listing and every naming variant", async () => {
        assert.ok(counts.stats.total > 0, "chapter must not be empty");
        assert.equal(counts.stats.total, expected[ch.chapterId]);
        assert.equal(await bankTotal(`chapter=${enc(ch.chapterName)}`), counts.stats.total);
        for (const alias of ch.chapterAliases) assert.equal(await bankTotal(`chapter=${enc(alias)}`), counts.stats.total, `alias "${alias}"`);
      });

      test("topics + Uncategorised add up exactly to the chapter (no double counting)", () => {
        const sum = Object.values(counts.topicCounts).reduce((a, n) => a + n, 0) + counts.noTopicCount;
        assert.equal(sum, counts.stats.total);
        assert.ok(Object.values(counts.topicCounts).filter((n) => n > 0).length >= 2, "at least two populated topics");
        assert.deepEqual(Object.keys(counts.topicCounts), counts.standardTopics, "topics in syllabus order");
      });

      test("each topic filter (and Uncategorised) returns exactly its count", async () => {
        for (const [t, n] of Object.entries(counts.topicCounts)) {
          assert.equal(await bankTotal(`chapter=${enc(ch.chapterName)}&topic=${enc(t)}`), n, t);
        }
        assert.equal(await bankTotal(`chapter=${enc(ch.chapterName)}&topic=__none__`), counts.noTopicCount, "Uncategorised");
      });

      test("difficulty counts add up and each difficulty filter matches", async () => {
        const s = counts.stats;
        assert.equal(s.easy + s.medium + s.hard + s.unclassified, s.total);
        for (const d of ["easy", "medium", "hard"]) assert.equal(await bankTotal(`chapter=${enc(ch.chapterName)}&difficulty=${d}`), s[d], d);
      });

      test("paging through the whole chapter returns every question exactly once", async () => {
        const seen = new Set();
        let fetched = 0;
        for (let page = 1; page < 200; page++) {
          const r = await get(`/api/practice/question-bank?limit=50&page=${page}&chapter=${enc(ch.chapterName)}`);
          r.body.questions.forEach((q) => seen.add(String(q._id)));
          fetched += r.body.questions.length;
          if (page >= r.body.totalPages) break;
        }
        assert.equal(fetched, counts.stats.total);
        assert.equal(seen.size, counts.stats.total, "a question appeared on two pages");
      });

      test("search finds a question of this chapter by its own text", async () => {
        const r = await get(`/api/practice/question-bank?limit=1&chapter=${enc(ch.chapterName)}`);
        const q = r.body.questions[0];
        const needle = String(q.question).replace(/\s+/g, " ").trim().slice(0, 25);
        const s = await get(`/api/practice/question-bank?limit=50&chapter=${enc(ch.chapterName)}&search=${enc(needle)}`);
        assert.ok(s.body.questions.some((x) => String(x._id) === String(q._id)), `search for "${needle}"`);
      });

      test("language views never mix languages", async () => {
        const BN = /[ঀ-৿]/;
        const en = await get(`/api/practice/question-bank?limit=50&chapter=${enc(ch.chapterName)}&version=english`);
        for (const q of en.body.questions) assert.ok(q.questionEn || (!BN.test(q.question) && !(q.options || []).some((o) => BN.test(o))), "Bengali question in the English view");
        const bn = await bankTotal(`chapter=${enc(ch.chapterName)}&version=bangla`);
        assert.ok(bn > 0 && bn <= counts.stats.total);
      });
    });
  }

  test("board questions are counted by board name", async () => {
    const boards = await mongoose.model("Question").distinct("boardName", { questionType: "board", hidden: { $ne: true } });
    const named = boards.filter(Boolean);
    assert.ok(named.length > 0);
    for (const b of named.slice(0, 5)) {
      const n = await mongoose.model("Question").countDocuments({ questionType: "board", boardName: b, hidden: { $ne: true }, $or: [{ isPublic: true }, { organizationId: null }] });
      assert.equal(await bankTotal(`boardName=${enc(b)}`), n, b);
    }
  });

  test("students cannot list the bank; they see topic names and counts only", async () => {
    assert.equal((await get(`/api/practice/question-bank?limit=1`, student)).status, 403);
    const tc = await get(`/api/practice/topic-counts?chapter=${enc(ALL_CHAPTERS[1].chapterName)}`, student);
    assert.equal(tc.status, 200);
    assert.equal(JSON.stringify(tc.body).includes("correctAnswer"), false);
  });
});
