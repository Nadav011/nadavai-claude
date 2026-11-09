# Native bar: what every Capacitor store app must have

Nadav, 2026-11-09: every store app stays Capacitor (no Expo, Swift or Kotlin rewrite), and gets every
native component and capability that a person can feel, end to end. This file is the bar. Each app
keeps a ledger `native/NATIVE-BAR.md` (or the repo's plan folder) with one row per item below, per
platform: pass, fail with owner and date, or "n/a" with the reason. A store build is not submitted
while a row that applies is "fail" without an owner.

Plugin choice: official `@capacitor/*` first, then Capawesome or capacitor-community, then others.
Before adding any third-party plugin check: a release in the last 6 months, Capacitor 8 support in its
README, a free licence (Capawesome "Insiders" plugins are paid: money is asked first), and its
socket.dev page has no alert. Bundled apps: every plugin is a native change (store build, `builds.md`).

| # | Item | How | Check |
|---|---|---|---|
| 1 | Haptics | `@capacitor/haptics`: light impact on primary taps, success/error notification on outcomes; native only. | Felt on a device for confirm, success and error. |
| 2 | Native action sheets and dialogs | `@capacitor/action-sheet` for choice menus, `@capacitor/dialog` for destructive confirms. | No web modal for a yes/no or a menu of actions. |
| 3 | Native tab bar and nav bar (apps with tab navigation) | `@capgo/capacitor-native-navigation` (UITabBar / Material bottom nav, one WebView; on iOS 26 the system Liquid Glass bar). Spike on one screen first; keep the web bar as fallback. | Tabs switch with native feel; badge counts on tabs; web bar hidden only inside the app. |
| 4 | Back gestures | iOS: `webView.allowsBackForwardNavigationGestures = true` in a small `CAPBridgeViewController` subclass (no config key exists). Android: `@capacitor/app` `backButton` handled by the router; predictive back declared. | Edge swipe goes back on iOS; Android back closes sheets first, then pages, then leaves. |
| 5 | System bars and edge to edge | Capacitor 8 SystemBars + `@capacitor/status-bar`; `viewport-fit=cover`; safe-area insets in CSS. | Status bar style follows the theme; nothing under the notch or home indicator. |
| 6 | Keyboard | `@capacitor/keyboard` (resize mode, accessory bar off where not needed, scroll the focused field into view). | The focused field is never covered; inputs are 16px or larger (no zoom). |
| 7 | Launch | `@capacitor/splash-screen` held until the first screen is ready; no white flash; dark splash in dark mode. | Cold start shows splash then content, never a blank page. |
| 8 | Share and external links | `@capacitor/share` (native sheet); `@capacitor/browser` (SFSafariViewController / Custom Tabs) for outside links; PDFs and `/api/*` files outside the app. | No dead end without a back control. |
| 9 | Notifications | Push (FCM + APNs, `shell-checklist.md` row 5), local notifications for reminders, Android channels and a monochrome small icon, badge with `@capawesome/capacitor-badge`, tap opens the exact screen (validated URL). | A push on a locked phone shows correctly and its tap lands on its screen. |
| 10 | Biometric lock (apps with owner, staff or money data) | `@aparajita/capacitor-biometric-auth`, `NSFaceIDUsageDescription` in Info.plist; opt-in in settings; fall back to the normal sign-in. | Face ID / fingerprint unlocks after background; turning it off works. This is an auth change: approval gate. |
| 11 | Privacy screen (personal or financial data) | `@capacitor/privacy-screen` (Android FLAG_SECURE, iOS app-switcher cover). | The app switcher shows no data. |
| 12 | Rating prompt | `@capacitor-community/in-app-review` after a real success moment, never the first session, at most once per 90 days. | Fires once on a device after the success moment. |
| 13 | Updates | Bundled: signed OTA + apply beacon (`ota.md`). Remote shell: live URL + min-build gate (`remote-shell.md`). Android also `@capawesome/capacitor-app-update` (Play in-app update). | A deploy is proven applied on phones; an old shell is asked to update. |
| 14 | Quick actions | `@capawesome/capacitor-app-shortcuts`: 2-4 long-press shortcuts to the main tasks. | Long-press the icon shows them and each opens its screen. |
| 15 | Links | Universal links and app links (`shell-checklist.md` row 6), validated before navigation (no `//host`, exact origin). | A link from WhatsApp opens the right screen in the app. |
| 16 | Text size, dark mode, motion | Respect Dynamic Type / font scale (`@capacitor/text-zoom` or rem-based CSS), `prefers-color-scheme`, `prefers-reduced-motion`. | Largest system text keeps layouts usable; dark mode has no white flashes. |
| 17 | Offline | `@capacitor/network` + an offline banner; queued or blocked writes with a clear message. | Airplane mode: the app says so and loses nothing. |
| 18 | Device permissions | Usage strings for every capability the web layer reaches (`shell-checklist.md` row 14); ask at the moment of use, never at launch. | No crash and no surprise prompt at launch. |
| 19 | Touch feel of the web layer | The `mobile-native` skill list: no tap highlight, no 300 ms delay, `overscroll-behavior`, 44pt targets, momentum scroll, View Transitions between pages, 60fps. | Screen recording on a device shows no jank and no web artefacts. |
| 20 | Accessibility | VoiceOver and TalkBack labels, focus order, announcements for status changes. | A full main flow with the screen reader on. |

Device checks: Android on the LENOVO emulator (`apps/native/AGENTS.md` in sportchat-web has the
headless recipe) and on Nadav's phone over wireless debugging (`adb pair`, then `adb connect`);
iOS on a Codemagic macOS simulator run for screenshots and smoke, and on Nadav's iPhone through
TestFlight for touch, Face ID, push and links (no iOS simulator runs on Linux).
