# Shipping Croft to the App Store (iOS)

Croft is a PWA wrapped natively with **Capacitor**. This doc is the runbook for
turning the web app into a submittable iOS app.

The repo is already scaffolded:

- `capacitor.config.ts` — app id `za.co.underbridges.croft`, name **Croft**.
- `@capacitor/core`, `@capacitor/ios`, `@capacitor/cli` installed.
- Scripts: `npm run cap:add:ios`, `npm run cap:sync`, `npm run cap:open:ios`.
- The PWA pre-flight blockers are fixed (safe-area insets, zoom-lock removed,
  padded maskable icons).

By default the app **loads the live PWA** (`server.url` in the Capacitor config),
so the existing email + Google cookie auth works unchanged inside the WebView.

---

## Prerequisites (you provide)

| Need | Status | Note |
|------|--------|------|
| **Mac + Xcode** | ✅ you have this | Install Xcode from the App Store; run `xcode-select --install` for CLI tools. |
| **CocoaPods** | install | `sudo gem install cocoapods` (or `brew install cocoapods`). Capacitor uses it for the iOS project. |
| **Apple Developer Program** | ❌ not yet | **$99/yr** at [developer.apple.com](https://developer.apple.com/programs/). Required to sign, test on a device, and submit. Everything below up to "Signing" works without it. |

---

## 1. Generate the native iOS project (on your Mac)

```bash
npm install            # restore deps
npm run build          # build web/dist
npm run cap:add:ios    # generates the ios/ Xcode project (one time)
npm run cap:sync       # build + copy web + sync native (run after every web change)
npm run cap:open:ios   # opens ios/App/App.xcworkspace in Xcode
```

`ios/` is generated locally; build artifacts are git-ignored. Commit the `ios/`
project folder itself if you want it in version control (recommended once it exists).

## 2. App icon & splash

The PWA icons live in `web/public/icons/`. For the **native** app icon iOS wants a
1024×1024 PNG. Easiest path:

```bash
npm i -D @capacitor/assets
# place a 1024x1024 icon.png and a splash (2732x2732) in ./assets/
npx capacitor-assets generate --ios
```

This populates `ios/App/App/Assets.xcassets`. (A simple blue tile + white house
matching the current brand is fine to start.)

## 3. Signing (needs the Apple Developer account)

In Xcode → select the **App** target → **Signing & Capabilities**:
- Check **Automatically manage signing**.
- Select your **Team** (appears once you've joined the Developer Program and added
  your Apple ID in Xcode → Settings → Accounts).
- Bundle Identifier: `za.co.underbridges.croft` (must match `capacitor.config.ts`
  and the App Store Connect record).

## 4. App Store Connect

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps → +** →
   New App. Platform iOS, bundle id `za.co.underbridges.croft`, name **Croft**.
2. Fill in: category (Lifestyle / Productivity), privacy policy URL, support URL,
   description, keywords, **screenshots** (6.7" + 6.1" iPhone — capture from the
   running app/simulator), and the **App Privacy** questionnaire (Croft collects
   account email + household data → declare "Contact Info" and "User Content",
   linked to identity, used for app functionality).
3. In Xcode: **Product → Archive** → **Distribute App → App Store Connect → Upload**.
4. Back in App Store Connect, attach the build, then **Submit for Review**.

---

## ⚠️ The two decisions that matter

### a) App Review Guideline 4.2 ("minimum functionality")
Apple can reject apps that are *just* a website in a WebView. Croft has real
functionality, but to be safe, add a few native capabilities via Capacitor before
submitting — they also improve the app:
- `@capacitor/push-notifications` (this is on the roadmap anyway — APNs)
- `@capacitor/status-bar`, `@capacitor/haptics`, `@capacitor/share`,
  `@capacitor/app` (deep links / back handling)

A wrapper *plus* native push + share + haptics reads as a real app, not a webclip.

### b) Bundled build & token auth (optional, stronger)
The current config loads the remote site, so cookie auth "just works" but the app
needs a network connection and is a hosted WebView. To ship a **fully bundled,
offline-capable** app instead:

1. Remove the `server` block from `capacitor.config.ts` (app then loads
   `web/dist` from `capacitor://localhost`).
2. That origin is **cross-origin** to the API, so the `SameSite=Lax` `croft_token`
   cookie won't be sent. Migrate native auth to a **bearer token**:
   - On `/signup` & `/login`, also return the JWT in the JSON body.
   - Store it with `@capacitor/preferences` (or Keychain) on the device.
   - Send it as `Authorization: Bearer <jwt>`; have `requireAuth` accept the
     header in addition to the cookie.
   - Point the web API client at the absolute API URL
     (`https://croftapp.vercel.app/api`) when running in Capacitor
     (`Capacitor.isNativePlatform()`).
3. Google OAuth in a bundled app should use `@capacitor/browser` / an in-app
   browser tab and a custom-scheme redirect, rather than the web redirect.

Start with the remote-URL build (works today); move to bundled+token only if you
want offline or Apple pushes back on 4.2.
