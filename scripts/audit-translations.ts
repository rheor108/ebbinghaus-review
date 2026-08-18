import assert from "node:assert/strict";
import { SUPPORTED_LOCALES } from "../src/i18n";
import { EN_MESSAGES, type MessageKey } from "../src/messages";
import { TRANSLATIONS } from "../src/translations";

const keys = Object.keys(EN_MESSAGES) as MessageKey[];
const translatedLocales = SUPPORTED_LOCALES.filter(
  (locale) => locale !== "en" && locale !== "en-GB",
);

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

assert.equal(SUPPORTED_LOCALES.length, 46, "expected 46 supported Obsidian locales");
assert.equal(translatedLocales.length, 44, "expected 44 bundled translation dictionaries");
assert.equal(keys.length, 107, "message-key count changed; review every locale before accepting it");

for (const locale of translatedLocales) {
  const messages = TRANSLATIONS[locale];
  assert.ok(messages, `missing ${locale} translations`);
  assert.deepEqual(Object.keys(messages).sort(), [...keys].sort(), `${locale} key mismatch`);

  for (const key of keys) {
    const value = messages[key];
    assert.equal(value, value.trim(), `${locale}.${key} has surrounding whitespace`);
    assert.ok(value.length > 0, `${locale}.${key} is empty`);
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), `${locale}.${key} has a control character`);
    assert.deepEqual(
      placeholders(value),
      placeholders(EN_MESSAGES[key]),
      `${locale}.${key} placeholder mismatch`,
    );
  }
}

const forbiddenByLocale: Record<string, RegExp[]> = {
  ar: [/تخفيض السعر/, /بسبب \{date\}/, /خط الدراسة/, /تقييمات \{count\}/],
  de: [/Rezension/i, /Bewertung/i, /Studiengang/i],
  fi: [/setelit/i],
  fr: [/\bDue \{date\}/, /\bcritiques?\b/i, /\bavis\b/i],
  id: [/penurunan harga/i],
  nl: [/Vanwege \{date\}/i, /Recensie/i, /Beoordeling/i],
  pl: [/Ze względu na \{date\}/i, /Recenzja/i, /Pasja studiów/i],
  ro: [/Datorită \{date\}/i, /Dâră de studiu/i],
  ru: [/Учебная полоса/i, /Срок оплаты/i, /\bотзыв/i],
  uk: [/купюр/i],
  zh: [/票据/, /评价/, /审阅/],
  "zh-TW": [/票據/, /評價/, /審閱/],
};

for (const [locale, patterns] of Object.entries(forbiddenByLocale)) {
  const corpus = Object.values(TRANSLATIONS[locale] ?? {}).join("\n");
  for (const pattern of patterns) {
    assert.ok(!pattern.test(corpus), `${locale} contains known semantic regression: ${pattern}`);
  }
}

const studyReviewKeys: MessageKey[] = [
  "reviewStatus",
  "todayReview",
  "nextReview",
  "lastReview",
  "reviewIntervals",
  "noReviewScheduleYet",
  "startReviewSchedule",
  "overdueReviews",
  "noOverdueReviews",
  "dueDateAndStage",
  "reviewsLast7Days",
  "totalReviews",
  "todayReviewList",
  "currentReviewStatus",
  "reviewNoScheduleStatus",
  "reviewIntervalsSetting",
];

const canonicalStudyTerms: Record<string, RegExp> = {
  de: /Wiederhol/i,
  fr: /révis/i,
  it: /ripass/i,
  ja: /復習/,
  nl: /herhal/i,
  pl: /powtór/i,
  ru: /повтор/i,
  zh: /复习/,
  "zh-TW": /複習/,
};

for (const [locale, term] of Object.entries(canonicalStudyTerms)) {
  const messages = TRANSLATIONS[locale];
  assert.ok(messages, `missing ${locale} translations`);
  for (const key of studyReviewKeys) {
    assert.match(messages[key], term, `${locale}.${key} does not use the canonical study-review term`);
  }
}

for (const locale of ["am", "ar", "bn", "id", "ka"]) {
  const messages = TRANSLATIONS[locale];
  assert.ok(messages, `missing ${locale} translations`);
  for (const key of ["noMarkdownNoteOpen", "openMarkdownToSeeProgress", "openMarkdownFirst"] as const) {
    assert.match(messages[key], /Markdown/, `${locale}.${key} translated the Markdown brand name`);
  }
}

console.log(`Translation audit passed: ${translatedLocales.length} locales × ${keys.length} messages = ${translatedLocales.length * keys.length} strings.`);
