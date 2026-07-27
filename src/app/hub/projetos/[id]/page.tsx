import { HubProjectDetail } from "@/components/hub/HubProjectsCore";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <HubProjectDetail id={id} />; }
