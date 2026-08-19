# Ebbinghaus Review for Obsidian

[English](README.md) · [한국어](README.ko.md)

Schedule spaced reviews for each note, see what is due today or overdue, and track your learning progress without adding properties to the top of your notes.

> The default intervals are a practical spaced-repetition preset. They do not claim to reproduce Ebbinghaus's experimental results exactly for every learner. You can customize the intervals in settings.

### Highlights

- Start a configurable `1, 3, 7, 14, 30, 60, 120 day` review schedule for any note.
- Review today's notes, overdue notes, progress, and seven-day activity from a dedicated dashboard.
- Mark a review complete, postpone it until tomorrow, or undo an accidental completion.
- Keep review data in plugin storage so note properties stay clean.
- Detect review-data changes from another device in an iCloud-based vault without restarting Obsidian.
- Receive in-app and optional operating-system notifications.
- Use the same plugin on desktop and mobile.
- Automatically match Obsidian's interface language across all 46 completed app locales; unknown future locales fall back to English.

### Screenshots

#### Dashboard and current-note status

![Study dashboard and current-note review status](docs/images/review-status.png)

#### Study statistics

![Ebbinghaus Review study statistics](docs/images/review-statistics.png)

### Language support

The plugin uses Obsidian's official `getLanguage()` API and bundles translations for every locale marked as complete for the app in the [official Obsidian translations repository](https://github.com/obsidianmd/obsidian-translations#existing-languages). No network connection is needed for translation. English is used as a safe fallback for newly added or unknown locales.

Translations are machine-assisted. Korean has completed a manual editorial review; every other localized dictionary has full structural QA and targeted terminology corrections but still needs native-speaker review before it can be considered native-certified. See the [translation quality and review status](docs/translation-quality.md).

### Usage

1. Open a Markdown note.
2. Run **Start or restart the review schedule for the current note** from the command palette.
3. Use the status bar or ribbon icons to open the current-note panel and study dashboard.
4. Select **Done** after studying, or postpone the review until tomorrow.
5. Check the **Study statistics** tab for your streak and recent activity.

### Development

Requires Obsidian 1.8.7 or later.

```bash
npm install
npm run check
```

Run `npm run audit:i18n` to validate all 4,708 localized messages independently.

Copy `main.js`, `manifest.json`, and `styles.css` into a test vault's `.obsidian/plugins/ebbinghaus-review/` directory, then enable **Ebbinghaus Review** under **Settings → Community plugins**.
