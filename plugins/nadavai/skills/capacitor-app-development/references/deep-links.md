# Deep Links: Hosting the Association Files

Deep links, Universal Links, App Links, `appUrlOpen` routing and verification belong to the `capacitor-deep-linking` skill. This file keeps only where the web project puts the two site association files.

They must be reachable at:

- `https://<domain>/.well-known/apple-app-site-association`
- `https://<domain>/.well-known/assetlinks.json`

For web frameworks, place the files in the correct directory:

- **Angular**: Add to `src/.well-known/` and configure `angular.json` assets array to include `.well-known`.
- **React (CRA / Vite)**: Place in `public/.well-known/`.
- **Vue**: Place in `public/.well-known/`.

iOS: Apple's [Search API Validation Tool](https://search.developer.apple.com/appsearch-validation-tool/) checks the hosted association file.
