// Read-time checks for whether a question can stand on its own in timed play (battles,
// daily tournament). Nothing is written to the database: questions that fail are only
// skipped by the pickers and listed for teacher review.
//
// A question "needs context" when its text points at something that is not part of the
// question itself — a stimulus passage (উদ্দীপক / অনুচ্ছেদ), a figure or table (চিত্র / ছক /
// figure), or "the said …" (উক্ত) — and that thing is neither embedded in the text nor
// attached as an image. Such questions are fine in a printed paper next to their passage,
// but unanswerable when shuffled into a battle.

const hasImage = (q) => (Array.isArray(q.image) ? q.image.some(Boolean) : Boolean(q.image)) || (Array.isArray(q.images) && q.images.some(Boolean));

const STIMULUS_REF = /উদ্দীপক|অনুচ্ছেদ|passage|stimulus/i;
// Referential phrasing only ("নিচের চিত্র", "চিত্রটি", "চিত্রে প্রদর্শিত", "shown in the figure"),
// not compounds such as প্রবাহচিত্র (flowchart), চিত্রায়ন, "চিত্র আপলোড" or "figure of speech".
const FIGURE_REF = /(?<![ঀ-৿])(?:চিত্রটি|চিত্রে(?:র)?\s*(?:দেখানো|প্রদর্শিত|উল্লিখিত|বর্ণিত|আলোকে)|চিত্রানুযায়ী|চিত্র\s*দেখ|ছকটি|ছকে|সারণিটি|টেবিলটি)|(?:shown|given) in (?:the )?(?:figure|diagram|table)|(?:above|following|given|below) (?:circuit|figure|table|diagram)|the (?:figure|diagram) (?:above|below)/i;
const ABOVE_REF = /উপরের|উপরোক্ত|নিচের\s+(?:চিত্র|ছক|সার্কিট|বর্তনী|লজিক\s*(?:চিত্র|সার্কিট|বর্তনী)|প্রোগ্রাম|কোড)/;
const SAID_REF = /(?:^|\s)উক্ত(?:\s|$)/;
const DEMONSTRATIVE_START = /^\s*(?:এই|ঐ|ওই|সেই)\s/;

// The passage is part of the question text: "উদ্দীপক: …", "…পড়ো …: <passage>", or a long
// parenthetical summary "(<passage>)".
function embedsStimulus(raw) {
  // Compare without the nukta so both stored spellings of ড়/য় match (see utils/syllabusTopics.js).
  const text = raw.normalize("NFD").replace(/়/g, "");
  if (/উদ্দীপক(?:টি)?\s*[:ঃ]/.test(text)) return true;
  const afterColon = text.split(/[:ঃ]/).slice(1).join(":").trim();
  if (/পড(?:ো|ুন|ে)/.test(text) && afterColon.length >= 40) return true;
  const paren = text.match(/\(([^()]{30,})\)/);
  return Boolean(paren);
}

/**
 * @returns {string[]} reason codes; empty when the question is playable on its own.
 *   needs_stimulus · needs_figure · refers_to_previous · duplicate_options · too_few_options · answer_not_in_options · garbled_text
 */
export function playabilityIssues(q) {
  const text = String(q.question || "").replace(/\s+/g, " ").trim();
  const issues = [];
  const opts = (q.options || []).map((o) => String(o ?? "").trim()).filter(Boolean);
  if (opts.length < 2) issues.push("too_few_options");
  if (new Set(opts).size < opts.length) issues.push("duplicate_options");
  if (q.correctAnswer != null && opts.length && !opts.includes(String(q.correctAnswer).trim())) issues.push("answer_not_in_options");
  if (/�/.test(text) || (q.options || []).some((o) => /�/.test(String(o ?? "")))) issues.push("garbled_text");
  const img = hasImage(q);
  const embedded = embedsStimulus(text);
  if (STIMULUS_REF.test(text) && !embedded && !img) issues.push("needs_stimulus");
  if ((FIGURE_REF.test(text) || ABOVE_REF.test(text)) && !img && !embedded) issues.push("needs_figure");
  if (!embedded && !img && (SAID_REF.test(text) || (DEMONSTRATIVE_START.test(text) && text.length < 80))) issues.push("refers_to_previous");
  return [...new Set(issues)];
}

export const isPlayable = (q) => playabilityIssues(q).length === 0;

export const ISSUE_LABELS = {
  needs_stimulus: "Refers to a passage (উদ্দীপক) that is not included",
  needs_figure: "Refers to a figure or table that is not attached",
  refers_to_previous: "Refers to something from a previous question (উক্ত / এই …)",
  duplicate_options: "Two or more options are identical",
  too_few_options: "Fewer than two options",
  answer_not_in_options: "The correct answer is not one of the options",
  garbled_text: "Contains corrupted characters (�)",
};
