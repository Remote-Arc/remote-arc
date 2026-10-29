---
name: setup
description: Guide a new Remote Arc user through pairing a Windows, macOS, or Linux computer with their current AI client, and verify that the computer is online.
---

# Set up Remote Arc

Use this skill when a user installs Remote Arc, asks how to begin, or cannot find their computer.

## Check before asking them to install

1. If Remote Arc is connected, call `list_devices` to determine whether their account has paired computers. Do not assume the AI client connection also installed the computer Agent.
2. If a paired Windows, macOS, or Linux computer is online (not merely a Chrome Companion browser entry), tell the user it is ready and ask what they want to do. Do not recommend reinstalling.
3. If a paired computer exists but is offline, explain that the Agent must be running on that computer. Ask them to open Remote Arc on that machine or enable its background connection in Dashboard if they want access after login. Do not pair a duplicate device just to fix an offline status.
4. If no Windows/macOS/Linux computer is paired (even if a Chrome Companion browser is listed), lead with the native download link. Offer the general guide as more information and include the Dashboard link. Expand curl and npx alternatives only when useful or requested, in that order. Do not lead with npm or ask a nontechnical user to install Node.js.

## First-time computer pairing

Use the current client context. Do not assume ChatGPT: users may be in Claude, Codex, Cursor or another compatible MCP client. Use the general guide below when the client is unknown. Only offer https://remotearc.app/install/chatgpt as a client-specific guide when the user is actually using ChatGPT; do not send users of other clients to install the ChatGPT Plugin.

Keep the first reply short and use the user's language. When they need to install the Agent, give the download link directly rather than requiring a documentation visit first.

1. **Install the Agent:** https://remotearc.app/downloads. Choose Windows, macOS or Linux. No Node.js is required. Follow the page's current primary installation method on the **computer the user wants their AI client to access**. On macOS, if the page offers a signed DMG, have the user open it, drag Remote Arc into Applications and open the App to pair in their browser. Otherwise use the curl installer, which selects the processor and sets executable permissions automatically. Do not describe the raw macOS command-line binary as a drag-and-drop app or require users to run chmod when using either installer. Do not claim a signed DMG is available before the download page offers it.
2. **More information:** https://remotearc.app/connect-ai. This is the general client connection and installation guide. **Dashboard:** https://agent.remotearc.app/devices for paired computers, status and permissions.
3. **Optional — curl on macOS/Linux:** no Node.js is needed. Have the user run this installation command in Terminal, then run the startup command printed by the installer. Running it inside WSL installs into WSL, not Windows.

   ```sh
   curl -fsSL https://remotearc.app/install.sh | sh
   ```

4. **Optional — npx:** for users who already have Node.js 20 or newer, on Windows, macOS or Linux:

   ```sh
   npx remotelink@latest
   ```

The user runs the Agent locally; the AI client cannot bootstrap an unpaired computer by installing it in a cloud terminal.

- The Agent opens a browser pairing flow. Have the user sign into the **same Remote Arc account** connected to their current AI client, compare the displayed short code, and approve the actual machine.
- **Dashboard:** https://agent.remotearc.app/devices. Include this link so the user can see paired computers, online status and device permissions.
- Choose the minimal necessary device permissions, including read-only access first. Editing and terminal execution are separate permissions.
- If prompted, allow background connection only when the user wants it. The computer must be powered on and connected; Remote Arc cannot turn on an off computer.
- Return to the current conversation and call `list_devices` again to verify the new machine appears and is online.
- Offer a simple read-only test such as `device_tools` for the paired machine, before any file edits or commands.

## AI client connection is a separate step

Connecting Remote Arc to the AI client and completing OAuth authorize the **AI client**. Running the Agent and approving its pairing authorize the **computer**. Both are needed for computer tasks, and neither replaces the other.

If an OAuth prompt appears, guide the user to connect Remote Arc in the client they are using, sign in and approve the requested scopes. Never ask for passwords, pairing codes, OAuth tokens, OTPs, or CAPTCHA solutions in chat.

More setup information: https://remotearc.app/connect-ai

Do not claim installation or device pairing succeeded until `list_devices` confirms it. Never silently install the Agent on a different machine. Apps integrations (e.g. GitHub or Gmail through `list_apps`) may work without a paired computer, but computer tools do not.
