import { OrganizationList, OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { DashboardNav } from "@/components/dashboard/nav";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { getActiveTenant } from "@/lib/tenant";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await getActiveTenant();

  // No active workspace yet — gate every dashboard route behind picking one.
  if (!tenant) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Create your workspace</h1>
          <p className="mt-2 text-muted-foreground">
            A workspace is your business. Create one to start training your AI assistant.
          </p>
        </div>
        <OrganizationList
          hidePersonal
          afterCreateOrganizationUrl="/dashboard"
          afterSelectOrganizationUrl="/dashboard"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <span className="font-semibold">Rabnix AI</span>
        </div>
        <DashboardNav />
        <div className="mt-auto border-t p-3">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
            appearance={{ elements: { rootBox: "w-full", organizationSwitcherTrigger: "w-full justify-start" } }}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="md:hidden">
            <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/dashboard" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserButton />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
