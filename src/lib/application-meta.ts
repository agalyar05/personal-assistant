import type { ApplicationKind, ApplicationStatus } from "./types";

export const APPLICATION_KINDS: ApplicationKind[] = [
  "scholarship",
  "job",
  "internship",
  "program",
  "grant",
  "other",
];

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "idea",
  "researching",
  "in_progress",
  "submitted",
  "interview",
  "accepted",
  "rejected",
  "withdrawn",
];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  idea: "Idea",
  researching: "Researching",
  in_progress: "In progress",
  submitted: "Submitted",
  interview: "Interview",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};
