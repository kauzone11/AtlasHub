import { NewMeetingPage } from "@/components/hub/HubCollaborationPages";
import { requireHubMember } from "@/lib/hub/auth";
import { hasHubPermission } from "@/lib/hub/permissions";
import { redirect } from "next/navigation";

export default async function Page() {
  const session = await requireHubMember();
  if (!hasHubPermission(session.role, "meetings:create"))
    redirect("/hub/reunioes");
  return <NewMeetingPage />;
}
