---
name: setup
description: Guide a new Remote Arc user through pairing a Windows, macOS, or Linux computer with the ChatGPT Plugin, and verify that the computer is online.
---

# Set up Remote Arc in ChatGPT

Use this skill when a user installs Remote Arc, asks how to begin, or cannot find their computer.

## Check before asking them to install

1. If Remote Arc is connected, call `list_devices` to determine whether their account has paired computers. Do not assume plugin OAuth also installed the computer Agent.
2. If a paired Windows, macOS, or Linux computer is online (not merely a Chrome Companion browser entry), tell the user it is ready and ask what they want to do. Do not recommend reinstalling.
3. If a paired computer exists but is offline, explain that the Agent must be running on that computer. Ask them to open Remote Arc on that machine or enable its background connection in Dashboard if they want access after login. Do not pair a duplicate device just to fix an offline status.
4. If no Windows/macOS/Linux computer is paired (even if a Chrome Companion browser is listed), show the installation guide, recommend a native download, then offer curl and npx as alternatives in that order. Do not lead with npm or ask a nontechnical user to install Node.js.

## First-time computer pairing

Give the user these links directly, in their language:

1. **Installation guide:** https://remotearc.app/install/chatgpt.
2. **Recommended — native download:** https://remotearc.app/downloads. Choose Windows, macOS or Linux and the appropriate processor. No Node.js is required. Follow the page's platform-specific instructions to run the downloaded Agent on the **computer the user wants ChatGPT to access**. Do not promise a macOS binary works by double-clicking; the page explains its execution-permission and Terminal steps.
3. **Alternative — curl on macOS/Linux:** no Node.js is needed. Have the user run this installation command in Terminal, then run the startup command printed by the installer. Running it inside WSL installs into WSL, not Windows.

   ```sh
   curl -fsSL https://remotearc.app/install.sh | sh
   ```

4. **Alternative — npx:** for users who already have Node.js 20 or newer, on Windows, macOS or Linux:

   ```sh
   npx remotelink@latest
   ```

The user runs the Agent locally; ChatGPT cannot bootstrap an unpaired computer by installing it in a cloud terminal.

- The Agent opens a browser pairing flow. Have the user sign into the **same Remote Arc account** used for the ChatGPT Plugin, compare the displayed short code, and approve the actual machine.
- **Dashboard:** https://agent.remotearc.app/devices. Include this link so the user can see paired computers, online status and device permissions.
- Choose the minimal necessary device permissions, including read-only access first. Editing and terminal execution are separate permissions.
- If prompted, allow background connection only when the user wants it. The computer must be powered on and connected; Remote Arc cannot turn on an off computer.
- Return to this ChatGPT conversation and call `list_devices` again to verify the new machine appears and is online.
- Offer a simple read-only test such as `device_tools` for the paired machine, before any file edits or commands.

## ChatGPT account connection is a separate step

Installing the public Plugin and completing Remote Arc OAuth authorize the **AI client**. Running the Agent and approving its pairing authorize the **computer**. Both are needed for computer tasks, and neither replaces the other.

If an OAuth prompt appears, guide the user to connect Remote Arc in ChatGPT, sign in and approve the requested scopes. Never ask for passwords, pairing codes, OAuth tokens, OTPs, or CAPTCHA solutions in chat.

Direct setup documentation: https://remotearc.app/install/chatgpt

Do not claim installation or device pairing succeeded until `list_devices` confirms it. Never silently install the Agent on a different machine. Apps integrations (e.g. GitHub or Gmail through `list_apps`) may work without a paired computer, but computer tools do not.
