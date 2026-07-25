# CloudFront + WAF 도입 절차

현재 `msmsge.com`은 Route53 A 레코드가 EC2 EIP를 직접 가리킨다. 애플리케이션,
Nginx, 모니터링 보호를 먼저 배포하고 안정성을 확인한 뒤 이 절차를 별도 변경으로
진행한다. DNS와 인증서가 바뀌므로 앱 코드 PR과 한 번에 전환하지 않는다.

## 권장 구조

```text
사용자 → Route53 → CloudFront + AWS WAF → origin.msmsge.com → EC2 Nginx → Next.js
```

- CloudFront 뷰어 인증서는 `us-east-1` ACM에서 `msmsge.com`, `www.msmsge.com`을
  포함해 발급한다. [AWS 공식 인증서 요구사항](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html)
- `origin.msmsge.com`은 기존 EIP를 가리키고 원본용 공인 인증서를 따로 적용한다.
  CloudFront와 원본 사이도 HTTPS로 유지한다.
- 동적 페이지와 `/api/*`는 캐시하지 않고 쿠키·쿼리 문자열을 전달한다.
  `/_next/static/*`, `/images/*`처럼 해시 또는 정적 자산만 캐시한다.
- CloudFront가 넣는 비밀 원본 헤더가 없는 직접 요청은 Nginx에서 거부한다. 이후
  가능하면 EC2 보안 그룹도 CloudFront 원본 연결용 관리형 prefix list로 제한한다.

## WAF 초기 규칙

처음 24~48시간은 관리형 규칙을 `Count`로 관찰하고 정상 요청 오탐을 확인한 뒤
`Block`으로 바꾼다.

1. AWS Managed Rules의 IP 평판·Known Bad Inputs.
2. Common Rule Set은 JSON API 오탐을 확인한 뒤 차단 전환.
3. 전체 요청은 IP당 1분 1,200회 수준의 비상 상한.
4. 고비용 API 경로는 IP당 1분 300회 수준의 WAF 상한. 실제 정상 속도 제어는
   더 촘촘한 Nginx 3r/s와 앱의 사용자/IP 제한이 맡는다.
5. 관리자·로그인 경로는 별도 관찰 지표를 두고, 정상 OAuth 콜백을 방해하지 않게
   일반 API보다 넉넉하게 둔다.

AWS WAF rate 기반 규칙은 60·120·300·600초 평가 창을 지원한다.
[AWS 공식 rate 규칙 문서](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-high-level-settings.html)

## 무중단 전환과 롤백

1. `origin.msmsge.com` HTTPS와 원본 헤더 차단을 먼저 확인한다.
2. CloudFront 기본 도메인에서 health, 로그인, 게임 액션, 이미지, 업로드를 확인한다.
3. WAF는 Count 상태로 시작한다.
4. Route53 레코드 TTL을 낮춘 뒤 `www`부터 CloudFront로 전환하고, 이상이 없으면
   apex를 전환한다.
5. 외부 업타임·5xx·429·원본 CPU/메모리·WAF 샘플 요청을 함께 관찰한다.
6. 문제 발생 시 Route53을 기존 EIP로 되돌리고 원본 헤더 차단을 해제한다.

CloudFront 요금제에는 WAF·DDoS 보호가 포함된 정액제가 있으며 계정/사용량 조건을
확인해야 한다. 종량제 WAF는 Web ACL, 규칙 수, 요청 수가 각각 과금된다.
[CloudFront 가격](https://aws.amazon.com/cloudfront/pricing/),
[AWS WAF 가격](https://aws.amazon.com/waf/pricing/)

## 적용 전에 필요한 결정

- CloudFront 정액제(계정에서 사용 가능할 때) 또는 종량제.
- `origin.msmsge.com` DNS·인증서 발급 권한.
- 배포자가 사용할 AWS IAM 권한(ACM, CloudFront, WAFv2, Route53, EC2 보안 그룹).
- WAF 로그 보관 위치와 기간.
