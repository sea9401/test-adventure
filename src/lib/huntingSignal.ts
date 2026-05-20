// 포그라운드(실시간) 사냥 진행 여부를 알리는 경량 모듈 신호.
//
// VersionCheck 는 root layout 에 마운트돼 GameContext(page.tsx)보다 바깥이라 huntingActive
// 를 직접 못 본다. 같은 JS 컨텍스트에서 공유되는 모듈 싱글턴으로 잇는다 — page.tsx 가 사냥
// 상태가 바뀔 때 set, VersionCheck 가 새 배포 자동 새로고침 직전에 read 한다.
//
// 왜 필요한가: 새 배포 감지 시 탭이 숨겨지면 자동 reload 하는데, 그러면 실시간 사냥을 켜둔
// 채 탭을 벗어난 사람의 huntingActive(클라 상태)가 reload 로 false 가 돼 복귀해도 사냥이
// 재개되지 않는다. 사냥 중에는 reload 를 미뤄 이 끊김을 막는다.

let foregroundHunting = false;

export function setForegroundHunting(active: boolean): void {
  foregroundHunting = active;
}

export function isForegroundHunting(): boolean {
  return foregroundHunting;
}
