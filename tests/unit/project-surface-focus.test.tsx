import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
// The dictionary, not the copy: a label rename is a product decision, not a broken test.
import { en } from "@/lib/i18n/en";

/**
 * Typing in the dialog on the DASHBOARD (reported 2026-08-30).
 *
 * The form keeps focus in isolation, so whatever replaces the input lives in the surface around it.
 * This drives the real path: the empty-state block, its *New project* button, and the dialog that
 * opens from it.
 */

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/session", () => ({ useSession: () => ({ user: { id: 46, name: "Ahmed" } }) }));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/api/client");
  return {
    ...actual,
    listProjects: vi.fn(async () => []),
    fetchAllMyRequests: vi.fn(async () => ({ requests: [] })),
    fetchTaxonomy: vi.fn(async () => []),
    fetchChart: vi.fn(async () => ({ project: null, version: 1, groups: [] })),
  };
});

import { ProjectsSurface } from "@/components/projects/ProjectsSurface";

beforeEach(() => cleanup());

describe("the dialog on the dashboard", () => {
  it("keeps focus in the title across several characters", async () => {
    render(
      <LocaleProvider>
        <ProjectsSurface embedded />
      </LocaleProvider>,
    );

    // The empty block appears once the (stubbed) list answers.
    const open = await screen.findByRole("button", { name: /new project/i });
    fireEvent.click(open);

    const field = () => screen.getByLabelText(en.projects.form.title, { exact: false }) as HTMLInputElement;
    field().focus();

    for (let i = 1; i <= 3; i++) {
      fireEvent.change(field(), { target: { value: "Qid".slice(0, i) } });
      await waitFor(() => expect(field().value).toBe("Qid".slice(0, i)));
      // A replaced node cannot hold focus. This is the assertion the bug fails.
      expect(document.activeElement, `focus lost after ${i} character(s)`).toBe(field());
    }
  });
});
