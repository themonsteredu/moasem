import { NextRequest } from 'next/server'

export function assertAdmin(request: NextRequest) {
  const expected = process.env.MOASEM_ADMIN_KEY
  const received = request.headers.get('x-moasem-admin-key')

  if (!expected || !received || received !== expected) {
    throw new Error('UNAUTHORIZED')
  }
}
