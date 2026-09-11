import { Suspense } from "react";
import CreateFlow from "@/components/create/CreateFlow";
import { getLocale } from "@/lib/locale-server";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const locale = await getLocale();
  return (
    <Suspense fallback={null}>
      <CreateFlow locale={locale} />
    </Suspense>
  );
}
