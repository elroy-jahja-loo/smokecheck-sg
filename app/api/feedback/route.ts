import { getPostgisPool, hasPostgisConfig } from "@/lib/db/postgis";
import { badRequest, enforceRateLimit, jsonResponse } from "@/lib/http";
import { observeApiRequest } from "@/lib/observability/logging";
import { appendCorsHeaders, preflightResponse, requireJsonRequest } from "@/lib/security";
import { parseFeedbackSubmission } from "@/lib/validation";

export const dynamic = "force-dynamic";

const corsOptions = { methods: ["POST", "OPTIONS"] };
const feedbackRecipient = "ejahjaloo@gmail.com";

type FeedbackRecord = {
  id: string;
  feedback: string;
  rating: number;
  rating_comment: string;
  email_sent_at: string | null;
  created_at: string;
};

export function OPTIONS(request: Request) {
  return preflightResponse(request, corsOptions);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const jsonError = requireJsonRequest(request);
  if (jsonError) return appendCorsHeaders(jsonError, request, corsOptions);

  const limited = await enforceRateLimit(request, "feedback", 5, 3600);
  if (limited) return appendCorsHeaders(limited, request, corsOptions);

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 160) {
    return appendCorsHeaders(badRequest("Feedback submissions require a valid Idempotency-Key header."), request, corsOptions);
  }

  const submission = parseFeedbackSubmission(await request.json().catch(() => undefined));
  if (!submission) return appendCorsHeaders(badRequest("Provide feedback and a rating from 1 to 5."), request, corsOptions);
  if (!hasPostgisConfig()) {
    return appendCorsHeaders(jsonResponse({ error: "unavailable", message: "Feedback is temporarily unavailable." }, { status: 503 }), request, corsOptions);
  }

  let record: FeedbackRecord;
  try {
    const result = await getPostgisPool().query<FeedbackRecord>(
      `insert into public.feedback_submissions (idempotency_key, feedback, rating, rating_comment)
       values ($1, $2, $3, $4)
       on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
       returning id, feedback, rating, rating_comment, email_sent_at, created_at`,
      [idempotencyKey, submission.feedback, submission.rating, submission.ratingComment],
    );
    record = result.rows[0];
  } catch {
    observeApiRequest("/api/feedback", startedAt, { failed: true, stage: "store" });
    return appendCorsHeaders(jsonResponse({ error: "storage_failed", message: "Could not save your feedback. Please try again." }, { status: 500 }), request, corsOptions);
  }

  if (!record.email_sent_at) {
    try {
      await sendFeedbackEmail(record);
      await getPostgisPool().query("update public.feedback_submissions set email_sent_at = now() where id = $1", [record.id]);
    } catch {
      observeApiRequest("/api/feedback", startedAt, { failed: true, stage: "email" });
      return appendCorsHeaders(jsonResponse({ error: "notification_failed", message: "Your feedback was saved, but we could not send its notification. Please try again shortly." }, { status: 502 }), request, corsOptions);
    }
  }

  observeApiRequest("/api/feedback", startedAt, { submitted: true });
  return appendCorsHeaders(jsonResponse({ submitted: true }, { status: 201 }), request, corsOptions);
}

async function sendFeedbackEmail(record: FeedbackRecord) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "SmokeCheck SG <onboarding@resend.dev>",
      to: [feedbackRecipient],
      subject: `SmokeCheck feedback: ${record.rating}/5`,
      text: `New SmokeCheck feedback\n\nRating: ${record.rating}/5\n\nFeedback:\n${record.feedback}\n\nComment on rating:\n${record.rating_comment || "(none)"}\n\nSubmitted: ${record.created_at}`,
    }),
  });
  if (!response.ok) throw new Error("Resend rejected the feedback notification");
}
