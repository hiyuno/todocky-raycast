# Todocky for Raycast

Add tasks to [Todocky](https://github.com/hiyuno/Todocky) without leaving Raycast.

The extension talks to the MCP server that the Todocky Mac app already embeds — a
loopback-only JSON-RPC endpoint on `127.0.0.1:47823`. Nothing leaves your Mac, and
no account, API key or sync service is involved.

## Setup

1. Open Todocky → **Settings → MCP Server** and turn it on.
2. Run any command from this extension. The first call after each Todocky launch
   raises a confirmation in Todocky itself — press **Allow**.

The **Open Todocky** action brings the app forward via AppleScript, so macOS asks
once for permission to let Raycast control Todocky.

If Todocky runs on a different Mac on your network, turn on **Allow network access**
there, generate a token, and put the network URL and the token in this extension's
preferences. That traffic is unencrypted, so only do it on a network you trust.

## Commands

| Command | What it does |
|---|---|
| **Add Task** | Form with a project picker, task name and notes. Keeps the project selected after submitting, so you can capture several tasks in a row. |
| **Quick Add Task** | Type the task straight into the Raycast bar. Files it into the project named in preferences, otherwise the last one you used, otherwise Inbox. |
| **Search Projects** | Browse projects, look at their tasks, and add a task to any of them. |

## Preferences

- **Todocky Server URL** — defaults to `http://127.0.0.1:47823/`, the URL Todocky
  shows in Settings.
- **Access Token** — only needed when reaching Todocky over the network.
- **Default Project** — the project *Quick Add Task* files into. If the name does
  not match any project, the command stops instead of filing the task elsewhere.

## Development

```sh
npm install
npm run dev     # loads the extension into Raycast with live reload
npm run lint
npm run build
```
