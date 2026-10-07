import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function OrgInviteUnavailablePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Invitation unavailable</CardTitle>
          <CardDescription>This invitation can&apos;t be accepted.</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
