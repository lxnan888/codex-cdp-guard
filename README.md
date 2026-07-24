# Codex CDP Guard

一个通过 Chrome DevTools Protocol 自动暂停 Codex 询问倒计时的 Windows 桌面工具。

界面支持中文和英文，首次启动默认中文，并会记住上次选择的语言。

## 下载

Windows x64 便携版可从 GitHub Releases 下载，无需安装。

## 开发

```powershell
npm install
npm run dev
```

Codex 桌面端需要在 `127.0.0.1:9229` 开放页面调试端口。程序启动后会自动连接，也可以在界面修改主机、端口和轮询间隔。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

## 打包

```powershell
npm run dist
```

便携版 `.exe` 输出到 `release` 目录。程序不创建系统服务、不驻留托盘，也不保存连接配置或事件日志，仅在本地保存界面语言偏好；关闭窗口后监控立即停止。

正式版本由 `v*` Git 标签触发 GitHub Actions 构建并发布，本地开发无需生成 Release 文件。
