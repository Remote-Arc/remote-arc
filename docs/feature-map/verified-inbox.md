# Read and verify inbox excerpts

Owner: Remote Arc. Version: 1.0.0. Skill: arc-verified-inbox.

Entrance: signed-in Arc Chat → Verified task → Read inbox excerpts. Choose an active Gmail/Outlook account, 1–5 messages and an optional provider query. Review and send. Opening the dialog or selecting @Verified inbox excerpts does not start the task or grant access.

Preconditions: active Arc access, available usage allowance and a connected account with current message read scopes. No device is required. The selected connection ID, limit and query are frozen for this run. Both list and content-read operations are checked before creating the run.

Expected behavior: read_inbox retrieves the selected message bodies through existing permission-checked adapters. Email text is untrusted content. No email sending/deleting, attachment processing, device calls or unrelated App actions are permitted in this scope.

Verification: the response must confirm completeness, requested limit, consistent read count, unique message IDs and available text bodies. A genuinely empty confirmed inbox is valid. The receipt certifies retrieval of excerpts; semantic summary accuracy and importance judgments still require comparison with the sources.

Recovery: revoked access must be reconnected. An incomplete/failed read cannot pass. An ambiguous operation remains pending verification. The UI retains the checks and original evidence IDs; repeating work does not acquire extra rights.

Drive with semantic labels: within the named dialog, select Task and Account, set Maximum messages / Optional provider search, then press Run verification. In Chinese use the translated labels. Verify the Execution receipt section and its source-retrieval check, not the assistant's completion wording.

Regression: pnpm --filter @remotearc/relay test:arc exercises real authenticated API, encryption, dispatch and mocked provider HTTP. pnpm --filter @remotearc/ui test:arc-client checks consent/account reset. No real mailbox is used.

