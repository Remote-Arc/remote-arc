# Browser Runner handoff and live view

Browser Runner uses an installed Chrome, Edge or Chromium window on the linked computer. By default the window runs out of sight. It is not a cloud browser or a truly windowless browser. True headless operation and datacenter IP addresses can cause sites to request more verification; use a computer with a display for human handoff.

After a submit or navigation, the Agent checks for visible verification, sign-in and one-time-code blockers. It shows the existing task window without reloading it and notifies its owner. Dashboard device settings can change this to **Notify only** for meetings or presentations. Hidden, inactive CAPTCHA frames do not stop a task. Remote Arc does not solve challenges or read their responses.

Use `browser_runner_wait` with `until=user_done` to wait while the owner finishes. Other conditions are `page_change`, `text`, `url_contains`, `upload_done` and `idle`. Each call waits locally for up to 40 seconds and returns `met`, `timeout` or `needs_user`. A timeout can be followed by another wait. Waiting never authorizes or retries a submit; inspect the result and confirm the existing effect.

For managed background processes, use `process_status` with `wait_ms` and optional `until_text`, rather than repeated sleep/output calls. Values over 40000 are capped.

The live-view page is available only to the signed-in device owner. It starts a view-only JPEG stream while someone is watching, at most two frames per second, capped at 200 KB per frame. A viewport capture supplies the first frame and refreshes a static or occluded page if screencast frames stop. It leaves the browser viewport and native window unchanged; Retina images are scaled locally before forwarding. Frames pass through memory only and are not saved, logged or sent to a model. A missing heartbeat stops capture after 30 seconds. Complete verification in the task window on the computer; remote input from the live-view page is a later feature.

A task waiting for the owner or carrying an unresolved final submit cannot be closed accidentally. Deliberate abandonment requires `force=true` and a reason, recorded in the task receipt. User handoffs have a two-hour timeout with one reminder before collection. Checkpoints survive collection and Agent restarts. If a browser must be reopened after restart, `reentry_needed` lists fields and uploads that must be restored; earlier receipts are history, not proof that the reopened page still contains them.

Rollout: apply migration `0064_runner_attention.sql` before the Relay, then update the Go Agent. Old Agents continue to support their previous tools; new wait/live-view operations require an updated Agent. Video upload support is tracked in #340 and must be released before validating the MP4 flow in #342. Test only synthetic forms, including delayed visible CAPTCHA challenges; do not use real employer submissions for acceptance tests.
