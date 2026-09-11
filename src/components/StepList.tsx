import { clsx } from "clsx";
import { Spinner } from "@/components/ui";

export type StepState = "pending" | "active" | "done" | "error";

export interface Step {
  id: string;
  label: string;
  state: StepState;
}

/**
 * Honest staged progress (spec §21): every row corresponds to a real backend
 * stage and only advances when that stage's request actually resolves.
 */
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step) => (
        <li key={step.id} className="flex items-center gap-3 text-sm">
          <span className="flex size-5 items-center justify-center">
            {step.state === "done" && (
              <svg viewBox="0 0 20 20" className="size-5 text-moss" fill="none" aria-hidden="true">
                <path
                  d="m5 10.5 3.5 3.5L15 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {step.state === "active" && <Spinner className="text-moss" />}
            {step.state === "pending" && (
              <span className="size-2 rounded-full border border-taupe/60" />
            )}
            {step.state === "error" && (
              <svg viewBox="0 0 20 20" className="size-5 text-clay" fill="none" aria-hidden="true">
                <path
                  d="m6 6 8 8m0-8-8 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </span>
          <span
            className={clsx(
              step.state === "pending" && "text-taupe",
              step.state === "active" && "text-ink animate-soft-pulse",
              step.state === "done" && "text-ink",
              step.state === "error" && "text-clay",
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
