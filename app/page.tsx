import { PamaiLaunchpad } from '@/components/PamaiLaunchpad'

interface HomePageProps {
  searchParams?: Promise<{
    caseId?: string | string[]
  }>
}

function normalizeCaseId(caseId: string | string[] | undefined): string | null {
  if (Array.isArray(caseId)) {
    return caseId[0]?.trim() || null
  }

  return caseId?.trim() || null
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined

  return <PamaiLaunchpad initialCaseId={normalizeCaseId(resolvedSearchParams?.caseId)} />
}
