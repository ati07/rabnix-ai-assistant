import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
    </div>
  );
}
