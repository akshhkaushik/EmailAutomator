import StartupDetailClient from "./startup-detail-client";

export default async function StartupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StartupDetailClient startupId={id} />;
}
