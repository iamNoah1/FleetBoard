'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface Props {
  namespaces: string[];
}

export default function Filters({ namespaces }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedNamespace = searchParams.get('namespace') ?? '';
  const q = searchParams.get('q') ?? '';

  const params = useMemo(() => new URLSearchParams(searchParams), [searchParams]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="filters">
      <select
        aria-label="Filter by namespace"
        value={selectedNamespace}
        onChange={(e) => update('namespace', e.target.value)}
      >
        <option value="">All namespaces</option>
        {namespaces.map((ns) => (
          <option key={ns} value={ns}>
            {ns}
          </option>
        ))}
      </select>

      <input
        aria-label="Filter by deployment substring"
        value={q}
        onChange={(e) => update('q', e.target.value)}
        placeholder="Deployment contains..."
      />
    </div>
  );
}
