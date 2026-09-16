#!/usr/bin/env python3
"""Move a coding session between CLI agents: Claude Code, Codex and Kimi.

Reads the source agent's own session transcript, compresses it into a portable
handoff document under .omc/handoffs/, and launches the target agent on it.

  handoff codex                     # latest Claude session here -> codex
  handoff claude --from codex       # latest Codex session here -> claude
  handoff kimi --raw                # mechanical extraction, no LLM summary
  handoff file --from auto          # newest session from any agent, write only
  handoff codex --session b65e --note "focus on the RTL bug"
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HOME = Path.home()
AGENTS = ("claude", "codex", "kimi")
TARGETS = AGENTS + ("file",)
EDIT_TOOLS = {"Edit", "Write", "NotebookEdit", "apply_patch", "edit_file", "write_file"}
INTERESTING_TOOLS = EDIT_TOOLS | {"Bash", "Task", "Agent", "shell", "run_command"}
MAX_TEXT = 4000        # per assistant message, characters
MAX_RAW = 400_000      # whole raw document, characters

# Kimi does not document its store and creates it only after the first run, so
# every plausible location is probed instead of hardcoding one.
KIMI_ROOTS = ("~/.kimi/sessions", "~/.kimi/projects", "~/.kimi/history",
              "~/.cache/kimi/sessions", "~/.local/share/kimi/sessions", "./.kimi/sessions")


# --------------------------------------------------------------------------- utils

def die(msg: str) -> None:
    sys.exit(f"handoff: {msg}")


# Both harnesses inject context into the message stream wrapped in XML-ish tags.
# Named ones are stripped inline; a message that is nothing but such a block is dropped.
INJECTED_TAGS = ("system-reminder", "local-command-stdout", "skills_instructions",
                 "environment_context", "user_instructions", "recommended_plugins",
                 "command-name", "command-message", "command-args")
WHOLLY_INJECTED = re.compile(r"^<([a-z][a-z0-9_-]*)>.*</\1>$", re.S)


def strip_noise(text: str) -> str:
    """Drop harness-injected blocks that are not the speaker's own words."""
    if not text:
        return ""
    for tag in INJECTED_TAGS:
        text = re.sub(rf"<{tag}>.*?</{tag}>", "", text, flags=re.S)
    text = text.strip()
    return "" if WHOLLY_INJECTED.match(text) else text


def newest(paths: list[Path]) -> list[Path]:
    return sorted(paths, key=lambda p: p.stat().st_mtime, reverse=True)


# ------------------------------------------------------------------- session lookup

def claude_sessions(workdir: Path) -> list[Path]:
    root = HOME / ".claude" / "projects"
    for candidate in [workdir, *workdir.parents]:
        d = root / re.sub(r"[^A-Za-z0-9]", "-", str(candidate))
        if d.is_dir():
            return newest(list(d.glob("*.jsonl")))
    return []


def codex_sessions(workdir: Path) -> list[Path]:
    root = HOME / ".codex" / "sessions"
    if not root.is_dir():
        return []
    hits = []
    for f in newest(list(root.rglob("rollout-*.jsonl")))[:200]:
        try:
            with f.open(encoding="utf-8", errors="replace") as fh:
                meta = json.loads(fh.readline() or "{}")
        except (OSError, json.JSONDecodeError):
            continue
        cwd = (meta.get("payload") or {}).get("cwd")
        if cwd and (Path(cwd) == workdir or workdir in Path(cwd).parents
                    or Path(cwd) in workdir.parents):
            hits.append(f)
    return hits


def kimi_sessions(workdir: Path) -> list[Path]:
    hits: list[Path] = []
    for root in KIMI_ROOTS:
        d = Path(root.replace("./", f"{workdir}/")).expanduser()
        if d.is_dir():
            hits += list(d.rglob("*.jsonl")) + list(d.rglob("*.json"))
    return newest(hits)


FINDERS = {"claude": claude_sessions, "codex": codex_sessions, "kimi": kimi_sessions}


def resolve_session(agent: str, workdir: Path, want: str | None) -> tuple[str, Path]:
    if want and Path(want).is_file():
        path = Path(want)
        return (agent if agent != "auto" else sniff_agent(path)), path

    agents = AGENTS if agent == "auto" else (agent,)
    found: list[tuple[str, Path]] = []
    for a in agents:
        for p in FINDERS[a](workdir):
            found.append((a, p))
    if not found:
        hint = (" Kimi creates its session store only after its first run; until then use "
                "the in-agent route: run `kimi` and ask it to write the handoff itself."
                if agent == "kimi" else "")
        die(f"no {agent} sessions found for {workdir}.{hint}")

    if want and want != "latest":
        hits = [(a, p) for a, p in found if want in p.stem]
        if not hits:
            die(f"no session matching {want!r} for {agent} in {workdir}")
        return hits[0]

    exclude = os.environ.get("CLAUDE_SESSION_ID")
    for a, p in sorted(found, key=lambda t: t[1].stat().st_mtime, reverse=True):
        if exclude and exclude in p.stem:
            continue  # never hand over the session doing the handing over
        return a, p
    return found[0]


def sniff_agent(path: Path) -> str:
    try:
        head = path.open(encoding="utf-8", errors="replace").readline()
    except OSError:
        return "claude"
    return "codex" if '"session_meta"' in head or '"response_item"' in head else "claude"


# ----------------------------------------------------------------------- transcripts

def iter_json(path: Path):
    for line in path.open(encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue


def parse_claude(path: Path) -> dict:
    title, turns, edited, cwd, branch = None, [], [], None, None
    for rec in iter_json(path):
        kind = rec.get("type")
        cwd = rec.get("cwd") or cwd
        branch = rec.get("gitBranch") or branch
        if kind == "ai-title":
            title = rec.get("aiTitle") or title
        elif kind == "user":
            if rec.get("origin", {}).get("kind") != "human":
                continue  # tool results, task notifications, injected reminders
            content = rec.get("message", {}).get("content")
            text = content if isinstance(content, str) else "".join(
                b.get("text", "") for b in content or [] if b.get("type") == "text")
            if (text := strip_noise(text)):
                turns.append(("user", text, []))
        elif kind == "assistant":
            said, acted = [], []
            for block in rec.get("message", {}).get("content", []) or []:
                if block.get("type") == "text" and block.get("text", "").strip():
                    said.append(block["text"].strip())
                elif block.get("type") == "tool_use":
                    name, args = block.get("name", ""), block.get("input", {}) or {}
                    fp = args.get("file_path") or args.get("path")
                    if name in EDIT_TOOLS and fp:
                        edited.append(fp)
                    if name in INTERESTING_TOOLS:
                        detail = fp or str(args.get("command", ""))[:120]
                        acted.append(f"{name}({detail})" if detail else name)
            body = "\n\n".join(said)[:MAX_TEXT]
            if body or acted:
                turns.append(("assistant", body, acted))
    return {"title": title, "turns": turns, "edited": edited, "cwd": cwd,
            "branch": branch, "session": path.stem, "agent": "claude"}


def parse_codex(path: Path) -> dict:
    """Codex rollout: response_item payloads carrying role/content and tool calls."""
    turns, edited, cwd, title = [], [], None, None
    for rec in iter_json(path):
        payload = rec.get("payload") or {}
        if rec.get("type") == "session_meta":
            cwd = payload.get("cwd") or cwd
            continue
        if rec.get("type") != "response_item":
            continue
        ptype = payload.get("type")
        if ptype == "message":
            role = payload.get("role")
            if role == "developer":
                continue  # system scaffolding, not the conversation
            text = "".join(c.get("text", "") for c in payload.get("content", []) or []
                           if c.get("type") in ("input_text", "output_text", "text"))
            if not (text := strip_noise(text)):
                continue
            if role == "user":
                turns.append(("user", text, []))
                title = title or text[:60]
            elif role == "assistant":
                turns.append(("assistant", text[:MAX_TEXT], []))
        elif ptype in ("function_call", "custom_tool_call", "local_shell_call"):
            name = payload.get("name") or ptype
            raw = payload.get("arguments") or payload.get("input") or ""
            fp = None
            if isinstance(raw, str):
                if (m := re.search(r'"(?:file_path|path)"\s*:\s*"([^"]+)"', raw)):
                    fp = m.group(1)
            if fp and name in EDIT_TOOLS:
                edited.append(fp)
            detail = fp or str(raw)[:120]
            if turns and turns[-1][0] == "assistant":
                turns[-1][2].append(f"{name}({detail})")
            else:
                turns.append(("assistant", "", [f"{name}({detail})"]))
    return {"title": title, "turns": turns, "edited": edited, "cwd": cwd,
            "branch": None, "session": path.stem, "agent": "codex"}


def parse_generic(path: Path) -> dict:
    """Best-effort reader for a store whose schema is not known (Kimi today)."""
    turns, cwd = [], None
    records = list(iter_json(path)) if path.suffix == ".jsonl" else []
    if not records:
        try:
            blob = json.loads(path.read_text(encoding="utf-8", errors="replace"))
        except (OSError, json.JSONDecodeError):
            die(f"cannot read {path}")
        records = blob if isinstance(blob, list) else blob.get("messages") or [blob]
    for rec in records:
        if not isinstance(rec, dict):
            continue
        cwd = rec.get("cwd") or rec.get("workDir") or cwd
        node = rec.get("message") if isinstance(rec.get("message"), dict) else rec
        role, content = node.get("role"), node.get("content")
        if role not in ("user", "assistant") or content is None:
            continue
        text = content if isinstance(content, str) else "".join(
            b.get("text", "") for b in content or [] if isinstance(b, dict))
        if (text := strip_noise(text)):
            turns.append((role, text[:MAX_TEXT], []))
    return {"title": None, "turns": turns, "edited": [], "cwd": cwd,
            "branch": None, "session": path.stem, "agent": "kimi"}


PARSERS = {"claude": parse_claude, "codex": parse_codex, "kimi": parse_generic}


# -------------------------------------------------------------------------- render

def render_raw(d: dict, speaker: str) -> str:
    title = d["title"] or d["session"][:12]
    out = [f"# Session handoff: {title}", "",
           f"- Source agent: {d['agent']}",
           f"- Source session: `{d['session']}`",
           f"- Working directory: `{d.get('cwd') or '?'}`",
           f"- Branch: `{d.get('branch') or '?'}`",
           f"- Exported: {dt.datetime.now().isoformat(timespec='minutes')}", ""]
    if d["edited"]:
        out += ["## Files touched", ""]
        out += [f"- `{f}`" for f in list(dict.fromkeys(d["edited"]))[:40]] + [""]
    out += ["## Conversation", ""]
    for role, body, acted in d["turns"]:
        out += [f"### {'Nadav' if role == 'user' else speaker}", ""]
        if body:
            out += [body, ""]
        if acted:
            out += ["Actions: " + "; ".join(acted[:12]), ""]
    doc = "\n".join(out)
    return doc if len(doc) <= MAX_RAW else doc[:MAX_RAW] + "\n\n_[truncated]_\n"


SUMMARY_PROMPT = """You are compressing a coding-agent session transcript into a handoff \
document for a DIFFERENT AI coding agent that has no memory of it. That agent will read only \
your output, then continue the work in the same repository.

Write the document in this exact structure, in English, with no preamble:

# Handoff: <short title>
## Goal
What the user is ultimately trying to achieve, in 1-3 sentences.
## State now
What already works and what is still broken or unfinished. Be concrete.
## Decisions made
Bullet list. Each decision plus the reason it was made, so the next agent does not undo it.
## Files touched
Bullet list of paths, each with one line on what changed there. Omit if none.
## Open questions
Anything the user was asked and has not answered, or that is genuinely undecided. Omit if none.
## Next step
The single next concrete action, as a command or a file:line to edit.

Rules: facts from the transcript only, never invent file paths or results. Keep any user \
instruction that constrains the work (conventions, language, things forbidden). Quote the \
user's own words when the wording matters. Aim for under 150 lines.

TRANSCRIPT:
"""


def summarize(raw: str, model: str) -> str | None:
    if not shutil.which("claude"):
        return None
    try:
        proc = subprocess.run(["claude", "-p", "--model", model, SUMMARY_PROMPT + raw],
                              capture_output=True, text=True, timeout=900)
    except (subprocess.TimeoutExpired, OSError) as exc:
        print(f"handoff: summary failed ({exc}); falling back to raw", file=sys.stderr)
        return None
    if proc.returncode != 0 or not proc.stdout.strip():
        print(f"handoff: summary failed ({proc.stderr.strip()[:200]}); using raw",
              file=sys.stderr)
        return None
    return proc.stdout.strip()


# -------------------------------------------------------------------------- launch

def pickup_prompt(doc: Path, source: str, note: str | None) -> str:
    text = (f"Read {doc} first. It is a handoff from a previous {source} session on this "
            "repository: goal, current state, decisions already made, files touched and the "
            "next step. Treat its decisions as settled unless the code contradicts them. Then "
            "continue the work from 'Next step'.")
    return f"{text}\n\n{note}" if note else text


def launch(target: str, doc: Path, source: str, note: str | None, workdir: Path) -> int:
    if not shutil.which(target):
        print(f"handoff: {target} is not installed; document written to {doc}", file=sys.stderr)
        return 1
    prompt = pickup_prompt(doc, source, note)
    cmd = {"codex": [target, prompt],
           "claude": [target, prompt],
           "kimi": [target, "--work-dir", str(workdir), "-p", prompt]}[target]
    print(f"handoff: launching {target} on {doc}", file=sys.stderr)
    return subprocess.call(cmd, cwd=workdir)


# ---------------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(prog="handoff", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", choices=TARGETS, nargs="?", default="file",
                    help="agent to hand over to, or 'file' to only write the document")
    ap.add_argument("--from", dest="source", choices=AGENTS + ("auto",), default="claude",
                    help="agent to hand over from (default: claude; 'auto' = newest session)")
    ap.add_argument("--session", help="session id fragment, a transcript path, or 'latest'")
    ap.add_argument("--project", type=Path, default=Path.cwd(), help="repository (default: cwd)")
    ap.add_argument("--raw", action="store_true", help="mechanical extraction, no LLM summary")
    ap.add_argument("--model", default="haiku", help="model used for the summary")
    ap.add_argument("--note", help="extra instruction appended to the pickup prompt")
    ap.add_argument("--out", type=Path, help="write here instead of .omc/handoffs/")
    ap.add_argument("--no-launch", action="store_true", help="write the document, do not launch")
    ap.add_argument("--list", action="store_true", help="list candidate sessions and exit")
    args = ap.parse_args()

    workdir = args.project.resolve()

    if args.list:
        for a in (AGENTS if args.source == "auto" else (args.source,)):
            for p in FINDERS[a](workdir)[:10]:
                stamp = dt.datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
                print(f"{a:7} {stamp}  {p.stem[:36]}  {p.stat().st_size // 1024}KB")
        return 0

    source, session = resolve_session(args.source, workdir, args.session)
    data = PARSERS[source](session)
    if not data["turns"]:
        die(f"{session.name} has no conversation to hand over")

    raw = render_raw(data, source.capitalize())
    summary = None if args.raw else summarize(raw, args.model)
    doc_text = summary or raw

    if args.out:
        out = args.out
    else:
        base = data["title"] or session.stem
        slug = re.sub(r"[^\w֐-׿]+", "-", base).strip("-")[:40] or "session"
        out = workdir / ".omc" / "handoffs" / f"{dt.date.today()}-{source}-{slug}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        doc_text.rstrip()
        + f"\n\n---\nSource: {source} session `{data['session']}` "
          f"({'summarized' if summary else 'raw'}), {len(data['turns'])} turns.\n",
        encoding="utf-8")
    print(out)

    if args.target == "file" or args.no_launch:
        return 0
    return launch(args.target, out, source, args.note, workdir)


if __name__ == "__main__":
    sys.exit(main())
