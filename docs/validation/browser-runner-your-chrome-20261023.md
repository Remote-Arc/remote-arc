# Browser Runner: existing Chrome validation (2026-10-23)

PR #313 adds saved sign-ins and an optional `browser=your_chrome` mode.
It remains stacked on #310 (`perf/browser-runner-fast-forms`).

## Verified on Windows

- `go build ./...` and `go vet ./...` from `apps/agent`.
- `go test ./internal/vault ./internal/browserrunner ./internal/cli -count=1`.
- Chrome tests cover shared connections, existing cookies, keeping unrelated
  tabs, browser/profile defaults on resume, Agent restart with an unsubmitted
  draft still in its original tab, closing paused or already closed task tabs,
  idle disconnect/reconnect, and cross-site iframe uploads/submissions.
- HTTP/WebSocket fixtures cover a delayed Allow shared by retries, denial,
  and cancelling an in-progress handshake when the Agent stops.
- `REMOTEARC_YOUR_CHROME_LIVE=1 go test ./internal/browserrunner -run
  '^TestLiveYourChrome$' -count=1 -v -timeout 5m` passed against the actual
  running Chrome. Two example.com tasks shared one connection, read their
  page titles and followed the public Learn more link. Their task windows
  were then closed and the connection disconnected. This test is opt-in;
  normal tests never attach to the user's Chrome.
- Relay browser tool contracts and UI/Relay TypeScript checks passed.
  Older Agents that ignore the browser parameter are reported as unsupported
  rather than claiming they connected to the user's Chrome.
- UI production build, SEO smoke, onboarding readability and use-case checks
  passed. Playwright's existing route checks passed for the browser guide,
  MCP reference and application workflow on desktop English/light and mobile
  Chinese/dark, using installed Chrome (`PLAYWRIGHT_CHANNEL=chrome`).
- Screenshots and link checks confirmed three mode cards, localized setup
  links, correct document language, and no horizontal overflow or page errors.

## Limits

- Chrome's native Allow prompt remains required for each new connection.
  Keeping the shared connection avoids new prompts between tasks. Chrome's
  control banner remains visible while connected.
- Connections disconnect five minutes after the last task detaches. Idle
  tasks first pause after twenty minutes. Agent shutdown disconnects at once
  and preserves task windows for recovery. A disconnected task window may
  remain open when closed/forgotten; `tab_left_open` reports this explicitly.
- The shell-script switch-page test is skipped on Windows; input validation
  and handshake lifecycle tests run there. The native smoke test was run once
  successfully; it does not assert a real user rejection of the Chrome dialog.
- Local race instrumentation was unavailable because this Go installation
  has CGO disabled and no C compiler. No claim of a passing race run is made.
- No Agent installation, production deployment, PR merge, or Chrome Web Store
  submission was performed by this change.

Chrome's documented permission behavior:
https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session
