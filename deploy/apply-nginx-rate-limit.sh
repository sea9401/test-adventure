#!/usr/bin/env bash
# 운영 nginx 설정에 느슨한 rate limit 을 적용한다.
# EC2 에서 실행: cd ~/adventure-rpg && bash deploy/apply-nginx-rate-limit.sh
set -euo pipefail

DEST="${DEST:-/etc/nginx/conf.d/msmsge.conf}"
TMP="$(mktemp)"

sudo cp "$DEST" "$TMP"

perl -0pi -e '
  my $zones = "limit_req_zone \$binary_remote_addr zone=api_per_ip:10m rate=20r/s;\n"
            . "limit_req_zone \$binary_remote_addr zone=page_per_ip:10m rate=60r/s;\n\n";
  $_ = $zones . $_ unless /zone=api_per_ip:10m/;

  my $api = q{
    location /api/auth/ {
        limit_req zone=api_per_ip burst=200 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }

    location /api/ {
        limit_req zone=api_per_ip burst=100 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }
};
  s/(\n\s*location\s+\/\s*\{\s*\n\s*proxy_pass\s+http:\/\/127\.0\.0\.1:3000;)/
    ($` =~ m{location\s+\/api\/}) ? $1 : "\n$api$1"/se;

  s/(location\s+\/\s*\{\s*\n)(?!\s*limit_req\s+zone=page_per_ip)/
    $1 . "        limit_req zone=page_per_ip burst=180 nodelay;\n        limit_req_status 429;\n"/ge;

  s/(proxy_set_header\s+X-Forwarded-Proto\s+\$scheme;\n)(?!\s*proxy_set_header\s+X-Forwarded-For)/
    $1 . "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\n        proxy_set_header X-Real-IP \$remote_addr;\n"/ge;
' "$TMP"

if sudo cmp -s "$TMP" "$DEST"; then
  rm -f "$TMP"
  echo "nginx rate limit already applied"
  exit 0
fi

BACKUP="${DEST}.bak.$(date +%Y%m%d%H%M%S)"
sudo cp "$DEST" "$BACKUP"
sudo cp "$TMP" "$DEST"
rm -f "$TMP"

if ! sudo nginx -t; then
  sudo cp "$BACKUP" "$DEST"
  sudo nginx -t
  echo "nginx config test failed; restored backup: $BACKUP" >&2
  exit 1
fi

sudo systemctl reload nginx

echo "nginx rate limit applied"
echo "backup: $BACKUP"
