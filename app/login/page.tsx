"use client";

import { useState, useEffect } from "react";
import { signIn } from "@/app/actions/auth";
import { GraduationCap, Lock, Loader2 } from "lucide-react";
import "./login.css";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  // Countdown timer for rate limit
  useEffect(() => {
    if (retryAfter && retryAfter > 0) {
      const timer = setInterval(() => {
        setRetryAfter((prev) => {
          if (prev && prev > 1) {
            return prev - 1;
          }
          // Timer expired - allow retrying
          setIsRateLimited(false);
          setError(null);
          return null;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [retryAfter]);

  async function handleSubmit(formData: FormData) {
    if (isRateLimited && retryAfter && retryAfter > 0) {
      return; // Don't allow submit while rate limited
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn(formData);
      if (result?.error) {
        setError(result.error);

        // Check if rate limited
        if ("rateLimited" in result && result.rateLimited) {
          setIsRateLimited(true);
          if ("retryAfter" in result && typeof result.retryAfter === "number") {
            setRetryAfter(result.retryAfter);
          }
        }
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    }
    return `${secs}s`;
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <GraduationCap size={48} />
          </div>
          <h1 className="login-title">Admin Portal</h1>
          <p className="login-subtitle">Sign in to manage certificates</p>
        </div>

        <form action={handleSubmit} className="login-form">
          {error && (
            <div
              className={`login-error ${isRateLimited ? "rate-limited" : ""}`}
            >
              {isRateLimited && retryAfter ? (
                <>
                  <div className="rate-limit-icon">
                    <Lock size={24} />
                  </div>
                  <div className="rate-limit-message">
                    Too many login attempts
                  </div>
                  <div className="rate-limit-countdown">
                    Try again in <strong>{formatCountdown(retryAfter)}</strong>
                  </div>
                </>
              ) : (
                error
              )}
            </div>
          )}

          <div className="input-group">
            <label htmlFor="email" className="input-label">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="input"
              placeholder="admin@example.com"
              autoComplete="email"
              disabled={isRateLimited}
            />
          </div>

          <div className="input-group">
            <label htmlFor="password" className="input-label">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="input"
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={isRateLimited}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || isRateLimited}
            className={`btn btn-primary btn-lg login-button w-full ${
              isRateLimited ? "btn-disabled" : ""
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="spinner-icon" /> Signing in...
              </>
            ) : isRateLimited ? (
              <>
                <Lock size={16} /> Locked (
                {retryAfter ? formatCountdown(retryAfter) : "wait"})
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>Certificate Verification System</p>
        </div>
      </div>
    </div>
  );
}
