# 무슨무슨게임 Android 앱

이 디렉터리는 `https://msmsge.com` PWA를 Android 앱으로 실행하는 Trusted Web Activity(TWA) 프로젝트다.

## 고정 식별자

- 패키지 ID: `com.msmsge.game`
- 앱 이름: `무슨무슨게임`
- 시작 URL: `https://msmsge.com/`
- 최소 SDK: 21
- 컴파일/대상 SDK: 36

Play Console에 첫 Android App Bundle을 올린 뒤에는 패키지 ID를 변경할 수 없다.

## 로컬 디버그 빌드

Bubblewrap가 설치한 JDK와 Android SDK를 사용하는 경우:

```bash
JAVA_HOME="$HOME/.bubblewrap/jdk/jdk-17.0.11+9" \
ANDROID_HOME="$HOME/.bubblewrap/android_sdk" \
./gradlew assembleDebug
```

결과 APK는 `app/build/outputs/apk/debug/app-debug.apk`에 생성된다.

## Play 제출 전 필수 작업

1. Play App Signing을 활성화하고 업로드 키를 저장소 밖에 생성·백업한다.
2. Play 앱 서명 인증서 SHA-256을 `https://msmsge.com/.well-known/assetlinks.json`에 등록한다.
3. `twa-manifest.json`의 `fingerprints`에도 동일한 인증서 지문을 추가하고 프로젝트를 갱신한다.
4. `versionCode`를 이전 제출본보다 높인 뒤 서명된 AAB를 만든다.
5. 실제 Android 기기에서 로그인, 뒤로가기, 외부 링크, 화면 회전, 네트워크 단절 복구를 확인한다.

서명 빌드 시에는 키 경로를 명시적으로 전달한다. 비밀번호는 명령행 인자로 남기지 않고 Bubblewrap의 비공개 입력창에 입력한다.

```bash
npx --yes @bubblewrap/cli@1.25.0 build \
  --signingKeyPath="/저장소/밖의/경로/msmsge-upload.keystore" \
  --signingKeyAlias="msmsge-upload"
```

키스토어, 비밀번호, `local.properties`, APK/AAB 및 Gradle 빌드 산출물은 Git에 커밋하지 않는다.
