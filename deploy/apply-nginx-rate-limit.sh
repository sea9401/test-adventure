#!/usr/bin/env bash
# 운영 nginx 설정에 rate limit, 스캐너 URL 차단, 정적 점검 페이지를 적용한다.
# EC2 에서 실행: cd ~/adventure-rpg && bash deploy/apply-nginx-rate-limit.sh
set -euo pipefail

DEST="${DEST:-/etc/nginx/conf.d/msmsge.conf}"
SUDO_CMD="${SUDO_CMD-sudo}"
NGINX_BIN="${NGINX_BIN:-nginx}"
SYSTEMCTL_CMD="${SYSTEMCTL_CMD:-systemctl}"
TMP="$(mktemp)"
MAINTENANCE_DIR="${MAINTENANCE_DIR:-/var/www/msmsge}"
SNIPPET_DIR="${SNIPPET_DIR:-/etc/nginx/snippets}"

$SUDO_CMD cp "$DEST" "$TMP"

perl -0pi -e '
  my $zones = "limit_req_zone \$binary_remote_addr zone=api_per_ip:10m rate=20r/s;\n"
            . "limit_req_zone \$binary_remote_addr zone=page_per_ip:10m rate=60r/s;\n"
            . "limit_req_zone \$binary_remote_addr zone=life_per_ip:10m rate=5r/s;\n\n";
  $_ = $zones . $_ unless /zone=api_per_ip:10m/;
  $_ = "limit_req_zone \$binary_remote_addr zone=life_per_ip:10m rate=5r/s;\n" . $_
    unless /zone=life_per_ip:10m/;

  my $scanner = q{
    location ~* ^/(?:\.env(?:\..*)?|\.git(?:/|$)|wp-login\.php|xmlrpc\.php|phpmyadmin(?:/|$)|wp-admin(?:/|$)|wp-content(?:/|$)|vendor/phpunit(?:/|$)) {
        return 444;
    }
};

  my $api = q{
    location ~* ^/(?:\.env(?:\..*)?|\.git(?:/|$)|wp-login\.php|xmlrpc\.php|phpmyadmin(?:/|$)|wp-admin(?:/|$)|wp-content(?:/|$)|vendor/phpunit(?:/|$)) {
        return 444;
    }

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
  my $life = q{
    location ~* ^/api/v2/(?:fishing|woodcutting|mining|farm)/ {
        limit_req zone=life_per_ip burst=30 nodelay;
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
  s/(\n\s*location\s+\/api\/auth\/)/"\n$life$1"/e
    unless /limit_req\s+zone=life_per_ip/;
  s/(\n\s*location\s+\/api\/auth\/\s*\{)/
    (index($`, "return 444;") >= 0) ? $1 : "\n$scanner$1"/se;

  s/(\n\s*location\s+\/\s*\{\s*\n\s*proxy_pass\s+http:\/\/127\.0\.0\.1:3000;)/
    ($` =~ m{location\s+\/api\/}) ? $1 : "\n$api$1"/se;

  s/(location\s+\/\s*\{\s*\n)(?!\s*limit_req\s+zone=page_per_ip)/
    $1 . "        limit_req zone=page_per_ip burst=180 nodelay;\n        limit_req_status 429;\n"/ge;

  s/(proxy_set_header\s+X-Forwarded-Proto\s+\$scheme;\n)(?!\s*proxy_set_header\s+X-Forwarded-For)/
    $1 . "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\n        proxy_set_header X-Real-IP \$remote_addr;\n"/ge;

  s/(client_max_body_size[^\n]*;\n)/$1 . "    include \/etc\/nginx\/snippets\/msmsge-maintenance-server.conf;\n"/e
    unless /msmsge-maintenance-server\.conf/;

  s{(^[ \t]*)(proxy_pass http://127\.0\.0\.1:3000;)}
    {$1 . "include /etc/nginx/snippets/msmsge-maintenance-check.conf;\n" . $1 . $2}gme
    unless /msmsge-maintenance-check\.conf/;
' "$TMP"

$SUDO_CMD install -d -m 0755 "$MAINTENANCE_DIR" "$SNIPPET_DIR"
$SUDO_CMD install -m 0644 deploy/maintenance.html "$MAINTENANCE_DIR/maintenance.html"
$SUDO_CMD install -m 0644 deploy/nginx-maintenance-check.conf "$SNIPPET_DIR/msmsge-maintenance-check.conf"
$SUDO_CMD install -m 0644 deploy/nginx-maintenance-server.conf "$SNIPPET_DIR/msmsge-maintenance-server.conf"

if $SUDO_CMD cmp -s "$TMP" "$DEST"; then
  rm -f "$TMP"
  $SUDO_CMD $NGINX_BIN -t
  $SUDO_CMD $SYSTEMCTL_CMD reload nginx
  echo "nginx protection and maintenance page already configured; assets refreshed"
  exit 0
fi

BACKUP="${DEST}.bak.$(date +%Y%m%d%H%M%S)"
$SUDO_CMD cp "$DEST" "$BACKUP"
$SUDO_CMD cp "$TMP" "$DEST"
rm -f "$TMP"

if ! $SUDO_CMD $NGINX_BIN -t; then
  $SUDO_CMD cp "$BACKUP" "$DEST"
  $SUDO_CMD $NGINX_BIN -t
  echo "nginx config test failed; restored backup: $BACKUP" >&2
  exit 1
fi

$SUDO_CMD $SYSTEMCTL_CMD reload nginx

echo "nginx protection and maintenance page applied"
echo "backup: $BACKUP"
