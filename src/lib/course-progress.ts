import type { Assignment, Course } from "./types";

type ProgressAssignment = Pick<Assignment, "courseId" | "status">;

export type CourseProgress<A extends ProgressAssignment = Assignment> = {
  course: Course;
  mine: A[];
  done: number;
  remaining: number;
  total: number;
  pct: number;
};

/** Per-course completion, excluding n/a assignments from the denominator. */
export function computeCourseProgress<A extends ProgressAssignment>(
  courses: Course[],
  assignments: A[],
): CourseProgress<A>[] {
  return courses.map((course) => {
    const mine = assignments.filter((a) => a.courseId === course.id);
    const countable = mine.filter((a) => a.status !== "n_a");
    const done = countable.filter(
      (a) => a.status === "complete" || a.status === "submitted",
    ).length;
    const total = countable.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { course, mine, done, remaining: total - done, total, pct };
  });
}
