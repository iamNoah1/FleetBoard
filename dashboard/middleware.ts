import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const user = process.env.FLEETBOARD_BASIC_AUTH_USER;
const password = process.env.FLEETBOARD_BASIC_AUTH_PASSWORD;
const authEnabled = !!(user && password);

export function middleware(req: NextRequest) {
  if (!authEnabled) return NextResponse.next();

  const authorization = req.headers.get('authorization');
  if (authorization?.startsWith('Basic ')) {
    const decoded = atob(authorization.slice(6));
    const colon = decoded.indexOf(':');
    if (colon !== -1) {
      const u = decoded.slice(0, colon);
      const p = decoded.slice(colon + 1);
      if (u === user && p === password) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="FleetBoard"' },
  });
}

export const config = {
  matcher: ['/((?!api/ingest|_next/static|_next/image|favicon.ico).*)'],
};
