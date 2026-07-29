import type {
  Application,
  ApplicationStatus,
  Assignment,
  AssignmentStatus,
} from "./types";

export const APP_SHEET_PREFIX = "app:";

export function isAppSheetId(id: string): boolean {
  return id.startsWith(APP_SHEET_PREFIX);
}

export function appIdFromSheetId(id: string): string {
  return id.slice(APP_SHEET_PREFIX.length);
}

export function appStatusToAssignment(
  status: ApplicationStatus,
): AssignmentStatus {
  switch (status) {
    case "idea":
    case "researching":
      return "not_started";
    case "in_progress":
      return "in_progress";
    case "submitted":
    case "interview":
      return "submitted";
    case "accepted":
      return "complete";
    case "rejected":
    case "withdrawn":
      return "n_a";
    default:
      return "not_started";
  }
}

export function assignmentStatusToApp(
  status: AssignmentStatus,
  prev: ApplicationStatus,
): ApplicationStatus {
  switch (status) {
    case "not_started":
      return prev === "researching" ? "researching" : "idea";
    case "in_progress":
      return "in_progress";
    case "submitted":
      return prev === "interview" ? "interview" : "submitted";
    case "complete":
      return "accepted";
    case "n_a":
      return prev === "rejected" ? "rejected" : "withdrawn";
    default:
      return prev;
  }
}

/** Map an application into a sheet/kanban row. */
export function applicationToSheetRow(
  app: Application,
  applicationsCourseId: string | null,
): Assignment {
  return {
    id: `${APP_SHEET_PREFIX}${app.id}`,
    courseId: applicationsCourseId,
    title: app.title,
    status: appStatusToAssignment(app.status),
    dueAt: app.deadline,
    assignmentType: app.kind,
    difficulty: "medium",
    pointsEarned: null,
    pointsPossible: null,
    notes: [app.description, app.notes].filter(Boolean).join("\n\n"),
    link: app.url,
    sortOrder: 50_000 + (app.sortOrder || 0),
    dueReminderSentFor: null,
    createdAt: app.createdAt,
  };
}
