import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
    </div>
  );
}
