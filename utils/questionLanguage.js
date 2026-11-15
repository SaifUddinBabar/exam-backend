// Per-question language rules, shared by the API filters and the audit.
// The frontend mirrors these in src/lib/questionLanguage.js.
//
// A question can be shown in Bengali when it has dedicated Bengali fields
// (questionBn) or its base text/options contain Bengali script, or it is
// language-neutral (no words at all, e.g. "(1011)₂ = ?").
// It can be shown in English when it has questionEn, or its base text and
// options contain no Bengali script.
// The other language is never used as a silent fallback.

export const BN_RX = /[ঀ-৿]/;
const LATIN_WORD_RX = /[A-Za-z]{3,}/;

const has = (v) => typeof v === "string" && v.trim() !== "";
const anyBn = (q) => BN_RX.test(q.question || "") || (q.options || []).some((o) => BN_RX.test(o || ""));
const anyLatinWord = (q) => LATIN_WORD_RX.test(q.question || "") || (q.options || []).some((o) => LATIN_WORD_RX.test(o || ""));

export function availableLanguages(q) {
  const bnBase = anyBn(q) || !anyLatinWord(q);
  const enBase = !anyBn(q);
  return { bn: has(q.questionBn) || bnBase, en: has(q.questionEn) || enBase };
}

/** Mongo filter for questions displayable in `version` ("bangla" | "english"). */
export function languageFilter(version) {
  const BN = /[ঀ-৿]/;
  if (version === "bangla") {
    return {
      $or: [
        { questionBn: { $gt: "" } },
        { question: BN },
        { options: BN },
        { $and: [{ question: { $not: /[A-Za-z]{3,}/ } }, { options: { $not: /[A-Za-z]{3,}/ } }] },
      ],
    };
  }
  if (version === "english") {
    return { $or: [{ questionEn: { $gt: "" } }, { $and: [{ question: { $not: BN } }, { options: { $not: BN } }] }] };
  }
  return null;
}

/**
 * Audit classification (never used to change data):
 *  bilingual   – has both questionBn and questionEn
 *  bn          – Bengali (technical English terms inside Bengali text are normal)
 *  en          – English only
 *  neutral     – no words in either script (numbers / symbols / code)
 *  mixed       – Bengali text that also carries a full English sentence (≥6 consecutive
 *                English words) or Bengali question with English-only options, or vice versa
 *  unavailable – no usable text
 */
export function classifyLanguage(q) {
  if (has(q.questionBn) && has(q.questionEn)) return "bilingual";
  const text = q.question || "";
  if (!text.trim() && !has(q.questionBn) && !has(q.questionEn)) return "unavailable";
  const qBn = BN_RX.test(text);
  const opts = (q.options || []).filter(has);
  const optBn = opts.filter((o) => BN_RX.test(o)).length;
  // Bengali questions with English technical options ("GPRS-এর পূর্ণরূপ কী?") are normal
  // Bengali-medium content. "Mixed" means the question text itself carries a full
  // English sentence next to Bengali, or an English question has Bengali options.
  const longEnglishRun = /(?:\b[A-Za-z][A-Za-z'’-]*\b[\s,]+){5,}\b[A-Za-z][A-Za-z'’-]*\b/.test(text);
  if (qBn && longEnglishRun) return "mixed";
  if (!qBn && optBn > 0 && LATIN_WORD_RX.test(text)) return "mixed";
  if (qBn || optBn) return "bn";
  if (anyLatinWord(q)) return "en";
  return "neutral";
}
