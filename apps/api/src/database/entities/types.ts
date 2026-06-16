export enum DocumentVisibility {
  Public = "public",
  Team = "team",
  Restricted = "restricted"
}

export enum ApprovalStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected"
}

export enum ToolCallStatus {
  Allowed = "allowed",
  NeedsApproval = "needs_approval",
  Blocked = "blocked",
  Failed = "failed"
}
