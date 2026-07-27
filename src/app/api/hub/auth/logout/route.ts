import { destroyHubSession } from "@/lib/hub/auth";
import { hubJson, withHubApi } from "@/lib/hub/api";

export const POST = withHubApi(async () => {
  await destroyHubSession();
  return hubJson({ success: true });
});
