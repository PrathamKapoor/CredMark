"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Folder,
  Hourglass,
  FileText,
  MapPin,
  Palette,
  Trash2,
  Save,
} from "lucide-react";
import { createTemplate, uploadTemplateImage } from "@/app/actions/templates";
import "../templates.css";

type PlacementMode = "link" | "name" | "event" | "date";

interface Coordinates {
  link_x: number;
  link_y: number;
  link_width: number;
  link_height: number;
  link_font_size: number;
  link_alignment: "left" | "center" | "right";
  name_x: number;
  name_y: number;
  name_width: number;
  name_height: number;
  name_font_size: number;
  name_alignment: "left" | "center" | "right";
  event_x: number | null;
  event_y: number | null;
  event_width: number;
  event_height: number;
  event_font_size: number;
  event_alignment: "left" | "center" | "right";
  date_x: number | null;
  date_y: number | null;
  date_width: number;
  date_height: number;
  date_font_size: number;
  date_alignment: "left" | "center" | "right";
}

export default function CreateTemplateForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false); // For file drag
  const [showPreview, setShowPreview] = useState(true);
  const [previewName, setPreviewName] = useState("John Doe");

  const [templateName, setTemplateName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null); // Local blob URL for preview
  const [imageWidth, setImageWidth] = useState(1920);
  const [imageHeight, setImageHeight] = useState(1080);

  const [placementMode, setPlacementMode] = useState<PlacementMode>("name");
  const [selectedMarker, setSelectedMarker] = useState<PlacementMode | null>(
    null
  );
  const [isMarkerDragging, setIsMarkerDragging] = useState(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    coordX: number;
    coordY: number;
  } | null>(null);

  const [coordinates, setCoordinates] = useState<Coordinates>({
    link_x: 960,
    link_y: 900,
    link_width: 300,
    link_height: 40,
    link_font_size: 12,
    link_alignment: "center",
    name_x: 960,
    name_y: 450,
    name_width: 600,
    name_height: 80,
    name_font_size: 48,
    name_alignment: "center",
    event_x: null,
    event_y: null,
    event_width: 400,
    event_height: 60,
    event_font_size: 24,
    event_alignment: "center",
    date_x: null,
    date_y: null,
    date_width: 300,
    date_height: 40,
    date_font_size: 18,
    date_alignment: "center",
  });

  // Handle keyboard navigation for selected marker
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!selectedMarker) return;

      const step = e.shiftKey ? 10 : 1; // Larger steps with Shift key
      let dx = 0,
        dy = 0;

      switch (e.key) {
        case "ArrowUp":
          dy = -step;
          break;
        case "ArrowDown":
          dy = step;
          break;
        case "ArrowLeft":
          dx = -step;
          break;
        case "ArrowRight":
          dx = step;
          break;
        case "Escape":
          setSelectedMarker(null);
          return;
        default:
          return;
      }

      e.preventDefault();

      setCoordinates((prev) => {
        switch (selectedMarker) {
          case "link":
            return {
              ...prev,
              link_x: Math.max(0, Math.min(imageWidth, prev.link_x + dx)),
              link_y: Math.max(0, Math.min(imageHeight, prev.link_y + dy)),
            };
          case "name":
            return {
              ...prev,
              name_x: Math.max(0, Math.min(imageWidth, prev.name_x + dx)),
              name_y: Math.max(0, Math.min(imageHeight, prev.name_y + dy)),
            };
          case "event":
            if (prev.event_x === null || prev.event_y === null) return prev;
            return {
              ...prev,
              event_x: Math.max(0, Math.min(imageWidth, prev.event_x + dx)),
              event_y: Math.max(0, Math.min(imageHeight, prev.event_y + dy)),
            };
          case "date":
            if (prev.date_x === null || prev.date_y === null) return prev;
            return {
              ...prev,
              date_x: Math.max(0, Math.min(imageWidth, prev.date_x + dx)),
              date_y: Math.max(0, Math.min(imageHeight, prev.date_y + dy)),
            };
          default:
            return prev;
        }
      });
    },
    [selectedMarker, imageWidth, imageHeight]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Start dragging a marker
  const handleMarkerMouseDown = (e: React.MouseEvent, mode: PlacementMode) => {
    e.stopPropagation();
    setSelectedMarker(mode);
    setPlacementMode(mode);
    setIsMarkerDragging(true);

    const coordX =
      mode === "link"
        ? coordinates.link_x
        : mode === "name"
        ? coordinates.name_x
        : mode === "event"
        ? coordinates.event_x ?? 0
        : coordinates.date_x ?? 0;
    const coordY =
      mode === "link"
        ? coordinates.link_y
        : mode === "name"
        ? coordinates.name_y
        : mode === "event"
        ? coordinates.event_y ?? 0
        : coordinates.date_y ?? 0;

    dragStartRef.current = { x: e.clientX, y: e.clientY, coordX, coordY };
  };

  // Handle mouse move during drag
  useEffect(() => {
    if (!isMarkerDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (
        !isMarkerDragging ||
        !dragStartRef.current ||
        !imageRef.current ||
        !selectedMarker
      )
        return;

      const rect = imageRef.current.getBoundingClientRect();
      const scaleX = imageWidth / rect.width;
      const scaleY = imageHeight / rect.height;

      const deltaX = (e.clientX - dragStartRef.current.x) * scaleX;
      const deltaY = (e.clientY - dragStartRef.current.y) * scaleY;

      const newX = Math.max(
        0,
        Math.min(imageWidth, Math.round(dragStartRef.current.coordX + deltaX))
      );
      const newY = Math.max(
        0,
        Math.min(imageHeight, Math.round(dragStartRef.current.coordY + deltaY))
      );

      setCoordinates((prev) => {
        switch (selectedMarker) {
          case "link":
            return { ...prev, link_x: newX, link_y: newY };
          case "name":
            return { ...prev, name_x: newX, name_y: newY };
          case "event":
            return { ...prev, event_x: newX, event_y: newY };
          case "date":
            return { ...prev, date_x: newX, date_y: newY };
          default:
            return prev;
        }
      });
    };

    const handleMouseUp = () => {
      setIsMarkerDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isMarkerDragging, selectedMarker, imageWidth, imageHeight]);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }

    setIsUploading(true);
    setError(null);
    // Clear previously persisted URL so save is blocked until this upload succeeds.
    setImageUrl(null);

    try {
      // Create local preview immediately
      const objectUrl = URL.createObjectURL(file);
      setLocalPreview(objectUrl);

      // Get image dimensions
      const img = new Image();

      await new Promise<void>((resolve) => {
        img.onload = () => {
          setImageWidth(img.naturalWidth);
          setImageHeight(img.naturalHeight);
          // Set initial coordinates based on image dimensions
          setCoordinates((prev) => ({
            ...prev,
            link_x: Math.round(img.naturalWidth / 2),
            link_y: Math.round(img.naturalHeight * 0.85),
            name_x: Math.round(img.naturalWidth / 2),
            name_y: Math.round(img.naturalHeight * 0.45),
          }));
          resolve();
        };
        img.src = objectUrl;
      });

      // Upload to Supabase
      const formData = new FormData();
      formData.append("file", file);

      const result = await uploadTemplateImage(formData);

      if (result.success && result.url) {
        setImageUrl(result.url);
        if (result.width && result.height) {
          setImageWidth(result.width);
          setImageHeight(result.height);
        }
      } else {
        setError(
          `Upload failed: ${result.error ||
            "Image could not be uploaded"}. Please fix the issue and re-upload before saving.`
        );
      }
    } catch {
      setError("Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;

    // If clicking on the canvas (not a marker), deselect and place new marker
    if ((e.target as HTMLElement).tagName === "IMG") {
      setSelectedMarker(null);
    }

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = imageWidth / rect.width;
    const scaleY = imageHeight / rect.height;

    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    setCoordinates((prev) => {
      switch (placementMode) {
        case "link":
          return { ...prev, link_x: x, link_y: y };
        case "name":
          return { ...prev, name_x: x, name_y: y };
        case "event":
          return { ...prev, event_x: x, event_y: y };
        case "date":
          return { ...prev, date_x: x, date_y: y };
        default:
          return prev;
      }
    });
  };

  const getMarkerPosition = (x: number, y: number) => {
    if (!imageRef.current) return { left: 0, top: 0 };

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = rect.width / imageWidth;
    const scaleY = rect.height / imageHeight;

    return {
      left: x * scaleX,
      top: y * scaleY,
    };
  };

  const getScaledFontSize = (fontSize: number) => {
    if (!imageRef.current) return fontSize;
    const rect = imageRef.current.getBoundingClientRect();
    const scale = rect.width / imageWidth;
    return Math.max(8, fontSize * scale);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!imageUrl) {
      setError("Please upload an image and wait for successful storage upload");
      return;
    }

    if (imageUrl.startsWith("blob:")) {
      setError("Template image must be uploaded to storage before saving");
      return;
    }

    if (!templateName.trim()) {
      setError("Please enter a template name");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await createTemplate({
        name: templateName,
        image_url: imageUrl,
        image_width: imageWidth,
        image_height: imageHeight,
        ...coordinates,
      });

      if (result.success) {
        router.push("/admin/templates");
      } else {
        setError(result.error || "Failed to create template");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="template-form-container">
      <div className="page-header">
        <h1 className="page-title">Create Template</h1>
        <p className="page-subtitle">
          Upload and configure a certificate template
        </p>
      </div>

      {error && (
        <div
          className="login-error"
          style={{ marginBottom: "var(--space-lg)" }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {!localPreview && !imageUrl ? (
          /* Upload Area */
          <div
            className={`upload-area ${isDragging ? "dragging" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="upload-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
            <div className="upload-icon">
              {isUploading ? <Hourglass size={48} /> : <Folder size={48} />}
            </div>
            <p className="upload-text">
              {isUploading
                ? "Uploading..."
                : "Drop your certificate template here"}
            </p>
            <p className="upload-hint">
              or click to browse (PNG, JPG recommended)
            </p>
          </div>
        ) : (
          /* Editor */
          <div className="editor-container">
            <div className="editor-preview">
              <div className="preview-header">
                <span className="preview-title">Template Preview</span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-md)",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-xs)",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showPreview}
                      onChange={(e) => setShowPreview(e.target.checked)}
                      style={{ accentColor: "var(--accent-primary)" }}
                    />
                    Show Text Preview
                  </label>
                  <span className="preview-instructions">
                    Click to place{" "}
                    {placementMode.charAt(0).toUpperCase() +
                      placementMode.slice(1)}
                  </span>
                </div>
              </div>

              <div
                className="preview-canvas-container"
                onClick={handleImageClick}
              >
                <img
                  ref={imageRef}
                  src={localPreview || imageUrl || ""}
                  alt="Template preview"
                />

                {/* Link Marker */}
                <div
                  className={`coordinate-marker marker-link ${
                    selectedMarker === "link" ? "selected" : ""
                  } ${
                    isMarkerDragging && selectedMarker === "link"
                      ? "dragging"
                      : ""
                  }`}
                  style={{
                    ...getMarkerPosition(
                      coordinates.link_x,
                      coordinates.link_y
                    ),
                    width:
                      coordinates.link_width *
                      (imageRef.current
                        ? imageRef.current.getBoundingClientRect().width /
                          imageWidth
                        : 1),
                    height:
                      coordinates.link_height *
                      (imageRef.current
                        ? imageRef.current.getBoundingClientRect().height /
                          imageHeight
                        : 1),
                  }}
                  onMouseDown={(e) => handleMarkerMouseDown(e, "link")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMarker("link");
                    setPlacementMode("link");
                  }}
                >
                  <span className="marker-label">Verification Link</span>
                </div>

                {/* Name Preview */}
                {showPreview ? (
                  <div
                    className={`text-preview-marker ${
                      selectedMarker === "name" ? "selected" : ""
                    } ${
                      isMarkerDragging && selectedMarker === "name"
                        ? "dragging"
                        : ""
                    }`}
                    style={{
                      ...getMarkerPosition(
                        coordinates.name_x,
                        coordinates.name_y
                      ),
                      width:
                        coordinates.name_width *
                        (imageRef.current
                          ? imageRef.current.getBoundingClientRect().width /
                            imageWidth
                          : 1),
                      height:
                        coordinates.name_height *
                        (imageRef.current
                          ? imageRef.current.getBoundingClientRect().height /
                            imageHeight
                          : 1),
                      fontSize: `${getScaledFontSize(
                        coordinates.name_font_size
                      )}px`,
                      textAlign: coordinates.name_alignment,
                      transform:
                        coordinates.name_alignment === "center"
                          ? "translate(-50%, -50%)"
                          : coordinates.name_alignment === "right"
                          ? "translate(-100%, -50%)"
                          : "translate(0%, -50%)",
                      color: "#1a1a1a",
                      fontWeight: "bold",
                      fontFamily: "Arial, Helvetica, sans-serif",
                      textShadow: "0 0 4px rgba(255,255,255,0.8)",
                      whiteSpace: "nowrap",
                      cursor: "grab",
                      pointerEvents: "auto",
                      border:
                        selectedMarker === "name"
                          ? "1px dashed rgba(0,0,0,0.2)"
                          : "1px dashed rgba(0,0,0,0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent:
                        coordinates.name_alignment === "center"
                          ? "center"
                          : coordinates.name_alignment === "right"
                          ? "flex-end"
                          : "flex-start",
                    }}
                    onMouseDown={(e) => handleMarkerMouseDown(e, "name")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMarker("name");
                      setPlacementMode("name");
                    }}
                  >
                    {selectedMarker === "name" && (
                      <>
                        {/* Horizontal Guide (Y-axis anchor) */}
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: "-50%",
                            right: "-50%",
                            height: "1px",
                            background: "rgba(255, 50, 50, 0.6)",
                            pointerEvents: "none",
                            zIndex: 10,
                          }}
                        />
                        {/* Vertical Guide (X-axis anchor) */}
                        <div
                          style={{
                            position: "absolute",
                            left:
                              coordinates.name_alignment === "left"
                                ? "0%"
                                : coordinates.name_alignment === "right"
                                ? "100%"
                                : "50%",
                            top: "-100%",
                            bottom: "-100%",
                            width: "1px",
                            background: "rgba(255, 50, 50, 0.6)",
                            pointerEvents: "none",
                            zIndex: 10,
                          }}
                        />
                      </>
                    )}
                    {previewName}
                  </div>
                ) : (
                  <div
                    className={`coordinate-marker marker-name ${
                      selectedMarker === "name" ? "selected" : ""
                    } ${
                      isMarkerDragging && selectedMarker === "name"
                        ? "dragging"
                        : ""
                    }`}
                    style={getMarkerPosition(
                      coordinates.name_x,
                      coordinates.name_y
                    )}
                    onMouseDown={(e) => handleMarkerMouseDown(e, "name")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMarker("name");
                      setPlacementMode("name");
                    }}
                  >
                    <span className="marker-label">Name</span>
                  </div>
                )}

                {/* Event Preview */}
                {coordinates.event_x !== null &&
                  coordinates.event_y !== null &&
                  (showPreview ? (
                    <div
                      className={`text-preview-marker ${
                        selectedMarker === "event" ? "selected" : ""
                      } ${
                        isMarkerDragging && selectedMarker === "event"
                          ? "dragging"
                          : ""
                      }`}
                      style={{
                        ...getMarkerPosition(
                          coordinates.event_x,
                          coordinates.event_y
                        ),
                        width:
                          coordinates.event_width *
                          (imageRef.current
                            ? imageRef.current.getBoundingClientRect().width /
                              imageWidth
                            : 1),
                        height:
                          coordinates.event_height *
                          (imageRef.current
                            ? imageRef.current.getBoundingClientRect().height /
                              imageHeight
                            : 1),
                        fontSize: `${getScaledFontSize(
                          coordinates.event_font_size
                        )}px`,
                        textAlign: coordinates.event_alignment,
                        transform:
                          coordinates.event_alignment === "center"
                            ? "translate(-50%, -50%)"
                            : coordinates.event_alignment === "right"
                            ? "translate(-100%, -50%)"
                            : "translate(0%, -50%)",
                        color: "#333",
                        fontWeight: "bold",
                        fontFamily: "Arial, Helvetica, sans-serif",
                        textShadow: "0 0 4px rgba(255,255,255,0.8)",
                        whiteSpace: "nowrap",
                        cursor: "grab",
                        pointerEvents: "auto",
                        border:
                          selectedMarker === "event"
                            ? "1px dashed rgba(0,0,0,0.2)"
                            : "1px dashed rgba(0,0,0,0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent:
                          coordinates.event_alignment === "center"
                            ? "center"
                            : coordinates.event_alignment === "right"
                            ? "flex-end"
                            : "flex-start",
                      }}
                      onMouseDown={(e) => handleMarkerMouseDown(e, "event")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMarker("event");
                        setPlacementMode("event");
                      }}
                    >
                      {selectedMarker === "event" && (
                        <>
                          <div
                            style={{
                              position: "absolute",
                              top: "50%",
                              left: "-50%",
                              right: "-50%",
                              height: "1px",
                              background: "rgba(255, 50, 50, 0.6)",
                              pointerEvents: "none",
                              zIndex: 10,
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              left:
                                coordinates.event_alignment === "left"
                                  ? "0%"
                                  : coordinates.event_alignment === "right"
                                  ? "100%"
                                  : "50%",
                              top: "-100%",
                              bottom: "-100%",
                              width: "1px",
                              background: "rgba(255, 50, 50, 0.6)",
                              pointerEvents: "none",
                              zIndex: 10,
                            }}
                          />
                        </>
                      )}
                      Sample Event Name
                    </div>
                  ) : (
                    <div
                      className={`coordinate-marker marker-event ${
                        selectedMarker === "event" ? "selected" : ""
                      } ${
                        isMarkerDragging && selectedMarker === "event"
                          ? "dragging"
                          : ""
                      }`}
                      style={getMarkerPosition(
                        coordinates.event_x,
                        coordinates.event_y
                      )}
                      onMouseDown={(e) => handleMarkerMouseDown(e, "event")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMarker("event");
                        setPlacementMode("event");
                      }}
                    >
                      <span className="marker-label">Event</span>
                    </div>
                  ))}

                {/* Date Preview */}
                {coordinates.date_x !== null &&
                  coordinates.date_y !== null &&
                  (showPreview ? (
                    <div
                      className={`text-preview-marker ${
                        selectedMarker === "date" ? "selected" : ""
                      } ${
                        isMarkerDragging && selectedMarker === "date"
                          ? "dragging"
                          : ""
                      }`}
                      style={{
                        ...getMarkerPosition(
                          coordinates.date_x,
                          coordinates.date_y
                        ),
                        width:
                          coordinates.date_width *
                          (imageRef.current
                            ? imageRef.current.getBoundingClientRect().width /
                              imageWidth
                            : 1),
                        height:
                          coordinates.date_height *
                          (imageRef.current
                            ? imageRef.current.getBoundingClientRect().height /
                              imageHeight
                            : 1),
                        fontSize: `${getScaledFontSize(
                          coordinates.date_font_size
                        )}px`,
                        textAlign: coordinates.date_alignment,
                        transform:
                          coordinates.date_alignment === "center"
                            ? "translate(-50%, -50%)"
                            : coordinates.date_alignment === "right"
                            ? "translate(-100%, -50%)"
                            : "translate(0%, -50%)",
                        color: "#444",
                        fontWeight: "bold",
                        fontFamily: "Arial, Helvetica, sans-serif",
                        textShadow: "0 0 4px rgba(255,255,255,0.8)",
                        whiteSpace: "nowrap",
                        cursor: "grab",
                        pointerEvents: "auto",
                        border:
                          selectedMarker === "date"
                            ? "1px dashed rgba(0,0,0,0.2)"
                            : "1px dashed rgba(0,0,0,0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent:
                          coordinates.date_alignment === "center"
                            ? "center"
                            : coordinates.date_alignment === "right"
                            ? "flex-end"
                            : "flex-start",
                      }}
                      onMouseDown={(e) => handleMarkerMouseDown(e, "date")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMarker("date");
                        setPlacementMode("date");
                      }}
                    >
                      {selectedMarker === "date" && (
                        <>
                          <div
                            style={{
                              position: "absolute",
                              top: "50%",
                              left: "-50%",
                              right: "-50%",
                              height: "1px",
                              background: "rgba(255, 50, 50, 0.6)",
                              pointerEvents: "none",
                              zIndex: 10,
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              left:
                                coordinates.date_alignment === "left"
                                  ? "0%"
                                  : coordinates.date_alignment === "right"
                                  ? "100%"
                                  : "50%",
                              top: "-100%",
                              bottom: "-100%",
                              width: "1px",
                              background: "rgba(255, 50, 50, 0.6)",
                              pointerEvents: "none",
                              zIndex: 10,
                            }}
                          />
                        </>
                      )}
                      January 7, 2026
                    </div>
                  ) : (
                    <div
                      className={`coordinate-marker marker-date ${
                        selectedMarker === "date" ? "selected" : ""
                      } ${
                        isMarkerDragging && selectedMarker === "date"
                          ? "dragging"
                          : ""
                      }`}
                      style={getMarkerPosition(
                        coordinates.date_x,
                        coordinates.date_y
                      )}
                      onMouseDown={(e) => handleMarkerMouseDown(e, "date")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMarker("date");
                        setPlacementMode("date");
                      }}
                    >
                      <span className="marker-label">Date</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="editor-sidebar">
              {/* Template Name */}
              <div className="editor-panel">
                <h3 className="panel-title">
                  <FileText
                    size={20}
                    style={{ display: "inline", marginRight: "8px" }}
                  />
                  Template Name
                </h3>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="input"
                  placeholder="e.g., Course Completion Certificate"
                  required
                />
              </div>

              {/* Placement Mode */}
              <div className="editor-panel">
                <h3 className="panel-title">
                  <MapPin
                    size={20}
                    style={{ display: "inline", marginRight: "8px" }}
                  />
                  Click to Place
                </h3>
                <div className="placement-modes">
                  {(["name", "link", "event", "date"] as PlacementMode[]).map(
                    (mode) => (
                      <label
                        key={mode}
                        className={`placement-mode ${
                          placementMode === mode ? "active" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="placementMode"
                          checked={placementMode === mode}
                          onChange={() => setPlacementMode(mode)}
                        />
                        <div className={`placement-mode-indicator ${mode}`} />
                        <div className="placement-mode-text">
                          <div className="placement-mode-title">
                            {mode.charAt(0).toUpperCase() + mode.slice(1)}
                          </div>
                          <div className="placement-mode-desc">
                            {mode === "name" && "Recipient name position"}
                            {mode === "link" && "Clickable verify link area"}
                            {mode === "event" && "Event/course name (optional)"}
                            {mode === "date" && "Issue date (optional)"}
                          </div>
                        </div>
                      </label>
                    )
                  )}
                </div>
              </div>

              {/* Settings Panel - Dynamic based on placement mode */}
              <div className="editor-panel">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "var(--space-md)",
                  }}
                >
                  <h3 className="panel-title" style={{ marginBottom: 0 }}>
                    <Palette
                      size={20}
                      style={{ display: "inline", marginRight: "8px" }}
                    />
                    {placementMode.charAt(0).toUpperCase() +
                      placementMode.slice(1)}{" "}
                    Settings
                  </h3>
                  {(placementMode === "event" || placementMode === "date") &&
                    coordinates[`${placementMode}_x`] !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setCoordinates((prev) => ({
                            ...prev,
                            [`${placementMode}_x`]: null,
                            [`${placementMode}_y`]: null,
                          }));
                          setSelectedMarker(null);
                        }}
                        className="btn btn-danger-link"
                        style={{
                          fontSize: "0.875rem",
                          padding: "4px 8px",
                          color: "#ef4444",
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                        title={`Remove ${placementMode} from template`}
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    )}
                </div>

                {/* Font Size */}
                <div
                  className="input-group"
                  style={{ marginBottom: "var(--space-md)" }}
                >
                  <label className="input-label">Font Size (px)</label>
                  <input
                    type="number"
                    value={
                      placementMode === "name"
                        ? coordinates.name_font_size
                        : placementMode === "event"
                        ? coordinates.event_font_size
                        : placementMode === "date"
                        ? coordinates.date_font_size
                        : coordinates.link_font_size
                    }
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 12;
                      setCoordinates((prev) => ({
                        ...prev,
                        [`${placementMode}_font_size`]: val,
                      }));
                    }}
                    className="input"
                    min={8}
                    max={500}
                  />
                </div>

                {/* Alignment */}
                <div
                  className="input-group"
                  style={{ marginBottom: "var(--space-md)" }}
                >
                  <label className="input-label">Alignment</label>
                  <select
                    value={
                      placementMode === "name"
                        ? coordinates.name_alignment
                        : placementMode === "event"
                        ? coordinates.event_alignment
                        : placementMode === "date"
                        ? coordinates.date_alignment
                        : coordinates.link_alignment
                    }
                    onChange={(e) => {
                      setCoordinates((prev) => ({
                        ...prev,
                        [`${placementMode}_alignment`]: e.target.value as "left" | "center" | "right",
                      }));
                    }}
                    className="select"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>

                {/* Dimensions */}
                <div className="coordinate-input-group">
                  <div className="input-group">
                    <label className="input-label">Width</label>
                    <input
                      type="number"
                      value={
                        placementMode === "name"
                          ? coordinates.name_width
                          : placementMode === "event"
                          ? coordinates.event_width
                          : placementMode === "date"
                          ? coordinates.date_width
                          : coordinates.link_width
                      }
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 100;
                        setCoordinates((prev) => ({
                          ...prev,
                          [`${placementMode}_width`]: val,
                        }));
                      }}
                      className="input coordinate-input"
                      min={20}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Height</label>
                    <input
                      type="number"
                      value={
                        placementMode === "name"
                          ? coordinates.name_height
                          : placementMode === "event"
                          ? coordinates.event_height
                          : placementMode === "date"
                          ? coordinates.date_height
                          : coordinates.link_height
                      }
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 20;
                        setCoordinates((prev) => ({
                          ...prev,
                          [`${placementMode}_height`]: val,
                        }));
                      }}
                      className="input coordinate-input"
                      min={10}
                    />
                  </div>
                </div>

                {/* Name Preview helper */}
                {placementMode === "name" && (
                  <div
                    className="input-group"
                    style={{ marginTop: "var(--space-md)" }}
                  >
                    <label className="input-label">Preview Text</label>
                    <input
                      type="text"
                      value={previewName}
                      onChange={(e) => setPreviewName(e.target.value)}
                      className="input"
                      placeholder="Enter sample name"
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div
                className="form-actions"
                style={{ marginTop: "auto", borderTop: "none", paddingTop: 0 }}
              >
                <Link
                  href="/admin/templates"
                  className="btn btn-secondary w-full"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  disabled={isLoading || isUploading || !imageUrl}
                >
                  {isLoading ? (
                    "Saving..."
                  ) : (
                    <>
                      <Save size={16} /> Save Template
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
