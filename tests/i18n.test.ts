import assert from "node:assert/strict";
import test from "node:test";
import { createI18n, resolveLocale, SUPPORTED_LOCALES } from "../src/i18n";
import { EN_MESSAGES, type MessageKey } from "../src/messages";
import { TRANSLATIONS } from "../src/translations";

const keys = Object.keys(EN_MESSAGES) as MessageKey[];

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

test("supports every completed Obsidian app locale", () => {
  assert.equal(SUPPORTED_LOCALES.length, 46);
  for (const locale of SUPPORTED_LOCALES) {
    if (locale === "en" || locale === "en-GB") continue;
    const messages = TRANSLATIONS[locale];
    assert.ok(messages, `missing ${locale} translations`);
    assert.deepEqual(Object.keys(messages).sort(), [...keys].sort(), `${locale} key mismatch`);
    for (const key of keys) {
      assert.ok(messages[key].trim().length > 0, `${locale}.${key} is empty`);
      assert.deepEqual(
        placeholders(messages[key]),
        placeholders(EN_MESSAGES[key]),
        `${locale}.${key} placeholder mismatch`,
      );
    }
  }
});

test("resolves exact, normalized, and base locales with an English fallback", () => {
  assert.equal(resolveLocale("pt-BR"), "pt-BR");
  assert.equal(resolveLocale("pt_BR"), "pt-BR");
  assert.equal(resolveLocale("zh-tw"), "zh-TW");
  assert.equal(resolveLocale("fr-CA"), "fr");
  assert.equal(resolveLocale("unknown"), "en");
});

test("formats translated messages and falls back to English", () => {
  assert.equal(createI18n("ko").t("inDays", { count: 3 }), "3일 후");
  assert.equal(createI18n("unknown").t("reviewStatus"), "Review status");
  assert.doesNotThrow(() => createI18n("kh").formatWeekday(new Date(2026, 7, 18)));
});
