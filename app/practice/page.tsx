import { Suspense } from "react";
import PracticeSessionShell from "@/components/PracticeSessionShell";

export default function PracticePage() {
  return (
    <Suspense fallback={null}>
      <PracticeSessionShell mode="mixed" />
    </Suspense>
  );
}
