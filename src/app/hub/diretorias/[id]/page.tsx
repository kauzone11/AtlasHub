import { HubDirectorateDetail } from "@/components/hub/HubDirectoratesCore";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <HubDirectorateDetail id={id} />; }
