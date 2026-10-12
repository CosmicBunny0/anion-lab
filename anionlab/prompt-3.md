Before this prompt: the live page (v3) was built in another chat and already has much of what's below.
For every requirement and test: if it's already there and correct, keep it and only add its test;
if it differs, change only the difference; if it's missing, build it. Never duplicate a feature.
If the full Prompt 3 text is not pasted below this message, stop and ask me for it. Don't use a saved copy.

Also fix two things left from Prompt 2, and add a test for each:
1. When the profile sheet opens and a profile already exists, focus the sheet's heading, not the name field,
   so the iPhone keyboard doesn't cover the delete buttons. Focus the name field only when no profile exists
   ("مين بيذاكر؟") or when I tap "add profile".
2. After the active profile is deleted, the sheet can't be closed (Escape, backdrop, any button) until
   I pick one of the remaining profiles, and nothing is written to storage until then.
In your report, include the exact output line of check_data.py.# Anion Lab update — Prompt 3 of 5: credit

Read `anionlab/RULES.md` and follow it, with N = 3. If it's missing, stop and tell me to run Prompt 1 first.

## Goal
Show "Made by Mohammed Aymen", exactly as written (Aymen: A-Y-M-E-N), on every view.
**Done when:** T7 passes, every earlier test still passes, and the same URL is republished.

## Work
- Put it small under the h1 in the top bar.
- Also add it as a footer at the end of every view: one `<footer>` after the view sections inside `#app`. The existing bottom padding of `#app` keeps it above the fixed nav, so it is never hidden behind it.
- Use `var(--graphite)` and the page's existing fonts (`--font-sci` suits Latin text here). Isolate it as LTR (`dir="ltr"`) inside the RTL page, and keep it readable in both themes.
- Add `<meta name="author" content="Mohammed Aymen">` next to the description meta.

### Tests (add to tests.mjs)
- T7: In each of the 7 views, at 360 px, in light and dark, scrolled to the bottom: the footer credit is visible and its bottom edge sits above the nav's top edge. The top-bar credit is visible, both read exactly "Made by Mohammed Aymen", and `meta[name=author]` exists with the same name.
