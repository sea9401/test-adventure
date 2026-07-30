# CloudFront + WAF 도입 절차

이 문서와 `infra/cloudfront-waf/`는 CDN/WAF 생성, 단계적 DNS 전환, 즉시 롤백을
한 변경 단위로 수행하기 위한 실행 자료다.

## 현재 운영 상태 — 2026-07-30

- CloudFront distribution `E2NWRUQ46FYRC`와 Pro 정액제(월 15 USD)를 사용한다.
- `msmsge.com`, `www.msmsge.com` Route53 alias는
  `diibeil31l506.cloudfront.net`을 가리킨다.
- WAF `msmsge-production-cloudfront`의 관리형 3개·rate 2개 규칙은 Count로
  관찰 중이다. 24~48시간 오탐 관찰 전에는 Block으로 올리지 않는다.
- `origin.msmsge.com` 인증서를 적용했고 CloudFront 원본 IP 48개만 실제 IP
  프록시로 신뢰한다. 비밀 원본 헤더 없는 HTTPS 직접 요청은 404로 거부한다.
- 전환 후 공개 release 검사, 모바일 로그인·게임 행동·새로고침, 동적 비캐시,
  해시 정적 자산의 CloudFront Hit를 확인했다.
- Route53 롤백 JSON은 CloudShell의 `.edge-state/`에 보관한다. WAF Block 승격과
  접근 로그 확인까지 끝나기 전에는 운영 TODO를 완료로 표시하지 않는다.

## 확정한 구성

```text
사용자 → Route53 → CloudFront + AWS WAF → origin.msmsge.com → EC2 Nginx → Next.js
```

- CloudFront 뷰어 인증서는 `us-east-1` ACM에서 `msmsge.com`과
  `www.msmsge.com`용으로 자동 발급·DNS 검증한다.
- `origin.msmsge.com`은 기존 EIP `54.180.28.29`를 가리킨다. 운영 EC2의 기존
  Let's Encrypt 인증서에 이 이름을 추가해 원본 연결도 TLS 1.2로 유지한다.
- 기본 동작은 모든 HTTP 메서드, 헤더, 쿠키, 쿼리를 원본으로 전달하고 캐시하지
  않는다. 로그인, OAuth, API, 동적 HTML의 동작이 바뀌지 않는다.
- 빌드 해시가 붙는 `/_next/static/*`만 AWS 관리형 최적화 정책으로 캐시한다.
  `/images/*`는 현재 파일명이 콘텐츠 해시가 아니므로 첫 전환에서는 캐시하지 않는다.
- CloudFront는 `X-Msmsge-Origin-Verify` 비밀 헤더를 원본 요청에 덮어쓴다. DNS
  전환이 안정된 뒤 Nginx에서 이 헤더 없는 HTTPS 직접 요청을 404로 거부한다.
- Nginx는 AWS가 공개한 `CLOUDFRONT_ORIGIN_FACING` IP만 프록시로 신뢰한다.
  따라서 `$remote_addr`, 연결 제한, API 속도 제한은 엣지 IP가 아닌 실제 사용자
  IP를 계속 기준으로 삼는다.

템플릿은 AWS 관리형 `CachingDisabled`, `CachingOptimized`, `AllViewer` 정책을
ID로 참조한다. CloudFront용 WAF는 반드시 `us-east-1`에서 생성해야 하므로 스택도
이 리전에 고정한다.

## 요금제 결정

운영 로그의 2026-07-21~30 원시 요청은 약 76.7만 건이었다. 스캐너 요청이 상당수이고
최근 감소세지만 월 100만 요청인 Free 한도를 안전하게 밑돈다고 단정하기 어렵다.
첫 도입은 **Pro 정액제(월 15 USD)**를 권장한다.

- Free: 월 100만 요청, 100GB, WAF 규칙 5개. 전체 로그 기능이 없어 Count 관찰이
  제한적이다.
- Pro: 월 1,000만 요청, 50TB, WAF 규칙 25개와 로그 기능. 초과 과금이 없고 WAF가
  차단한 요청은 사용량에 포함되지 않는다.
- 종량제는 CloudFront 외에 WAF Web ACL, 규칙, 요청이 각각 과금된다.

정액제 구독은 배포된 distribution을 CloudFront 콘솔에서 선택해 연결한다.
[AWS 정액제 설명](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html),
[CloudFront 가격](https://aws.amazon.com/cloudfront/pricing/),
[AWS WAF 가격](https://aws.amazon.com/waf/pricing/)

## WAF 규칙과 전환 기준

`infra/cloudfront-waf/template.yaml`은 정액제 Free에도 들어가는 5개 규칙을 만든다.

1. AWS IP 평판 관리형 규칙
2. AWS Known Bad Inputs 관리형 규칙
3. AWS Common Rule Set
4. 전체 요청 IP당 기본 5분 평가창 6,000회
5. 경기장·그리드 던전·오프라인 정산·전초기지 공격·대련 API IP당 기본 5분
   평가창 1,500회

최초 `WafMode=Count`에서는 모든 규칙이 지표와 샘플 요청만 남기고 차단하지 않는다.
24~48시간 동안 정상 로그인, OAuth 콜백, 플레이 API에 오탐이 없고 403·429·5xx가
증가하지 않은 것을 확인한 뒤 `WafMode=Block`으로 스택을 갱신한다. Pro 정액제에서
지원하지 않는 정규식 조건과 사용자 지정 평가창은 쓰지 않는다. 고비용 경로는 일반
문자열 시작 조건으로 묶고 rate 규칙은 AWS 기본 5분 평가창을 사용한다. 기존 1분당
평균 상한과 같도록 전체 6,000회, 고비용 API 1,500회로 환산했다.
[AWS rate 규칙 문서](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-high-level-settings.html)

## 0. 권한 원칙

운영 EC2의 `MsmsgeProdDbBackupEc2Role`은 백업 전용이며 Route53, ACM, CloudFront,
WAF 조회·변경 권한이 없다. 여기에 광범위한 권한을 추가하지 않는다. AWS 콘솔의
CloudShell 또는 만료 시간이 짧은 별도 배포 역할로 다음 절차를 수행한다.

실행 주체에는 이 스택과 DNS 전환 범위의 CloudFormation, ACM, CloudFront, WAFv2,
Route53 권한이 필요하다. 배포 뒤에는 권한을 회수한다. 원본 비밀값은 저장소,
명령행 인자, CI 로그에 넣지 않는다.

## 1. 기반 스택 생성

CloudShell 또는 전용 배포 세션에서 저장소 루트로 이동한다.

```bash
export HOSTED_ZONE_ID='실제-public-hosted-zone-id'
read -r -s -p 'Origin secret: ' ORIGIN_VERIFY_SECRET; echo
export ORIGIN_VERIFY_SECRET
bash infra/cloudfront-waf/deploy.sh
unset ORIGIN_VERIFY_SECRET
```

비밀값은 `openssl rand -hex 32`처럼 32~128자의 영문·숫자·`_`·`-`만 사용해
생성하고 안전한 비밀 저장소에 보관한다. 스크립트는 다음을 한 스택으로 만든다.

- `origin.msmsge.com` A 레코드
- apex/www용 ACM 인증서
- Count 모드 WAF Web ACL
- apex/www alias와 원본 비밀 헤더를 가진 CloudFront distribution

스택 출력의 `DistributionId`, `DistributionDomainName`, `WebAclArn`을 변경 기록에
남긴다. ACM DNS 검증과 CloudFront 전파 때문에 완료까지 수십 분 걸릴 수 있다.

## 2. 원본 준비

`origin.msmsge.com`이 EIP로 확인된 뒤 운영 EC2에서 기존 인증서에 원본 이름을
추가한다. 먼저 원본 SNI가 다른 가상 호스트로 빠지지 않게 운영 server block에 이름을
넣는다. 인증서 명령은 파일 경로를 유지하므로 현재 Nginx 설정을 갈아끼우지 않는다.

```bash
cd ~/adventure-rpg
bash deploy/apply-cloudfront-origin-host.sh
sudo certbot certonly --nginx --cert-name msmsge.com --expand --non-interactive \
  -d msmsge.com -d www.msmsge.com -d origin.msmsge.com
sudo nginx -t
sudo systemctl reload nginx
```

발급 뒤 인증서 SAN과 원본 HTTPS를 확인한다.

```bash
echo | openssl s_client -connect origin.msmsge.com:443 \
  -servername origin.msmsge.com 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
curl -fsS https://origin.msmsge.com/api/health
```

그다음 CloudFront가 붙어도 Nginx 제한이 사용자 IP별로 유지되도록 공식 IP 목록을
설치한다. 이 단계는 아직 DNS나 접근 차단을 바꾸지 않아 선적용할 수 있다.

```bash
cd ~/adventure-rpg
bash deploy/apply-cloudfront-real-ip.sh
```

AWS IP 범위 JSON의 `CLOUDFRONT_ORIGIN_FACING`만 `set_real_ip_from`으로 등록하며
매 실행 시 최신 목록으로 원자적으로 갱신한다.
[AWS IP 범위 문서](https://docs.aws.amazon.com/vpc/latest/userguide/aws-ip-ranges.html)

## 3. DNS 전 사전 검증과 요금제 연결

CloudFront 기본 도메인으로 원본 연결, 비캐시 health, 정적 자산 캐시를 확인한다.
기본 도메인으로 접속할 때 스크립트가 HTTP Host를 `msmsge.com`으로 보낸다.

```bash
bash infra/cloudfront-waf/smoke.sh dxxxxxxxxxxxxx.cloudfront.net
```

CloudFront 콘솔에서 이 distribution에 Pro 정액제를 연결하고 로그를 활성화한다.
같은 화면에서 `msmsge.com` Route53 hosted zone도 플랜에 연결해야 hosted zone과 표준
DNS 질의 비용이 정액제에 포함된다.
WAF 콘솔에서는 다섯 규칙이 Count이고 샘플 요청과 CloudWatch 지표가 들어오는지
확인한다. 로그인, 로그아웃, 카카오 콜백, 캐릭터 생성, 사냥 1회, 이미지 로드까지
직접 확인한 뒤 DNS로 진행한다.

## 4. 단계적 DNS 전환

AWS 세션에서 환경변수를 설정한다. 전환 스크립트는 대상 레코드의 기존 A를
권한 600 JSON으로 먼저 저장하고, CloudFront alias A로 UPSERT한다.

```bash
export HOSTED_ZONE_ID='실제-public-hosted-zone-id'
export DISTRIBUTION_DOMAIN='dxxxxxxxxxxxxx.cloudfront.net'
bash infra/cloudfront-waf/cutover-route53.sh www
bash infra/cloudfront-waf/smoke.sh msmsge.com
bash infra/cloudfront-waf/cutover-route53.sh apex
bash infra/cloudfront-waf/smoke.sh msmsge.com
```

`www`는 원래 apex로 301되므로 첫 명령 뒤 `curl -I https://www.msmsge.com/`도
확인한다. apex 전환 후 최소 두 TTL 동안 외부 health, 5xx, 429, EC2 CPU/메모리,
로그인과 핵심 게임 동작을 관찰한다.
`.edge-state/`의 두 Route53 백업 JSON은 롤백이 끝날 때까지 CloudShell 밖의 안전한
운영 기록 위치에도 복사한다.

DNS가 안정된 뒤에만 원본 직접 접근을 막는다. 기반 스택에 넣은 값과 **동일한**
비밀을 운영 EC2 환경변수로 전달한다.

```bash
read -r -s -p 'Origin secret: ' CLOUDFRONT_ORIGIN_SECRET; echo
export CLOUDFRONT_ORIGIN_SECRET
bash deploy/apply-cloudfront-origin-guard.sh
unset CLOUDFRONT_ORIGIN_SECRET
```

스크립트는 Nginx 백업, `nginx -t`, reload 후 헤더 없음=404·헤더 있음=200을
검증하며 실패하면 자동 복원한다. EC2 보안 그룹 443을 CloudFront 관리형 prefix
list로 제한하는 것은 48시간 안정화와 롤백 훈련 뒤 별도 변경으로 수행한다. 80은
Let's Encrypt HTTP-01 갱신을 위해 유지한다.

AWS가 원본 연결 IP 범위를 바꿀 수 있으므로 `apply-cloudfront-real-ip.sh`는 월 1회와
AWS `ip-ranges.json` 변경 알림 수신 시 다시 실행한다. 실패 시 기존 설정을 유지한다.

## 5. WAF Block 승격

Count로 24~48시간 관찰한 뒤 같은 배포 세션에서 실행한다. 기존 스택의 비밀과
다른 파라미터는 그대로 유지된다.

```bash
WAF_MODE=Block bash infra/cloudfront-waf/deploy.sh
```

승격 직후 `/api/health`, `/api/version`, 로그인과 OAuth, 사냥·생활·길드·경기장
동작을 재검사하고 WAF 차단 샘플을 확인한다. 오탐이면 즉시 Count로 되돌린다.

```bash
WAF_MODE=Count bash infra/cloudfront-waf/deploy.sh
```

## 긴급 롤백

원본 헤더 차단이 적용된 상태에서 DNS만 EIP로 되돌리면 모든 HTTPS 요청이 404가
되므로 반드시 아래 순서를 지킨다.

1. 운영 EC2에서 `bash deploy/remove-cloudfront-origin-guard.sh` 실행.
2. `cutover-route53.sh`가 출력한 apex와 www 백업 파일을 각각 복원.

```bash
export HOSTED_ZONE_ID='실제-public-hosted-zone-id'
bash infra/cloudfront-waf/rollback-route53.sh .edge-state/route53-apex-타임스탬프.json
bash infra/cloudfront-waf/rollback-route53.sh .edge-state/route53-www-타임스탬프.json
curl -fsS https://msmsge.com/api/health
```

롤백은 앱·CloudFront·WAF 스택을 삭제하지 않는다. 원인을 조사하고 재전환할 수 있게
리소스와 지표를 보존한다. DNS 정상화 전에 스택을 삭제하지 않는다.
