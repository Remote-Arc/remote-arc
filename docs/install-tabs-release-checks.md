# Install command tabs and production verification

The homepage defaults to npx. The same command card offers curl for native macOS/Linux/WSL installation and Homebrew, with the relevant requirements and matching copy action. Windows users can use npx or the native download link. The curl/Homebrew command blocks include remotelink for the first launch; installation does not authorize a device or grant tools by itself. The Homebrew tab links to the full tap/trust instructions.

The tabs support Left/Right, Home/End, roving focus, labeled panels and clipboard failure feedback. Changing methods clears old copy status, including a still-pending clipboard request. The card uses the existing theme tokens and respects reduced motion.

Production remains an owner-triggered promotion of master through the protected production environment. The new CI gate waits up to fifteen minutes for the latest push CI run for the exact requested SHA. Pending CI no longer causes an immediate failed deployment. A failed/cancelled CI run, stale master, unreadable API response or timeout stops promotion before database/Worker changes. The existing migration backup and vault-key safeguards remain in place.

The deployed Worker reports its public commit identity as deployment in /health, with no-store caching. The deploy script supplies DEPLOYMENT_SHA alongside the normal version tag.

After deployment, a bounded, read-only verifier checks:

- Exact Worker SHA and CLI version.
- Public Home, Arc, Docs, installation and categorized integrations routes in both languages.
- The actual JavaScript bundle and byte-for-byte native installation script.
- The Apps catalog/status schema, without treating configured credentials as verified OAuth.
- Signed-out Apps login with its original category preserved and unknown Docs routes returning 404.

The verifier can retry during propagation, but never approves OAuth, sends messages, executes device tools or spends provider credits. Failed verification marks the release failed for investigation; it does not automatically restore D1, rotate credentials or roll back an already deployed Worker.

Local checks:

    pnpm test:deploy-policy
    node scripts/production-smoke.mjs

The second command checks current production without asserting an exact SHA. The protected workflow always passes --sha "$GITHUB_SHA".
