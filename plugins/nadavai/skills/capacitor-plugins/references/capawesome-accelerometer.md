# Accelerometer

Capture acceleration force along the x, y, and z axes with real-time measurements and event listeners.

**Package:** `@capawesome-team/capacitor-accelerometer`
**Platforms:** Android, iOS
**Documentation:** https://capawesome.io/docs/sdks/capacitor/accelerometer/
**Capawesome Insiders:** Yes (paid licence)

## Installation

Paid plugin (Capawesome Insiders licence). Choosing it is a paid-service decision: ask Nadav first, and offer a free alternative from the `capacitor-plugins` index if one exists.

Install the package:

```bash
npm install @capawesome-team/capacitor-accelerometer
npx cap sync
```

## Configuration

### Android

#### Proguard

If using Proguard, add to `android/app/proguard-rules.pro`:

```
-keep class io.capawesome.capacitorjs.plugins.** { *; }
```

### iOS

#### Privacy Descriptions

Add to `ios/App/App/Info.plist`:

```xml
<key>NSMotionUsageDescription</key>
<string>The app needs to access the motion activity.</string>
```

## Usage

### Get a single measurement

```typescript
import { Accelerometer } from '@capawesome-team/capacitor-accelerometer';

const measurement = await Accelerometer.getMeasurement();
console.log('X:', measurement.x);
console.log('Y:', measurement.y);
console.log('Z:', measurement.z);
```

### Continuous measurement updates

```typescript
import { Accelerometer } from '@capawesome-team/capacitor-accelerometer';

await Accelerometer.addListener('measurement', (event) => {
  console.log('X:', event.x, 'Y:', event.y, 'Z:', event.z);
});

await Accelerometer.startMeasurementUpdates();

// Later, stop updates:
await Accelerometer.stopMeasurementUpdates();
await Accelerometer.removeAllListeners();
```

### Check and request permissions

```typescript
import { Accelerometer } from '@capawesome-team/capacitor-accelerometer';

const status = await Accelerometer.checkPermissions();
if (status.accelerometer !== 'granted') {
  await Accelerometer.requestPermissions();
}
```

### Check availability

```typescript
import { Accelerometer } from '@capawesome-team/capacitor-accelerometer';

const { isAvailable } = await Accelerometer.isAvailable();
```

## Notes

- Acceleration values are measured in G's (gravitational force).
- The `measurement` event listener requires calling `startMeasurementUpdates()` to begin emitting events.
- Call `stopMeasurementUpdates()` to stop receiving events.
