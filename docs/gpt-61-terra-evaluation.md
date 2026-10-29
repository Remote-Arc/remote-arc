# GPT-6.1 Terra in Arc

Reviewed 2026-10-27. Add Terra as a named hosted model for Plus / Pro; retain
GPT-6 Luna as the default Auto route until a real workload comparison supports
promotion. This review establishes documented compatibility and local integration,
not a measured quality or latency win over Luna.

## Published specifications and cost

OpenAI describes Terra as suited to visual reasoning, precise computer use and
writing, making it a relevant candidate for Arc's screen and browser workflows.
Both models accept images, have a 1,050,000-token context window and support
reasoning effort from `none` to `max` (default `medium`). Terra's tool calling
requires Responses. Arc already uses Responses for strict JSON, native decision
functions and hosted web search; the new model needs no transport or prompt change.

Standard USD per million tokens:

| Model | Uncached input | Cached input | Cache write, 30 minutes | Output |
| --- | ---: | ---: | ---: | ---: |
| GPT-6 Luna | $0.10 | $0.01 | $0.125 | $0.50 |
| GPT-6.1 Terra | $1.00 | $0.05 | $1.25 | $5.00 |

Terra costs 10 times Luna for uncached input and output, and 5 times for cache
reads. At 8,000 uncached input and 1,000 output tokens per inference, Luna costs
$0.0013 / 0.65 Arc Credits; Terra costs $0.013 / 6.5 Credits. A six-inference task
with that same usage per step costs $0.0078 / 3.9 Credits on Luna and $0.078 / 39
Credits on Terra. These are token-based examples, not measured task averages;
reasoning, cache usage and search fees change the result. The shared SaaS
calculator includes Terra automatically and keeps the existing cost-based wallet
conversion, budgets and plan terms.

Above 272K input tokens, Terra's input and cache rates double and its output
rate rises by 50% for the full request. The gateway reserves that higher rate
when the conservative input bound, including images and search content, crosses
the threshold. Settlement uses the observed total input tokens, so a large
reservation alone does not charge the premium. Arc retains its 4,096-token
output cap and the provider's
effective default reasoning effort; it does not expose the provider's full limits.

Sources: [Terra model and pricing](https://developers.openai.com/api/docs/models/gpt-6.1-terra),
[Luna model and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna),
[GPT-6 migration guidance](https://developers.openai.com/api/docs/guides/latest-model).

## Auto decision

Do not replace all Auto traffic based on capability positioning alone. The
absolute dollar difference is small for a short call, but multi-step tasks spend
the user's fixed Credits about ten times as fast at equal uncached token usage.
Terra may still be worthwhile when it improves first-attempt completion or saves
the user time; that requires measurement on Arc tasks.

First measure screen interpretation, browser action selection, multi-step tool
execution, grounded final answers and recovery from failed tools. Compare Luna
and Terra at the same effective reasoning effort, tool catalog and output cap.
Record completion rate, incorrect or duplicate writes, inference count, total
latency, tokens, cache usage and rated cost per completed task. Include repeated
trials; a single passing synthetic run does not establish model superiority.
If visual tasks justify the cost, consider a separately reviewed Auto routing
change targeting those tasks. Routine and trial traffic should remain on Luna
until that evidence exists. There is no new automatic fallback or retry.

## Verification and live comparison

Local checks cover the advertised model metadata and paid access gate, a
server-selected Terra Auto pilot, Responses vision/tool decisions, cache and
reasoning settlement, pre-dispatch budget denial, SaaS pricing and the synthetic
task harness. Scripted inference verifies integration, not model intelligence.

The existing live harness now accepts an allowlisted `ARC_EVAL_MODEL_ID` and an
optional comma-separated `ARC_EVAL_CASES`. It uses synthetic local accounts and
mocked external apps/devices, calls the real model only when a normal
`OPENAI_API_KEY` is supplied, and retains the total $0.25 funding ceiling. It
does not load credentials from Codex, alter production Auto or call real app
writes. Reports identify the actual selected model and whether inference was
scripted. Historical acceptance cannot be resumed for another model or subset.

Example in PowerShell, with the key supplied through the normal protected
evaluation environment:

```powershell
$env:ARC_EVAL_CASES = 'mail,github,vercel,calendar,managed-process,vercel-error'
$env:ARC_EVAL_MODEL_ID = 'gpt-6.1-terra' # repeat with gpt-6-luna for the baseline
pnpm --filter @remotearc/relay exec tsx scripts/arc-task-live-eval.ts
```

Save `work/arc-task-eval/report.json` under a model-specific name before the next
run. The task harness checks execution contracts and grounded answers; the
separate gateway regression checks image transport. A representative screen
quality set and latency measurements are still required before an Auto change.
No real Terra inference or account availability was verified in this local
review because this shell has no configured OpenAI API key.

For an approved environment-wide pilot, use the server-owned `ARC_MODELS`
override to replace the `arc-auto` entry with Terra's complete profile, including
all prices and long-context rates, while retaining `id: 'arc-auto'`. Keep the
other named-model entries. Merely setting `ARC_AUTO_MODEL_ID` to a named model
does not work for trial traffic: the funding database guard requires `arc-auto`.
Such a pilot changes Auto for the whole environment, including trials; it is not
a per-task visual router. Removing the model-list override restores the defaults.
