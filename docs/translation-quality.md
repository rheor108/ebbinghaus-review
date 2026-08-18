# Translation quality and review status

[English](../README.md) · [한국어](../README.ko.md)

Last audited: 2026-08-19

Ebbinghaus Review bundles 107 UI messages for each of 44 translated locales. English and British English use the English source dictionary, bringing the total supported Obsidian locales to 46.

## What the audit checks

`npm run audit:i18n` validates every bundled message for:

- complete and exact message-key coverage;
- non-empty, trimmed text without control characters;
- preservation of runtime placeholders such as `{date}` and `{count}`;
- known semantic regressions, including translations of “note” as money, “due” as debt or causation, and “review” as a product rating;
- consistent spaced-repetition terminology in German, French, Italian, Dutch, Polish, Russian, Japanese, Simplified Chinese, and Traditional Chinese;
- preservation of the `Markdown` brand in locales where the official Obsidian app uses that spelling.

The audit currently covers **44 locales × 107 messages = 4,708 translated strings**. It runs as part of `npm run check`.

## Review status

| Status | Locales | Meaning |
|---|---|---|
| Source reviewed | `en`, `en-GB` | Maintained from the English source dictionary. |
| Manual editorial review complete | `ko` | Every message was reviewed for meaning, consistency, and natural Korean UI wording. |
| Terminology sweep complete; native review requested | `de`, `fr`, `it`, `ja`, `nl`, `pl`, `ru`, `zh`, `zh-TW` | High-risk study-review terminology was rewritten consistently and all automated checks pass. A native speaker has not certified the complete dictionary. |
| Semantic corrections complete; native review requested | `am`, `ar`, `be`, `bn`, `ca`, `cs`, `da`, `el`, `es`, `fa`, `fi`, `ga`, `he`, `hu`, `id`, `ka`, `kh`, `lv`, `ms`, `ne`, `no`, `pt`, `pt-BR`, `ro`, `sa`, `sk`, `sq`, `sr`, `sv`, `th`, `tr`, `uk`, `uz`, `vi` | Full structural QA and targeted semantic corrections pass. Native editorial review is still required. |

“Native review requested” is intentional: automated checks and back-translation can detect many meaning changes, but they cannot certify natural grammar, tone, pluralization, or regional preference.

## How to review a locale

1. Open `src/messages.ts` for the English meaning and the matching `src/locales/<locale>.ts` file for the locale.
2. Review all 107 messages in the context of spaced-repetition study, not product reviews or general document inspection.
3. Keep every placeholder unchanged.
4. Keep `Obsidian` as the product name and follow the official Obsidian locale’s convention for `Markdown` and “note.”
5. Run `npm run audit:i18n` and `npm run check` before submitting changes.

Native-speaker corrections are welcome. A locale should move to “manual editorial review complete” only after all 107 messages have been reviewed in context.
