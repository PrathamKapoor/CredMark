"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Rocket, CheckCircle } from "lucide-react";
import { generateBulkPdfs, type BulkPdfResult } from "@/app/actions/pdf";
import type { Certificate } from "@/lib/types/database";

interface BulkPdfGeneratorProps {
  certificates: Certificate[];
}

export default function BulkPdfGenerator({
  certificates,
}: BulkPdfGeneratorProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [result, setResult] = useState<BulkPdfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerateExisting, setRegenerateExisting] = useState(false);

  // Count certificates without PDFs
  const certificatesWithoutPdf = certificates.filter(
    (c) => !c.pdf_url && c.template_id
  );
  const certificatesWithPdf = certificates.filter((c) => c.pdf_url);
  const certificatesWithoutTemplate = certificates.filter(
    (c) => !c.template_id
  );

  const handleBulkGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      // Determine which certificates to process
      const idsToProcess = regenerateExisting
        ? certificates.filter((c) => c.template_id).map((c) => c.id)
        : certificatesWithoutPdf.map((c) => c.id);

      if (idsToProcess.length === 0) {
        setError("No certificates to process");
        setIsGenerating(false);
        return;
      }

      const response = await generateBulkPdfs(
        idsToProcess,
        !regenerateExisting
      );

      if (response.success && response.result) {
        setResult(response.result);
        router.refresh();
      } else {
        setError(response.error || "Failed to generate PDFs");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsGenerating(false);
    }
  };

  const openModal = () => {
    setShowModal(true);
    setResult(null);
    setError(null);
  };

  const closeModal = () => {
    setShowModal(false);
    setResult(null);
    setError(null);
  };

  // Don't show button if no certificates
  if (certificates.length === 0) {
    return null;
  }

  return (
    <>
      <button
        className="btn btn-primary"
        onClick={openModal}
        disabled={certificatesWithoutPdf.length === 0 && !regenerateExisting}
      >
        <FileText size={16} /> Bulk Generate PDFs
        {certificatesWithoutPdf.length > 0 && (
          <span
            style={{
              marginLeft: "0.5rem",
              background: "rgba(255,255,255,0.2)",
              padding: "0.1rem 0.5rem",
              borderRadius: "1rem",
              fontSize: "0.8rem",
            }}
          >
            {certificatesWithoutPdf.length}
          </span>
        )}
      </button>

      {/* Modal */}
      {showModal && (
        <div className="success-overlay" onClick={closeModal}>
          <div
            className="confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "500px", width: "90%" }}
          >
            <h3 className="confirm-title">
              <FileText size={24} /> Bulk Generate PDFs
            </h3>

            {!result && !isGenerating && (
              <>
                <div style={{ marginBottom: "1rem" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.5rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        padding: "0.75rem",
                        background: "var(--bg-tertiary)",
                        borderRadius: "0.5rem",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: "bold",
                          color: "var(--accent-warning)",
                        }}
                      >
                        {certificatesWithoutPdf.length}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Without PDF
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "0.75rem",
                        background: "var(--bg-tertiary)",
                        borderRadius: "0.5rem",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: "bold",
                          color: "var(--accent-success)",
                        }}
                      >
                        {certificatesWithPdf.length}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Already Generated
                      </div>
                    </div>
                  </div>

                  {certificatesWithoutTemplate.length > 0 && (
                    <div
                      style={{
                        padding: "0.75rem",
                        background: "rgba(var(--accent-danger-rgb), 0.1)",
                        borderRadius: "0.5rem",
                        marginBottom: "1rem",
                        fontSize: "0.85rem",
                        color: "var(--accent-danger)",
                      }}
                    >
                      ⚠️ {certificatesWithoutTemplate.length} certificate(s)
                      have no template assigned and will be skipped.
                    </div>
                  )}

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                      padding: "0.75rem",
                      background: "var(--bg-tertiary)",
                      borderRadius: "0.5rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={regenerateExisting}
                      onChange={(e) => setRegenerateExisting(e.target.checked)}
                      style={{ width: "1.2rem", height: "1.2rem" }}
                    />
                    <span style={{ fontSize: "0.9rem" }}>
                      Regenerate existing PDFs (overwrites current PDFs)
                    </span>
                  </label>
                </div>

                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "0.85rem",
                    marginBottom: "1rem",
                  }}
                >
                  {regenerateExisting
                    ? `This will generate/regenerate PDFs for all ${
                        certificates.filter((c) => c.template_id).length
                      } certificates with templates.`
                    : `This will generate PDFs for ${certificatesWithoutPdf.length} certificate(s) without PDFs.`}
                </p>
              </>
            )}

            {isGenerating && (
              <div style={{ textAlign: "center", padding: "2rem 0" }}>
                <div
                  style={{
                    fontSize: "3rem",
                    marginBottom: "1rem",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                >
                  ⏳
                </div>
                <p style={{ color: "var(--text-secondary)" }}>
                  Generating PDFs... This may take a while.
                </p>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Please don&apos;t close this window.
                </p>
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: "1rem",
                  background: "rgba(var(--accent-danger-rgb), 0.1)",
                  borderRadius: "0.5rem",
                  marginBottom: "1rem",
                  color: "var(--accent-danger)",
                }}
              >
                ❌ {error}
              </div>
            )}

            {result && (
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "0.5rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div
                    style={{
                      padding: "0.75rem",
                      background: "rgba(var(--accent-success-rgb), 0.1)",
                      borderRadius: "0.5rem",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.5rem",
                        fontWeight: "bold",
                        color: "var(--accent-success)",
                      }}
                    >
                      {result.successful}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Generated
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "0.75rem",
                      background: "rgba(var(--accent-warning-rgb), 0.1)",
                      borderRadius: "0.5rem",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.5rem",
                        fontWeight: "bold",
                        color: "var(--accent-warning)",
                      }}
                    >
                      {result.skipped}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Skipped
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "0.75rem",
                      background:
                        result.failed > 0
                          ? "rgba(var(--accent-danger-rgb), 0.1)"
                          : "var(--bg-tertiary)",
                      borderRadius: "0.5rem",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.5rem",
                        fontWeight: "bold",
                        color:
                          result.failed > 0
                            ? "var(--accent-danger)"
                            : "var(--text-secondary)",
                      }}
                    >
                      {result.failed}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Failed
                    </div>
                  </div>
                </div>

                {result.failed > 0 && (
                  <div
                    style={{
                      maxHeight: "150px",
                      overflowY: "auto",
                      background: "var(--bg-tertiary)",
                      borderRadius: "0.5rem",
                      padding: "0.75rem",
                      fontSize: "0.8rem",
                    }}
                  >
                    <strong style={{ color: "var(--accent-danger)" }}>
                      Failed certificates:
                    </strong>
                    {result.results
                      .filter((r) => !r.success && !r.skipped)
                      .map((r, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "0.25rem 0",
                            borderBottom: "1px solid var(--border-color)",
                          }}
                        >
                          <span style={{ color: "var(--text-primary)" }}>
                            {r.name}
                          </span>
                          <span style={{ color: "var(--text-muted)" }}>
                            {" "}
                            ({r.certificateCode})
                          </span>
                          <div
                            style={{
                              color: "var(--accent-danger)",
                              fontSize: "0.75rem",
                            }}
                          >
                            {r.error}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                <div
                  style={{
                    textAlign: "center",
                    padding: "1rem 0",
                    color: "var(--accent-success)",
                  }}
                >
                  <CheckCircle size={20} style={{ display: "inline" }} /> Bulk
                  generation complete!
                </div>
              </div>
            )}

            <div className="confirm-actions">
              <button
                className="btn btn-secondary"
                onClick={closeModal}
                disabled={isGenerating}
              >
                {result ? "Close" : "Cancel"}
              </button>
              {!result && (
                <button
                  className="btn btn-primary"
                  onClick={handleBulkGenerate}
                  disabled={
                    isGenerating ||
                    (certificatesWithoutPdf.length === 0 && !regenerateExisting)
                  }
                >
                  {isGenerating ? (
                    "Generating..."
                  ) : (
                    <>
                      <Rocket size={16} /> Generate All
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </>
  );
}
