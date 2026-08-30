import type { Metadata } from "next";
import { ProjectsSurface } from "@/components/projects/ProjectsSurface";

export const metadata: Metadata = { title: "Projects" };

/**
 * `/projects` — the renter's sites.
 *
 * A thin server shell, as every other page here is: the surface below it is a client component
 * because everything on it is stateful (the form, the picker, the chart) and none of it can be
 * rendered ahead of knowing who is asking.
 */
export default function ProjectsPage() {
  return <ProjectsSurface />;
}
