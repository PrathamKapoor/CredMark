"use client";

import React, { useRef, useLayoutEffect, useState, useEffect, useCallback } from "react";
import gsap from "gsap";
import Image from "next/image";

interface VerifyCardProps {
  children: React.ReactNode;
}

export default function VerifyCard({ children }: VerifyCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitShellRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileScale, setMobileScale] = useState(1);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      if (!cardRef.current) return;

      // Keep 3D settings without any intro spin so card appears immediately.
      gsap.set(cardRef.current, {
        transformStyle: "preserve-3d",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        WebkitFontSmoothing: "antialiased",
        WebkitTransformZ: 0,
        force3D: true,
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const coarseQuery = window.matchMedia("(pointer: coarse)");
    const widthQuery = window.matchMedia("(max-width: 1024px)");

    const updateViewportMode = () => {
      const hasTouchPoints = navigator.maxTouchPoints > 0;
      const touchEventSupport = "ontouchstart" in window;
      const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const shouldFitMobile = uaMobile || (widthQuery.matches && (coarseQuery.matches || hasTouchPoints || touchEventSupport));
      setIsMobileViewport(shouldFitMobile);
    };

    updateViewportMode();

    if (typeof coarseQuery.addEventListener === "function") {
      coarseQuery.addEventListener("change", updateViewportMode);
      widthQuery.addEventListener("change", updateViewportMode);
      window.addEventListener("resize", updateViewportMode);

      return () => {
        coarseQuery.removeEventListener("change", updateViewportMode);
        widthQuery.removeEventListener("change", updateViewportMode);
        window.removeEventListener("resize", updateViewportMode);
      };
    }

    coarseQuery.addListener(updateViewportMode);
    widthQuery.addListener(updateViewportMode);
    window.addEventListener("resize", updateViewportMode);

    return () => {
      coarseQuery.removeListener(updateViewportMode);
      widthQuery.removeListener(updateViewportMode);
      window.removeEventListener("resize", updateViewportMode);
    };
  }, []);

  const recalculateMobileScale = useCallback(() => {
    const card = cardRef.current;
    const shell = fitShellRef.current;

    if (!card || !shell) return;

    if (!isMobileViewport) {
      shell.style.height = "";
      setMobileScale(1);
      return;
    }

    const cardHeight = card.offsetHeight;
    const cardWidth = card.offsetWidth;
    if (!cardHeight || !cardWidth) return;

    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;

    // Keep room for safe insets and breathing space around the card.
    const availableHeight = Math.max(220, viewportHeight - 18);
    const availableWidth = Math.max(260, Math.min(shell.clientWidth || viewportWidth, viewportWidth) - 8);

    const scaleByHeight = availableHeight / cardHeight;
    const scaleByWidth = availableWidth / cardWidth;
    const nextScale = Math.min(1, scaleByHeight, scaleByWidth);
    const clampedScale = Math.max(0.56, nextScale);

    setMobileScale((prev) => (Math.abs(prev - clampedScale) < 0.01 ? prev : clampedScale));
    shell.style.height = `${Math.ceil(cardHeight * clampedScale)}px`;
  }, [isMobileViewport]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const card = cardRef.current;
    if (!card) return;

    const resizeObserver = new ResizeObserver(() => {
      recalculateMobileScale();
    });

    resizeObserver.observe(card);

    const onResize = () => recalculateMobileScale();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    const rafId = requestAnimationFrame(recalculateMobileScale);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [recalculateMobileScale]);

  return (
    <div
      ref={containerRef}
      className="verify-card-wrapper"
      style={{
        perspective: "1200px",
        width: "100%",
        position: "relative",
        WebkitPerspective: "1200px",
        WebkitTransformStyle: "preserve-3d",
        transformStyle: "preserve-3d",
        /* Prevent touch flickering */
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <div
        ref={fitShellRef}
        className="verify-card-fit-shell"
      >
      <div
        className="verify-card-fit-scale"
        style={{
          width: "100%",
          transform: `scale(${mobileScale})`,
          transformOrigin: "top center",
          willChange: isMobileViewport ? "transform" : "auto",
        }}
      >
        <div
          ref={cardRef}
          className="verify-card-inner"
          style={{
            width: "100%",
            position: "relative",
            transformStyle: "preserve-3d",
            WebkitTransformStyle: "preserve-3d",
            transformOrigin: "center center",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
            WebkitTransform: "translate3d(0, 0, 0)",
            transform: "translate3d(0, 0, 0)",
            /* Prevent tap highlight on mobile */
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {/* Front Side - Contains the HolographicCard */}
          <div
            className="verify-card-face verify-card-front"
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              backfaceVisibility: "visible",
              WebkitBackfaceVisibility: "visible",
              transformStyle: "preserve-3d",
              WebkitTransformStyle: "preserve-3d",
              zIndex: 2,
              WebkitTransform: "rotateY(0deg) translateZ(1px)",
              transform: "rotateY(0deg) translateZ(1px)",
            }}
          >
            {children}
          </div>

          {/* Back Side - Contains the Favicon */}
          <div
            className="verify-card-face verify-card-back"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              WebkitTransform: "rotateY(180deg) translateZ(1px)",
              transform: "rotateY(180deg) translateZ(1px)",
              background: "#09090b",
              borderRadius: "30px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.1)",
              zIndex: 1,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "200px",
                height: "200px",
                filter: "drop-shadow(0 0 30px rgba(254,127,46,0.45)) drop-shadow(0 0 12px rgba(41,54,158,0.5))",
              }}
            >
              <Image
                src="/favicon.png"
                alt="Logo"
                fill
                style={{ objectFit: "contain" }}
                priority
              />
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
