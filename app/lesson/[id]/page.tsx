import { redirect } from "next/navigation";
import { getNodeById, unitCatalog } from "@/lib/units";

export const dynamicParams = false;

type LessonPageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return unitCatalog.flatMap((unit) =>
    unit.lessons.map((lesson) => ({
      id: lesson.lessonId,
    })),
  );
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { id } = await params;
  const match = getNodeById(id);

  if (match) {
    redirect(`/node/${match.node.id}`);
  }

  redirect("/unit/1");
}
