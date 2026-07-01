# Common Issues

**Error:** Over-editing removes technical precision.
Cause: Aggressive concision strips necessary qualifiers or technical terms.
Solution: Preserve all technical details. Only remove redundancy, not
precision. If a term is used once, keep it.

**Error:** Voice injection feels forced.
Cause: Adding first-person or opinions to formal/technical text.
Solution: Match the context. Use Level 3 only for personal/informal text
or when explicitly requested. Skip for docs, legal, UI, errors.

**Error:** Pattern detection false positives.
Cause: Legitimate use of "crucial" or em dashes in skilled human writing.
Solution: Context matters. Flag patterns but use judgment. If the word
fits naturally and the sentence is otherwise clean, leave it.

**Error:** No changes made despite user request.
Cause: Text is already concise and natural; agent incorrectly returns
original without explanation.
Solution: If scan finds <3 minor issues, return original with note:
"Text is already clear and natural." Do not force edits.
