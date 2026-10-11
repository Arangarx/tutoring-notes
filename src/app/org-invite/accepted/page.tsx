import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrgInviteSessionRefresh } from "../OrgInviteSessionRefresh";

export const dynamic = "force-dynamic";

export default async function OrgInviteAcceptedPage({
  searchParams,
}: {
  searchParams: Promise<{ refresh?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Invitation accepted</CardTitle>
          <CardDescription>You have joined the organization.</CardDescription>
        </CardHeader>
      </Card>
      <OrgInviteSessionRefresh refresh={params.refresh === "1"} />
    </main>
  );
}
