import { Suspense } from "react";
import CreateFlow from "@/components/create/CreateFlow";

export const dynamic = "force-dynamic";

export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreateFlow />
    </Suspense>
  );
}
