import { z } from "zod";

const coordinateSchema = z.object({
  lat: z.number().finite().min(1.1).max(1.5),
  lng: z.number().finite().min(103.5).max(104.1),
  gpsAccuracyM: z.number().finite().min(0).max(10000).optional(),
  selectedAddress: z.string().max(180).optional(),
});

const reportDraftSchema = z.object({
  coordinates: coordinateSchema,
  nearestAddress: z.string().min(1).max(220),
  boundaryStatus: z.string().min(1).max(220),
  occurredAt: z.string().min(1).max(80),
  incidentType: z.enum([
    "Smoking in prohibited area",
    "Littering near smoking area",
    "Other",
  ]),
  observationSubject: z
    .string()
    .max(100)
    .optional(),
  notes: z.string().max(1000).optional(),
});

const ragQuerySchema = z.object({
  question: z.string().min(1).max(500),
});

const feedbackSubmissionSchema = z.object({
  feedback: z.string().trim().min(1).max(2000),
  rating: z.number().int().min(1).max(5),
  ratingComment: z.string().trim().max(2000).optional().default(""),
});

function formatZodError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

function validateCoordinatePayload(value: unknown) {
  const result = coordinateSchema.safeParse(value);
  if (!result.success) return { error: formatZodError(result.error) };
  return { data: result.data };
}

function validateReportDraft(value: unknown) {
  const result = reportDraftSchema.safeParse(value);
  if (!result.success) return { error: formatZodError(result.error) };
  return { data: result.data };
}

function validateRagPayload(value: unknown) {
  const result = ragQuerySchema.safeParse(value);
  if (!result.success) return { error: formatZodError(result.error) };
  return { data: result.data };
}

function sanitizeNotes(value: string): string {
  return value.replace(/[<>]/g, "").trim().slice(0, 1000);
}

function sanitizeFeedback(value: string): string {
  return value.replace(/[<>]/g, "").trim().slice(0, 2000);
}

export function parseCoordinatePayload(value: unknown) {
  const result = validateCoordinatePayload(value);
  if ("error" in result) return undefined;
  return result.data;
}

type ObservationSubject = "Unknown person observed" | "Premises condition" | "Patrol observation";

function isObservationSubject(value: string): value is ObservationSubject {
  return value === "Unknown person observed" || value === "Premises condition" || value === "Patrol observation";
}

export function parseReportDraft(value: unknown, idempotencyKey: string) {
  const result = validateReportDraft(value);
  if ("error" in result) return undefined;
  const rawSubject = result.data.observationSubject ?? "";
  const observationSubject: ObservationSubject = isObservationSubject(rawSubject)
    ? rawSubject
    : "Unknown person observed";
  return {
    idempotencyKey,
    coordinates: result.data.coordinates,
    nearestAddress: result.data.nearestAddress,
    boundaryStatus: result.data.boundaryStatus,
    occurredAt: result.data.occurredAt,
    officerDisplay: "Authenticated officer" as const,
    incidentType: result.data.incidentType,
    observationSubject,
    notes: sanitizeNotes(result.data.notes ?? ""),
    attachmentPlaceholder: true as const,
    isPrototype: true as const,
  };
}

export function parseRagPayload(value: unknown) {
  const result = validateRagPayload(value);
  if ("error" in result) return undefined;
  return { question: result.data.question };
}

export function parseFeedbackSubmission(value: unknown) {
  const result = feedbackSubmissionSchema.safeParse(value);
  if (!result.success) return undefined;
  const feedback = sanitizeFeedback(result.data.feedback);
  if (!feedback) return undefined;
  return {
    feedback,
    rating: result.data.rating,
    ratingComment: sanitizeFeedback(result.data.ratingComment),
  };
}
