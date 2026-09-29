import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

export default function BillingCancelledPage() {
  return (
    <div className="mx-auto max-w-5xl py-4">
      <Card className="mx-auto max-w-lg space-y-4 p-6">
        <CardTitle>Checkout cancelled</CardTitle>
        <p className="text-sm text-muted">
          Checkout cancelled. No charge was made and your plan was not changed.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" href="/settings#billing">
            Back to billing
          </Button>
          <Button variant="secondary" href="/dashboard">
            Dashboard
          </Button>
        </div>
        <p className="text-xs text-muted">
          Need help?{" "}
          <Link href="/settings#billing" className="text-[var(--accent)] underline-offset-2 hover:underline">
            Open billing settings
          </Link>
        </p>
      </Card>
    </div>
  );
}
