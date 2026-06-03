import { NextResponse } from 'next/server'
import { getClients } from '@/lib/clients'

export async function GET() {
  return NextResponse.json(getClients())
}
