"use client";

import React, { useRef, useCallback, useState, useEffect } from "react";
import { Download, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import "./holographic-card.css";

interface HolographicCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  certificateCode?: string;
  showDownloadButton?: boolean;
}

type DeviceOrientationWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<string>;
};

type WebHapticsLike = {
  trigger: (input?: unknown, options?: { intensity?: number }) => Promise<void>;
  cancel?: () => void;
  destroy?: () => void;
};

const HolographicCard: React.FC<HolographicCardProps> = ({
  children,
  className,
  certificateCode,
  showDownloadButton = false,
  style,
  ...props
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [isRequestingMotionPermission, setIsRequestingMotionPermission] = useState(false);

  // Animation refs
  const rafRef = useRef<number>(0);
  const currentPos = useRef({ x: 50, y: 50 });
  const targetPos = useRef({ x: 50, y: 50 });
  const lastMotionBucketRef = useRef({ x: 50, y: 50 });
  const lastMotionHapticTsRef = useRef(0);
  const hapticsRef = useRef<WebHapticsLike | null>(null);

  const triggerHaptic = useCallback((mode: "toggle-on" | "toggle-off" | "motion") => {
    if (typeof navigator === "undefined") return;

    const fallback = () => {
      if (typeof navigator.vibrate !== "function") return;

      if (mode === "toggle-on") {
        navigator.vibrate([18, 30, 18]);
        return;
      }

      if (mode === "toggle-off") {
        navigator.vibrate(12);
        return;
      }

      navigator.vibrate(8);
    };

    const haptics = hapticsRef.current;
    if (!haptics) {
      fallback();
      return;
    }

    if (mode === "toggle-on") {
      void haptics.trigger("success", { intensity: 0.45 }).catch(fallback);
      return;
    }

    if (mode === "toggle-off") {
      void haptics.trigger("nudge", { intensity: 0.25 }).catch(fallback);
      return;
    }

    void haptics.trigger(8, { intensity: 0.22 }).catch(fallback);
  }, []);

  // Apply transform to the INNER element
  const applyTransform = useCallback(() => {
    if (!innerRef.current || !cardRef.current) return;

    const current = currentPos.current;

    // Calculate rotation (max ±15 degrees)
    const rotateY = ((current.x - 50) / 50) * 15;
    const rotateX = ((50 - current.y) / 50) * 15;

    // Apply CSS custom properties for glare/shine positioning
    cardRef.current.style.setProperty("--pointer-x", `${current.x}%`);
    cardRef.current.style.setProperty("--pointer-y", `${current.y}%`);

    // Apply transform to inner element
    innerRef.current.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  }, []);

  // Animation loop with smooth easing
  useEffect(() => {
    let isRunning = true;

    const tick = () => {
      if (!isRunning) return;

      const current = currentPos.current;
      const target = targetPos.current;

      // Smooth easing
      const easing = 0.1;

      // Interpolate
      current.x += (target.x - current.x) * easing;
      current.y += (target.y - current.y) * easing;

      // Apply the transform
      applyTransform();

      // Continue the loop
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      isRunning = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [applyTransform]);

  // Device orientation handler for mobile tilt
  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const { beta, gamma } = event;
    if (beta === null || gamma === null) return;

    // Normalize to 0-100 range, center around beta=45 (typical phone holding angle)
    const normalizedY = Math.max(0, Math.min(100, 50 + (beta - 45) * 1.5));
    const normalizedX = Math.max(0, Math.min(100, 50 + gamma * 1.5));

    targetPos.current = { x: normalizedX, y: normalizedY };
    setIsActive(true);

    const bucket = {
      x: Math.round(normalizedX / 8),
      y: Math.round(normalizedY / 8),
    };

    const now = Date.now();
    const bucketChanged =
      bucket.x !== lastMotionBucketRef.current.x ||
      bucket.y !== lastMotionBucketRef.current.y;

    if (bucketChanged && now - lastMotionHapticTsRef.current > 120) {
      triggerHaptic("motion");
      lastMotionHapticTsRef.current = now;
      lastMotionBucketRef.current = bucket;
    }
  }, [triggerHaptic]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pointerQuery = window.matchMedia("(pointer: coarse)");
    const hoverQuery = window.matchMedia("(hover: none)");
    const widthQuery = window.matchMedia("(max-width: 1024px)");
    const updateTouchMode = () => {
      const hasTouchPoints = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
      const touchEventSupport = "ontouchstart" in window;
      const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const likelyTouch = pointerQuery.matches || hoverQuery.matches || hasTouchPoints || touchEventSupport;
      const likelyMobile = uaMobile || (likelyTouch && widthQuery.matches);

      setIsTouchDevice(likelyMobile);
    };

    updateTouchMode();

    if (typeof pointerQuery.addEventListener === "function") {
      pointerQuery.addEventListener("change", updateTouchMode);
      hoverQuery.addEventListener("change", updateTouchMode);
      widthQuery.addEventListener("change", updateTouchMode);
      return () => {
        pointerQuery.removeEventListener("change", updateTouchMode);
        hoverQuery.removeEventListener("change", updateTouchMode);
        widthQuery.removeEventListener("change", updateTouchMode);
      };
    }

    pointerQuery.addListener(updateTouchMode);
    hoverQuery.addListener(updateTouchMode);
    widthQuery.addListener(updateTouchMode);
    return () => {
      pointerQuery.removeListener(updateTouchMode);
      hoverQuery.removeListener(updateTouchMode);
      widthQuery.removeListener(updateTouchMode);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isTouchDevice) return;

    let isDisposed = false;

    void import("web-haptics")
      .then((mod) => {
        if (isDisposed) return;
        const WebHapticsClass = mod.WebHaptics as new (options?: {
          debug?: boolean;
          showSwitch?: boolean;
        }) => WebHapticsLike;
        hapticsRef.current = new WebHapticsClass({ showSwitch: false });
      })
      .catch(() => {
        hapticsRef.current = null;
      });

    return () => {
      isDisposed = true;
      hapticsRef.current?.destroy?.();
      hapticsRef.current = null;
    };
  }, [isTouchDevice]);

  useEffect(() => {
    if (!motionEnabled) return;
    if (typeof window === "undefined") return;

    window.addEventListener("deviceorientation", handleOrientation, { passive: true });

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [motionEnabled, handleOrientation]);

  useEffect(() => {
    if (motionEnabled) return;

    targetPos.current = { x: 50, y: 50 };
    lastMotionBucketRef.current = { x: 50, y: 50 };
    setIsActive(false);
  }, [motionEnabled]);

  useEffect(() => {
    if (isTouchDevice) return;
    setMotionEnabled(false);
  }, [isTouchDevice]);

  // Mouse handlers for desktop
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouchDevice) return;
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    targetPos.current = {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  }, [isTouchDevice]);

  const handleMouseEnter = useCallback(() => {
    if (isTouchDevice) return;
    setIsActive(true);
  }, [isTouchDevice]);

  const handleMouseLeave = useCallback(() => {
    if (isTouchDevice) return;
    setIsActive(false);
    targetPos.current = { x: 50, y: 50 };
  }, [isTouchDevice]);

  const handleMotionToggle = async () => {
    if (!isTouchDevice) return;

    if (motionEnabled) {
      setMotionEnabled(false);
      triggerHaptic("toggle-off");
      return;
    }

    if (typeof DeviceOrientationEvent === "undefined") return;

    const DOEvent = DeviceOrientationEvent as DeviceOrientationWithPermission;
    setIsRequestingMotionPermission(true);

    try {
      if (typeof DOEvent.requestPermission === "function") {
        const permission = await DOEvent.requestPermission();
        if (permission !== "granted") return;
      }

      setMotionEnabled(true);
      setIsActive(true);
      triggerHaptic("toggle-on");
    } catch (err) {
      console.error("Orientation permission error:", err);
    } finally {
      setIsRequestingMotionPermission(false);
    }
  };

  const onMotionButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void handleMotionToggle();
  };

  const handleDownload = async () => {
    if (!certificateCode || isDownloading) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`/api/verify/${certificateCode}/pdf`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to download certificate");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate-${certificateCode}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
      alert(
        error instanceof Error ? error.message : "Failed to download certificate"
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        "holo-card",
        isActive && "holo-card--active",
        isTouchDevice && "holo-card--touch",
        className
      )}
      style={{
        "--pointer-x": "50%",
        "--pointer-y": "50%",
        ...style,
      } as React.CSSProperties}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {/* Inner wrapper for 3D transforms */}
      <div
        ref={innerRef}
        className="holo-inner"
        style={{
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "none",
        }}
      >
        {/* Holographic shine layer */}
        <div className="holo-shine" />

        {/* Glare overlay */}
        <div className="holo-glare" />

        {/* Content */}
        <div className="holo-content">
          {children}

          {showDownloadButton && certificateCode && (
            <div className="holo-download">
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="holo-download-btn"
              >
                <Download size={18} />
                <span>
                  {isDownloading ? "Downloading..." : "Download Certificate"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {isTouchDevice && (
        <button
          type="button"
          className={cn("holo-motion-toggle", motionEnabled && "holo-motion-toggle--active")}
          onClick={onMotionButtonClick}
          aria-label={motionEnabled ? "Disable card motion" : "Enable card motion"}
          aria-pressed={motionEnabled}
          disabled={isRequestingMotionPermission}
        >
          <Smartphone size={16} />
        </button>
      )}
    </div>
  );
};

export default HolographicCard;
