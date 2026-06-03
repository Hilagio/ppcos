import { NextResponse } from 'next/server'
import { getSkills } from '@/lib/skills'

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const skills = getSkills(params.name)
  return NextResponse.json(skills)
}
