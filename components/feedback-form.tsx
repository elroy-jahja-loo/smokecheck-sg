"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n/i18n-provider";

const ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function FeedbackForm() {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState<number>();
  const [ratingComment, setRatingComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const messageInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const openFeedback = () => {
      setStatus("idle");
      setIsOpen(true);
    };
    window.addEventListener("smokecheck:open-feedback", openFeedback);
    if (window.location.hash === "#feedback") openFeedback();
    return () => window.removeEventListener("smokecheck:open-feedback", openFeedback);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    messageInput.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

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
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("feedback.submitError"));
      setStatus("error");
    }
  }

  return <>
    <section className="feedback-entry" id="feedback" aria-labelledby="feedback-entry-title">
      <div>
        <p className="eyebrow">{t("feedback.eyebrow")}</p>
        <h2 id="feedback-entry-title">{t("feedback.title")}</h2>
        <p>{t("feedback.description")}</p>
      </div>
      <button type="button" className="live-primary-button" onClick={() => { setStatus("idle"); setIsOpen(true); }}>{t("nav.feedback")}</button>
    </section>
    {isOpen ? createPortal(
      <div className="feedback-modal" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsOpen(false); }}>
        <section className="feedback-modal__panel" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
          <div className="feedback-modal__heading">
            <div>
              <p className="eyebrow">{t("feedback.eyebrow")}</p>
              <h2 id="feedback-title">{t("feedback.title")}</h2>
            </div>
            <button type="button" className="feedback-modal__close" onClick={() => setIsOpen(false)} aria-label={t("feedback.close")}>x</button>
          </div>
          <form onSubmit={submit} className="feedback-form">
            <label htmlFor="feedback-message">
              <span>{t("feedback.messageLabel")}</span>
              <textarea ref={messageInput} id="feedback-message" name="feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={2000} required disabled={status === "sending"} />
            </label>
            <fieldset disabled={status === "sending"}>
              <legend>{t("feedback.ratingLabel")}</legend>
              <div className="feedback-form__ratings">
                {ratings.map((value) => (
                  <label key={value} className="feedback-form__rating">
                    <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} required />
                    <span>{value}</span>
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
      </div>,
      document.body,
    ) : null}
  </>;
}
