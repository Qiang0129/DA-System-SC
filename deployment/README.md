# Docker 与 Cloudflare Tunnel 部署

正式部署目录为 `/home/lab18/apps/da-system-sc`，公网入口固定为 `https://da.scu-gpt.me`。所有业务容器只使用 Docker 内部网络，不发布 WSL、Windows 或局域网端口。

## 首次部署

1. 在 Cloudflare 当前账号创建远程管理 Tunnel `da-system-sc`。
2. 为 Tunnel 添加公共主机名 `da.scu-gpt.me`，服务 URL 设置为 `http://web:80`。
3. 初始化本机密钥并通过隐藏输入保存 Tunnel Token：

   ```bash
   ./deployment/scripts/init-runtime.sh
   ./deployment/scripts/set-tunnel-token.sh
   ```

4. 配置 Turnstile 和邮箱验证：

   ```bash
   cp .env.security.example .env.security
   chmod 600 .env.security
   nano .env.security
   ```

   填写 `VITE_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`、SMTP 账号、SMTP 授权码和发件人地址。保存后将 `EMAIL_VERIFICATION_REQUIRED` 保持为 `true`。

5. 构建、迁移并启动：

   ```bash
   ./deployment/scripts/deploy.sh
   ```

   如果本地栈已经运行，只需在写入 Token 后执行：

   ```bash
   ./deployment/scripts/start-tunnel.sh
   ```

6. 安装每日备份定时器与 Windows 登录常驻任务：

   ```bash
   sudo ./deployment/scripts/install-backup-timer.sh
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w deployment/windows/install-wsl-startup-task.ps1)"
   ```

   Windows 任务会隐藏运行 `wsl.exe -d Ubuntu --exec /usr/bin/sleep infinity`，防止没有交互式终端时 WSL 自动退出并终止 Docker 容器。

## 日常运维

```bash
./deployment/scripts/status.sh
./deployment/scripts/smoke-test.sh
./deployment/scripts/backup.sh
docker compose --env-file .env.runtime logs -f --tail 100
```

恢复命令必须明确确认：

```bash
./deployment/scripts/restore.sh /mnt/e/WSL-Backups/DA-System-SC/备份文件.tar.gz --confirm-restore
```

`.env.runtime` 包含数据库、JWT 和 Tunnel 凭据，权限必须保持 `600`，禁止提交、截图或粘贴到聊天记录。
