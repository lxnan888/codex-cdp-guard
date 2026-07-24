# Codex CDP Guard

一个通过 Chrome DevTools Protocol 自动暂停 Codex 询问倒计时的 Windows 桌面工具。

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

便携版 `.exe` 输出到 `release` 目录。程序不创建系统服务、不驻留托盘，也不保存配置或事件日志；关闭窗口后监控立即停止。
