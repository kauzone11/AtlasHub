import { HubMeetingDetailPage } from "@/components/hub/HubMeetingDetailPage";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HubMeetingDetailPage id={id} />;
}
