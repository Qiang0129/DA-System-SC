#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

[[ "${EUID}" -eq 0 ]] || { echo "请使用 sudo 执行此脚本" >&2; exit 1; }

cat > /etc/systemd/system/da-system-sc-backup.service <<EOF
[Unit]
Description=DA-System-SC 每日一致性备份
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=root
WorkingDirectory=${PROJECT_DIR}
Environment=BACKUP_DIR=/mnt/e/WSL-Backups/DA-System-SC
ExecStart=${PROJECT_DIR}/deployment/scripts/backup.sh
EOF

cat > /etc/systemd/system/da-system-sc-backup.timer <<'EOF'
[Unit]
Description=每天 03:30 执行 DA-System-SC 备份

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=5m

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now da-system-sc-backup.timer
systemctl list-timers da-system-sc-backup.timer --no-pager
