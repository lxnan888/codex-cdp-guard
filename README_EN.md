# Codex CDP Guard

<p align="center">
  <a href="README.md">中文</a>
  &nbsp;|&nbsp;
  <strong>English</strong>
</p>

<p align="center">
  A Windows desktop tool that automatically pauses Codex prompt countdowns through the Chrome DevTools Protocol.
</p>

## Screenshots

### Chinese interface

![Codex CDP Guard Chinese interface](docs/images/app-zh.png)

### English interface

![Codex CDP Guard English interface](docs/images/app-en.png)

## Features

- Automatically connects to the Codex desktop app through its open CDP debugging port.
- Triggers the pause interaction when a new prompt panel is detected.
- Shows detection, pause, and connection-failure statistics with the 50 most recent events.
- Supports Chinese and English. Chinese is used on first launch; use the `中文 / EN` control in the top-right corner to switch languages. The last selection is remembered.
- Supports custom host, port, and polling interval settings.

## Download

Download the portable Windows x64 `.exe` from [GitHub Releases](https://github.com/lxnan888/codex-cdp-guard/releases). No installation is required.

## Development

```powershell
npm install
npm run dev
```

The Codex desktop app must expose its page debugging port at `127.0.0.1:9229`. Codex CDP Guard connects automatically on startup, and the connection settings can be changed in the interface.

## Verification

```powershell
npm run typecheck
npm test
```

## Release

Pushing a `v*` Git tag triggers GitHub Actions to test and build the portable EXE on a Windows runner and publish a GitHub Release.

The app does not install a system service, remain in the system tray, or save connection settings or event logs. Only the interface language preference is stored locally, and monitoring stops when the window closes.
