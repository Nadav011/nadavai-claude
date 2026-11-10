# App Icons

Splash screens (assets, `@capacitor/splash-screen` config, Android 12+ theme, iOS launch storyboard) belong to the `capacitor-splash-screen` skill. This file keeps the app icon part of `@capacitor/assets`.

## Source Asset Requirements

Put these files in the project's `assets/` directory (install with `npm install @capacitor/assets --save-dev`):

| File | Minimum Size | Purpose |
| ---- | ------------ | ------- |
| `icon-only.png` | 1024x1024 px | App icon without background (used for iOS) |
| `icon-foreground.png` | 1024x1024 px | Adaptive icon foreground layer (Android) |
| `icon-background.png` | 1024x1024 px | Adaptive icon background layer (Android) |

All files must be PNG or JPG format. Generate with `npx capacitor-assets generate` (`--ios`, `--android`, `--pwa` to scope).

## Adaptive Icons (Android)

Android 8.0+ uses adaptive icons with separate foreground and background layers. The `icon-foreground.png` and `icon-background.png` files are used to generate these. Keep the main icon content within the center 66% of the `icon-foreground.png` to ensure it is not clipped by different device masks.

## iOS

iOS uses a single icon at 1024x1024 and scales it for all required sizes. The `icon-only.png` is used as the source.
