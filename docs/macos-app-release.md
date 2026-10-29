# Native macOS App and DMG

The native App bundles the existing Go Agent in a menu-bar launcher. Download the Apple Silicon or Intel DMG, open it, drag Remote Arc to Applications, and open it there. It opens the existing browser-pairing flow. Node.js and chmod are not required. Minimum macOS: 13 Ventura.

The menu provides connection status, Dashboard/device permissions, Start Agent, an explicit Stop connection action, optional Launch at login, logs and the latest download page. Permissions and pairing remain in the existing Agent/Dashboard; no new local execution API or automatic permissions grant is introduced. Existing pairing is reused. A menu-bar launch never forces replacement of busy work. The Agent's existing version handoff updates an older idle Go runtime; busy or unmeasurable older runtimes are preserved.

Quit stops the Agent/viewer launched by the app. Separately configured background recovery may keep the computer connected, reflecting the existing setting. Stop connection explicitly disables that recovery and can interrupt running work, after confirmation. Launch at login registers the installed App only after the user chooses it.

To upgrade, quit the App, replace it in Applications and reopen. Device pairing, policies and Local Undo live outside the bundle and are kept. The download page follows the latest stable release; this is not an in-app automatic updater.

## Local builds

Run on a Mac with Xcode tools, Node.js and the Go version specified by apps/agent/go.mod:

```sh
node scripts/macos-app-test.mjs --arch=arm64
node scripts/macos-app-test.mjs --arch=amd64
```

This creates ad-hoc signed **test** DMGs and receipts under work/macos-app. These must not be published as normal Gatekeeper-approved installers. Acceptance mounts the actual DMG, verifies the App, icon, version, architecture, executable bits and Applications shortcut, and runs non-pairing App/menu smoke tests on the host architecture.

For an actual release, use a Developer ID Application identity and a notarytool keychain profile, or an App Store Connect notarization API key:

```sh
MACOS_SIGNING_IDENTITY='Developer ID Application: Your Name (TEAMID)' \
MACOS_NOTARY_PROFILE='RemoteArcNotary' \
node scripts/macos-app-test.mjs --arch=arm64 --release
```

Use a fresh build workspace per attempt. The build refuses to overwrite an existing DMG at the same path. It signs the nested Go executable and App with hardened runtime, notarizes and staples the App, builds/signs/notarizes/staples the DMG, and verifies Gatekeeper acceptance. No xattr/quarantine-removal instructions are used to bypass Gatekeeper.

## Account and certificate setup

An Apple Developer login or Apple Development certificate is not a Developer ID distribution identity. Verify that the paid Apple Developer Program membership is active. Select the paid team, not Personal Team. An Account Holder can create Developer ID Application through Xcode or Certificates, Identifiers & Profiles on the developer website. Developer ID Installer is for PKG installers and is not needed for this DMG flow. Do not revoke the development certificate.

If only Apple Development is available, check the membership/team/role and refresh Xcode's account. Use the website certificate workflow if necessary. Create the CSR/private key on the signing Mac; download and install the issued certificate there so the private key and certificate match. Never paste a private key, password or notarization credential in chat or the repository.

## Automatic release pipeline

The existing publish-remotelink workflow calls build-macos-app.yml in release mode first. Both architectures must build, sign, notarize and pass acceptance before the publishing job starts. The production environment's review remains enforced. Configure these production environment secrets through GitHub's secret UI/authorized secure tooling:

- MACOS_CERTIFICATE_P12: base64 PKCS#12 export containing the Developer ID Application certificate **and matching private key**.
- MACOS_CERTIFICATE_PASSWORD: the export password.
- MACOS_NOTARY_PRIVATE_KEY: the App Store Connect notarization API key contents (.p8).
- MACOS_NOTARY_KEY_ID and MACOS_NOTARY_ISSUER_ID: that key's identity.

Credentials are imported into a temporary CI keychain and cleaned up in an always step. Normal PR builds are ad-hoc test builds, not public releases, and do not import production signing material.

Release collection validates both architecture receipts, exact version/filenames, notarization and actual DMG SHA256. Only then are DMGs, macos-apps.json and MACOS-SHA256SUMS included in the native release. The files downloaded from GitHub are checked again before promotion. Missing credentials, rejection, incomplete architecture coverage or mismatched hashes block publication. Use a new release version when publishing changed source; existing stable release assets are not overwritten.

The website checks /api/downloads/macos without caching. Only a complete stable notarized manifest enables the two direct DMG buttons. Before the first signed release, or if its metadata cannot be verified, the working curl installer remains visible. The /api/downloads/macos/{arm64|amd64} links derive fixed GitHub filenames from the latest stable manifest, independent of the website build version. No unsigned test package is offered as a production installer.

This change alone does not mean that a signed DMG has been publicly released; successful production signing, notarization, package publication and user-machine acceptance are separate evidence.
