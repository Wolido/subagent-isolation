---
name: writing-clearly-and-concisely
description: |
  Use when refining, editing, or improving prose. Triggers: "polish",
  "rewrite", "simplify", "edit this", "refine text", "adjust wording",
  "精简", "润色", "改一下", "太啰嗦", "去除AI味", "降低AI率",
  "不像人写的", "make it clearer", "too wordy", "omit needless words",
  "Strunk", "expression optimization". Use for docs, READMEs, commits,
  PRs, UI copy, error messages, reports, summaries, emails, articles,
  blog posts, or any puffy/promotional/hedged/robotic/AI-generated prose.
  Use when text overuses "delve," "crucial," "testament," "vibrant",
  "pivotal," "underscores." Do NOT use for fiction, poetry,
  translation-only, code, data, math, or tone-shifting without clarity
  needs.
---

# Writing Clearly and Concisely

## Overview

Three-level optimizer: clarity rules, AI patterns, voice injection.
Scan Quick Reference first; load references as needed.

## Important

- **Preserve meaning.** Never change facts or technical details.
- **Preserve tone intent.** Match desired tone. No casual→formal unless asked.
- **Don't over-edit.** Leave clean sentences unchanged. Single-sentence
  changes should not exceed ~30% unless clearly broken.
- **Level 3 is context-sensitive.** Inject personality only in personal
  blogs, social media, informal emails, or when user asks for "more human".
  Skip for technical docs, legal text, error messages, and UI copy.

## When to Use / When NOT to Use

Use: docs, READMEs, commits, PRs, error messages, UI copy, reports,
summaries, puffy/robotic/AI-generated prose.
Do NOT use: fiction/poetry, legal contracts, translation-only, code,
data analysis, math, tone-shifting without clarity needs.

## Quick Reference

**Level 1 — Foundation:**
Load `03-elementary-principles-of-composition.md` for most tasks.
Load `02-...` for grammar issues, `05-...` for word-choice debates.

**Level 2 — Detection:**
Scan first, load `references/signs-of-ai-writing.md` for details.
Core: C1–C7 Content, L1–L5 Language, S1–S5 Style, CM1–CM3 Communication,
F1–F3 Filler/Hedging.
Extended: M1–M4 Markup, H1–H4 Historical (check if context permits).

**Level 3 — Enhancement (Inject voice):**
Use ONLY for personal/informal contexts. Skip for technical/legal/UI text.
- Opinions over neutral lists; vary sentence rhythm
- Acknowledge complexity; use "I" when appropriate
- Be specific about feelings ("unsettling" > "concerning")

## Process

If vague ("polish", "润色"), default conservative: Level 1 + 2. Do NOT
apply Level 3 unless promotional/personal or user asks for "more human".

1. Read input. Note context.
2. **Level 1** — Load `03-...`. Check active voice, concision,
   parallel structure. Skip if clean.
3. **Level 2** — Scan C1–F3. If suspicious, load `signs-of-ai-writing.md`
   for guidance. M1–M4: check only if text contains Markdown/wikitext
   markup or is intended for Wikipedia/MediaWiki.
4. **Level 3** — ONLY if personal/informal or user asks for "more human".
   Skip for technical docs, legal, errors, UI, reports.
5. **Quality check** — Natural aloud, varied structure, specifics replace
   vagueness. If <3 minor changes, return original with note.
6. **Output** — Preserve markdown. Return rewritten text + bullet list
   of changes. See `references/full-example.md` for format.

## Common Issues

See `references/common-issues.md` for typical pitfalls and how to avoid them.

## Reference

- `references/signs-of-ai-writing.md` — AI patterns C1–H4.
- `references/03-elementary-principles-of-composition.md` — Strunk Rules 8–18.
- `references/02-elementary-rules-of-usage.md` — Grammar Rules 1–7.
- `references/04-a-few-matters-of-form.md` — Formatting.
- `references/05-words-and-expressions-commonly-misused.md` — Word choice.
- `references/full-example.md` — Worked example.
