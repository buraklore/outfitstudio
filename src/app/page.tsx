import Link from "next/link";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale-server";

export default async function HomePage() {
  const locale = await getLocale();
  const M = t(locale).landing;
  const nums = ["01", "02", "03"];

  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="py-20 text-center md:py-28">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-taupe">
          {M.eyebrow}
        </p>
        <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-7xl">
          {M.title}
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base text-taupe md:text-lg">
          {M.subtitle1}
          <br />
          {M.subtitle2}
        </p>

        <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
          <Link
            href="/create?mode=links"
            className="group rounded-2xl border border-hairline bg-white p-7 text-left transition-all hover:-translate-y-0.5 hover:border-moss hover:shadow-[0_12px_40px_-16px_rgba(39,65,53,0.35)]"
          >
            <span className="font-display text-2xl text-ink">{M.card1Title}</span>
            <p className="mt-2 text-sm text-taupe">{M.card1Desc}</p>
            <span className="mt-5 inline-block text-sm font-medium text-moss">
              {M.card1Cta}{" "}
              <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </Link>
          <Link
            href="/create?mode=upload"
            className="group rounded-2xl border border-hairline bg-white p-7 text-left transition-all hover:-translate-y-0.5 hover:border-moss hover:shadow-[0_12px_40px_-16px_rgba(39,65,53,0.35)]"
          >
            <span className="font-display text-2xl text-ink">{M.card2Title}</span>
            <p className="mt-2 text-sm text-taupe">{M.card2Desc}</p>
            <span className="mt-5 inline-block text-sm font-medium text-moss">
              {M.card2Cta}{" "}
              <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </Link>
        </div>
      </section>

      <section className="grid gap-8 border-t border-hairline py-14 md:grid-cols-3">
        {M.steps.map((step, i) => (
          <div key={step.title}>
            <p className="font-display text-3xl text-hairline">{nums[i]}</p>
            <h2 className="mt-2 font-medium">{step.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-taupe">{step.text}</p>
          </div>
        ))}
      </section>

      <section className="border-t border-hairline py-10 text-sm text-taupe">
        <p>
          <span className="font-medium text-ink">{M.honestyTitle}</span> {M.honestyText}
        </p>
      </section>
    </div>
  );
}
