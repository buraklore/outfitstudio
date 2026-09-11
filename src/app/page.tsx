import Link from "next/link";

const STEPS = [
  { n: "01", title: "Add your pieces", text: "Paste product links or upload photos of your clothes." },
  { n: "02", title: "We dress the mannequin", text: "AI combines your exact items into one outfit preview." },
  { n: "03", title: "Get your score", text: "A 0–100 score with a detailed, explainable style report." },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="py-20 text-center md:py-28">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-taupe">
          AI outfit builder & style analysis
        </p>
        <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-7xl">
          Build Your Outfit
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base text-taupe md:text-lg">
          Add clothing links or upload your clothes.
          <br />
          We&rsquo;ll create the outfit for you.
        </p>

        <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
          <Link
            href="/create?mode=links"
            className="group rounded-2xl border border-hairline bg-white p-7 text-left transition-all hover:-translate-y-0.5 hover:border-moss hover:shadow-[0_12px_40px_-16px_rgba(39,65,53,0.35)]"
          >
            <span className="font-display text-2xl text-ink">Add Product Links</span>
            <p className="mt-2 text-sm text-taupe">
              Paste URLs for a top, bottom, shoes and more — we&rsquo;ll pull the product images.
            </p>
            <span className="mt-5 inline-block text-sm font-medium text-moss">
              Start with links <span className="transition-transform group-hover:translate-x-0.5 inline-block">→</span>
            </span>
          </Link>
          <Link
            href="/create?mode=upload"
            className="group rounded-2xl border border-hairline bg-white p-7 text-left transition-all hover:-translate-y-0.5 hover:border-moss hover:shadow-[0_12px_40px_-16px_rgba(39,65,53,0.35)]"
          >
            <span className="font-display text-2xl text-ink">Upload Clothing Photos</span>
            <p className="mt-2 text-sm text-taupe">
              Snap or upload photos — several garments in one photo work too.
            </p>
            <span className="mt-5 inline-block text-sm font-medium text-moss">
              Start with photos <span className="transition-transform group-hover:translate-x-0.5 inline-block">→</span>
            </span>
          </Link>
        </div>
      </section>

      <section className="grid gap-8 border-t border-hairline py-14 md:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.n}>
            <p className="font-display text-3xl text-hairline">{step.n}</p>
            <h2 className="mt-2 font-medium">{step.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-taupe">{step.text}</p>
          </div>
        ))}
      </section>

      <section className="border-t border-hairline py-10 text-sm text-taupe">
        <p>
          <span className="font-medium text-ink">Honest by design.</span> Your original product
          photos stay untouched; the mannequin image is clearly labeled as an AI preview and aims to
          preserve every garment&rsquo;s colors, patterns and cut.
        </p>
      </section>
    </div>
  );
}
