import { PamaiLaunchpad } from '@/components/PamaiLaunchpad'

interface CaseLaunchPageProps {
  params: Promise<{
    caseId: string
  }>
}

export default async function CaseLaunchPage({ params }: CaseLaunchPageProps) {
  const { caseId } = await params

  return <PamaiLaunchpad initialCaseId={decodeURIComponent(caseId).trim() || null} />
}
