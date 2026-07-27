import { HubTaskDetail } from "@/components/hub/HubTasksCore";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <HubTaskDetail id={id} />; }
