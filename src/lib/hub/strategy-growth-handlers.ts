import type { PrismaClient } from "@prisma/client";
import type { HubStrategicGrowthActor } from "./strategy-growth-policy";
import { acceptProposal, addOpportunityActivity, approveProposal, cancelOpportunity, cancelOpportunityActivity, cancelProposal, configurePipeline, convertLead, createProjectFromOpportunity, createProjectFromProposal, createProposalRevision, expireProposal, moveOpportunity, rejectProposal, reopenOpportunity, requestProposalReview, sendProposal, updateLeadStatus, updateOpportunity, updatePartnership } from "./strategy-growth-service";

export async function handleGrowthMutation(prisma: PrismaClient, actor: HubStrategicGrowthActor, action: string, id: string, input: Record<string, unknown>) {
  return action === "lead-status" ? updateLeadStatus(prisma, actor, id, input)
    : action === "lead-convert" ? convertLead(prisma, actor, id, input)
      : action === "pipeline-configure" ? configurePipeline(prisma, actor, Array.isArray(input.stages) ? input.stages as Array<Record<string, unknown>> : [])
        : action === "opportunity-move" ? moveOpportunity(prisma, actor, id, input)
          : action === "opportunity-update" ? updateOpportunity(prisma, actor, id, input)
            : action === "opportunity-cancel" ? cancelOpportunity(prisma, actor, id, input)
              : action === "opportunity-reopen" ? reopenOpportunity(prisma, actor, id, input)
                : action === "opportunity-project" ? createProjectFromOpportunity(prisma, actor, id, input)
                  : action === "opportunity-activity" ? addOpportunityActivity(prisma, actor, id, input)
                    : action === "activity-cancel" ? cancelOpportunityActivity(prisma, actor, id, input)
                      : action === "proposal-revision" ? createProposalRevision(prisma, actor, id, input)
                        : action === "proposal-review" ? requestProposalReview(prisma, actor, id, Number(input.version))
                          : action === "proposal-approve" ? approveProposal(prisma, actor, id, Number(input.version))
                            : action === "proposal-send" ? sendProposal(prisma, actor, id, input)
                              : action === "proposal-accept" ? acceptProposal(prisma, actor, id, input)
                                : action === "proposal-reject" ? rejectProposal(prisma, actor, id, input)
                                  : action === "proposal-expire" ? expireProposal(prisma, actor, id, input)
                                    : action === "proposal-cancel" ? cancelProposal(prisma, actor, id, input)
                                      : action === "proposal-project" ? createProjectFromProposal(prisma, actor, id, input)
                                        : action === "partnership-update" ? updatePartnership(prisma, actor, id, input)
                                          : null;
}
