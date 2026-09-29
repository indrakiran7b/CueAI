import { redirect } from "next/navigation";

/** Dedicated Resume Tailor login entry — preserves return URL. */
export default function ResumeTailorLoginPage() {
  redirect("/login?next=%2Fresume-tailor");
}
