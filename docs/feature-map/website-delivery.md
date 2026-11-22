# Website delivery in Arc

Entry: Arc Chat, or Skills → Build a working website → Use with Arc. Selection opens a new draft with an @badge and no expanded prompt. @ also lists active Apps; reference IDs are checked against the signed-in account and saved in the encrypted conversation.

Required: an online authorized computer with file and managed-process tools and a trusted workspace. Windows, macOS and Linux are supported; portable website work must not invent a Linux requirement. Existing source location and explicit user constraints remain binding.

Journey: describe the website → inspect or select a computer → create real files in a new project folder → read them back → start an available preview → check HTTP response and expected page content → return the actual path and preview URL. Publication requires the user's specified account/project and a separate actual public HTTP/content check. No browser automation or new framework is required for a static site.

Recovery: a no-match selection returns owned device capabilities with dispatched:false so the agent can correct inferred platform/tool requirements. It cannot relax permissions, explicit user requirements or workspace boundaries. Unknown writes retain the existing stop-and-inspect behavior. Missing optional media engines are not an implicit installation request.

Default Arc library: the three App verification workflows plus Build a working website and Create a saved report. The Connect catalog still exposes its engine handbooks, but those are no longer advertised as ready Arc skills. Image Studio/ComfyUI is not a built-in hosted image generation service.

Verification: apps/relay/scripts/arc-outcomes-test.ts drives the production runtime with scripted inference and an isolated synthetic device adapter, writes a real temporary HTML file and checks a live local HTTP response. It covers Linux mismatch recovery, ownership isolation, file schema rejection and one preview start. It does not establish real-model planning quality, customer-device health or public deployment success. Apps/Skills badge interactions are covered by the frontend tests and browser audit.
