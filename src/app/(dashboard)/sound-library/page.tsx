// FILE: src/app/(dashboard)/sound-library/page.tsx
// The sounds library moved to /sounds.
import { redirect } from "next/navigation";

export default function SoundLibraryPage() {
  redirect("/sounds");
}
