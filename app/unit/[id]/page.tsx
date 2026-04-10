import UnitScreen from "@/components/UnitScreen";
import { getUnitById, unitCatalog } from "@/lib/units";
import { notFound } from "next/navigation";

export const dynamicParams = false;

type UnitPageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return unitCatalog.map((unit) => ({
    id: unit.id,
  }));
}

export default async function UnitPage({ params }: UnitPageProps) {
  const { id } = await params;
  const unit = getUnitById(id);

  if (!unit) {
    notFound();
  }

  return <UnitScreen unit={unit} />;
}
