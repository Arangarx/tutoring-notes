import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptOrgInviteAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrgInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Organization invitation</CardTitle>
          <CardDescription>Accept to join this organization with the invited role.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={acceptOrgInviteAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit">Accept invitation</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
