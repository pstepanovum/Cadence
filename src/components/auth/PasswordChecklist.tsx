// FILE: src/components/auth/PasswordChecklist.tsx
import { checkPassword } from "@/components/auth/password-rules";
import { cn } from "@/lib/utils";

export function PasswordChecklist({ id, password, email }: { id: string; password: string; email?: string }) {
  const rules = checkPassword(password, email);
  return (
    <ul id={id} className="grid gap-1 pt-2 text-xs sm:grid-cols-2" aria-label="Password rules">
      {rules.map((rule) => (
        <li key={rule.id} className={cn("flex items-center gap-1.5", rule.met ? "text-sage-text" : "text-slate-grey")}>
          <span aria-hidden="true">{rule.met ? "✓" : "•"}</span>
          <span>
            {rule.label}
            <span className="sr-only">{rule.met ? ", met" : ", not met yet"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
