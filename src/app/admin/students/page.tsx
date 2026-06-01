import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { StudentsRoster } from "@/components/admin/StudentsRoster";
import { Button } from "@/components/ui/button";
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
      description="Your roster — add students, open profiles, and start whiteboard sessions."
      actions={
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/admin/outbox">View outbox</Link>
        </Button>
      }
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
