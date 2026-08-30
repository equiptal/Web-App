import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { ProjectForm, emptyProjectForm, type ProjectFormValue } from "@/components/projects/ProjectForm";

/**
 * Typing must not lose focus (reported 2026-08-30).
 *
 * One letter went in and the caret left the field, so every character needed a fresh click. That is
 * always the same fault underneath: the input's DOM node is being REPLACED between renders rather
 * than updated, and React cannot keep focus on a node it just threw away.
 *
 * The test drives the form the way the dialog does — a parent holding the value in state — and types
 * three characters without touching the field in between.
 */

vi.mock("next/dynamic", () => ({ default: () => () => null })); // the map needs Google; not the subject

function Harness() {
  const [value, setValue] = useState<ProjectFormValue>(emptyProjectForm());
  return (
    <LocaleProvider>
      <ProjectForm value={value} onChange={setValue} onCancel={() => {}} onSave={() => {}} />
    </LocaleProvider>
  );
}

describe("typing in the form", () => {
  it("keeps focus in the title across several characters", () => {
    cleanup();
    render(<Harness />);

    const title = screen.getByLabelText(/name for this project/i) as HTMLInputElement;
    title.focus();
    expect(document.activeElement).toBe(title);

    for (const [i, ch] of [..."Qid"].entries()) {
      fireEvent.change(title, { target: { value: "Qid".slice(0, i + 1) } });
      void ch;
      // Re-query: if the node was replaced, this is a DIFFERENT element and the old one is detached.
      const now = screen.getByLabelText(/name for this project/i);
      expect(document.activeElement, `focus lost after ${i + 1} character(s)`).toBe(now);
    }

    expect((screen.getByLabelText(/name for this project/i) as HTMLInputElement).value).toBe("Qid");
  });

  it("keeps focus in the address too", () => {
    cleanup();
    render(<Harness />);

    const address = screen.getByLabelText(/^address$/i) as HTMLInputElement;
    address.focus();
    fireEvent.change(address, { target: { value: "Q" } });
    fireEvent.change(address, { target: { value: "Qi" } });

    expect(document.activeElement).toBe(screen.getByLabelText(/^address$/i));
  });
});
