import { HubOperationsPage } from "@/components/hub/HubOperationsPage";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <HubOperationsPage mode="entries" entryId={(await params).id} />; }
