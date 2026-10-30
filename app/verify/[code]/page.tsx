import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import HolographicCard from "@/components/ui/holographic-card";
import GradientLoader from "@/components/GradientLoader";

import VerifyCard from "./VerifyCard";
import { Check, X, HelpCircle } from "lucide-react";
import "../verify.css";
interface VerifyPageProps {
  params: Promise<{ code: string }>;
}

interface PublicVerificationCertificate {
  certificate_code: string;
  name: string | null;
  event_name: string | null;
  date_of_issue: string | null;
  is_valid: boolean;
}

async function getCertificate(code: string): Promise<PublicVerificationCertificate | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('verify_certificate', {p_code: code.toUpperCase()}).maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as PublicVerificationCertificate;
}

export async function generateMetadata({ params }: VerifyPageProps): Promise<Metadata> {
  const { code } = await params;
  const certificate = await getCertificate(code);

  if (!certificate) {
    return {
      title: "Certificate Not Found | Verification",
      description: "This certificate code could not be verified.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    title: certificate.is_valid ? "Certificate Verified | Verification" : "Certificate Revoked | Verification",
    description: "Public certificate verification result.",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function VerifyPage({ params }: VerifyPageProps) {
  const { code } = await params;
  const certificate = await getCertificate(code);



  if (!certificate) {
    return (
      <div className="verify-container">
        <div
          className="verify-card"
          style={{ position: "relative", zIndex: 10 }}
        >
          <VerifyCard>
            <HolographicCard
              style={{ width: "100%", borderColor: "rgba(255, 255, 255, 0.1)" }}
            >
              <div
                className="verify-not-found"
                style={{
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                  padding: "3rem",
                }}
              >
                <div className="verify-icon">
                  <HelpCircle className="w-10 h-10 text-white" />
                </div>
                <h1
                  className="verify-status"
                  style={{ color: "var(--text-muted)" }}
                >
                  Certificate Not Found
                </h1>
                <p className="verify-subtitle">
                  The certificate code{" "}
                  <code className="verify-code">{code.toUpperCase()}</code> does
                  not exist in our system.
                </p>
                <div className="verify-footer">
                  <p>Please check the code and try again.</p>
                </div>
              </div>
            </HolographicCard>
          </VerifyCard>
        </div>
      </div>
    );
  }

  const isValid = certificate.is_valid;

  return (
    <div className="verify-container">
      <div className="verify-card" style={{ position: "relative", zIndex: 10 }}>
        <VerifyCard>
          <HolographicCard
            style={{ width: "100%" }}
            certificateCode={certificate.certificate_code}
            showDownloadButton={isValid}
          >
            <div
              className={isValid ? "verify-valid" : "verify-invalid"}
              style={{
                background: "transparent",
                border: "none",
                boxShadow: "none",
                padding: "3rem",
                transformStyle: "preserve-3d",
              }}
            >
              {/* GradientLoader in place of the big tick mark */}
              <div
                className="verify-icon"
                style={{
                  position: "relative",
                  zIndex: 10,
                  transform: "translateZ(10px)",
                }}
              >
                <GradientLoader size={120} />
              </div>

              {/* Valid/Invalid Certificate with inline icon */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  position: "relative",
                  zIndex: 15,
                  transform: "translateZ(15px)",
                }}
              >
                {isValid ? (
                  <Check className="w-6 h-6" style={{ color: "#22c55e" }} />
                ) : (
                  <X className="w-6 h-6" style={{ color: "#ef4444" }} />
                )}
                <h1
                  className="verify-status"
                  style={{ margin: 0 }}
                >
                  {isValid ? "Valid Certificate" : "Invalid Certificate"}
                </h1>
              </div>

              <p
                className="verify-subtitle"
                style={{
                  position: "relative",
                  zIndex: 20,
                  transform: "translateZ(20px)",
                }}
              >
                {isValid
                  ? "This certificate is authentic and has been verified."
                  : "This certificate has been revoked or is no longer valid."}
              </p>

              {isValid && <>
              {/* Recipient Name - Centered and Prominent */}
              <div
                style={{
                  textAlign: "center",
                  margin: "2rem 0 1.5rem",
                  position: "relative",
                  zIndex: 30,
                  transform: "translateZ(30px)",
                }}
              >
                <h2
                  className="name-text-shine"
                  style={{
                    fontSize: "1.75rem",
                    fontWeight: "700",
                    color: "var(--text-primary)",
                    marginBottom: "0",
                    letterSpacing: "0.5px",
                  }}
                >
                  {certificate.name}
                </h2>
              </div>

              {/* Certificate Details - Creative Grid Layout */}
              <div
                className="verify-details-grid"
                style={{
                  position: "relative",
                  zIndex: 25,
                  transform: "translateZ(25px)",
                }}
              >
                {/* Event/Course - Featured */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    padding: "1.25rem",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "rgba(255, 255, 255, 0.7)",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      marginBottom: "0.5rem",
                      fontWeight: "600",
                    }}
                  >
                    Event / Course
                  </div>
                  <div
                    style={{
                      fontSize: "1.125rem",
                      color: "var(--text-primary)",
                      fontWeight: "600",
                    }}
                  >
                    {certificate.event_name}
                  </div>
                </div>

                {/* Date and Code - Side by Side */}
                <div className="verify-details-duo">
                  <div
                    style={{
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "12px",
                      padding: "1rem",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "rgba(255, 255, 255, 0.7)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        marginBottom: "0.5rem",
                        fontWeight: "600",
                      }}
                    >
                      Issued
                    </div>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--text-primary)",
                        fontWeight: "500",
                      }}
                    >
                      {new Date(certificate.date_of_issue || '').toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        }
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "12px",
                      padding: "1rem",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "rgba(255, 255, 255, 0.7)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        marginBottom: "0.5rem",
                        fontWeight: "600",
                      }}
                    >
                      Code
                    </div>
                    <code
                      className="verify-code"
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: "600",
                      }}
                    >
                      {certificate.certificate_code}
                    </code>
                  </div>
                </div>
              </div>
              </>}
            </div>
          </HolographicCard>
        </VerifyCard>
      </div>
    </div>
  );
}
