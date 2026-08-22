"use client";

import { useState } from "react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { cookingDeliveryScore, type CookingDeliveryRequest } from "./delivery";
import { cookingFoodDefinition, cookingEffectText, type CookingFoodDefinition, type CookingFoodId } from "./food";
import type { CookingMutation, CookingResponse } from "./clientTypes";

function RequestCard({ request, data, busy, mutate }: { request: CookingDeliveryRequest; data: CookingResponse; busy: boolean; mutate: CookingMutation }) {
  const [quantity, setQuantity] = useState(1);
  const foods = Object.entries(data.cookingFoods).flatMap(([id, count]) => {
    const food = cookingFoodDefinition(id);
    const score = food ? cookingDeliveryScore(food, request) : 0;
    return food && score > 0 && (count ?? 0) > 0 ? [{ food, count: count ?? 0, score }] : [];
  });
  const progress = request.kind === "daily" ? data.cooking.daily.requestScores[request.id] ?? 0 : data.cooking.weekly.requestScore;
  const complete = request.kind === "daily" ? data.cooking.daily.completedRequestIds.includes(request.id) : data.cooking.weekly.completed;
  return (
    <article className={`${SURFACE_INSET} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div><h4 className="font-bold text-zinc-900 dark:text-zinc-100">{request.title}</h4><div className="text-xs text-zinc-500">점수 {Math.min(progress, request.targetScore)}/{request.targetScore}</div></div>
        <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">{complete ? "완료" : request.kind === "weekly" ? "주간" : "일일"}</div>
      </div>
      <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">보상: {request.rewards.gold.toLocaleString()}골드 · 증표 {request.rewards.reputation} · 요리 XP {request.rewards.cookingXp}</div>
      {!complete && foods.length > 0 ? <div className="mt-3 space-y-2">{foods.map(({ food, count, score }) => (
        <FoodDeliveryRow key={food.id} food={food} count={count} score={score} quantity={quantity} setQuantity={setQuantity} busy={busy}
          onDeliver={() => mutate({ action: "deliver", requestId: request.id, foodId: food.id, quantity: Math.min(quantity, count) })} />
      ))}</div> : !complete ? <div className="mt-3 text-xs text-zinc-500">현재 조건에 맞는 완성 음식이 없습니다.</div> : null}
    </article>
  );
}

function FoodDeliveryRow({ food, count, score, quantity, setQuantity, busy, onDeliver }: {
  food: CookingFoodDefinition; count: number; score: number; quantity: number;
  setQuantity: (value: number) => void; busy: boolean; onDeliver: () => void;
}) {
  return <div className="rounded-md border border-zinc-300 bg-white p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
    <div className="font-semibold text-zinc-800 dark:text-zinc-100">{food.name} · 보유 {count}개</div>
    <div className="text-zinc-500">{cookingEffectText(food.effect)} · 개당 {score}점 · 이번 {score * Math.min(quantity, count)}점</div>
    <div className="mt-1 flex gap-1"><input type="number" min={1} max={count} value={Math.min(quantity, count)} onChange={(event) => setQuantity(Math.max(1, Math.min(count, Number(event.target.value) || 1)))} className="w-16 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950" />
      <button type="button" disabled={busy} onClick={onDeliver} className="rounded bg-emerald-600 px-2 py-1 font-bold text-white disabled:opacity-50">납품</button></div>
  </div>;
}

export function CookingDeliveryPanel({ data, busy, mutate }: { data: CookingResponse; busy: boolean; mutate: CookingMutation }) {
  const standingFoods = Object.entries(data.cookingFoods).flatMap(([id, count]) => {
    const food = cookingFoodDefinition(id);
    return food && (count ?? 0) > 0 ? [{ food, count: count ?? 0 }] : [];
  });
  return <section className={`${SURFACE_CARD} p-4`}>
    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">조건 납품</h3>
    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">특정 음식 대신 조건을 만족하는 여러 요리로 목표 점수를 채웁니다.</p>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{data.requests.daily.map((request) => <RequestCard key={request.id} request={request} data={data} busy={busy} mutate={mutate} />)}<RequestCard request={data.requests.weekly} data={data} busy={busy} mutate={mutate} /></div>
    <div className={`${SURFACE_INSET} mt-4 p-3`}><h4 className="font-bold">상시 납품 {data.cooking.daily.standingDeliveries}/20</h4><p className="text-xs text-zinc-500">조건 보상보다 낮은 가격으로 모든 완성 음식을 매입합니다.</p>
      <div className="mt-2 flex flex-wrap gap-2">{standingFoods.map(({ food, count }) => <button key={food.id} type="button" disabled={busy || data.cooking.daily.standingDeliveries >= 20}
        onClick={() => void mutate({ action: "standing_delivery", foodId: food.id as CookingFoodId, quantity: 1 })}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900">{food.name} 1개 납품 (보유 {count})</button>)}</div>
    </div>
  </section>;
}
