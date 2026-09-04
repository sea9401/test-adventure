import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminProvider } from "../AdminContext";
import { BroadcastTab } from "./BroadcastTab";

describe("관리자 공지·우편", () => {
  it("개별 우편 수신자를 유저 ID 대신 닉네임으로 검색한다", () => {
    const html = renderToStaticMarkup(
      <AdminProvider>
        <BroadcastTab />
      </AdminProvider>,
    );

    expect(html).toContain("수신자 닉네임");
    expect(html).toContain('placeholder="닉네임 입력"');
    expect(html).toContain("닉네임을 검색한 뒤 정확한 계정을 선택하세요.");
    expect(html).not.toContain("유저 탭에서 복사한 user id");
    expect(html).not.toContain('placeholder="user id"');
  });

  it("보상 우편 소비 아이템 목록에서 세 소모품을 선택하고 코인샵 목록과 중복하지 않는다", () => {
    const html = renderToStaticMarkup(
      <AdminProvider>
        <BroadcastTab />
      </AdminProvider>,
    );

    const consumableStart = html.indexOf(">소비 아이템 첨부<");
    const cashItemStart = html.indexOf(">무슨 코인샵 아이템 첨부<");
    const consumableSection = html.slice(consumableStart, cashItemStart);
    const cashItemSection = html.slice(cashItemStart);

    expect(consumableStart).toBeGreaterThanOrEqual(0);
    expect(cashItemStart).toBeGreaterThan(consumableStart);
    expect(consumableSection).toContain("스태미나 회복약");
    expect(consumableSection).toContain("수행 초기화 물약");
    expect(consumableSection).toContain("100레벨 달성의 비약");
    expect(cashItemSection).not.toContain("수행 초기화 물약");
    expect(cashItemSection).not.toContain("100레벨 달성의 비약");
  });

  it("대량 우편에서 농장·낚시·상점·가공 요리 재료를 첨부할 수 있다", () => {
    const html = renderToStaticMarkup(
      <AdminProvider>
        <BroadcastTab />
      </AdminProvider>,
    );

    const cookingStart = html.indexOf(">요리 재료 첨부<");
    const equipmentStart = html.indexOf(">장비 첨부 (기본 등급)<");
    const cookingSection = html.slice(cookingStart, equipmentStart);

    expect(cookingStart).toBeGreaterThanOrEqual(0);
    expect(equipmentStart).toBeGreaterThan(cookingStart);
    for (const ingredientName of [
      "밀",
      "황금 밀",
      "돼지고기",
      "일반 어획물",
      "전설의 어획물",
      "소금",
      "후추",
      "조리용 기름",
      "숙성 식초",
      "향신료",
      "효모",
      "밀가루",
      "버터",
      "치즈",
      "진한 육수",
      "만능 소스",
      "생크림",
    ]) {
      expect(cookingSection).toContain(ingredientName);
    }
    expect(cookingSection).not.toContain("배합 사료");
  });

  it("숙련 증서를 지급하고 재료·장비를 미개척지 출처별로 나눠 고를 수 있다", () => {
    const html = renderToStaticMarkup(
      <AdminProvider>
        <BroadcastTab />
      </AdminProvider>,
    );

    expect(html).toContain(">숙련 증서<");
    for (const category of [
      "성장·강화·기타 재료",
      "생활 재료",
      "제작 재료",
      "협동 보스 보상",
      "원정·위험 해역 재료",
      "미개척지 재료",
      "미개척지 보스 재료",
      "미개척지 보스 소환석",
      "일반 장비 · 무기",
      "일반 장비 · 갑옷",
      "미개척지 · 개척자 장비",
      "미개척지 · 특화 제작 장비",
      "미개척지 · 보스 고유 장비",
    ]) {
      expect(html).toContain(category);
    }
  });
});
