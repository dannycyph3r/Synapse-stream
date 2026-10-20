import Link from "next/link";

/** The brand is the name alone: no symbol beside it. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center text-ink" aria-label="SYNAPSE, home">
      <span aria-hidden="true" className="text-[0.9375rem] font-[650] leading-none tracking-[0.22em]">
        SYNAPSE
      </span>
    </Link>
  );
}
