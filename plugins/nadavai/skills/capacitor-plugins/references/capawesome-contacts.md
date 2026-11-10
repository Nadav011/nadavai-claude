# Contacts

Capacitor plugin to read, write, and select device contacts.

**Package:** `@capawesome-team/capacitor-contacts`

**Platforms:** Android, iOS, Web
**Documentation:** https://capawesome.io/docs/sdks/capacitor/contacts/

**Availability:** Capawesome Insiders only (paid licence)

## Installation

Paid plugin (Capawesome Insiders licence). Choosing it is a paid-service decision: ask Nadav first, and offer a free alternative from the `capacitor-plugins` index if one exists.

Install the package:

```bash
npm install @capawesome-team/capacitor-contacts
npx cap sync
```

## Configuration

### Android

#### Permissions

Add to `AndroidManifest.xml` before or after the `application` tag:

```xml
<uses-permission android:name="android.permission.READ_CONTACTS" />
<uses-permission android:name="android.permission.WRITE_CONTACTS" />
```

#### Proguard

If using Proguard, add to `proguard-rules.pro`:

```
-keep class io.capawesome.capacitorjs.plugins.** { *; }
```

### iOS

#### Privacy Descriptions

Add to `ios/App/App/Info.plist`:

```xml
<key>NSContactsUsageDescription</key>
<string>We need access to your contacts to display them in the app.</string>
```

#### Entitlements

To access the `note` field of a contact, the app must have the `com.apple.developer.contacts.notes` entitlement. See [Apple documentation](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.contacts.notes).

## Usage

### Create a contact

```typescript
import { Contacts, PhoneNumberType } from '@capawesome-team/capacitor-contacts';

const { id } = await Contacts.createContact({
  contact: {
    givenName: 'John',
    familyName: 'Doe',
    phoneNumbers: [
      { value: '1234567890', type: PhoneNumberType.Mobile, isPrimary: true }
    ]
  }
});
```

### Get contacts with pagination

```typescript
const { contacts } = await Contacts.getContacts({
  fields: ['id', 'givenName', 'familyName', 'phoneNumbers'],
  limit: 10,
  offset: 0
});
```

### Pick contacts

```typescript
const { contacts } = await Contacts.pickContacts({
  fields: ['id', 'givenName', 'familyName', 'emailAddresses'],
  multiple: true // Web only
});
```

### Update a contact

```typescript
await Contacts.updateContactById({
  id: 'contact-id',
  contact: {
    givenName: 'Jane',
    birthday: null,    // Deletes the field
    note: undefined    // Preserves existing value
  }
});
```

### Delete a contact

```typescript
await Contacts.deleteContactById({ id: 'contact-id' });
```

### Permissions

```typescript
const status = await Contacts.checkPermissions();
await Contacts.requestPermissions();
```

## Notes

- Supports CRUD operations for contacts and contact groups (groups on iOS only).
- Partial updates: missing properties are preserved, `null` values delete fields, `undefined` values are ignored.
- `getContacts()` does not return photos to avoid performance issues. Use `getContactById()` for individual contact photos.
- Pagination via `limit` (default: 20) and `offset` (default: 0) in `getContacts()`.
- Native modals available: `displayCreateContact()`, `displayContactById()`, `displayUpdateContactById()`.
- Android accounts support via `getAccounts()` and the `account` field on contacts.
- `countContacts()` returns the total number of contacts on the device.
