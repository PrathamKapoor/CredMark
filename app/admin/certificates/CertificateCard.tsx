"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Certificate } from "@/lib/types/database";
import {
  Link2,
  Download,
  Loader2,
  RefreshCw,
  Pencil,
  Mail,
  Ban,
  CheckCircle,
  Trash2,
  XCircle,
} from "lucide-react";

import {
  updateCertificateValidity,
  deleteCertificate,
  updateCertificateEmail,
} from "@/app/actions/certificates";
import { buildVerificationUrl } from "@/lib/utils/certificate-code";

interface CertificateCardProps {
  certificate: Certificate;
}

export default function CertificateCard({ certificate }: CertificateCardProps) {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    "revoke" | "delete" | "restore" | null
  >(null);

  const [pdfError, setPdfError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailBatchId,setEmailBatchId]=useState<string|null>(null);
  const emailRequestKey=useRef<string|null>(null);

  /* 🔹 Email edit state */
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editedEmail, setEditedEmail] = useState(certificate.email);
  const [emailEditError, setEmailEditError] = useState<string | null>(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const verificationUrl = buildVerificationUrl(certificate.certificate_code);

  /* =====================
       ACTION HANDLERS
       ===================== */

  const handleAction = async () => {
    setIsLoading(true);
    try {
      if (confirmAction === "delete") {
        await deleteCertificate(certificate.id);
      } else if (confirmAction === "revoke") {
        await updateCertificateValidity(certificate.id, false);
      } else if (confirmAction === "restore") {
        await updateCertificateValidity(certificate.id, true);
      }
    } finally {
      setIsLoading(false);
      setShowConfirm(false);
      setConfirmAction(null);
      router.refresh();
    }
  };

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    setPdfError(null);

    try {
      const res = await fetch(`/api/certificates/${certificate.id}/pdf`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({regenerate: !!(certificate.pdf_object_path || certificate.pdf_url)}),
      });

      const data = await res.json();
      if (!res.ok) {
        setPdfError(data.error || "Failed to generate PDF");
        return;
      }

      router.refresh();
    } catch {
      setPdfError("Failed to generate PDF");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSendEmail = async () => {
    setIsSendingEmail(true);
    setEmailError(null);
    setEmailSuccess(false);
    emailRequestKey.current ??= crypto.randomUUID();

    try {
      const res = await fetch(`/api/certificates/${certificate.id}/email`, {
        method: "POST",
        headers: {"Content-Type":"application/json", "Idempotency-Key": emailRequestKey.current!},
        body: JSON.stringify({resend: certificate.email_sent}),
      });

      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error || "Failed to queue email");
        return;
      }

      setEmailSuccess(true);
      setEmailBatchId(data.batchId);
      emailRequestKey.current=null;
      router.refresh();
    } catch {
      setEmailError("Failed to queue email");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSaveEmail = async () => {
    setIsSavingEmail(true);
    setEmailEditError(null);

    try {
      const result = await updateCertificateEmail(certificate.id, editedEmail);

      if (!result.success) {
        setEmailEditError(result.error || "Failed to update email");
        return;
      }

      setIsEditingEmail(false);
      router.refresh();
    } finally {
      setIsSavingEmail(false);
    }
  };

  const openConfirm = (action: "revoke" | "delete" | "restore") => {
    setConfirmAction(action);
    setShowConfirm(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  /* =====================
       RENDER
       ===================== */

  return (
    <>
      <div
        className={`certificate-card ${!certificate.is_valid ? "revoked" : ""}`}
      >
        <div className="certificate-card-header">
          <div>
            <div className="certificate-name">{certificate.name}</div>
          </div>
          <span
            className={`badge ${certificate.is_valid ? "badge-success" : "badge-danger"
              }`}
          >
            {certificate.is_valid ? "Valid" : "Revoked"}
          </span>
        </div>

        <div
          className="certificate-code"
          style={{ cursor: "pointer" }}
          onClick={() => copyToClipboard(certificate.certificate_code)}
          title="Click to copy"
        >
          {certificate.certificate_code}
        </div>

        <div className="certificate-details">
          {/* 🔹 EMAIL ROW (EDITABLE) */}
          <div className="certificate-detail">
            <span className="certificate-detail-label">Email</span>
            <span
              className="certificate-detail-value"
              style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, maxWidth: "75%" }}
            >
              {isEditingEmail ? (
                <>
                  <input
                    type="email"
                    value={editedEmail}
                    onChange={(e) => setEditedEmail(e.target.value)}
                    className="input"
                    style={{ maxWidth: 220 }}
                  />
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleSaveEmail}
                    disabled={isSavingEmail}
                    title="Save"
                    aria-label="Save email"
                  >
                    {isSavingEmail ? (
                      <Loader2 size={16} className="spinner-icon" />
                    ) : (
                      <CheckCircle size={16} />
                    )}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setIsEditingEmail(false);
                      setEditedEmail(certificate.email);
                      setEmailEditError(null);
                    }}
                    title="Cancel"
                    aria-label="Cancel email edit"
                  >
                    <XCircle size={16} />
                  </button>
                </>
              ) : (
                <>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textAlign: "right",
                    }}
                    title={certificate.email}
                  >
                    {certificate.email}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ flexShrink: 0, padding: "4px" }}
                    onClick={() => setIsEditingEmail(true)}
                    title="Edit email"
                  >
                    <Pencil size={16} />
                  </button>
                </>
              )}
            </span>
          </div>

          <div className="certificate-detail">
            <span className="certificate-detail-label">Event</span>
            <span className="certificate-detail-value">
              {certificate.event_name}
            </span>
          </div>

          <div className="certificate-detail">
            <span className="certificate-detail-label">Issue Date</span>
            <span className="certificate-detail-value">
              {new Date(certificate.date_of_issue).toISOString().split("T")[0]}
            </span>
          </div>

          <div className="certificate-detail">
            <span className="certificate-detail-label">PDF Status</span>
            <span
              className="certificate-detail-value"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {(certificate.pdf_object_path || certificate.pdf_url) ? (
                <>
                  <CheckCircle size={14} />
                  <span>Generated</span>
                </>
              ) : (
                <>
                  <XCircle size={14} />
                  <span>Not generated</span>
                </>
              )}
            </span>
          </div>

          <div className="certificate-detail">
            <span className="certificate-detail-label">Email Sent</span>
            <span
              className="certificate-detail-value"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {certificate.email_sent ? (
                <>
                  <CheckCircle size={14} />
                  <span>Yes</span>
                </>
              ) : (
                <>
                  <XCircle size={14} />
                  <span>No</span>
                </>
              )}
            </span>
          </div>
        </div>

        {emailEditError && (
          <div
            style={{
              color: "var(--accent-danger)",
              fontSize: "0.8rem",
              textAlign: "center",
            }}
          >
            {emailEditError}
          </div>
        )}

        {pdfError && <div className="error-text">{pdfError}</div>}
        {emailError && <div className="error-text">{emailError}</div>}
        {emailSuccess && (
          <div
            className="success-text"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <CheckCircle size={14} />
            <span>Email queued. <a href={`/admin/circulation?batch=${emailBatchId}`}>View progress</a></span>
          </div>
        )}

        <div className="certificate-actions">
          <a
            href={verificationUrl}
            target="_blank"
            className="btn btn-secondary btn-sm"
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Link2 size={16} />
              <span>Verify</span>
            </span>
          </a>

          {(certificate.pdf_object_path || certificate.pdf_url) ? (
            <>
              <a
                href={`/api/verify/${certificate.certificate_code}/pdf`}
                target="_blank"
                className="btn btn-secondary btn-sm"
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Download size={16} />
                  <span>PDF</span>
                </span>
              </a>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleGeneratePdf}
                disabled={isGeneratingPdf || !certificate.is_valid}
                title={isGeneratingPdf ? "Generating PDF..." : "Check or rebuild PDF from its frozen template settings"}
              >
                {isGeneratingPdf ? (
                  <Loader2 size={16} className="spinner-icon" />
                ) : (
                  <RefreshCw size={16} />
                )}
              </button>
              {certificate.is_valid && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleSendEmail}
                  disabled={isSendingEmail || !!emailBatchId}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {isSendingEmail ? (
                      <Loader2 size={16} className="spinner-icon" />
                    ) : (
                      <Mail size={16} />
                    )}
                    <span>{certificate.email_sent ? "Resend" : "Send"}</span>
                  </span>
                </button>
              )}
            </>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleGeneratePdf}
              disabled={isGeneratingPdf || !certificate.template_id || !certificate.is_valid}
            >
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {isGeneratingPdf ? (
                  <Loader2 size={16} className="spinner-icon" />
                ) : (
                  <Download size={16} />
                )}
                <span>{isGeneratingPdf ? "Generating…" : "Generate PDF"}</span>
              </span>
            </button>
          )}

          {certificate.is_valid ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => openConfirm("revoke")}
              title="Revoke Certificate"
            >
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Ban size={16} />
                <span>Revoke</span>
              </span>
            </button>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => openConfirm("restore")}
            >
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <CheckCircle size={16} />
                <span>Restore</span>
              </span>
            </button>
          )}

          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--accent-danger)" }}
            onClick={() => openConfirm("delete")}
            title="Delete Certificate"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* CONFIRM DIALOG */}
      {showConfirm && (
        <div className="success-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title" style={{ marginTop: 0, textAlign: "center", fontSize: "1.75rem" }}>Are you sure?</p>
            <div className="confirm-actions" style={{ justifyContent: "center" }}>
              <button
                className="btn btn-ghost"
                style={{ border: "1px solid var(--accent-primary)" }}
                onClick={handleAction}
                disabled={isLoading}
              >
                Confirm
              </button>
              <button
                className="btn btn-danger"
                onClick={() => setShowConfirm(false)}
                disabled={isLoading}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
