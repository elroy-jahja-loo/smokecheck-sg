"use client";

import { useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n/i18n-provider";

const ratings = [1, 2, 3, 4, 5] as const;

export function FeedbackForm() {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState<number>();
  const [ratingComment, setRatingComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) return;
    setStatus("sending");
    setErrorMessage("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({ feedback, rating, ratingComment }),
      });
      const payload = await response.json().catch(() => undefined) as { message?: string } | undefined;
      if (!response.ok) throw new Error(payload?.message ?? t("feedback.submitError"));
      setFeedback("");
      setRating(undefined);
      setRatingComment("");
      idempotencyKey.current = crypto.randomUUID();
      setStatus("success");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("feedback.submitError"));
      setStatus("error");
    }
  }

  return (
    <section className="feedback-form" id="feedback" aria-labelledby="feedback-title">
      <div className="feedback-form__intro">
        <p className="eyebrow">{t("feedback.eyebrow")}</p>
        <h2 id="feedback-title">{t("feedback.title")}</h2>
        <p>{t("feedback.description")}</p>
      </div>
      <form onSubmit={submit} className="feedback-form__fields">
        <label htmlFor="feedback-message">
          <span>{t("feedback.messageLabel")}</span>
          <textarea id="feedback-message" name="feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={2000} required disabled={status === "sending"} />
        </label>
        <fieldset disabled={status === "sending"}>
          <legend>{t("feedback.ratingLabel")}</legend>
          <div className="feedback-form__ratings">
            {ratings.map((value) => (
              <label key={value} className="feedback-form__rating">
                <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} required />
                <span aria-hidden="true">{value}</span>
                <span className="sr-only">{t("feedback.ratingOption").replace("{rating}", String(value))}</span>
              </label>
            ))}
          </div>
          <p className="feedback-form__rating-scale"><span>{t("feedback.ratingLow")}</span><span>{t("feedback.ratingHigh")}</span></p>
        </fieldset>
        <label htmlFor="feedback-rating-comment">
          <span>{t("feedback.ratingCommentLabel")} <em>{t("feedback.optional")}</em></span>
          <textarea id="feedback-rating-comment" name="ratingComment" value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} maxLength={2000} disabled={status === "sending"} />
        </label>
        <div className="feedback-form__submit">
          <button type="submit" className="live-primary-button" disabled={status === "sending"}>{status === "sending" ? t("feedback.submitting") : t("feedback.submit")}</button>
          {status === "success" ? <p role="status" className="feedback-form__success">{t("feedback.success")}</p> : null}
          {status === "error" ? <p role="alert" className="feedback-form__error">{errorMessage}</p> : null}
        </div>
      </form>
    </section>
  );
}
