# Codex CDP Guard

<p align="center">
  <strong>中文</strong>
  &nbsp;|&nbsp;
  <a href="README_EN.md">English</a>
</p>

<p align="center">
  通过 Chrome DevTools Protocol 自动暂停 Codex 询问倒计时的 Windows 桌面工具。
</p>

## 界面展示

### 中文界面

![Codex CDP Guard 中文界面](docs/images/app-zh.png)

### 英文界面

![Codex CDP Guard 英文界面](docs/images/app-en.png)

## 功能

- 自动连接开放 CDP 调试端口的 Codex 桌面端。
- 发现新的询问面板后触发暂停交互。
- 显示检测、暂停和连接失败统计，以及最近 50 条事件。
- 支持中文和英文。首次启动默认中文，可使用右上角的 `中文 / EN` 按钮切换，并记住上次选择。
- 支持修改主机、端口和轮询间隔。

## 下载

从 [GitHub Releases](https://github.com/lxnan888/codex-cdp-guard/releases) 下载 Windows x64 便携版 `.exe`，无需安装。

## 开发

```powershell
npm install
npm run dev
```

Codex 桌面端需要在 `127.0.0.1:9229` 开放页面调试端口。程序启动后会自动连接，也可以在界面修改连接设置。

## 验证

```powershell
npm run typecheck
npm test
```

## 发布

`v*` Git 标签会触发 GitHub Actions，在 Windows runner 上测试、构建便携版 EXE 并创建 GitHub Release。

程序不创建系统服务、不驻留托盘，也不保存连接配置或事件日志，仅在本地保存界面语言偏好；关闭窗口后监控立即停止。
