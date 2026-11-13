// Two checks of honest choices (nadav-design `standard/experience.md`, rules H-02 and H-03), the
// part of them a page's markup can show:
//   consent-prechecked  a consent box (mailing, marketing, cookies, sharing) that is on when the page
//                       loads; the check cannot tell a default from a choice she saved earlier, so a
//                       person reads which
//   consent-refuse      a yes to a consent request (cookies, mailing, a permission) with no refuse
//                       control beside it, or one much less prominent
// Words decide what is consent, so a consent box or banner worded in other words is missed: these
// checks find the plain cases, and the reviewer of H-02 and H-03 reads the rest. They run in the
// checks phase (`extended-checks.spec.ts`) and only report. `consentInPage` runs INSIDE the page.
//
// Each condition that makes or withholds a finding is one line ending in `// M:<code>`: the kit's
// tests (`tests/extended-checks.mjs`) delete that line, and change the thresholds one at a time, and
// check that a fixture test fails.
import type { Page } from "@playwright/test";

export const CONSENT_CHECK_IDS = ["consent-prechecked", "consent-refuse"] as const;

export interface ConsentResult {
  count: number;
  kinds: Record<string, number>;
  samples: string[];
  /** What the check could not judge, said so; never a finding. */
  notes?: string[];
}

/**
 * The measurable rule of "as prominent" (H-03): the refuse control is a button or a link like the
 * accept control, at least half its area, its text at least 85% of the accept text's size, and its
 * text at least 4.5:1 against its own background.
 */
export const PROMINENCE = { area: 0.5, font: 0.85, contrast: 4.5 } as const;

export function consentInPage(prominence: { area: number; font: number; contrast: number }): { kind: string; sample: string }[] {
  // A consent box: what its label says it agrees to. A consent request: the words of the box around an accept button.
  // «עדכונים» alone is also an app's own updates, so only updates by mail or message, or asked for, are consent.
  const CONSENT = /עוגיות|קוקיז|cookie|דיוור|ניוזלטר|newsletter|(לקבל|קבלת) עדכונים|עדכונים (ב|ל)?(מייל|אימייל|דוא"ל|sms|הודעות|וואטסאפ|ווטסאפ)|מבצעים|פרסומ|שיווק|marketing|הסכמה|consent|מסכימ|מאשר|i agree|שיתוף (ה)?מידע|צד שלישי|third.part|פרטיות|privacy/i;
  const REQUEST = /עוגיות|קוקיז|cookie|דיוור|ניוזלטר|newsletter|פרסומ|שיווק|marketing|הסכמה|consent|הרשאה|permission|מיקום|location|התראות|notification/i;
  const NECESSARY = /הכרחי|נחוצ|חיוני|necessary|essential|required|strictly/i;
  const ACCEPT = /^(אישור|אישור הכול|אישור הכל|לאשר|מאשר|מאשרת|אני מסכים|אני מסכימה|מסכים|מסכימה|הסכמה|קבלה|קבלת הכול|קבלת הכל|לקבל הכול|לקבל הכל|לאפשר|אפשר|accept|accept all|allow|allow all|agree|i agree|got it|ok)$/i;
  // A word that also saves an ordinary form: inside a box with fields it is the form's submit, not a yes.
  const GENERIC = /^(אישור|ok|got it)$/i;
  // Closing the box is not refusing (H-03), so «סגירה» and a close icon are not here.
  const REFUSE = /^(דחייה|דחיית הכול|דחיית הכל|לדחות|לא תודה|לא, תודה|לא מסכים|לא מסכימה|סירוב|לסרב|רק הכרחיות|רק עוגיות הכרחיות|לא עכשיו|לא כרגע|אחר כך|ביטול|לא לאפשר|בלי עדכונים|reject|reject all|decline|decline all|deny|deny all|no thanks|no, thanks|not now|later|maybe later|only necessary|necessary only|don't allow)$/i;
  const FIELDS = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea, [role="switch"], [role="checkbox"], [role="combobox"], [role="textbox"]';
  const vis = (el: Element | null): el is HTMLElement => {
    if (!el || !(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    return !el.closest('[aria-hidden="true"], [inert], [hidden], dialog:not([open])');
  };
  const words = (el: Element) => ((el as HTMLElement).innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  const nameOf = (el: Element) => {
    const by = el.getAttribute("aria-labelledby");
    if (by) return by.split(/\s+/).map((id) => words(document.getElementById(id) ?? document.createElement("i"))).join(" ");
    const own = el.getAttribute("aria-label");
    if (own) return own;
    const id = el.id;
    const lab = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.closest("label");
    if (lab) return words(lab);
    // The text of the row it sits in: the nearest ancestor with words, while short.
    for (let a = el.parentElement, i = 0; a && i < 3; a = a.parentElement, i++) {
      const t = words(a);
      if (t) return t.length <= 200 ? t : "";
    }
    return "";
  };
  const out: { kind: string; sample: string }[] = [];
  const short = (s: string) => `"${s.slice(0, 50)}"`;

  // consent-prechecked: a box or switch that gives consent, on when the page loads.
  for (const el of Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"], [role="switch"]'))) {
    // A native box drawn by its label (the box itself hidden) is judged by its label.
    if (!vis(el) && !(el instanceof HTMLInputElement && vis(el.closest("label")))) continue;
    const on = el instanceof HTMLInputElement ? el.checked : el.getAttribute("aria-checked") === "true" || el.getAttribute("data-state") === "checked";
    if (!on) continue;
    const name = nameOf(el);
    if (!CONSENT.test(name)) continue;
    const locked = (el as HTMLInputElement).disabled || el.getAttribute("aria-disabled") === "true";
    if (locked && NECESSARY.test(name)) continue; // M:necessary
    out.push({ kind: "prechecked", sample: `prechecked: ${short(name)} is on when the page loads (a default, or a choice saved earlier: a person reads which)` }); // M:prechecked
  }

  // consent-refuse: every accept control in a consent request has a refuse control as prominent.
  const controls = Array.from(document.querySelectorAll('button, [role="button"], a[href], input[type="button"], input[type="submit"]')).filter(vis);
  const label = (el: Element) =>
    (el instanceof HTMLInputElement ? el.value : words(el) || el.getAttribute("aria-label") || "")
      .replace(/[’‘]/g, "'")
      .replace(/[.!]$/, "")
      .trim();
  // Any CSS colour (rgb, hex, oklch, color-mix) as sRGB 0-255 and alpha 0-1, as the browser paints it.
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c: string): [number, number, number, number] => {
    if (!cx) return [0, 0, 0, 1];
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top: [number, number, number, number], under: [number, number, number, number]): [number, number, number, number] => [
    top[0] * top[3] + under[0] * (1 - top[3]),
    top[1] * top[3] + under[1] * (1 - top[3]),
    top[2] * top[3] + under[2] * (1 - top[3]),
    1,
  ];
  const lum = (c: [number, number, number, number]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  // What is painted behind the element's text: its own and its ancestors' backgrounds, composited down
  // to the first opaque one (white below all). null when an image or gradient is in the way.
  const bgOf = (el: Element): [number, number, number, number] | null => {
    const layers: [number, number, number, number][] = [];
    for (let a: Element | null = el; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.backgroundImage !== "none") return null; // M:bg-image
      const c = rgba(s.backgroundColor);
      if (c[3] === 0) continue;
      layers.push(c);
      if (c[3] === 1) break;
    }
    return layers.reduceRight<[number, number, number, number]>((under, top) => over(top, under), [255, 255, 255, 1]); // M:composite
  };
  const contrast = (el: Element) => {
    const bg = bgOf(el);
    if (!bg) return null;
    const a = lum(over(rgba(getComputedStyle(el).color), bg));
    const b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const area = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  };
  const size = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
  const notes: string[] = [];
  for (const yes of controls) {
    if (!ACCEPT.test(label(yes))) continue;
    // The request it answers: the nearest box around it whose words are a consent request.
    let box: HTMLElement | null = null;
    for (let a = yes.parentElement, i = 0; a && a !== document.body && i < 6; a = a.parentElement, i++) {
      const t = words(a);
      if (t.length > 2000) break;
      if (REQUEST.test(t.replace(label(yes), ""))) {
        box = a;
        break;
      }
    }
    if (!box) continue;
    if (GENERIC.test(label(yes)) && box.querySelector(FIELDS)) continue; // a settings form's own save // M:form
    const nos = controls.filter((c) => c !== yes && box.contains(c) && REFUSE.test(label(c)));
    if (!nos.length) {
      out.push({ kind: "no-refuse", sample: `no-refuse: ${short(label(yes))} in ${short(words(box))} has no refuse control beside it` }); // M:no-refuse
      continue;
    }
    // Each refuse control against the accept: area, text size, and (when it can be judged) contrast.
    const judged = nos.map((no) => {
      let ok = true;
      if (area(no) < prominence.area * area(yes)) ok = false; // M:weak-area
      if (size(no) < prominence.font * size(yes)) ok = false; // M:weak-font
      const c = contrast(no);
      if (c !== null && c < prominence.contrast) ok = false; // M:weak-contrast
      return { no, ok, known: c !== null };
    });
    if (judged.some((j) => j.ok && j.known)) continue;
    const unknown = judged.find((j) => j.ok && !j.known);
    if (unknown) {
      notes.push(`contrast not judged: ${short(label(unknown.no))} has an image or gradient behind it; its area and text size are as prominent as ${short(label(yes))}`); // M:note
      continue;
    }
    out.push({ kind: "weak-refuse", sample: `weak-refuse: ${short(label(nos[0]))} is less prominent than ${short(label(yes))}` }); // M:weak-refuse
  }
  for (const n of notes) out.push({ kind: "note", sample: n });
  return out;
}

/** Both consent checks on the page as it loaded. */
export async function consentChecks(page: Page): Promise<Record<(typeof CONSENT_CHECK_IDS)[number], ConsentResult>> {
  const items = await page.evaluate(consentInPage, { ...PROMINENCE });
  const pick = (kinds: string[], withNotes = false): ConsentResult => {
    const mine = items.filter((i) => kinds.includes(i.kind));
    const k: Record<string, number> = {};
    for (const i of mine) k[i.kind] = (k[i.kind] ?? 0) + 1;
    const notes = withNotes ? items.filter((i) => i.kind === "note").map((i) => i.sample) : [];
    return { count: mine.length, kinds: k, samples: mine.slice(0, 8).map((i) => i.sample), ...(notes.length ? { notes } : {}) };
  };
  return { "consent-prechecked": pick(["prechecked"]), "consent-refuse": pick(["no-refuse", "weak-refuse"], true) };
}
