-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "HubOrganizationType" AS ENUM ('JUNIOR_ENTERPRISE', 'ASSOCIATION', 'FOUNDATION', 'COMPANY', 'PUBLIC_ORGANIZATION', 'OTHER');

-- CreateEnum
CREATE TYPE "HubAccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "HubMemberInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "HubInvitationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "EconomikRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'DIRECTOR', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "HubOrganizationPosition" AS ENUM ('PRESIDENT', 'COUNSELOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "HubMemberCategory" AS ENUM ('MEMBER', 'TRAINEE', 'ALUMNI');

-- CreateEnum
CREATE TYPE "EconomikStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED', 'DELETED');

-- CreateEnum
CREATE TYPE "EconomikWalletTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "EconomikWalletTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EconomikWalletSourceType" AS ENUM ('PROJECT_PAYOUT', 'PROJECT_REVERSAL', 'MANUAL_ADJUSTMENT', 'TRANSACTION_REVERSAL', 'REQUEST_APPROVAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EconomikWalletRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HubAvailabilityExceptionType" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "HubMeetingStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "HubMeetingParticipantStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE', 'ATTENDED', 'ABSENT');

-- CreateEnum
CREATE TYPE "HubAvailabilityPollStatus" AS ENUM ('OPEN', 'CLOSED', 'SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HubBoardScope" AS ENUM ('ORGANIZATION', 'DIRECTORATE');

-- CreateEnum
CREATE TYPE "HubTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "HubCalendarEventType" AS ENUM ('MANUAL', 'MEETING', 'TASK_DEADLINE', 'PROJECT_DEADLINE', 'MILESTONE');

-- CreateEnum
CREATE TYPE "HubFinancialCategoryType" AS ENUM ('INCOME', 'EXPENSE', 'BOTH');

-- CreateEnum
CREATE TYPE "HubCounterpartyType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH', 'OTHER');

-- CreateEnum
CREATE TYPE "HubFinancialEntryDirection" AS ENUM ('PAYABLE', 'RECEIVABLE');

-- CreateEnum
CREATE TYPE "HubFinancialEntryStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_SETTLED', 'SETTLED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HubFinancialInstallmentStatus" AS ENUM ('OPEN', 'PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HubSettlementMethod" AS ENUM ('PIX', 'BANK_TRANSFER', 'CASH', 'CARD', 'BOLETO', 'OTHER');

-- CreateEnum
CREATE TYPE "HubFinancialPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "HubBudgetStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HubReimbursementStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HubProfileVisibility" AS ENUM ('PRIVATE', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "HubMemberLifecycleEventType" AS ENUM ('JOINED', 'ROLE_CHANGED', 'DIRECTORATE_CHANGED', 'LEAVE_STARTED', 'OFFBOARDED', 'REACTIVATED');

-- CreateEnum
CREATE TYPE "HubDevelopmentGoalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HubPeopleCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HubFeedbackVisibility" AS ENUM ('PRIVATE_TO_RECIPIENT', 'MANAGER_AND_RECIPIENT', 'PEOPLE_ADMIN');

-- CreateEnum
CREATE TYPE "HubEvaluationType" AS ENUM ('SELF', 'MANAGER', 'PEER');

-- CreateEnum
CREATE TYPE "HubEvaluationStatus" AS ENUM ('PENDING', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "HubRecognitionVisibility" AS ENUM ('PRIVATE', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "HubRecruitmentProcessStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HubCandidateStatus" AS ENUM ('ACTIVE', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'HIRED');

-- CreateEnum
CREATE TYPE "HubStrategyCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HubStrategicObjectiveStatus" AS ENUM ('DRAFT', 'ACTIVE', 'AT_RISK', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HubStrategicPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "HubKeyResultDirection" AS ENUM ('INCREASE', 'DECREASE', 'MAINTAIN');

-- CreateEnum
CREATE TYPE "HubKeyResultStatus" AS ENUM ('ACTIVE', 'AT_RISK', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HubStrategicInitiativeStatus" AS ENUM ('PLANNED', 'ACTIVE', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HubIndicatorFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "HubStrategicRiskStatus" AS ENUM ('OPEN', 'MONITORING', 'MITIGATED', 'ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "HubStrategicReviewStatus" AS ENUM ('DRAFT', 'CLOSED');

-- CreateEnum
CREATE TYPE "HubGrowthOrganizationStatus" AS ENUM ('PROSPECT', 'CUSTOMER', 'PARTNER', 'INACTIVE');

-- CreateEnum
CREATE TYPE "HubLeadSource" AS ENUM ('REFERRAL', 'SOCIAL', 'EVENT', 'OUTBOUND', 'INBOUND', 'PARTNERSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "HubLeadStatus" AS ENUM ('NEW', 'QUALIFYING', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "HubOpportunityStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HubOpportunityActivityType" AS ENUM ('NOTE', 'CALL', 'MEETING', 'EMAIL', 'TASK', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "HubProposalStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HubPartnershipStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "EconomikWorkspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hubName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publicName" TEXT,
    "legalName" TEXT,
    "document" TEXT,
    "institutionalEmail" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'BR',
    "type" "HubOrganizationType" NOT NULL DEFAULT 'JUNIOR_ENTERPRISE',
    "responsibleMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomikWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "HubAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "lastOrganizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMemberInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "HubMemberInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "organizationPosition" "HubOrganizationPosition" NOT NULL,
    "memberCategory" "HubMemberCategory" NOT NULL,
    "directorateId" TEXT,
    "appointAsDirector" BOOLEAN NOT NULL DEFAULT false,
    "invitedById" TEXT NOT NULL,
    "existingInvitedMemberId" TEXT,
    "deliveryStatus" "HubInvitationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryAt" TIMESTAMP(3),
    "lastDeliveryError" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "HubMemberInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceHubLink" (
    "id" TEXT NOT NULL,
    "hubOrganizationId" TEXT NOT NULL,
    "atlasOrganizationId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceHubLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceHubMutation" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceHubMutation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceHubAudit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "hubOrganizationId" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "responsibleAccountId" TEXT,
    "actorUserId" TEXT,
    "safeMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceHubAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomikDirectorate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "directorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomikDirectorate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomikMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "position" TEXT,
    "organizationPosition" "HubOrganizationPosition" NOT NULL DEFAULT 'MEMBER',
    "memberCategory" "HubMemberCategory" NOT NULL DEFAULT 'MEMBER',
    "accountId" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "role" "EconomikRole" NOT NULL DEFAULT 'MEMBER',
    "status" "EconomikStatus" NOT NULL DEFAULT 'ACTIVE',
    "directorateId" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "lastLoginAt" TIMESTAMP(3),
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomikMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomikMetricProject" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "client" TEXT,
    "description" TEXT,
    "grossAmountCents" INTEGER NOT NULL DEFAULT 0,
    "competenceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCollaborative" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE,
    "deadline" DATE,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "nextDelivery" TEXT,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "primaryDirectorateId" TEXT,
    "managerId" TEXT,
    "responsibleMemberId" TEXT,
    "createdById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedMemberPoolCents" INTEGER,
    "financialRuleSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomikMetricProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubProjectDirectorate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "directorateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubProjectDirectorate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubProjectTeamMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubProjectTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubProjectMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" DATE NOT NULL,
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubProjectMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomikMetricProjectParticipant" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomikMetricProjectParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomikFinancialRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "organizationSharePct" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "atlasSharePct" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "memberSharePct" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomikFinancialRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomikWalletAccount" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomikWalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomikWalletTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "EconomikWalletTransactionType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT,
    "status" "EconomikWalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "sourceType" "EconomikWalletSourceType",
    "sourceId" TEXT,
    "sourceNote" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EconomikWalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomikWalletRequest" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "accountId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "EconomikWalletRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomikWalletRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomikAuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "memberId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EconomikAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientMemberId" TEXT NOT NULL,
    "actorMemberId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubAvailabilityRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubAvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubAvailabilityException" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "HubAvailabilityExceptionType" NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubAvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMeeting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "directorateId" TEXT,
    "organizationWide" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "HubMeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "location" TEXT,
    "meetingUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "minutes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubAvailabilityPoll" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dates" DATE[],
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "slotMinutes" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "responseDeadline" TIMESTAMP(3),
    "directorateId" TEXT,
    "status" "HubAvailabilityPollStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubAvailabilityPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubAvailabilityPollParticipant" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubAvailabilityPollParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubAvailabilitySelection" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "slotStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubAvailabilitySelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMeetingDirectorate" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "directorateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubMeetingDirectorate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMeetingExternalGuest" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubMeetingExternalGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMeetingResponseEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "HubMeetingParticipantStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubMeetingResponseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "responseStatus" "HubMeetingParticipantStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "invitationVersion" INTEGER NOT NULL DEFAULT 1,
    "attendanceStatus" "HubMeetingParticipantStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubMeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMeetingAgendaItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "estimatedMinutes" INTEGER,
    "presenterMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubMeetingAgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMeetingDecision" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubMeetingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubBoard" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "directorateId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "HubBoardScope" NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubBoardColumn" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isDoneColumn" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubBoardColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "sourceMeetingId" TEXT,
    "directorateId" TEXT,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "HubTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "dueAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubCalendarEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "HubCalendarEventType" NOT NULL DEFAULT 'MANUAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL,
    "location" TEXT,
    "directorateId" TEXT,
    "projectId" TEXT,
    "meetingId" TEXT,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubTaskAssignee" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubTaskAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubTaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubTaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubTaskChecklistItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubTaskChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubFinancialCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "type" "HubFinancialCategoryType" NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubFinancialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubCostCenter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "directorateId" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "normalizedCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubCostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubCounterparty" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "HubCounterpartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "document" TEXT,
    "normalizedDocument" TEXT,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubCounterparty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubFinancialEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "direction" "HubFinancialEntryDirection" NOT NULL,
    "status" "HubFinancialEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "directorateId" TEXT,
    "counterpartyId" TEXT,
    "projectId" TEXT,
    "issueDate" DATE NOT NULL,
    "competenceDate" DATE NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancellationReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubFinancialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubFinancialInstallment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "HubFinancialInstallmentStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubFinancialInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubFinancialSettlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "method" "HubSettlementMethod" NOT NULL,
    "reference" TEXT,
    "createdById" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubFinancialSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubFinancialPeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "HubFinancialPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubFinancialPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubBudget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "HubBudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubBudgetLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "month" INTEGER NOT NULL,
    "plannedCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubBudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubReimbursementRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requesterMemberId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "HubReimbursementStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "costCenterId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "financialEntryId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubReimbursementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubReimbursementItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expenseDate" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "receiptReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubReimbursementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMemberProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "phone" TEXT,
    "birthDate" DATE,
    "joinedAt" DATE,
    "leftAt" DATE,
    "employmentType" TEXT,
    "university" TEXT,
    "course" TEXT,
    "semester" TEXT,
    "linkedinUrl" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "bio" TEXT,
    "visibility" "HubProfileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubMemberProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMemberLifecycleEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" "HubMemberLifecycleEventType" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubMemberLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubOnboardingTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "directorateId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubOnboardingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubOnboardingTemplateItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "dueAfterDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubOnboardingTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubOnboardingAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubOnboardingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubOnboardingAssignmentItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "templateItemId" TEXT NOT NULL,
    "ownerMemberId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATE,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubOnboardingAssignmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubCompetency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMemberCompetency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubMemberCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubDevelopmentPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubDevelopmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubDevelopmentGoal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "ownerMemberId" TEXT NOT NULL,
    "managerMemberId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "HubDevelopmentGoalStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" DATE,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubDevelopmentGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubPeopleCycle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "HubPeopleCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" DATE,
    "endsAt" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubPeopleCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubFeedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cycleId" TEXT,
    "authorMemberId" TEXT NOT NULL,
    "recipientMemberId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "HubFeedbackVisibility" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubEvaluation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "evaluatorMemberId" TEXT NOT NULL,
    "evaluatedMemberId" TEXT NOT NULL,
    "type" "HubEvaluationType" NOT NULL,
    "status" "HubEvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubEvaluationCriterion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scaleMin" INTEGER NOT NULL DEFAULT 1,
    "scaleMax" INTEGER NOT NULL DEFAULT 5,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubEvaluationCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubEvaluationResponse" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubEvaluationResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubRecognition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientMemberId" TEXT NOT NULL,
    "givenById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recognizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visibility" "HubRecognitionVisibility" NOT NULL DEFAULT 'ORGANIZATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubRecognition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubParticipationRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubParticipationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubRecruitmentProcess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "HubRecruitmentProcessStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubRecruitmentProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubRecruitmentStage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubRecruitmentStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubCandidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "currentStageId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "status" "HubCandidateStatus" NOT NULL DEFAULT 'ACTIVE',
    "rejectionReason" TEXT,
    "hiredMemberId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubCandidateStageEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "movedById" TEXT NOT NULL,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubCandidateStageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubCandidateEvaluation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubCandidateEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubStrategyCycle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE NOT NULL,
    "status" "HubStrategyCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "allowOverlap" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubStrategyCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubStrategicObjective" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "directorateId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerMemberId" TEXT,
    "status" "HubStrategicObjectiveStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "HubStrategicPriority" NOT NULL DEFAULT 'MEDIUM',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "startsAt" DATE,
    "dueAt" DATE,
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubStrategicObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubKeyResult" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerMemberId" TEXT,
    "unit" TEXT NOT NULL,
    "startValue" DECIMAL(24,6) NOT NULL,
    "targetValue" DECIMAL(24,6) NOT NULL,
    "currentValue" DECIMAL(24,6) NOT NULL,
    "direction" "HubKeyResultDirection" NOT NULL,
    "weight" DECIMAL(7,4) NOT NULL,
    "status" "HubKeyResultStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubKeyResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubKeyResultHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "keyResultId" TEXT NOT NULL,
    "previousValue" DECIMAL(24,6) NOT NULL,
    "value" DECIMAL(24,6) NOT NULL,
    "progress" DECIMAL(7,4) NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubKeyResultHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubStrategicInitiative" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "objectiveId" TEXT,
    "boardId" TEXT,
    "projectId" TEXT,
    "opportunityId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerMemberId" TEXT,
    "directorateId" TEXT,
    "status" "HubStrategicInitiativeStatus" NOT NULL DEFAULT 'PLANNED',
    "startsAt" DATE,
    "dueAt" DATE,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubStrategicInitiative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubStrategicIndicator" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "direction" "HubKeyResultDirection" NOT NULL,
    "frequency" "HubIndicatorFrequency" NOT NULL,
    "ownerMemberId" TEXT,
    "directorateId" TEXT,
    "targetValue" DECIMAL(24,6) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubStrategicIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubIndicatorMeasurement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "periodKey" TEXT NOT NULL,
    "value" DECIMAL(24,6) NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubIndicatorMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubStrategicRisk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "objectiveId" TEXT,
    "directorateId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "status" "HubStrategicRiskStatus" NOT NULL DEFAULT 'OPEN',
    "ownerMemberId" TEXT,
    "mitigation" TEXT,
    "reviewDate" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubStrategicRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubStrategicRiskHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "status" "HubStrategicRiskStatus" NOT NULL,
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "mitigation" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubStrategicRiskHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubStrategicReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "meetingId" TEXT,
    "reviewDate" DATE NOT NULL,
    "participantMemberIds" TEXT[],
    "summary" TEXT,
    "objectiveSnapshots" JSONB,
    "indicatorSnapshots" JSONB,
    "riskSummary" JSONB,
    "decisions" JSONB,
    "nextActions" JSONB,
    "status" "HubStrategicReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubStrategicReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubGrowthOrganization" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "document" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'BR',
    "notes" TEXT,
    "status" "HubGrowthOrganizationStatus" NOT NULL DEFAULT 'PROSPECT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubGrowthOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubGrowthContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "growthOrganizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubGrowthContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubLead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "growthOrganizationId" TEXT,
    "title" TEXT NOT NULL,
    "source" "HubLeadSource" NOT NULL,
    "status" "HubLeadStatus" NOT NULL DEFAULT 'NEW',
    "ownerMemberId" TEXT,
    "directorateId" TEXT,
    "notes" TEXT,
    "disqualificationReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "convertedOpportunityId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubPipelineStage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubPipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubOpportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "growthOrganizationId" TEXT NOT NULL,
    "primaryContactId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerMemberId" TEXT,
    "directorateId" TEXT,
    "stageId" TEXT NOT NULL,
    "status" "HubOpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "estimatedValueCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "expectedCloseDate" DATE,
    "source" "HubLeadSource" NOT NULL,
    "probability" INTEGER NOT NULL,
    "probabilityOverride" INTEGER,
    "probabilityOverrideReason" TEXT,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "lossReason" TEXT,
    "cancellationReason" TEXT,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceLeadId" TEXT,
    "projectId" TEXT,
    "projectCreationKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubOpportunityStageHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "fromStatus" "HubOpportunityStatus" NOT NULL,
    "toStatus" "HubOpportunityStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubOpportunityStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubOpportunityActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "type" "HubOpportunityActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "nextActionAt" TIMESTAMP(3),
    "meetingId" TEXT,
    "taskId" TEXT,
    "replacesActivityId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubOpportunityActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubProposal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "validUntil" DATE,
    "currency" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "status" "HubProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "expiredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "activeRevisionId" TEXT,
    "projectId" TEXT,
    "projectCreationKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubProposalRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "deliverables" TEXT NOT NULL,
    "timeline" TEXT NOT NULL,
    "commercialTerms" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubProposalRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubProposalItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitAmountCents" INTEGER NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "HubProposalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubPartnership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "growthOrganizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ownerMemberId" TEXT,
    "status" "HubPartnershipStatus" NOT NULL DEFAULT 'PROPOSED',
    "startsAt" DATE,
    "endsAt" DATE,
    "goals" TEXT,
    "notes" TEXT,
    "opportunityId" TEXT,
    "initiativeId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubPartnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubStrategicGrowthMutation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubStrategicGrowthMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EconomikWorkspace_slug_key" ON "EconomikWorkspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "HubAccount_normalizedEmail_key" ON "HubAccount"("normalizedEmail");

-- CreateIndex
CREATE INDEX "HubAccount_lastOrganizationId_idx" ON "HubAccount"("lastOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HubMemberInvitation_tokenHash_key" ON "HubMemberInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "HubMemberInvitation_organizationId_status_createdAt_idx" ON "HubMemberInvitation"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "HubMemberInvitation_organizationId_normalizedEmail_idx" ON "HubMemberInvitation"("organizationId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "HubMemberInvitation_existingInvitedMemberId_idx" ON "HubMemberInvitation"("existingInvitedMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceHubLink_hubOrganizationId_key" ON "WorkspaceHubLink"("hubOrganizationId");

-- CreateIndex
CREATE INDEX "WorkspaceHubLink_atlasOrganizationId_idx" ON "WorkspaceHubLink"("atlasOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceHubMutation_scope_idempotencyKey_key" ON "WorkspaceHubMutation"("scope", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkspaceHubAudit_hubOrganizationId_createdAt_idx" ON "WorkspaceHubAudit"("hubOrganizationId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceHubAudit_actorUserId_createdAt_idx" ON "WorkspaceHubAudit"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EconomikDirectorate_workspaceId_idx" ON "EconomikDirectorate"("workspaceId");

-- CreateIndex
CREATE INDEX "EconomikDirectorate_workspaceId_archivedAt_idx" ON "EconomikDirectorate"("workspaceId", "archivedAt");

-- CreateIndex
CREATE INDEX "EconomikDirectorate_directorId_idx" ON "EconomikDirectorate"("directorId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomikDirectorate_workspaceId_slug_key" ON "EconomikDirectorate"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "EconomikMember_workspaceId_idx" ON "EconomikMember"("workspaceId");

-- CreateIndex
CREATE INDEX "EconomikMember_workspaceId_organizationPosition_idx" ON "EconomikMember"("workspaceId", "organizationPosition");

-- CreateIndex
CREATE INDEX "EconomikMember_workspaceId_memberCategory_idx" ON "EconomikMember"("workspaceId", "memberCategory");

-- CreateIndex
CREATE INDEX "EconomikMember_directorateId_idx" ON "EconomikMember"("directorateId");

-- CreateIndex
CREATE INDEX "EconomikMember_accountId_idx" ON "EconomikMember"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomikMember_workspaceId_normalizedEmail_key" ON "EconomikMember"("workspaceId", "normalizedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "EconomikMetricProject_idempotencyKey_key" ON "EconomikMetricProject"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EconomikMetricProject_workspaceId_idx" ON "EconomikMetricProject"("workspaceId");

-- CreateIndex
CREATE INDEX "EconomikMetricProject_status_idx" ON "EconomikMetricProject"("status");

-- CreateIndex
CREATE INDEX "EconomikMetricProject_workspaceId_archivedAt_status_idx" ON "EconomikMetricProject"("workspaceId", "archivedAt", "status");

-- CreateIndex
CREATE INDEX "EconomikMetricProject_primaryDirectorateId_idx" ON "EconomikMetricProject"("primaryDirectorateId");

-- CreateIndex
CREATE INDEX "EconomikMetricProject_managerId_idx" ON "EconomikMetricProject"("managerId");

-- CreateIndex
CREATE INDEX "HubProjectDirectorate_directorateId_idx" ON "HubProjectDirectorate"("directorateId");

-- CreateIndex
CREATE UNIQUE INDEX "HubProjectDirectorate_projectId_directorateId_key" ON "HubProjectDirectorate"("projectId", "directorateId");

-- CreateIndex
CREATE INDEX "HubProjectTeamMember_memberId_idx" ON "HubProjectTeamMember"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "HubProjectTeamMember_projectId_memberId_key" ON "HubProjectTeamMember"("projectId", "memberId");

-- CreateIndex
CREATE INDEX "HubProjectMilestone_projectId_dueAt_idx" ON "HubProjectMilestone"("projectId", "dueAt");

-- CreateIndex
CREATE INDEX "EconomikMetricProjectParticipant_memberId_idx" ON "EconomikMetricProjectParticipant"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomikMetricProjectParticipant_projectId_memberId_key" ON "EconomikMetricProjectParticipant"("projectId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomikFinancialRule_workspaceId_key" ON "EconomikFinancialRule"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomikWalletAccount_memberId_key" ON "EconomikWalletAccount"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomikWalletTransaction_idempotencyKey_key" ON "EconomikWalletTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EconomikWalletTransaction_accountId_idx" ON "EconomikWalletTransaction"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomikWalletRequest_idempotencyKey_key" ON "EconomikWalletRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EconomikWalletRequest_accountId_idx" ON "EconomikWalletRequest"("accountId");

-- CreateIndex
CREATE INDEX "EconomikWalletRequest_status_idx" ON "EconomikWalletRequest"("status");

-- CreateIndex
CREATE INDEX "EconomikAuditLog_workspaceId_idx" ON "EconomikAuditLog"("workspaceId");

-- CreateIndex
CREATE INDEX "EconomikAuditLog_action_idx" ON "EconomikAuditLog"("action");

-- CreateIndex
CREATE INDEX "EconomikAuditLog_createdAt_idx" ON "EconomikAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "HubNotification_organizationId_recipientMemberId_readAt_idx" ON "HubNotification"("organizationId", "recipientMemberId", "readAt");

-- CreateIndex
CREATE INDEX "HubNotification_recipientMemberId_createdAt_idx" ON "HubNotification"("recipientMemberId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "HubNotification_organizationId_createdAt_idx" ON "HubNotification"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HubNotification_organizationId_idempotencyKey_key" ON "HubNotification"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "HubAvailabilityRule_organizationId_memberId_idx" ON "HubAvailabilityRule"("organizationId", "memberId");

-- CreateIndex
CREATE INDEX "HubAvailabilityRule_memberId_weekday_idx" ON "HubAvailabilityRule"("memberId", "weekday");

-- CreateIndex
CREATE INDEX "HubAvailabilityException_organizationId_memberId_idx" ON "HubAvailabilityException"("organizationId", "memberId");

-- CreateIndex
CREATE INDEX "HubAvailabilityException_memberId_date_idx" ON "HubAvailabilityException"("memberId", "date");

-- CreateIndex
CREATE INDEX "HubMeeting_organizationId_startAt_idx" ON "HubMeeting"("organizationId", "startAt");

-- CreateIndex
CREATE INDEX "HubMeeting_directorateId_startAt_idx" ON "HubMeeting"("directorateId", "startAt");

-- CreateIndex
CREATE INDEX "HubMeeting_createdById_idx" ON "HubMeeting"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "HubMeeting_organizationId_idempotencyKey_key" ON "HubMeeting"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "HubAvailabilityPoll_organizationId_status_idx" ON "HubAvailabilityPoll"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HubAvailabilityPoll_directorateId_idx" ON "HubAvailabilityPoll"("directorateId");

-- CreateIndex
CREATE INDEX "HubAvailabilityPollParticipant_memberId_idx" ON "HubAvailabilityPollParticipant"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "HubAvailabilityPollParticipant_pollId_memberId_key" ON "HubAvailabilityPollParticipant"("pollId", "memberId");

-- CreateIndex
CREATE INDEX "HubAvailabilitySelection_pollId_slotStart_idx" ON "HubAvailabilitySelection"("pollId", "slotStart");

-- CreateIndex
CREATE INDEX "HubAvailabilitySelection_memberId_idx" ON "HubAvailabilitySelection"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "HubAvailabilitySelection_pollId_memberId_slotStart_key" ON "HubAvailabilitySelection"("pollId", "memberId", "slotStart");

-- CreateIndex
CREATE INDEX "HubMeetingDirectorate_directorateId_idx" ON "HubMeetingDirectorate"("directorateId");

-- CreateIndex
CREATE UNIQUE INDEX "HubMeetingDirectorate_meetingId_directorateId_key" ON "HubMeetingDirectorate"("meetingId", "directorateId");

-- CreateIndex
CREATE INDEX "HubMeetingExternalGuest_meetingId_idx" ON "HubMeetingExternalGuest"("meetingId");

-- CreateIndex
CREATE INDEX "HubMeetingResponseEvent_meetingId_memberId_createdAt_idx" ON "HubMeetingResponseEvent"("meetingId", "memberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HubMeetingResponseEvent_organizationId_eventId_key" ON "HubMeetingResponseEvent"("organizationId", "eventId");

-- CreateIndex
CREATE INDEX "HubMeetingParticipant_memberId_responseStatus_idx" ON "HubMeetingParticipant"("memberId", "responseStatus");

-- CreateIndex
CREATE UNIQUE INDEX "HubMeetingParticipant_meetingId_memberId_key" ON "HubMeetingParticipant"("meetingId", "memberId");

-- CreateIndex
CREATE INDEX "HubMeetingAgendaItem_presenterMemberId_idx" ON "HubMeetingAgendaItem"("presenterMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "HubMeetingAgendaItem_meetingId_order_key" ON "HubMeetingAgendaItem"("meetingId", "order");

-- CreateIndex
CREATE INDEX "HubMeetingDecision_meetingId_decidedAt_idx" ON "HubMeetingDecision"("meetingId", "decidedAt");

-- CreateIndex
CREATE INDEX "HubBoard_organizationId_isArchived_idx" ON "HubBoard"("organizationId", "isArchived");

-- CreateIndex
CREATE INDEX "HubBoard_directorateId_idx" ON "HubBoard"("directorateId");

-- CreateIndex
CREATE INDEX "HubBoardColumn_boardId_isArchived_idx" ON "HubBoardColumn"("boardId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "HubBoardColumn_boardId_order_key" ON "HubBoardColumn"("boardId", "order");

-- CreateIndex
CREATE INDEX "HubTask_organizationId_dueAt_idx" ON "HubTask"("organizationId", "dueAt");

-- CreateIndex
CREATE INDEX "HubTask_boardId_columnId_position_idx" ON "HubTask"("boardId", "columnId", "position");

-- CreateIndex
CREATE INDEX "HubTask_sourceMeetingId_idx" ON "HubTask"("sourceMeetingId");

-- CreateIndex
CREATE INDEX "HubTask_directorateId_status_idx" ON "HubTask"("directorateId", "status");

-- CreateIndex
CREATE INDEX "HubTask_projectId_status_idx" ON "HubTask"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HubTask_organizationId_idempotencyKey_key" ON "HubTask"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "HubCalendarEvent_organizationId_startAt_idx" ON "HubCalendarEvent"("organizationId", "startAt");

-- CreateIndex
CREATE INDEX "HubCalendarEvent_directorateId_startAt_idx" ON "HubCalendarEvent"("directorateId", "startAt");

-- CreateIndex
CREATE INDEX "HubCalendarEvent_projectId_idx" ON "HubCalendarEvent"("projectId");

-- CreateIndex
CREATE INDEX "HubCalendarEvent_meetingId_idx" ON "HubCalendarEvent"("meetingId");

-- CreateIndex
CREATE INDEX "HubTaskAssignee_memberId_idx" ON "HubTaskAssignee"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "HubTaskAssignee_taskId_memberId_key" ON "HubTaskAssignee"("taskId", "memberId");

-- CreateIndex
CREATE INDEX "HubTaskComment_taskId_createdAt_idx" ON "HubTaskComment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "HubTaskComment_authorId_idx" ON "HubTaskComment"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "HubTaskChecklistItem_taskId_order_key" ON "HubTaskChecklistItem"("taskId", "order");

-- CreateIndex
CREATE INDEX "HubFinancialCategory_organizationId_type_isActive_idx" ON "HubFinancialCategory"("organizationId", "type", "isActive");

-- CreateIndex
CREATE INDEX "HubFinancialCategory_parentId_idx" ON "HubFinancialCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "HubFinancialCategory_organizationId_normalizedName_key" ON "HubFinancialCategory"("organizationId", "normalizedName");

-- CreateIndex
CREATE INDEX "HubCostCenter_organizationId_isActive_idx" ON "HubCostCenter"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "HubCostCenter_directorateId_idx" ON "HubCostCenter"("directorateId");

-- CreateIndex
CREATE UNIQUE INDEX "HubCostCenter_organizationId_normalizedCode_key" ON "HubCostCenter"("organizationId", "normalizedCode");

-- CreateIndex
CREATE INDEX "HubCounterparty_organizationId_normalizedName_idx" ON "HubCounterparty"("organizationId", "normalizedName");

-- CreateIndex
CREATE INDEX "HubCounterparty_organizationId_normalizedDocument_idx" ON "HubCounterparty"("organizationId", "normalizedDocument");

-- CreateIndex
CREATE INDEX "HubCounterparty_organizationId_normalizedEmail_idx" ON "HubCounterparty"("organizationId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "HubFinancialEntry_organizationId_status_competenceDate_idx" ON "HubFinancialEntry"("organizationId", "status", "competenceDate");

-- CreateIndex
CREATE INDEX "HubFinancialEntry_organizationId_direction_issueDate_idx" ON "HubFinancialEntry"("organizationId", "direction", "issueDate");

-- CreateIndex
CREATE INDEX "HubFinancialEntry_categoryId_idx" ON "HubFinancialEntry"("categoryId");

-- CreateIndex
CREATE INDEX "HubFinancialEntry_costCenterId_idx" ON "HubFinancialEntry"("costCenterId");

-- CreateIndex
CREATE INDEX "HubFinancialEntry_directorateId_idx" ON "HubFinancialEntry"("directorateId");

-- CreateIndex
CREATE INDEX "HubFinancialEntry_counterpartyId_idx" ON "HubFinancialEntry"("counterpartyId");

-- CreateIndex
CREATE INDEX "HubFinancialEntry_projectId_idx" ON "HubFinancialEntry"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "HubFinancialEntry_organizationId_idempotencyKey_key" ON "HubFinancialEntry"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "HubFinancialInstallment_organizationId_dueDate_status_idx" ON "HubFinancialInstallment"("organizationId", "dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HubFinancialInstallment_entryId_number_key" ON "HubFinancialInstallment"("entryId", "number");

-- CreateIndex
CREATE INDEX "HubFinancialSettlement_organizationId_settledAt_idx" ON "HubFinancialSettlement"("organizationId", "settledAt");

-- CreateIndex
CREATE INDEX "HubFinancialSettlement_entryId_reversedAt_idx" ON "HubFinancialSettlement"("entryId", "reversedAt");

-- CreateIndex
CREATE INDEX "HubFinancialSettlement_installmentId_reversedAt_idx" ON "HubFinancialSettlement"("installmentId", "reversedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HubFinancialSettlement_organizationId_idempotencyKey_key" ON "HubFinancialSettlement"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "HubFinancialPeriod_organizationId_status_idx" ON "HubFinancialPeriod"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HubFinancialPeriod_organizationId_year_month_key" ON "HubFinancialPeriod"("organizationId", "year", "month");

-- CreateIndex
CREATE INDEX "HubBudget_organizationId_year_status_idx" ON "HubBudget"("organizationId", "year", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HubBudget_organizationId_year_name_revision_key" ON "HubBudget"("organizationId", "year", "name", "revision");

-- CreateIndex
CREATE INDEX "HubBudgetLine_organizationId_month_idx" ON "HubBudgetLine"("organizationId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "HubBudgetLine_budgetId_categoryId_costCenterId_month_key" ON "HubBudgetLine"("budgetId", "categoryId", "costCenterId", "month");

-- CreateIndex
CREATE INDEX "HubReimbursementRequest_organizationId_status_createdAt_idx" ON "HubReimbursementRequest"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "HubReimbursementRequest_requesterMemberId_status_idx" ON "HubReimbursementRequest"("requesterMemberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HubReimbursementRequest_organizationId_idempotencyKey_key" ON "HubReimbursementRequest"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "HubReimbursementItem_organizationId_requestId_idx" ON "HubReimbursementItem"("organizationId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "HubMemberProfile_memberId_key" ON "HubMemberProfile"("memberId");

-- CreateIndex
CREATE INDEX "HubMemberProfile_organizationId_idx" ON "HubMemberProfile"("organizationId");

-- CreateIndex
CREATE INDEX "HubMemberLifecycleEvent_organizationId_memberId_createdAt_idx" ON "HubMemberLifecycleEvent"("organizationId", "memberId", "createdAt");

-- CreateIndex
CREATE INDEX "HubOnboardingTemplate_organizationId_isActive_idx" ON "HubOnboardingTemplate"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "HubOnboardingTemplateItem_organizationId_idx" ON "HubOnboardingTemplateItem"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HubOnboardingTemplateItem_templateId_order_key" ON "HubOnboardingTemplateItem"("templateId", "order");

-- CreateIndex
CREATE INDEX "HubOnboardingAssignment_organizationId_memberId_completedAt_idx" ON "HubOnboardingAssignment"("organizationId", "memberId", "completedAt");

-- CreateIndex
CREATE INDEX "HubOnboardingAssignmentItem_organizationId_ownerMemberId_co_idx" ON "HubOnboardingAssignmentItem"("organizationId", "ownerMemberId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HubOnboardingAssignmentItem_assignmentId_templateItemId_key" ON "HubOnboardingAssignmentItem"("assignmentId", "templateItemId");

-- CreateIndex
CREATE UNIQUE INDEX "HubCompetency_organizationId_normalizedName_key" ON "HubCompetency"("organizationId", "normalizedName");

-- CreateIndex
CREATE INDEX "HubMemberCompetency_organizationId_memberId_idx" ON "HubMemberCompetency"("organizationId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "HubMemberCompetency_memberId_competencyId_key" ON "HubMemberCompetency"("memberId", "competencyId");

-- CreateIndex
CREATE INDEX "HubDevelopmentPlan_organizationId_memberId_isActive_idx" ON "HubDevelopmentPlan"("organizationId", "memberId", "isActive");

-- CreateIndex
CREATE INDEX "HubDevelopmentGoal_organizationId_ownerMemberId_status_idx" ON "HubDevelopmentGoal"("organizationId", "ownerMemberId", "status");

-- CreateIndex
CREATE INDEX "HubPeopleCycle_organizationId_status_idx" ON "HubPeopleCycle"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HubFeedback_organizationId_recipientMemberId_createdAt_idx" ON "HubFeedback"("organizationId", "recipientMemberId", "createdAt");

-- CreateIndex
CREATE INDEX "HubEvaluation_organizationId_evaluatorMemberId_status_idx" ON "HubEvaluation"("organizationId", "evaluatorMemberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HubEvaluation_cycleId_evaluatorMemberId_evaluatedMemberId_t_key" ON "HubEvaluation"("cycleId", "evaluatorMemberId", "evaluatedMemberId", "type");

-- CreateIndex
CREATE INDEX "HubEvaluationCriterion_organizationId_idx" ON "HubEvaluationCriterion"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HubEvaluationCriterion_cycleId_order_key" ON "HubEvaluationCriterion"("cycleId", "order");

-- CreateIndex
CREATE INDEX "HubEvaluationResponse_organizationId_idx" ON "HubEvaluationResponse"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HubEvaluationResponse_evaluationId_criterionId_key" ON "HubEvaluationResponse"("evaluationId", "criterionId");

-- CreateIndex
CREATE INDEX "HubRecognition_organizationId_recipientMemberId_recognizedA_idx" ON "HubRecognition"("organizationId", "recipientMemberId", "recognizedAt");

-- CreateIndex
CREATE INDEX "HubParticipationRecord_organizationId_memberId_date_idx" ON "HubParticipationRecord"("organizationId", "memberId", "date");

-- CreateIndex
CREATE INDEX "HubRecruitmentProcess_organizationId_status_idx" ON "HubRecruitmentProcess"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HubRecruitmentStage_organizationId_idx" ON "HubRecruitmentStage"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HubRecruitmentStage_processId_order_key" ON "HubRecruitmentStage"("processId", "order");

-- CreateIndex
CREATE INDEX "HubCandidate_organizationId_status_idx" ON "HubCandidate"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HubCandidate_processId_normalizedEmail_key" ON "HubCandidate"("processId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "HubCandidateStageEvent_candidateId_createdAt_idx" ON "HubCandidateStageEvent"("candidateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HubCandidateStageEvent_organizationId_idempotencyKey_key" ON "HubCandidateStageEvent"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "HubCandidateEvaluation_organizationId_idx" ON "HubCandidateEvaluation"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HubCandidateEvaluation_candidateId_evaluatorId_key" ON "HubCandidateEvaluation"("candidateId", "evaluatorId");

-- CreateIndex
CREATE INDEX "HubStrategyCycle_organizationId_status_startsAt_endsAt_idx" ON "HubStrategyCycle"("organizationId", "status", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "HubStrategyCycle_organizationId_name_key" ON "HubStrategyCycle"("organizationId", "name");

-- CreateIndex
CREATE INDEX "HubStrategicObjective_organizationId_cycleId_directorateId_idx" ON "HubStrategicObjective"("organizationId", "cycleId", "directorateId");

-- CreateIndex
CREATE INDEX "HubStrategicObjective_organizationId_ownerMemberId_status_idx" ON "HubStrategicObjective"("organizationId", "ownerMemberId", "status");

-- CreateIndex
CREATE INDEX "HubKeyResult_organizationId_objectiveId_idx" ON "HubKeyResult"("organizationId", "objectiveId");

-- CreateIndex
CREATE INDEX "HubKeyResult_organizationId_ownerMemberId_status_idx" ON "HubKeyResult"("organizationId", "ownerMemberId", "status");

-- CreateIndex
CREATE INDEX "HubKeyResultHistory_organizationId_keyResultId_createdAt_idx" ON "HubKeyResultHistory"("organizationId", "keyResultId", "createdAt");

-- CreateIndex
CREATE INDEX "HubStrategicInitiative_organizationId_directorateId_status_idx" ON "HubStrategicInitiative"("organizationId", "directorateId", "status");

-- CreateIndex
CREATE INDEX "HubStrategicInitiative_objectiveId_idx" ON "HubStrategicInitiative"("objectiveId");

-- CreateIndex
CREATE INDEX "HubStrategicIndicator_organizationId_directorateId_isActive_idx" ON "HubStrategicIndicator"("organizationId", "directorateId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "HubStrategicIndicator_organizationId_name_key" ON "HubStrategicIndicator"("organizationId", "name");

-- CreateIndex
CREATE INDEX "HubIndicatorMeasurement_organizationId_indicatorId_measured_idx" ON "HubIndicatorMeasurement"("organizationId", "indicatorId", "measuredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HubIndicatorMeasurement_organizationId_idempotencyKey_key" ON "HubIndicatorMeasurement"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "HubStrategicRisk_organizationId_cycleId_directorateId_statu_idx" ON "HubStrategicRisk"("organizationId", "cycleId", "directorateId", "status");

-- CreateIndex
CREATE INDEX "HubStrategicRiskHistory_organizationId_riskId_createdAt_idx" ON "HubStrategicRiskHistory"("organizationId", "riskId", "createdAt");

-- CreateIndex
CREATE INDEX "HubStrategicReview_organizationId_cycleId_reviewDate_idx" ON "HubStrategicReview"("organizationId", "cycleId", "reviewDate");

-- CreateIndex
CREATE INDEX "HubStrategicReview_meetingId_idx" ON "HubStrategicReview"("meetingId");

-- CreateIndex
CREATE INDEX "HubGrowthOrganization_organizationId_status_idx" ON "HubGrowthOrganization"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HubGrowthOrganization_organizationId_normalizedName_key" ON "HubGrowthOrganization"("organizationId", "normalizedName");

-- CreateIndex
CREATE INDEX "HubGrowthContact_organizationId_growthOrganizationId_isActi_idx" ON "HubGrowthContact"("organizationId", "growthOrganizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "HubGrowthContact_growthOrganizationId_normalizedEmail_key" ON "HubGrowthContact"("growthOrganizationId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "HubLead_organizationId_status_directorateId_idx" ON "HubLead"("organizationId", "status", "directorateId");

-- CreateIndex
CREATE UNIQUE INDEX "HubLead_organizationId_idempotencyKey_key" ON "HubLead"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "HubPipelineStage_organizationId_isActive_idx" ON "HubPipelineStage"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "HubPipelineStage_organizationId_order_key" ON "HubPipelineStage"("organizationId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "HubPipelineStage_organizationId_name_key" ON "HubPipelineStage"("organizationId", "name");

-- CreateIndex
CREATE INDEX "HubOpportunity_organizationId_stageId_status_idx" ON "HubOpportunity"("organizationId", "stageId", "status");

-- CreateIndex
CREATE INDEX "HubOpportunity_organizationId_directorateId_ownerMemberId_idx" ON "HubOpportunity"("organizationId", "directorateId", "ownerMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "HubOpportunity_organizationId_sourceLeadId_key" ON "HubOpportunity"("organizationId", "sourceLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "HubOpportunity_organizationId_projectCreationKey_key" ON "HubOpportunity"("organizationId", "projectCreationKey");

-- CreateIndex
CREATE INDEX "HubOpportunityStageHistory_organizationId_opportunityId_cre_idx" ON "HubOpportunityStageHistory"("organizationId", "opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "HubOpportunityActivity_organizationId_opportunityId_occurre_idx" ON "HubOpportunityActivity"("organizationId", "opportunityId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "HubProposal_organizationId_opportunityId_status_idx" ON "HubProposal"("organizationId", "opportunityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HubProposal_organizationId_projectCreationKey_key" ON "HubProposal"("organizationId", "projectCreationKey");

-- CreateIndex
CREATE INDEX "HubProposalRevision_organizationId_proposalId_idx" ON "HubProposalRevision"("organizationId", "proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "HubProposalRevision_proposalId_revisionNumber_key" ON "HubProposalRevision"("proposalId", "revisionNumber");

-- CreateIndex
CREATE INDEX "HubProposalItem_organizationId_revisionId_idx" ON "HubProposalItem"("organizationId", "revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "HubProposalItem_revisionId_order_key" ON "HubProposalItem"("revisionId", "order");

-- CreateIndex
CREATE INDEX "HubPartnership_organizationId_status_ownerMemberId_idx" ON "HubPartnership"("organizationId", "status", "ownerMemberId");

-- CreateIndex
CREATE INDEX "HubStrategicGrowthMutation_organizationId_entityType_entity_idx" ON "HubStrategicGrowthMutation"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "HubStrategicGrowthMutation_organizationId_scope_idempotency_key" ON "HubStrategicGrowthMutation"("organizationId", "scope", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "EconomikWorkspace" ADD CONSTRAINT "EconomikWorkspace_responsibleMemberId_fkey" FOREIGN KEY ("responsibleMemberId") REFERENCES "EconomikMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAccount" ADD CONSTRAINT "HubAccount_lastOrganizationId_fkey" FOREIGN KEY ("lastOrganizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMemberInvitation" ADD CONSTRAINT "HubMemberInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMemberInvitation" ADD CONSTRAINT "HubMemberInvitation_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "EconomikDirectorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMemberInvitation" ADD CONSTRAINT "HubMemberInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "EconomikMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMemberInvitation" ADD CONSTRAINT "HubMemberInvitation_existingInvitedMemberId_fkey" FOREIGN KEY ("existingInvitedMemberId") REFERENCES "EconomikMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceHubLink" ADD CONSTRAINT "WorkspaceHubLink_hubOrganizationId_fkey" FOREIGN KEY ("hubOrganizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikDirectorate" ADD CONSTRAINT "EconomikDirectorate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikDirectorate" ADD CONSTRAINT "EconomikDirectorate_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "EconomikMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikMember" ADD CONSTRAINT "EconomikMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikMember" ADD CONSTRAINT "EconomikMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "HubAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikMember" ADD CONSTRAINT "EconomikMember_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "EconomikDirectorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikMetricProject" ADD CONSTRAINT "EconomikMetricProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikMetricProject" ADD CONSTRAINT "EconomikMetricProject_primaryDirectorateId_fkey" FOREIGN KEY ("primaryDirectorateId") REFERENCES "EconomikDirectorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikMetricProject" ADD CONSTRAINT "EconomikMetricProject_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "EconomikMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikMetricProject" ADD CONSTRAINT "EconomikMetricProject_responsibleMemberId_fkey" FOREIGN KEY ("responsibleMemberId") REFERENCES "EconomikMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikMetricProject" ADD CONSTRAINT "EconomikMetricProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EconomikMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubProjectDirectorate" ADD CONSTRAINT "HubProjectDirectorate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EconomikMetricProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubProjectDirectorate" ADD CONSTRAINT "HubProjectDirectorate_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "EconomikDirectorate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubProjectTeamMember" ADD CONSTRAINT "HubProjectTeamMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EconomikMetricProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubProjectTeamMember" ADD CONSTRAINT "HubProjectTeamMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "EconomikMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubProjectMilestone" ADD CONSTRAINT "HubProjectMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EconomikMetricProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikMetricProjectParticipant" ADD CONSTRAINT "EconomikMetricProjectParticipant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EconomikMetricProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikMetricProjectParticipant" ADD CONSTRAINT "EconomikMetricProjectParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "EconomikMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikFinancialRule" ADD CONSTRAINT "EconomikFinancialRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikWalletAccount" ADD CONSTRAINT "EconomikWalletAccount_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "EconomikMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikWalletTransaction" ADD CONSTRAINT "EconomikWalletTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EconomikWalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikWalletTransaction" ADD CONSTRAINT "EconomikWalletTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EconomikMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikWalletRequest" ADD CONSTRAINT "EconomikWalletRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EconomikWalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikWalletRequest" ADD CONSTRAINT "EconomikWalletRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "EconomikMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikWalletRequest" ADD CONSTRAINT "EconomikWalletRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "EconomikMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikAuditLog" ADD CONSTRAINT "EconomikAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomikAuditLog" ADD CONSTRAINT "EconomikAuditLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "EconomikMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubNotification" ADD CONSTRAINT "HubNotification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubNotification" ADD CONSTRAINT "HubNotification_recipientMemberId_fkey" FOREIGN KEY ("recipientMemberId") REFERENCES "EconomikMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubNotification" ADD CONSTRAINT "HubNotification_actorMemberId_fkey" FOREIGN KEY ("actorMemberId") REFERENCES "EconomikMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAvailabilityRule" ADD CONSTRAINT "HubAvailabilityRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAvailabilityRule" ADD CONSTRAINT "HubAvailabilityRule_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "EconomikMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAvailabilityException" ADD CONSTRAINT "HubAvailabilityException_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAvailabilityException" ADD CONSTRAINT "HubAvailabilityException_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "EconomikMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeeting" ADD CONSTRAINT "HubMeeting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeeting" ADD CONSTRAINT "HubMeeting_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "EconomikDirectorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeeting" ADD CONSTRAINT "HubMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EconomikMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeeting" ADD CONSTRAINT "HubMeeting_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "EconomikMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAvailabilityPoll" ADD CONSTRAINT "HubAvailabilityPoll_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAvailabilityPoll" ADD CONSTRAINT "HubAvailabilityPoll_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "EconomikDirectorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAvailabilityPoll" ADD CONSTRAINT "HubAvailabilityPoll_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EconomikMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAvailabilityPollParticipant" ADD CONSTRAINT "HubAvailabilityPollParticipant_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "HubAvailabilityPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAvailabilityPollParticipant" ADD CONSTRAINT "HubAvailabilityPollParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "EconomikMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAvailabilitySelection" ADD CONSTRAINT "HubAvailabilitySelection_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "HubAvailabilityPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAvailabilitySelection" ADD CONSTRAINT "HubAvailabilitySelection_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "EconomikMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeetingDirectorate" ADD CONSTRAINT "HubMeetingDirectorate_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "HubMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeetingDirectorate" ADD CONSTRAINT "HubMeetingDirectorate_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "EconomikDirectorate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeetingExternalGuest" ADD CONSTRAINT "HubMeetingExternalGuest_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "HubMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeetingResponseEvent" ADD CONSTRAINT "HubMeetingResponseEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeetingResponseEvent" ADD CONSTRAINT "HubMeetingResponseEvent_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "HubMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeetingResponseEvent" ADD CONSTRAINT "HubMeetingResponseEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "EconomikMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeetingParticipant" ADD CONSTRAINT "HubMeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "HubMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeetingParticipant" ADD CONSTRAINT "HubMeetingParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "EconomikMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeetingAgendaItem" ADD CONSTRAINT "HubMeetingAgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "HubMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeetingAgendaItem" ADD CONSTRAINT "HubMeetingAgendaItem_presenterMemberId_fkey" FOREIGN KEY ("presenterMemberId") REFERENCES "EconomikMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeetingDecision" ADD CONSTRAINT "HubMeetingDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "HubMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMeetingDecision" ADD CONSTRAINT "HubMeetingDecision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EconomikMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubBoard" ADD CONSTRAINT "HubBoard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubBoard" ADD CONSTRAINT "HubBoard_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "EconomikDirectorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubBoard" ADD CONSTRAINT "HubBoard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EconomikMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubBoardColumn" ADD CONSTRAINT "HubBoardColumn_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "HubBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTask" ADD CONSTRAINT "HubTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTask" ADD CONSTRAINT "HubTask_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "HubBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTask" ADD CONSTRAINT "HubTask_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "HubBoardColumn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTask" ADD CONSTRAINT "HubTask_sourceMeetingId_fkey" FOREIGN KEY ("sourceMeetingId") REFERENCES "HubMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTask" ADD CONSTRAINT "HubTask_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "EconomikDirectorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTask" ADD CONSTRAINT "HubTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EconomikMetricProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTask" ADD CONSTRAINT "HubTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EconomikMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubCalendarEvent" ADD CONSTRAINT "HubCalendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubCalendarEvent" ADD CONSTRAINT "HubCalendarEvent_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "EconomikDirectorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubCalendarEvent" ADD CONSTRAINT "HubCalendarEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EconomikMetricProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubCalendarEvent" ADD CONSTRAINT "HubCalendarEvent_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "HubMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubCalendarEvent" ADD CONSTRAINT "HubCalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EconomikMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTaskAssignee" ADD CONSTRAINT "HubTaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HubTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTaskAssignee" ADD CONSTRAINT "HubTaskAssignee_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "EconomikMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTaskComment" ADD CONSTRAINT "HubTaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HubTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTaskComment" ADD CONSTRAINT "HubTaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "EconomikMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTaskChecklistItem" ADD CONSTRAINT "HubTaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HubTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubFinancialEntry" ADD CONSTRAINT "HubFinancialEntry_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "EconomikDirectorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubFinancialEntry" ADD CONSTRAINT "HubFinancialEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EconomikMetricProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategyCycle" ADD CONSTRAINT "HubStrategyCycle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategicObjective" ADD CONSTRAINT "HubStrategicObjective_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategicObjective" ADD CONSTRAINT "HubStrategicObjective_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "HubStrategyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubKeyResult" ADD CONSTRAINT "HubKeyResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubKeyResult" ADD CONSTRAINT "HubKeyResult_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "HubStrategicObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubKeyResultHistory" ADD CONSTRAINT "HubKeyResultHistory_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "HubKeyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategicInitiative" ADD CONSTRAINT "HubStrategicInitiative_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategicInitiative" ADD CONSTRAINT "HubStrategicInitiative_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "HubStrategicObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategicIndicator" ADD CONSTRAINT "HubStrategicIndicator_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubIndicatorMeasurement" ADD CONSTRAINT "HubIndicatorMeasurement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubIndicatorMeasurement" ADD CONSTRAINT "HubIndicatorMeasurement_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "HubStrategicIndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategicRisk" ADD CONSTRAINT "HubStrategicRisk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategicRisk" ADD CONSTRAINT "HubStrategicRisk_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "HubStrategyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategicRisk" ADD CONSTRAINT "HubStrategicRisk_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "HubStrategicObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategicRiskHistory" ADD CONSTRAINT "HubStrategicRiskHistory_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "HubStrategicRisk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategicReview" ADD CONSTRAINT "HubStrategicReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategicReview" ADD CONSTRAINT "HubStrategicReview_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "HubStrategyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubGrowthOrganization" ADD CONSTRAINT "HubGrowthOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubGrowthContact" ADD CONSTRAINT "HubGrowthContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubGrowthContact" ADD CONSTRAINT "HubGrowthContact_growthOrganizationId_fkey" FOREIGN KEY ("growthOrganizationId") REFERENCES "HubGrowthOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubLead" ADD CONSTRAINT "HubLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubLead" ADD CONSTRAINT "HubLead_growthOrganizationId_fkey" FOREIGN KEY ("growthOrganizationId") REFERENCES "HubGrowthOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubPipelineStage" ADD CONSTRAINT "HubPipelineStage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubOpportunity" ADD CONSTRAINT "HubOpportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubOpportunity" ADD CONSTRAINT "HubOpportunity_growthOrganizationId_fkey" FOREIGN KEY ("growthOrganizationId") REFERENCES "HubGrowthOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubOpportunity" ADD CONSTRAINT "HubOpportunity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "HubPipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubOpportunityStageHistory" ADD CONSTRAINT "HubOpportunityStageHistory_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "HubOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubOpportunityActivity" ADD CONSTRAINT "HubOpportunityActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubOpportunityActivity" ADD CONSTRAINT "HubOpportunityActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "HubOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubProposal" ADD CONSTRAINT "HubProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubProposal" ADD CONSTRAINT "HubProposal_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "HubOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubProposalRevision" ADD CONSTRAINT "HubProposalRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubProposalRevision" ADD CONSTRAINT "HubProposalRevision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "HubProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubProposalItem" ADD CONSTRAINT "HubProposalItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubProposalItem" ADD CONSTRAINT "HubProposalItem_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "HubProposalRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubPartnership" ADD CONSTRAINT "HubPartnership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubPartnership" ADD CONSTRAINT "HubPartnership_growthOrganizationId_fkey" FOREIGN KEY ("growthOrganizationId") REFERENCES "HubGrowthOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStrategicGrowthMutation" ADD CONSTRAINT "HubStrategicGrowthMutation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "EconomikWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
