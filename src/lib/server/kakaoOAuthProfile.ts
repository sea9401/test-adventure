import "server-only";

type KakaoOAuthProfile = {
  id: string | number;
  kakao_account?: {
    email?: string;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    profile?: { nickname?: string; profile_image_url?: string };
  };
};

export function kakaoPlaceholderEmail(
  providerAccountId: string | number,
): string {
  return `kakao_${providerAccountId}@kakao.oauth`;
}

export function mapKakaoOAuthProfile(profile: KakaoOAuthProfile) {
  const account = profile.kakao_account;
  // Kakao가 유효성과 소유 확인을 모두 보장한 주소만 사용자 이메일로 사용한다.
  // 권한이 없거나 검증 표식이 빠진 경우 provider id 기반 주소로 격리한다.
  const email =
    account?.is_email_valid === true &&
    account.is_email_verified === true &&
    typeof account.email === "string" &&
    account.email.length > 0
      ? account.email
      : kakaoPlaceholderEmail(profile.id);

  return {
    id: String(profile.id),
    name: account?.profile?.nickname ?? null,
    email,
    image: account?.profile?.profile_image_url ?? null,
  };
}
