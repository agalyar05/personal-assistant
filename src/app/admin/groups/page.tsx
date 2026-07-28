"use client";

import { useCallback, useEffect, useState } from "react";
import type { Course, CourseLink } from "@/lib/types";
import { classColorsForTheme } from "@/lib/themes";
import { useUiTheme } from "@/components/ThemePicker";

const MAX_LINKS = 5;

function emptyLinks(): CourseLink[] {
  return [];
}

function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

export default function GroupsPage() {
  const { theme } = useUiTheme();
  const [courses, setCourses] = useState<Course[]>([]);
  const [msg, setMsg] = useState("");
  const [editingLinksId, setEditingLinksId] = useState<string | null>(null);
  const [draftLinks, setDraftLinks] = useState<CourseLink[]>([]);
  const suggestions = classColorsForTheme(theme.id);
  const [form, setForm] = useState({
    name: "",
    code: "",
    color: suggestions[0]?.hex || "#0f766e",
    professor: "",
    schedule: "",
    links: emptyLinks() as CourseLink[],
  });

  const load = useCallback(async () => {
    const res = await fetch("/api/courses");
    const json = await res.json();
    setCourses(
      (json.courses || []).map((c: Course) => ({
        ...c,
        links: Array.isArray(c.links) ? c.links : [],
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const stillSuggested = suggestions.some((s) => s.hex === form.color);
    if (!stillSuggested && suggestions[0]) {
      setForm((f) => ({ ...f, color: suggestions[0]!.hex }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.id]);

  async function saveCourse(partial?: Partial<Course> & { id?: string }) {
    const payload = partial || {
      name: form.name,
      code: form.code,
      color: form.color,
      professor: form.professor,
      schedule: form.schedule,
      links: form.links.filter((l) => l.url.trim()),
    };
    if (!payload.name?.trim()) {
      setMsg("Name required");
      return;
    }
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setMsg("Save failed");
      return;
    }
    if (!partial) {
      setForm({
        name: "",
        code: "",
        color: suggestions[0]?.hex || "#0f766e",
        professor: "",
        schedule: "",
        links: emptyLinks(),
      });
      setMsg("Class added");
    } else {
      setMsg("Updated");
    }
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this class? Assignments will become unassigned.")) {
      return;
    }
    await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    await load();
  }

  function startEditLinks(c: Course) {
    setEditingLinksId(c.id);
    setDraftLinks(
      c.links.length
        ? c.links.map((l) => ({ ...l }))
        : [{ label: "", url: "" }],
    );
  }

  async function saveLinks(c: Course) {
    const links = draftLinks
      .map((l) => ({
        label: l.label.trim() || "Link",
        url: normalizeUrl(l.url),
      }))
      .filter((l) => l.url);
    await saveCourse({
      id: c.id,
      name: c.name,
      code: c.code,
      color: c.color,
      professor: c.professor,
      schedule: c.schedule,
      links,
    });
    setEditingLinksId(null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
        <h2 className="display text-2xl">Groups</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Classes and color chips used across Assignments. Add Canvas / syllabus
          links under each class. Palette suggestions follow your theme.
        </p>
        {msg && <p className="mt-3 text-sm text-[var(--accent)]">{msg}</p>}
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
        <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          Add class
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Class name"
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder="Code (e.g. Chem2)"
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <input
            placeholder="Professor(s)"
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            value={form.professor}
            onChange={(e) => setForm({ ...form, professor: e.target.value })}
          />
          <input
            placeholder="Schedule"
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            value={form.schedule}
            onChange={(e) => setForm({ ...form, schedule: e.target.value })}
          />
        </div>
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Links (optional)
          </p>
          <div className="mt-2 space-y-2">
            {form.links.map((link, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input
                  placeholder="Label (Canvas)"
                  className="w-28 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm sm:w-36"
                  value={link.label}
                  onChange={(e) => {
                    const links = [...form.links];
                    links[i] = { ...link, label: e.target.value };
                    setForm({ ...form, links });
                  }}
                />
                <input
                  placeholder="https://…"
                  className="min-w-[180px] flex-1 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  value={link.url}
                  onChange={(e) => {
                    const links = [...form.links];
                    links[i] = { ...link, url: e.target.value };
                    setForm({ ...form, links });
                  }}
                />
                <button
                  type="button"
                  className="text-sm text-red-700"
                  onClick={() =>
                    setForm({
                      ...form,
                      links: form.links.filter((_, j) => j !== i),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            {form.links.length < MAX_LINKS && (
              <button
                type="button"
                className="text-sm text-[var(--accent)]"
                onClick={() =>
                  setForm({
                    ...form,
                    links: [...form.links, { label: "", url: "" }],
                  })
                }
              >
                + Add link
              </button>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs uppercase tracking-wide text-[var(--muted)]">
          Suggested colors
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s.hex}
              type="button"
              title={s.label}
              onClick={() => setForm({ ...form, color: s.hex })}
              className={`h-9 w-9 rounded-full border-2 ${
                form.color === s.hex
                  ? "border-[var(--ink)] scale-110"
                  : "border-transparent"
              }`}
              style={{ background: s.hex }}
            />
          ))}
          <label className="flex h-9 items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 text-xs text-[var(--muted)]">
            Custom
            <input
              type="color"
              className="h-6 w-6 cursor-pointer border-0 bg-transparent"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void saveCourse()}
          className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white"
        >
          Add class
        </button>
      </section>

      <section className="space-y-3">
        {courses.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <span
                    className="h-4 w-4 shrink-0 rounded-full"
                    style={{ background: c.color }}
                  />
                  <div className="min-w-0">
                    <div className="font-medium">
                      {c.code ? `${c.code} — ${c.name}` : c.name}
                    </div>
                    <div className="text-sm text-[var(--muted)]">
                      {[c.professor, c.schedule].filter(Boolean).join(" · ") ||
                        "No details yet"}
                    </div>
                    {editingLinksId !== c.id && (c.links?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        {c.links.map((l, i) => (
                          <a
                            key={`${l.url}-${i}`}
                            href={normalizeUrl(l.url)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--accent)] hover:underline"
                          >
                            {l.label || "Link"}
                          </a>
                        ))}
                      </div>
                    )}
                    {editingLinksId !== c.id && (
                      <button
                        type="button"
                        className="mt-2 text-xs text-[var(--muted)] hover:text-[var(--accent)]"
                        onClick={() => startEditLinks(c)}
                      >
                        {(c.links?.length ?? 0) ? "Edit links" : "+ Add links"}
                      </button>
                    )}
                  </div>
                </div>
                {editingLinksId === c.id && (
                  <div className="mt-3 space-y-2 pl-7">
                    {draftLinks.map((link, i) => (
                      <div key={i} className="flex flex-wrap gap-2">
                        <input
                          placeholder="Label"
                          className="w-28 rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm"
                          value={link.label}
                          onChange={(e) => {
                            const next = [...draftLinks];
                            next[i] = { ...link, label: e.target.value };
                            setDraftLinks(next);
                          }}
                        />
                        <input
                          placeholder="https://…"
                          className="min-w-[160px] flex-1 rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm"
                          value={link.url}
                          onChange={(e) => {
                            const next = [...draftLinks];
                            next[i] = { ...link, url: e.target.value };
                            setDraftLinks(next);
                          }}
                        />
                        <button
                          type="button"
                          className="text-xs text-red-700"
                          onClick={() =>
                            setDraftLinks(draftLinks.filter((_, j) => j !== i))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      {draftLinks.length < MAX_LINKS && (
                        <button
                          type="button"
                          className="text-sm text-[var(--accent)]"
                          onClick={() =>
                            setDraftLinks([
                              ...draftLinks,
                              { label: "", url: "" },
                            ])
                          }
                        >
                          + Link
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded-lg bg-[var(--accent)] px-3 py-1 text-sm text-white"
                        onClick={() => void saveLinks(c)}
                      >
                        Save links
                      </button>
                      <button
                        type="button"
                        className="text-sm text-[var(--muted)]"
                        onClick={() => setEditingLinksId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex gap-1">
                  {suggestions.slice(0, 6).map((s) => (
                    <button
                      key={s.hex}
                      type="button"
                      className="h-6 w-6 rounded-full border border-white/50"
                      style={{ background: s.hex }}
                      title={s.label}
                      onClick={() =>
                        void saveCourse({
                          id: c.id,
                          name: c.name,
                          color: s.hex,
                        })
                      }
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="text-sm text-red-700"
                  onClick={() => void remove(c.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {!courses.length && (
          <p className="text-sm text-[var(--muted)]">No classes yet.</p>
        )}
      </section>
    </div>
  );
}
