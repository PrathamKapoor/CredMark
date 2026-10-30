"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import GradientLoader from "@/components/GradientLoader";
import DarkVeil from "./DarkVeil";   // ✅ ADD THIS
import "./verify.css";

export default function VerifyPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedCode = code.trim().toUpperCase();

    if (!trimmedCode) {
      setError("Please enter a certificate code");
      return;
    }

    if (trimmedCode.length < 6) {
      setError("Certificate code must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    router.push(`/verify/${trimmedCode}`);
  }

  return (
    <div className="verify-container">

      {/* ✅ DARK VEIL BACKGROUND */}
      <DarkVeil />

      {/* ✅ FOREGROUND CONTENT */}
      <div className="verify-card">
        <div className="verify-header">
          <div className="verify-icon">
            <Search size={48} />
          </div>
          <h1 className="verify-title">Certificate Verification</h1>
          <p className="verify-subtitle">
            Enter your certificate code to verify its authenticity
          </p>
        </div>

        <form onSubmit={handleSubmit} className="verify-form">
          {error && <div className="verify-error">{error}</div>}

          <div className="input-group">
            <label htmlFor="code" className="input-label">
              Certificate Code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              className="input verify-input"
              placeholder="Enter your certificate code"
              autoComplete="off"
              maxLength={20}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary btn-lg verify-button w-full"
          >
            {isLoading ? (
              <>
                <span
                  className="spinner"
                  style={{ width: 20, height: 20 }}
                ></span>
                Verifying...
              </>
            ) : (
              "Verify Certificate"
            )}
          </button>
        </form>

        {/* <div className="verify-footer">
          <p></p>
        </div> */}
      </div>
    </div>
  );
}
