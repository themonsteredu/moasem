import { NextResponse } from 'next/server'

// Every endpoint also checks the verified user and current database permissions.
export function middleware() {
  const response = NextResponse.next()
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}
export const config = { matcher: ['/api/admin/:path*', '/api/auth/:path*'] }
