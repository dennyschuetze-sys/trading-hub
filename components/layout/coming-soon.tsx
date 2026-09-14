import { Hammer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { navItems } from "@/lib/navigation";
import { PageHeader } from "./page-header";

export function ComingSoon({ href, features }: { href: string; features: string[] }) {
  const item = navItems.find((i) => i.href === href)!;
  const Icon = item.icon;

  return (
    <>
      <PageHeader title={item.label}>
        <Badge variant="secondary">Phase {item.phase}</Badge>
      </PageHeader>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            <Icon className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="flex items-center justify-center gap-2 font-medium">
              <Hammer className="size-4" /> Wird in Phase {item.phase} gebaut
            </p>
            <p className="text-sm text-muted-foreground">Das kommt hier hin:</p>
          </div>
          <ul className="grid max-w-md gap-1 text-left text-sm text-muted-foreground">
            {features.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
