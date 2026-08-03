import { NextRequest, NextResponse } from 'next/server';
import { getServerRuntimeConfig } from '@/services/runtimeConfig';

export const dynamic = 'force-dynamic';

const runtimeHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, max-age=0',
};

export function GET(request: NextRequest) {
  const config = getServerRuntimeConfig();
  if (request.nextUrl.searchParams.get('format') === 'json') {
    return NextResponse.json(config, {
      headers: runtimeHeaders,
    });
  }

  const serializedConfig = JSON.stringify(config)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const script = `window.__READEST_RUNTIME_CONFIG=${serializedConfig};`;
  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      ...runtimeHeaders,
    },
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...runtimeHeaders,
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}
