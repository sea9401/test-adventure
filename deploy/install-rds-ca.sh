#!/usr/bin/env bash
# AWS RDS 상용 리전용 CA bundle을 시스템 경로에 설치/갱신한다.
# 사용: bash deploy/install-rds-ca.sh
set -euo pipefail

SOURCE_URL="https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem"
TARGET_PATH="${DATABASE_CA_CERT_PATH:-/etc/pki/rds/global-bundle.pem}"
TEMP_FILE=$(mktemp)
trap 'rm -f "$TEMP_FILE"' EXIT

echo "▶ AWS RDS CA bundle 다운로드"
curl -fsS "$SOURCE_URL" -o "$TEMP_FILE"

grep -q -- "-----BEGIN CERTIFICATE-----" "$TEMP_FILE" || {
  echo "✗ 내려받은 파일에 PEM 인증서가 없음" >&2
  exit 1
}
openssl crl2pkcs7 -nocrl -certfile "$TEMP_FILE" \
  | openssl pkcs7 -print_certs -noout >/dev/null

echo "▶ $TARGET_PATH 설치"
sudo install -d -m 0755 "$(dirname "$TARGET_PATH")"
sudo install -m 0644 "$TEMP_FILE" "$TARGET_PATH"
echo "✓ AWS RDS CA bundle 설치 완료"
