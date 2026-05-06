import { PamaiVoiceConsole } from '@/components/PamaiVoiceConsole'

interface VoiceSessionPageProps {
  params: Promise<{ sessionId: string }>
}

export default async function VoiceSessionPage({ params }: VoiceSessionPageProps) {
  const { sessionId } = await params

  return <PamaiVoiceConsole sessionId={sessionId} />
}