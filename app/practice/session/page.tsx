import { Suspense } from "react";
import PracticeSessionShell from "@/components/PracticeSessionShell";

export default function PracticeSessionPage() {
  return (
    <Suspense fallback={null}>
      <PracticeSessionShell mode="mixed" />
    </Suspense>
  );
}
