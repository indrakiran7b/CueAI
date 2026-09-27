import { redirect } from "next/navigation";

/** Legacy path — Resume Tailor lives at /resume-tailor. */
export default function ResumeLegacyRedirectPage() {
  redirect("/resume-tailor");
}
