import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const cookieStore = await cookies();
  const authenticated = cookieStore.has("atlas_hub_session") || cookieStore.has("atlas_hub_account_session");
  redirect(authenticated ? "/hub" : "/hub/login");
}
