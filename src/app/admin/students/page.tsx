import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { StudentsRoster } from "@/components/admin/StudentsRoster";
import { getStudentScope, studentsWhereForScope } from "@/lib/student-scope";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const students = await db.student.findMany({
    where: studentsWhereForScope(scope),
    orderBy: { createdAt: "desc" },
  });

  return (
    <AdminPageShell
      title="Students"
      eyebrow={
        <p className="label-mono m-0 text-accent-text">Your roster</p>
      }
      description="Add students, open profiles, and start whiteboard sessions."
    >
      <StudentsRoster
        students={students.map((s) => ({
          id: s.id,
          name: s.name,
          createdAt: s.createdAt.toISOString(),
        }))}
      />
    </AdminPageShell>
  );
}
