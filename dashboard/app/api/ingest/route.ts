import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getConfig } from '@/lib/config';
import { upsertBatch } from '@/lib/store';
import type { Source } from '@/lib/types';

const knownSources = new Set<Source>(['image', 'endpoint', 'catalog', 'hybrid', 'unknown']);

function normalizeSource(raw?: string): Source {
  if (!raw) return 'image';
  return knownSources.has(raw as Source) ? (raw as Source) : 'unknown';
}

const observationSchema = z.object({
  namespace: z.string().min(1),
  deployment: z.string().min(1),
  image: z.string(),
  version: z.string().min(1),
  replicasDesired: z.number().int().nonnegative(),
  replicasAvailable: z.number().int().nonnegative(),
  replicasUpdated: z.number().int().nonnegative(),
  health: z.enum(['OK', 'DEGRADED', 'ERROR', 'UNKNOWN']),
  source: z.string().optional(),
  timestamp: z.string().min(1),
  error: z.string().optional()
});

const payloadSchema = z.object({
  cluster: z.string().min(1),
  observations: z.array(z.unknown())
});

export async function POST(req: NextRequest) {
  const config = getConfig();
  const apiKey = req.headers.get('x-api-key');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { cluster, observations } = parsed.data;
  const expectedKey = config.apiKeys[cluster];
  if (!expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const validObservations: z.infer<typeof observationSchema>[] = [];
  let skipped = 0;
  for (const entry of observations) {
    const parsedObservation = observationSchema.safeParse(entry);
    if (!parsedObservation.success) {
      skipped += 1;
      continue;
    }
    validObservations.push(parsedObservation.data);
  }

  const result = upsertBatch(
    cluster,
    validObservations.map((o) => ({
      ...o,
      cluster,
      source: normalizeSource(o.source)
    }))
  );

  return NextResponse.json({
    cluster,
    accepted: result.accepted,
    skipped: result.skipped + skipped
  });
}
