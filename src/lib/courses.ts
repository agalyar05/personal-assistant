import type { Course } from "./types";

/** Reserved class/group for scholarship & job deadlines on Masterlist. */
export const APPLICATIONS_GROUP_CODE = "APPS";

export function isApplicationsGroup(c: Pick<Course, "code" | "name">): boolean {
  return (
    c.code === APPLICATIONS_GROUP_CODE ||
    c.name.trim().toLowerCase() === "applications"
  );
}

export const DEFAULT_APPLICATIONS_GROUP: Omit<
  Course,
  "id" | "createdAt"
> = {
  name: "Applications",
  code: APPLICATIONS_GROUP_CODE,
  color: "#a16207",
  professor: "",
  schedule: "",
  links: [],
  sortOrder: 0,
};
