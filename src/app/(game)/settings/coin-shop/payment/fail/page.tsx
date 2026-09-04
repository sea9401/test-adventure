import { Suspense } from "react";
import { PaymentResultView } from "../PaymentResultView";

export default function MuseunCoinPaymentFailPage() {
  return <Suspense fallback={null}><PaymentResultView mode="fail" /></Suspense>;
}
