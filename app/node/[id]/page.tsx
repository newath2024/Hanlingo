import NodeShell from "@/components/NodeShell";
import { getNodeById, nodeCatalog } from "@/lib/units";
import { notFound } from "next/navigation";

export const dynamicParams = false;

type NodePageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return nodeCatalog.map((node) => ({
    id: node.id,
  }));
}

export default async function NodePage({ params }: NodePageProps) {
  const { id } = await params;
  const match = getNodeById(id);

  if (!match) {
    notFound();
  }

  return (
    <main className="page-shell">
      <NodeShell unit={match.unit} node={match.node} lesson={match.lesson} />
    </main>
  );
}
