import type { CategoryTotal } from "@/server/research/balance-reconciliation/schema";
import { stroopsToDecimal } from "@/server/research/balance-reconciliation/runningBalance";

export function CategoryBreakdown({ categories }: { categories: CategoryTotal[] }) {
  return (
    <section data-testid="category-breakdown" className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">Categories</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {categories.map((category) => (
          <li key={`${category.category}:${category.asset}`}>
            {category.category} {category.asset} {stroopsToDecimal(BigInt(category.stroops))}
          </li>
        ))}
      </ul>
    </section>
  );
}
