import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/server/storage';
import { validateEnv } from '@/server/env/validation';
import { Network } from '@/server/stellar/events/types';

export async function GET(request: NextRequest) {
  const env = validateEnv();

  const searchParams = request.nextUrl.searchParams;
  const network = searchParams.get('network');
  const contract = searchParams.get('contract');
  const cursor = searchParams.get('cursor') ?? undefined;
  const limitParam = searchParams.get('limit') ?? '100';

  if (!network || !contract) {
    return NextResponse.json(
      { error: 'Both "network" and "contract" query parameters are required.' },
      { status: 400 }
    );
  }

  if (network !== 'testnet' && network !== 'pubnet') {
    return NextResponse.json(
      { error: 'Network must be either "testnet" or "pubnet".' },
      { status: 400 }
    );
  }

  const limit = Number(limitParam);
  if (Number.isNaN(limit) || limit < 1 || limit > 1000) {
    return NextResponse.json(
      { error: 'Limit must be an integer between 1 and 1000.' },
      { status: 400 }
    );
  }

  const storage = getStorage(env);
  try {
    const events = await storage.getEvents({
      network: network as Network,
      contract,
      cursor,
      limit,
    });
    return NextResponse.json(events);
  } catch (error) {
    console.error('Failed to fetch events:', error);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
