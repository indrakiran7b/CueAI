export const runtime = "nodejs";
export const maxDuration = 90;

export { POST } from "@cueai/resume-service/routes/analyze";
export type {
  ResumeRewrite,
  ResumeAnalysis,
  ResumeAnalysisResult,
  ResumeTailorResult,
  TailoredResult,
} from "@cueai/resume-service/routes/analyze";
