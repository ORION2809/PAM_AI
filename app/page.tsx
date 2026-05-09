import { PamaiLaunchpad } from '@/components/PamaiLaunchpad'

interface HomePageProps {
  searchParams?: Promise<{
    caseId?: string | string[]
  }>
}

function normalizeCaseId(caseId: string | string[] | undefined): string {
  if (Array.isArray(caseId)) {
    return caseId[0]?.trim() || 'E-7036'
  }

  return caseId?.trim() || 'E-7036'
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined

  return <PamaiLaunchpad initialCaseId={normalizeCaseId(resolvedSearchParams?.caseId)} />
}