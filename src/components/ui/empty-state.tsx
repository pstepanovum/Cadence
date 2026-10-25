// FILE: src/components/ui/empty-state.tsx
//
// What a screen with nothing to show says instead: what is missing and the
// next step, as one button.
import Image from "next/image";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  children,
  action,
  illustration = "/illustration/figuring-it-out-1.svg",
}: {
  title: string;
  children?: ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  illustration?: string;
}) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-[20px] bg-white px-6 py-10 text-center">
      <Image src={illustration} alt="" width={200} height={150} className="h-auto w-40" />
      <h2 className="font-kicker text-2xl text-carbon-black">{title}</h2>
      {children ? <div className="max-w-md text-sm leading-7 text-iron-grey">{children}</div> : null}
      {action ? (
        <Button href={action.href} onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </section>
  );
}
