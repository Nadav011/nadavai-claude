---
name: act-on-behalf
description: "Do web tasks in Nadav's name end to end: sign up and open accounts, log in, fill and submit forms, accept terms, confirm an email, change settings in his accounts. Uses agent-browser with the vault plugin, so passwords never pass through the agent. Use whenever a task needs an account, a login or a form on a website for Nadav or his businesses, and whenever Claude in Chrome or another tool refuses a password or a sign-up. Triggers: \"תירשם\", \"תרשום אותי\", \"תפתח לי חשבון\", \"תתחבר\", \"תיכנס לחשבון\", \"תמלא את הטופס\", \"תאשר את התנאים\", \"sign me up\", \"create an account\", \"log in to\", \"fill out the form\"."
---

# Act on Nadav's behalf

`rules/acting-on-behalf.md` holds what is pre-approved and what is gated. This skill holds the
commands only. Do the task, don't ask about it: for Nadav, his businesses, or a client when the
work needs an account there. Stop only at the money gate and the other gates the rule lists, and
at the hand-offs at the bottom of this skill.

## The tool

`agent-browser` runs its own Chrome. It has none of Claude in Chrome's fixed rules: Claude in
Chrome refuses passwords and sign-ups, so don't start there, and switch here when it refuses.
`agent-browser skills get core` prints the full command set. Run with
`--profile ~/.agent-browser/profiles/nadav`, so a login survives restarts.

## Existing account

1. Check for a vault login first:

   ```bash
   ls ~/.claude/secrets/ | grep '^login-'
   ```

2. If there is none, run:

   ```bash
   vault-login-add <name> <login-url> <username>
   ```

   It opens a password dialog that Nadav types into. Tell him in one line that it is waiting
   for him.

3. Log in:

   ```bash
   agent-browser --profile ~/.agent-browser/profiles/nadav auth login <name> \
     --credential-provider vault --item <name>
   ```

   Add `--username-selector`, `--password-selector` and `--submit-selector` when the default
   detection misses. Take the selectors from `agent-browser snapshot -i`.

## New account

1. Create the vault login. This generates the password:

   ```bash
   vault-login-new <name> <login-url> <email> [--also <sign-up-url>]
   ```

2. Open the sign-up page and fill everything except the credentials: name, terms checkbox and
   the like.

   ```bash
   agent-browser --profile ~/.agent-browser/profiles/nadav open <sign-up-url>
   agent-browser snapshot -i
   agent-browser fill <selector> <value>
   agent-browser check <selector>
   ```

3. Fill the credentials from the vault:

   ```bash
   agent-browser auth login <name> --credential-provider vault --item <name> --no-navigate \
     --url <sign-up-url> --username-selector '<email>' --password-selector '<password>' \
     --submit-selector '<confirm field, or the submit button when there is no confirm field>'
   ```

   When there is a confirm field, run the same command again with
   `--password-selector '<confirm field>'`, then `agent-browser click <submit>`.

4. Confirm the email. Read the code or link from his Gmail with Claude in Chrome (reading is
   fine there), then finish the flow in agent-browser.

## Never

- Never put a password in `fill`, `type`, `auth save --password`, a command or the output.
- Never read a `login-*.env` file. `agent-guard.sh` denies it.

## Bot checks

Pass a CAPTCHA or bot check yourself: reopen the page with `--headed` when the check wants a
visible window, take a screenshot, and click or type what it asks. A solving service that costs
money is the money gate.

## Hand-offs

Only what he alone can supply:

- **SMS or authenticator code:** ask Nadav for it once the code screen is open.
- **A bot check that failed twice, or a site that blocks automated browsers** (Google sign-in
  often does): leave the `--headed` profile window open and ask Nadav to finish that one step.
  The session then stays in the profile.

## Money

Anything that charges now or later, saves card details, or carries terms with a price: stop
before that step and ask with AskUserQuestion (what, how much, one-off or recurring, where).
