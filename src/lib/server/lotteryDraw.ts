import { createHmac } from "node:crypto";

const UINT64_RANGE = BigInt(1) << BigInt(64);

function deterministicUint64(secret: string, roundId: number, counter: number): bigint {
  const digest = createHmac("sha256", Buffer.from(secret, "hex"))
    .update(`${roundId}:${counter}`)
    .digest();
  return digest.readBigUInt64BE(0);
}

// commit 된 비밀값으로 서로 다른 티켓을 뽑는다. rejection sampling 으로 modulo bias 도
// 제거해 티켓 번호마다 정확히 같은 확률을 갖는다.
export function drawLotteryTickets(
  totalTickets: number,
  secret: string,
  roundId: number,
  count = 3,
): number[] {
  const total = Math.floor(totalTickets);
  const draws = Math.floor(count);
  if (total < 1 || draws < 1 || draws > total) {
    throw new Error("invalid lottery draw size");
  }
  const totalBig = BigInt(total);
  const acceptedRange = UINT64_RANGE - (UINT64_RANGE % totalBig);
  const picked = new Set<number>();
  let counter = 0;
  while (picked.size < draws) {
    const value = deterministicUint64(secret, roundId, counter++);
    if (value >= acceptedRange) continue;
    picked.add(Number(value % totalBig) + 1);
  }
  return [...picked];
}
