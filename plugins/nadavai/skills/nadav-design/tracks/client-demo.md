# Track `client-demo`: a demo built to win or brief a client

A site or an app shown to a prospect or a partner before any real work: invented content around
a real kind of business. Projects so far: the Kfir Bar and Elisha Fund sites, the demos hub, the
mailer packs. It is seen by another professional who judges Nadav by it, so anything generic or
inconsistent reads as low effort.

A demo of a product he is building for himself (a redesign demo, a store demo) is not this
track; that is `redesign` or `site`. This track is declared in the first step of the mode. Its
tempo is `flow`.

When an app stands behind the demo (the client's app exists in a repo of ours and its build was
decided), the demo after the first direction round is built inside that app's code on invented
data, only as unit 1 of a build plan Nadav approved (`shared/rules.md`, «An app is built once»,
point 2); approving the direction never starts work in the client's app repo. With no app behind
it, the page is the deliverable. A client demo at the prospect stage never starts the client's app.

## Rules

1. **Keep the design he approved.** A request to change content is not a request to redesign:
   "גרוע ביותר, למה שינית את כל העיצוב הקודם" (14.10.2026). Change only what the content forces.
2. **Concrete, never generic.** Invented names, organisations, roles, numbers and dates, all
   specific and plausible; a full sign-off on a letter; no bracketed placeholder anywhere.
   Hebrew that reads as written by a professional, not by a model.
3. **One set of facts.** Every invented fact lives in one file (`content/facts.json` or the
   project's equivalent) and every page reads from it. `python3 redesign/tools/facts-check.py
   --facts content/facts.json <pages>` fails on a figure in a page that is not in the file, on
   an open value and on a placeholder. What must add up in this demo's own story (totals, ages
   against years, a date against its weekday) gets a small check written for that demo, as the
   Kfir Bar site has. Names, dates and button labels across pages and e-mails are compared from
   a dump of the wording, not by eye over rendered pages.
4. **Invented people are checked against real ones.** A name passes a check against the relevant
   real list and a web search before it is used. Where the demo sits inside a real event, the
   site carries a permanent demo line, and the marking it has is never removed, weakened or
   explained away with a cover story. Where the marking sits on an existing demo is his
   decision; it is not changed without his word.
5. **Photos.** Free-licence or generated, labelled as illustrative where a visitor could take
   them for real, with credits kept in a file. No faces presented as real people.
6. **It plays.** The demo opens as the working thing: real navigation, every button does
   something. Where it shows a product, there is one walkthrough per feature in plain Hebrew.
   A map of screens is for reviewers, not for the client.
7. **One index.** When the deliverable has parts (an email, its landing page, a site), one page
   shows them together so the whole can be judged at once, and a zip can be sent.
8. **His own domain.** Never `*.vercel.app`; `noindex` on anything invented; the link checked
   with `redesign/tools/early-show.sh` before it is sent.
9. **Caveats said plainly** when it is handed over: what is fictional, what carries a demo
   notice, which browsers were not checked.

## Checks before it is shown

- `facts-check.py` exits 0 (figures, open values, placeholders), and the demo's own arithmetic
  check when it has one.
- `noindex` is in the served page: `curl -s <url> | grep -i 'name="robots"'` shows it.
- Mixed Hebrew and Latin passages pass a direction audit.
- The DoD mechanical checks on every page, on a phone and a desktop.
- A fresh reviewer reads it as the client would, for "generic" and for anything that contradicts
  another page.

Sending it to the client is a message in Nadav's name: `nadavai:client-messages` and his explicit
request for that send.
