import { Suspense } from "react";
import PracticeSessionShell from "@/components/PracticeSessionShell";

export default function ErrorPracticePage() {
  return (
    <Suspense fallback={null}>
      <PracticeSessionShell mode="errors" />
    </Suspense>
  );
}
