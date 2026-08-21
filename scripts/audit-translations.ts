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
assert.equal(keys.length, 111, "message-key count changed; review every locale before accepting it");

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

  assert.ok(
    messages.reviewIntervalsDesc.includes("1, 3, 7, 14"),
    `${locale}.reviewIntervalsDesc must show the exact ASCII comma-separated format accepted by the parser`,
  );
}

const forbiddenByLocale: Record<string, RegExp[]> = {
  am: [/ግምገማ/],
  ar: [/تخفيض السعر/, /بسبب \{date\}/, /خط الدراسة/, /تقييمات \{count\}/],
  be: [/агляд/i, /разгляд/i],
  bn: [/পর্যালোচনা/, /রিভিউ/],
  ca: [/resseny/i, /comentari/i],
  cs: [/recenz/i],
  da: [/anmeld/i],
  de: [/Rezension/i, /Bewertung/i, /Studiengang/i],
  el: [/κριτικ/i, /αξιολόγ/i],
  es: [/reseñ/i],
  fa: [/نظرات/, /بازبینی/],
  fi: [/setelit/i, /arvostel/i],
  fr: [/\bDue \{date\}/, /\bcritiques?\b/i, /\bavis\b/i],
  ga: [/léirmheas/i],
  he: [/ביקור/, /סקיר/],
  hu: [/vélem/i, /felülvizsgál/i, /áttekint/i],
  id: [/penurunan harga/i, /ulasan/i, /tinjau/i, /peninjau/i, /\breview\b/i],
  ka: [/მიმოხილ/i, /განხილ/i],
  lv: [/atsauks/i, /pārskat/i, /apskat/i],
  ms: [/ulasan/i, /semakan/i],
  ne: [/समीक्षा/],
  nl: [/Vanwege \{date\}/i, /Recensie/i, /Beoordeling/i],
  no: [/anmeld/i, /vurder/i],
  pl: [/Ze względu na \{date\}/i, /Recenzja/i, /Pasja studiów/i],
  pt: [/avalia/i],
  "pt-BR": [/avalia/i],
  ro: [/Datorită \{date\}/i, /Dâră de studiu/i],
  ru: [/Учебная полоса/i, /Срок оплаты/i, /\bотзыв/i],
  sa: [/समीक्षा/],
  sk: [/recenz/i],
  sq: [/koment/i, /rishik/i, /shqyrt/i],
  sr: [/рецензи/i, /преглед/i],
  sv: [/\brecension/i, /\bomdöme/i],
  th: [/รีวิว/, /บทวิจารณ์/, /ความเห็น/],
  tr: [/yorum/i, /değerlend/i, /incele/i],
  uk: [/купюр/i, /відгук/i, /реценз/i, /огляд/i, /перегляд/i],
  uz: [/sharh/i, /ko['‘ʻ’]rib/i],
  vi: [/đánh giá/i, /xem lại/i],
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
  "openMarkdownToSeeProgress",
  "todayReview",
  "nextReview",
  "lastReview",
  "reviewIntervals",
  "undoReviewCompletion",
  "noReviewScheduleYet",
  "startWithDefaultIntervals",
  "startReviewSchedule",
  "overdueReviews",
  "notesDueToday",
  "allReviewsDoneToday",
  "newReviewsAppear",
  "noOverdueReviews",
  "schedulesOnTime",
  "dueDateAndStage",
  "reviewCompletedForNote",
  "statsBasedOnCompletions",
  "reviewsLast7Days",
  "totalReviews",
  "scheduledNotes",
  "openTodayReviewsA11y",
  "openStatusA11y",
  "todayReviewList",
  "currentReviewStatus",
  "commandStartRestart",
  "commandMarkReviewed",
  "commandUndo",
  "commandSnooze",
  "commandOpenToday",
  "commandOpenStatus",
  "commandOpenOverdue",
  "scheduleStartedNotice",
  "noActiveSchedule",
  "reviewRecorded",
  "allStagesCompleted",
  "reviewRecordedNext",
  "reviewPostponed",
  "noUndoRecord",
  "cannotUndoChanged",
  "reviewUndoNotice",
  "noNoteStatusBar",
  "reviewStatusBar",
  "reviewAllCompleteStatus",
  "reviewPausedStatus",
  "reviewNoScheduleStatus",
  "cannotOpenStatusPanel",
  "dueNotification",
  "migrationNotice",
  "reviewIntervalsSetting",
  "reviewIntervalsDesc",
  "notificationTimeDesc",
  "notifyOnStartupDesc",
];

const canonicalStudyTerms: Record<string, RegExp> = {
  am: /ክለሳ/,
  ar: /مراجع/,
  be: /паўтар|паўтор/i,
  bn: /পুনরাবৃত্তি/,
  ca: /repàs|repass/i,
  cs: /opakov/i,
  da: /repet/i,
  de: /Wiederhol/i,
  el: /επαν/i,
  es: /repas/i,
  fa: /مرور/,
  fi: /kerta|kerrat/i,
  fr: /révis/i,
  ga: /athbhreith/i,
  he: /חזר|חזור/,
  hu: /ismét/i,
  id: /pengulang|ulangi/i,
  it: /ripass/i,
  ja: /復習/,
  ka: /გამეორ|გაიმეორ/,
  kh: /រំលឹកមេរៀន/,
  ko: /복습/,
  lv: /atkārto/i,
  ms: /pengulang|ulang kaji/i,
  ne: /पुनरावृत्ति/,
  nl: /herha/i,
  no: /repet|gjent/i,
  pl: /powtór/i,
  pt: /revis|rever/i,
  "pt-BR": /revis|revise/i,
  ro: /recapitul/i,
  ru: /повтор/i,
  sa: /पुनरावृत्त/,
  sk: /opakov/i,
  sq: /përsërit/i,
  sr: /понов|понав/i,
  sv: /repet/i,
  th: /ทบทวน/,
  tr: /tekrar/i,
  uk: /повтор/i,
  uz: /takror/i,
  vi: /ôn tập/i,
  zh: /复习/,
  "zh-TW": /複習/,
};

assert.deepEqual(
  Object.keys(canonicalStudyTerms).sort(),
  [...translatedLocales].sort(),
  "every translated locale must define its canonical study-review term",
);

const terminologyFailures: string[] = [];

for (const [locale, term] of Object.entries(canonicalStudyTerms)) {
  const messages = TRANSLATIONS[locale];
  assert.ok(messages, `missing ${locale} translations`);
  for (const key of studyReviewKeys) {
    if (!term.test(messages[key])) {
      terminologyFailures.push(`${locale}.${key}`);
    }
  }
}

assert.equal(
  terminologyFailures.length,
  0,
  `messages without the locale's canonical study-review term:\n${terminologyFailures.join("\n")}`,
);

for (const locale of translatedLocales) {
  const messages = TRANSLATIONS[locale];
  assert.ok(messages, `missing ${locale} translations`);
  for (const key of ["noMarkdownNoteOpen", "openMarkdownToSeeProgress", "openMarkdownFirst"] as const) {
    assert.match(messages[key], /Markdown/, `${locale}.${key} translated the Markdown brand name`);
  }
}

console.log(`Translation audit passed: ${translatedLocales.length} locales × ${keys.length} messages = ${translatedLocales.length * keys.length} strings.`);
