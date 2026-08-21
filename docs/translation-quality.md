# Translation quality and review status

[English](../README.md) · [한국어](../README.ko.md)

Last audited: 2026-08-21

Ebbinghaus Review bundles 110 UI messages for each of 44 translated locales. English and British English use the English source dictionary, bringing the total supported Obsidian locales to 46.

## What the audit checks

`npm run audit:i18n` validates every bundled message for:

- complete and exact message-key coverage;
- non-empty, trimmed text without control characters;
- preservation of runtime placeholders such as `{date}` and `{count}`;
- known semantic regressions, including translations of “note” as money, “due” as debt or causation, and “review” as a product rating;
- consistent spaced-repetition terminology across all 44 translated locales for the highest-risk dashboard, schedule, statistics, status, and notification messages;
- preservation of the `Markdown` brand in every translated locale;
- the exact ASCII comma-separated interval example (`1, 3, 7, 14`) accepted by the settings parser.

The audit currently covers **44 locales × 110 messages = 4,840 translated strings**. It runs as part of `npm run check`.

## Review status

| Status | Locales | Meaning |
|---|---|---|
| Source reviewed | `en`, `en-GB` | Maintained from the English source dictionary. |
| Manual editorial review complete | `ko` | Every message was reviewed for meaning, consistency, and natural Korean UI wording. |
| Cross-locale terminology sweep complete; native review requested | `am`, `ar`, `be`, `bn`, `ca`, `cs`, `da`, `de`, `el`, `es`, `fa`, `fi`, `fr`, `ga`, `he`, `hu`, `id`, `it`, `ja`, `ka`, `kh`, `lv`, `ms`, `ne`, `nl`, `no`, `pl`, `pt`, `pt-BR`, `ro`, `ru`, `sa`, `sk`, `sq`, `sr`, `sv`, `th`, `tr`, `uk`, `uz`, `vi`, `zh`, `zh-TW` | Full structural QA and a fresh semantic terminology sweep pass. Product-review wording and other known high-impact mistranslations were corrected, but a native speaker has not certified every sentence. |

“Native review requested” is intentional: automated checks and back-translation can detect many meaning changes, but they cannot certify natural grammar, tone, pluralization, or regional preference.

## How to review a locale

1. Open `src/messages.ts` for the English meaning and the matching `src/locales/<locale>.ts` file for the locale.
2. Review all 110 messages in the context of spaced-repetition study, not product reviews or general document inspection. Use the locale's established study-repetition term consistently.
3. Keep every placeholder unchanged.
4. Keep `Obsidian` and `Markdown` as product/format names, and follow the official Obsidian locale’s convention for “note.”
5. Run `npm run audit:i18n` and `npm run check` before submitting changes.

Native-speaker corrections are welcome. A locale should move to “manual editorial review complete” only after all 110 messages have been reviewed in context.
