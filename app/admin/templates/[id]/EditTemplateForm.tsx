"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateTemplate, uploadTemplateFont } from "@/app/actions/templates";
import type { Template, Placeholder } from "@/lib/types/database";
import {
  ArrowLeft,
  Info,
  Save,
  Trash2,
  AlertCircle,
  Bold,
  Italic,
  Underline,
  Plus,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import "../templates.css";

type PlacementMode = "link" | "name" | "event" | "date" | `custom-${string}`;

const DEFAULT_TEXT_COLOR = "#000000";
const HEX_COLOR_REGEX = /^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/i;
const COLOR_SWATCHES = [
  "#000000",
  "#1F2937",
  "#374151",
  "#6B7280",
  "#9CA3AF",
  "#FFFFFF",
  "#7F1D1D",
  "#DC2626",
  "#F97316",
  "#F59E0B",
  "#EAB308",
  "#15803D",
  "#22C55E",
  "#0F766E",
  "#14B8A6",
  "#0891B2",
  "#0EA5E9",
  "#2563EB",
  "#4F46E5",
  "#7C3AED",
  "#A21CAF",
  "#DB2777",
  "#BE123C",
  "#92400E",
];

const normalizeHexColor = (value: string | null | undefined): string => {
  if (!value) return DEFAULT_TEXT_COLOR;

  const normalized = value.trim();
  if (!HEX_COLOR_REGEX.test(normalized)) return DEFAULT_TEXT_COLOR;

  const upper = normalized.toUpperCase();
  if (upper.length === 4) {
    return `#${upper[1]}${upper[1]}${upper[2]}${upper[2]}${upper[3]}${upper[3]}`;
  }

  return upper;
};

const isValidHexColor = (value: string): boolean => HEX_COLOR_REGEX.test(value);

interface EditTemplateFormProps {
  template: Template;
}

export default function EditTemplateForm({ template }: EditTemplateFormProps) {
  const router = useRouter();
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [previewName, setPreviewName] = useState("John Doe");
  const [isEditingName, setIsEditingName] = useState(false);
  const [showDimensionsTooltip, setShowDimensionsTooltip] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [templateName, setTemplateName] = useState(template.name);
  const [placementMode, setPlacementMode] = useState<PlacementMode>("name");
  const [selectedMarker, setSelectedMarker] = useState<PlacementMode | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    coordX: number;
    coordY: number;
  } | null>(null);

  // Custom fonts state
  const [customFonts, setCustomFonts] = useState<string[]>(
    template.custom_fonts || []
  );
  const [customFontFiles, setCustomFontFiles] = useState<Record<string, string>>(
    template.custom_font_files || {}
  );
  const [newFontName, setNewFontName] = useState("");
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [isUploadingFont, setIsUploadingFont] = useState(false);

  // Custom placeholders state
  const [customPlaceholders, setCustomPlaceholders] = useState<Placeholder[]>(
    (template.placeholders || []).map((placeholder) => ({
      ...placeholder,
      color: normalizeHexColor(placeholder.color),
    }))
  );
  const [showAddPlaceholder, setShowAddPlaceholder] = useState(false);
  const [showAddFont, setShowAddFont] = useState(false);
  const [newPlaceholderKey, setNewPlaceholderKey] = useState("");
  const [newPlaceholderLabel, setNewPlaceholderLabel] = useState("");

  // Inject uploaded custom fonts for accurate on-canvas preview.
  useEffect(() => {
    const styleId = "template-custom-font-face";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    const css = Object.entries(customFontFiles)
      .filter(([, url]) => Boolean(url))
      .map(([family, url]) => {
        const escapedFamily = family.replace(/"/g, '\\"');
        // Support both OTF and TTF formats - browser will choose the appropriate one
        return `@font-face { font-family: "${escapedFamily}"; src: url("${url}") format("opentype"), url("${url}") format("truetype"); font-display: swap; }`;
      })
      .join("\n");

    styleEl.textContent = css;

    return () => {
      // Keep the style node for subsequent updates in this editor session.
    };
  }, [customFontFiles]);

  const [coordinates, setCoordinates] = useState<{
    link_x: number;
    link_y: number;
    link_width: number;
    link_height: number;
    link_font_size: number;
    link_alignment: "left" | "center" | "right";
    link_font_family: string;
    link_bold: boolean;
    link_italic: boolean;
    link_underline: boolean;
    link_color: string;
    name_x: number;
    name_y: number;
    name_width: number;
    name_height: number;
    name_font_size: number;
    name_alignment: "left" | "center" | "right";
    name_font_family: string;
    name_bold: boolean;
    name_italic: boolean;
    name_underline: boolean;
    name_color: string;
    event_x: number | null;
    event_y: number | null;
    event_width: number;
    event_height: number;
    event_font_size: number | null;
    event_alignment: "left" | "center" | "right";
    event_font_family: string | null;
    event_bold: boolean;
    event_italic: boolean;
    event_underline: boolean;
    event_color: string;
    date_x: number | null;
    date_y: number | null;
    date_width: number;
    date_height: number;
    date_font_size: number | null;
    date_alignment: "left" | "center" | "right";
    date_font_family: string | null;
    date_bold: boolean;
    date_italic: boolean;
    date_underline: boolean;
    date_color: string;
  }>({
    link_x: template.link_x,
    link_y: template.link_y,
    link_width: template.link_width,
    link_height: template.link_height,
    link_font_size: template.link_font_size || 12,
    link_alignment: template.link_alignment || "center",
    link_font_family: template.link_font_family || "sans-serif",
    link_bold: template.link_bold ?? false,
    link_italic: template.link_italic ?? false,
    link_underline: template.link_underline ?? true,
    link_color: normalizeHexColor(template.link_color),
    name_x: template.name_x,
    name_y: template.name_y,
    name_width: template.name_width || 600,
    name_height: template.name_height || 80,
    name_font_size: template.name_font_size,
    name_alignment: template.name_alignment,
    name_font_family: template.name_font_family || "serif",
    name_bold: template.name_bold ?? true,
    name_italic: template.name_italic ?? false,
    name_underline: template.name_underline ?? false,
    name_color: normalizeHexColor(template.name_color),
    event_x: template.event_x,
    event_y: template.event_y,
    event_width: template.event_width || 400,
    event_height: template.event_height || 60,
    event_font_size: template.event_font_size ?? 24,
    event_alignment: template.event_alignment || "center",
    event_font_family: template.event_font_family || "sans-serif",
    event_bold: template.event_bold ?? false,
    event_italic: template.event_italic ?? false,
    event_underline: template.event_underline ?? false,
    event_color: normalizeHexColor(template.event_color),
    date_x: template.date_x,
    date_y: template.date_y,
    date_width: template.date_width || 300,
    date_height: template.date_height || 40,
    date_font_size: template.date_font_size ?? 18,
    date_alignment: template.date_alignment || "center",
    date_font_family: template.date_font_family || "sans-serif",
    date_bold: template.date_bold ?? false,
    date_italic: template.date_italic ?? false,
    date_underline: template.date_underline ?? false,
    date_color: normalizeHexColor(template.date_color),
  });

  // ============ UNIFIED COORDINATE HELPERS ============
  // These abstract the storage differences between built-in (coordinates object) and custom (array) placeholders

  const getMarkerCoords = useCallback(
    (mode: PlacementMode): { x: number; y: number } | null => {
      if (typeof mode === "string" && mode.startsWith("custom-")) {
        const idx = parseInt(mode.split("-")[1]);
        const p = customPlaceholders[idx];
        return p ? { x: p.x, y: p.y } : null;
      }
      switch (mode) {
        case "link":
          return { x: coordinates.link_x, y: coordinates.link_y };
        case "name":
          return { x: coordinates.name_x, y: coordinates.name_y };
        case "event":
          return coordinates.event_x !== null && coordinates.event_y !== null
            ? { x: coordinates.event_x, y: coordinates.event_y }
            : null;
        case "date":
          return coordinates.date_x !== null && coordinates.date_y !== null
            ? { x: coordinates.date_x, y: coordinates.date_y }
            : null;
        default:
          return null;
      }
    },
    [coordinates, customPlaceholders]
  );

  const updateMarkerCoords = useCallback(
    (mode: PlacementMode, x: number, y: number) => {
      // Clamp to image bounds
      const clampedX = Math.max(0, Math.min(template.image_width, x));
      const clampedY = Math.max(0, Math.min(template.image_height, y));

      if (typeof mode === "string" && mode.startsWith("custom-")) {
        const idx = parseInt(mode.split("-")[1]);
        setCustomPlaceholders((prev) => {
          const updated = [...prev];
          if (updated[idx]) {
            updated[idx] = { ...updated[idx], x: clampedX, y: clampedY };
          }
          return updated;
        });
        return;
      }
      setCoordinates((prev) => {
        switch (mode) {
          case "link":
            return { ...prev, link_x: clampedX, link_y: clampedY };
          case "name":
            return { ...prev, name_x: clampedX, name_y: clampedY };
          case "event":
            return { ...prev, event_x: clampedX, event_y: clampedY };
          case "date":
            return { ...prev, date_x: clampedX, date_y: clampedY };
          default:
            return prev;
        }
      });
    },
    [template.image_width, template.image_height]
  );

  // Handle keyboard navigation for selected marker (unified for all marker types)
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

      // Unified: get current coords, apply delta, update
      const current = getMarkerCoords(selectedMarker);
      if (!current) return;
      updateMarkerCoords(selectedMarker, current.x + dx, current.y + dy);
    },
    [selectedMarker, getMarkerCoords, updateMarkerCoords]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Focus and select template name input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameBlur = async () => {
    setIsEditingName(false);
    // Auto-save when unfocused
    if (templateName.trim() !== template.name && templateName.trim()) {
      setIsLoading(true);
      try {
        const result = await updateTemplate(template.id, {
          name: templateName,
          custom_fonts: customFonts,
          custom_font_files: customFontFiles,
          placeholders: customPlaceholders,
          ...coordinates,
        });

        if (result.success) {
          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
        } else {
          setError(result.error || "Failed to update template name");
          // Revert on error
          setTemplateName(template.name);
        }
      } catch {
        setError("An unexpected error occurred");
        setTemplateName(template.name);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNameBlur();
    } else if (e.key === "Escape") {
      setTemplateName(template.name);
      setIsEditingName(false);
    }
  };

  // Start dragging a marker (unified for all marker types)
  const handleMarkerMouseDown = (e: React.MouseEvent, mode: PlacementMode) => {
    e.stopPropagation();
    setSelectedMarker(mode);
    setPlacementMode(mode);
    setIsDragging(true);

    // Unified: get current coords for any marker type
    const current = getMarkerCoords(mode);
    const coordX = current?.x ?? 0;
    const coordY = current?.y ?? 0;

    dragStartRef.current = { x: e.clientX, y: e.clientY, coordX, coordY };
  };

  // Handle mouse move during drag (unified for all marker types)
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (
        !isDragging ||
        !dragStartRef.current ||
        !imageRef.current ||
        !selectedMarker
      )
        return;

      const rect = imageRef.current.getBoundingClientRect();
      const scaleX = template.image_width / rect.width;
      const scaleY = template.image_height / rect.height;

      const deltaX = (e.clientX - dragStartRef.current.x) * scaleX;
      const deltaY = (e.clientY - dragStartRef.current.y) * scaleY;

      const newX = Math.round(dragStartRef.current.coordX + deltaX);
      const newY = Math.round(dragStartRef.current.coordY + deltaY);

      // Unified: update any marker type
      updateMarkerCoords(selectedMarker, newX, newY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isDragging,
    selectedMarker,
    template.image_width,
    template.image_height,
    updateMarkerCoords,
  ]);

  // Handle click on canvas to place marker (unified for all marker types)
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;

    // If clicking on the canvas (not a marker), deselect and place new marker
    if ((e.target as HTMLElement).tagName === "IMG") {
      setSelectedMarker(null);
    }

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = template.image_width / rect.width;
    const scaleY = template.image_height / rect.height;

    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    // Unified: update any marker type
    updateMarkerCoords(placementMode, x, y);
  };

  const getMarkerPosition = (x: number | null, y: number | null) => {
    if (x === null || y === null || !imageRef.current)
      return { left: 0, top: 0 };

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = rect.width / template.image_width;
    const scaleY = rect.height / template.image_height;

    return {
      left: x * scaleX,
      top: y * scaleY,
    };
  };

  const getScaledFontSize = (fontSize: number) => {
    if (!imageRef.current) return fontSize;
    const rect = imageRef.current.getBoundingClientRect();
    const scale = rect.width / template.image_width;
    return Math.max(8, fontSize * scale);
  };

  const getActiveTextColor = useCallback((): string => {
    if (
      typeof placementMode === "string" &&
      placementMode.startsWith("custom-")
    ) {
      const idx = parseInt(placementMode.split("-")[1]);
      return normalizeHexColor(customPlaceholders[idx]?.color);
    }

    if (placementMode === "name") return normalizeHexColor(coordinates.name_color);
    if (placementMode === "event") return normalizeHexColor(coordinates.event_color);
    if (placementMode === "date") return normalizeHexColor(coordinates.date_color);
    return normalizeHexColor(coordinates.link_color);
  }, [coordinates, customPlaceholders, placementMode]);

  const [hexInputValue, setHexInputValue] = useState(getActiveTextColor());

  useEffect(() => {
    setHexInputValue(getActiveTextColor());
  }, [getActiveTextColor]);

  const setActiveTextColor = useCallback(
    (colorValue: string) => {
      const normalizedColor = normalizeHexColor(colorValue);

      if (
        typeof placementMode === "string" &&
        placementMode.startsWith("custom-")
      ) {
        const idx = parseInt(placementMode.split("-")[1]);
        setCustomPlaceholders((prev) => {
          const updated = [...prev];
          if (updated[idx]) {
            updated[idx] = { ...updated[idx], color: normalizedColor };
          }
          return updated;
        });
        return;
      }

      setCoordinates((prev) => {
        if (placementMode === "name") return { ...prev, name_color: normalizedColor };
        if (placementMode === "event") return { ...prev, event_color: normalizedColor };
        if (placementMode === "date") return { ...prev, date_color: normalizedColor };
        return { ...prev, link_color: normalizedColor };
      });
    },
    [placementMode]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await updateTemplate(template.id, {
        name: templateName,
        custom_fonts: customFonts,
        custom_font_files: customFontFiles,
        placeholders: customPlaceholders,
        ...coordinates,
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error || "Failed to update template");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const inferFontNameFromFile = (fileName: string): string => {
    const base = fileName.replace(/\.[^/.]+$/, "").trim();
    if (!base) return "";

    return base
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const handleFontUpload = async () => {
    if (!fontFile) {
      setError("Please select an OTF or TTF file.");
      return;
    }

    const fontName = newFontName.trim() || inferFontNameFromFile(fontFile.name);
    if (!fontName) {
      setError("Please provide a font name.");
      return;
    }

    setIsUploadingFont(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", fontFile);
      formData.append("fontName", fontName);

      const result = await uploadTemplateFont(formData);

      if (!result.success || !result.fontName || !result.url) {
        setError(result.error || "Font upload failed.");
        return;
      }

      if (!customFonts.includes(result.fontName)) {
        setCustomFonts((prev) => [...prev, result.fontName!]);
      }
      setCustomFontFiles((prev) => ({
        ...prev,
        [result.fontName!]: result.url!,
      }));

      setNewFontName("");
      setFontFile(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch {
      setError("Failed to upload custom font.");
    } finally {
      setIsUploadingFont(false);
    }
  };

  return (
    <div className="template-form-container">
      <div className="page-header">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-md)",
            marginBottom: "var(--space-md)",
          }}
        >
          <Link
            href="/admin/templates"
            className="btn btn-secondary btn-sm"
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <ArrowLeft size={16} />
            Back
          </Link>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            Edit Template
          </h1>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-md)",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-md)",
              flex: 1,
            }}
          >
            {isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={handleNameKeyDown}
                style={{
                  fontSize: "1rem",
                  fontWeight: "500",
                  padding: "0.5rem 0.75rem",
                  border: "2px solid var(--accent-primary)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  fontFamily: "inherit",
                  maxWidth: "400px",
                }}
              />
            ) : (
              <h2
                onClick={() => setIsEditingName(true)}
                style={{
                  fontSize: "1rem",
                  fontWeight: "500",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-md)",
                  transition: "background-color var(--transition-base)",
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--bg-tertiary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
                title="Click to edit template name"
              >
                {templateName}
              </h2>
            )}

            <div style={{ position: "relative", display: "inline-block" }}>
              <button
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0.25rem",
                  color: "var(--text-muted)",
                  transition: "color var(--transition-base)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--accent-primary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--text-muted)")
                }
                onMouseOver={() => setShowDimensionsTooltip(true)}
                onMouseOut={() => setShowDimensionsTooltip(false)}
                title="Image dimensions"
              >
                <Info size={18} />
              </button>
              {showDimensionsTooltip && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.875rem",
                    whiteSpace: "nowrap",
                    border: "1px solid var(--border-primary)",
                    zIndex: 10,
                    marginBottom: "0.5rem",
                  }}
                >
                  {template.image_width} × {template.image_height} px
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            form="template-edit-form"
            className="btn btn-primary btn-sm"
            disabled={isLoading}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              whiteSpace: "nowrap",
            }}
          >
            <Save size={16} />
            {isLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="login-error"
          style={{ marginBottom: "var(--space-lg)" }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-md)",
            color: "var(--accent-success)",
            marginBottom: "var(--space-lg)",
            textAlign: "center",
          }}
        >
          ✓ Template saved successfully!
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        id="template-edit-form"
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      >
        {/* Toolbar */}
        <div
          className="editor-toolbar"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-md)",
            padding: "var(--space-sm) var(--space-md)",
            background: "var(--bg-card)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-lg)",
            marginBottom: "var(--space-md)",
            flexWrap: "wrap",
          }}
        >
          {/* Font Family */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-xs)",
            }}
          >
            <select
              value={
                typeof placementMode === "string" &&
                placementMode.startsWith("custom-")
                  ? customPlaceholders[parseInt(placementMode.split("-")[1])]
                      ?.fontFamily || "sans-serif"
                  : placementMode === "name"
                  ? coordinates.name_font_family
                  : placementMode === "event"
                  ? coordinates.event_font_family || "sans-serif"
                  : placementMode === "date"
                  ? coordinates.date_font_family || "sans-serif"
                  : coordinates.link_font_family
              }
              onChange={(e) => {
                if (
                  typeof placementMode === "string" &&
                  placementMode.startsWith("custom-")
                ) {
                  const idx = parseInt(placementMode.split("-")[1]);
                  setCustomPlaceholders((prev) => {
                    const updated = [...prev];
                    updated[idx] = {
                      ...updated[idx],
                      fontFamily: e.target.value,
                    };
                    return updated;
                  });
                } else {
                  setCoordinates((prev) => ({
                    ...prev,
                    [`${placementMode}_font_family`]: e.target.value,
                  }));
                }
              }}
              className="select"
              style={{ width: "160px", padding: "0.25rem 0.5rem" }}
            >
              <optgroup label="Standard Fonts">
                <option value="serif" style={{ fontFamily: "serif" }}>
                  Serif
                </option>
                <option value="sans-serif" style={{ fontFamily: "sans-serif" }}>
                  Sans-serif
                </option>
              </optgroup>
              <optgroup label="Google Fonts">
                <option value="Montserrat, sans-serif">Montserrat</option>
                <option value="Inter, sans-serif">Inter</option>
                {customFonts.map((font, idx) => (
                  <option key={idx} value={`${font}, sans-serif`}>
                    {font}
                  </option>
                ))}
              </optgroup>
              <optgroup label="System Fonts">
                <option
                  value="Georgia, serif"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  Georgia
                </option>
                <option
                  value="Times New Roman, serif"
                  style={{ fontFamily: "Times New Roman, serif" }}
                >
                  Times New Roman
                </option>
                <option
                  value="Arial, sans-serif"
                  style={{ fontFamily: "Arial, sans-serif" }}
                >
                  Arial
                </option>
                <option
                  value="Verdana, sans-serif"
                  style={{ fontFamily: "Verdana, sans-serif" }}
                >
                  Verdana
                </option>
                <option
                  value="Courier New, monospace"
                  style={{ fontFamily: "Courier New, monospace" }}
                >
                  Courier New
                </option>
              </optgroup>
            </select>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAddFont(!showAddFont)}
              style={{
                padding: "0.25rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "36px",
                width: "36px",
              }}
              title="Add custom font family or upload OTF/TTF"
            >
              <Plus size={16} />
            </button>
          </div>

          <div
            style={{
              width: "1px",
              height: "24px",
              backgroundColor: "var(--border-primary)",
            }}
          />

          {/* Font Size */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-xs)",
            }}
          >
            <input
              type="number"
              value={(() => {
                const val =
                  typeof placementMode === "string" &&
                  placementMode.startsWith("custom-")
                    ? customPlaceholders[parseInt(placementMode.split("-")[1])]
                        ?.fontSize
                    : placementMode === "name"
                    ? coordinates.name_font_size
                    : placementMode === "event"
                    ? coordinates.event_font_size
                    : placementMode === "date"
                    ? coordinates.date_font_size
                    : coordinates.link_font_size;
                return val === null || val === undefined || Number.isNaN(val)
                  ? ""
                  : val;
              })()}
              onChange={(e) => {
                const rawVal = e.target.value;
                const val = rawVal === "" ? NaN : parseInt(rawVal);

                if (
                  typeof placementMode === "string" &&
                  placementMode.startsWith("custom-")
                ) {
                  const idx = parseInt(placementMode.split("-")[1]);
                  setCustomPlaceholders((prev) => {
                    const updated = [...prev];
                    updated[idx] = { ...updated[idx], fontSize: val };
                    return updated;
                  });
                } else {
                  setCoordinates((prev) => ({
                    ...prev,
                    [`${placementMode}_font_size`]: val,
                  }));
                }
              }}
              onBlur={(e) => {
                const currentVal = parseInt(e.target.value);
                const defaultVal = 12;
                if (Number.isNaN(currentVal) || currentVal < 1) {
                  if (
                    typeof placementMode === "string" &&
                    placementMode.startsWith("custom-")
                  ) {
                    const idx = parseInt(placementMode.split("-")[1]);
                    setCustomPlaceholders((prev) => {
                      const updated = [...prev];
                      updated[idx] = { ...updated[idx], fontSize: defaultVal };
                      return updated;
                    });
                  } else {
                    setCoordinates((prev) => ({
                      ...prev,
                      [`${placementMode}_font_size`]: defaultVal,
                    }));
                  }
                }
              }}
              className="input"
              style={{ width: "60px", padding: "0.25rem 0.5rem" }}
              min={8}
              max={200}
            />
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
              px
            </span>
          </div>

          <div
            style={{
              width: "1px",
              height: "24px",
              backgroundColor: "var(--border-primary)",
            }}
          />

          {/* Style Controls */}
          <div style={{ display: "flex", gap: "2px" }}>
            <button
              type="button"
              className={`btn-style-toggle ${
                (
                  typeof placementMode === "string" &&
                  placementMode.startsWith("custom-")
                    ? customPlaceholders[parseInt(placementMode.split("-")[1])]
                        ?.bold
                    : placementMode === "name"
                    ? coordinates.name_bold
                    : placementMode === "event"
                    ? coordinates.event_bold
                    : placementMode === "date"
                    ? coordinates.date_bold
                    : coordinates.link_bold
                )
                  ? "active"
                  : ""
              }`}
              onClick={() => {
                if (
                  typeof placementMode === "string" &&
                  placementMode.startsWith("custom-")
                ) {
                  const idx = parseInt(placementMode.split("-")[1]);
                  setCustomPlaceholders((prev) => {
                    const updated = [...prev];
                    updated[idx] = {
                      ...updated[idx],
                      bold: !updated[idx].bold,
                    };
                    return updated;
                  });
                } else {
                  setCoordinates((prev) => ({
                    ...prev,
                    [`${placementMode}_bold`]:
                      !prev[`${placementMode}_bold` as keyof typeof prev],
                  }));
                }
              }}
              title="Bold"
              style={{ padding: "0.4rem" }}
            >
              <Bold size={16} />
            </button>
            <button
              type="button"
              className={`btn-style-toggle ${
                (
                  typeof placementMode === "string" &&
                  placementMode.startsWith("custom-")
                    ? customPlaceholders[parseInt(placementMode.split("-")[1])]
                        ?.italic
                    : placementMode === "name"
                    ? coordinates.name_italic
                    : placementMode === "event"
                    ? coordinates.event_italic
                    : placementMode === "date"
                    ? coordinates.date_italic
                    : coordinates.link_italic
                )
                  ? "active"
                  : ""
              }`}
              onClick={() => {
                if (
                  typeof placementMode === "string" &&
                  placementMode.startsWith("custom-")
                ) {
                  const idx = parseInt(placementMode.split("-")[1]);
                  setCustomPlaceholders((prev) => {
                    const updated = [...prev];
                    updated[idx] = {
                      ...updated[idx],
                      italic: !updated[idx].italic,
                    };
                    return updated;
                  });
                } else {
                  setCoordinates((prev) => ({
                    ...prev,
                    [`${placementMode}_italic`]:
                      !prev[`${placementMode}_italic` as keyof typeof prev],
                  }));
                }
              }}
              title="Italic"
              style={{ padding: "0.4rem" }}
            >
              <Italic size={16} />
            </button>
            <button
              type="button"
              className={`btn-style-toggle ${
                (
                  typeof placementMode === "string" &&
                  placementMode.startsWith("custom-")
                    ? customPlaceholders[parseInt(placementMode.split("-")[1])]
                        ?.underline
                    : placementMode === "name"
                    ? coordinates.name_underline
                    : placementMode === "event"
                    ? coordinates.event_underline
                    : placementMode === "date"
                    ? coordinates.date_underline
                    : coordinates.link_underline
                )
                  ? "active"
                  : ""
              }`}
              onClick={() => {
                if (
                  typeof placementMode === "string" &&
                  placementMode.startsWith("custom-")
                ) {
                  const idx = parseInt(placementMode.split("-")[1]);
                  setCustomPlaceholders((prev) => {
                    const updated = [...prev];
                    updated[idx] = {
                      ...updated[idx],
                      underline: !updated[idx].underline,
                    };
                    return updated;
                  });
                } else {
                  setCoordinates((prev) => ({
                    ...prev,
                    [`${placementMode}_underline`]:
                      !prev[`${placementMode}_underline` as keyof typeof prev],
                  }));
                }
              }}
              title="Underline"
              style={{ padding: "0.4rem" }}
            >
              <Underline size={16} />
            </button>
          </div>

          <div
            style={{
              width: "1px",
              height: "24px",
              backgroundColor: "var(--border-primary)",
            }}
          />

          {/* Alignment */}
          <div style={{ display: "flex", gap: "2px" }}>
            {[
              { val: "left", icon: AlignLeft, label: "Left" },
              { val: "center", icon: AlignCenter, label: "Center" },
              { val: "right", icon: AlignRight, label: "Right" },
            ].map(({ val, icon: Icon, label }) => {
              const currentAlign =
                typeof placementMode === "string" &&
                placementMode.startsWith("custom-")
                  ? customPlaceholders[parseInt(placementMode.split("-")[1])]
                      ?.alignment
                  : placementMode === "name"
                  ? coordinates.name_alignment
                  : placementMode === "event"
                  ? coordinates.event_alignment
                  : placementMode === "date"
                  ? coordinates.date_alignment
                  : coordinates.link_alignment;

              return (
                <button
                  key={val}
                  type="button"
                  className={`btn-style-toggle ${
                    currentAlign === val ? "active" : ""
                  }`}
                  onClick={() => {
                    if (
                      typeof placementMode === "string" &&
                      placementMode.startsWith("custom-")
                    ) {
                      const idx = parseInt(placementMode.split("-")[1]);
                      setCustomPlaceholders((prev) => {
                        const updated = [...prev];
                        updated[idx] = {
                          ...updated[idx],
                          alignment: val as "left" | "center" | "right",
                        };
                        return updated;
                      });
                    } else {
                      setCoordinates((prev) => {
                        const alignment = val as "left" | "center" | "right";
                        if (placementMode === "name") {
                          return { ...prev, name_alignment: alignment };
                        }
                        if (placementMode === "event") {
                          return { ...prev, event_alignment: alignment };
                        }
                        if (placementMode === "date") {
                          return { ...prev, date_alignment: alignment };
                        }
                        return { ...prev, link_alignment: alignment };
                      });
                    }
                  }}
                  title={`Align ${label}`}
                  style={{ padding: "0.4rem" }}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>

          <div
            style={{
              width: "1px",
              height: "24px",
              backgroundColor: "var(--border-primary)",
            }}
          />

          {/* Text Color */}
          <div className="color-toolbar-group">
            <div className="color-swatch-grid" role="group" aria-label="Color palette">
              {COLOR_SWATCHES.map((swatch) => {
                const isActive = getActiveTextColor() === swatch;
                return (
                  <button
                    key={swatch}
                    type="button"
                    className={`color-swatch ${isActive ? "active" : ""}`}
                    style={{ backgroundColor: swatch }}
                    onClick={() => {
                      setActiveTextColor(swatch);
                      setHexInputValue(swatch);
                    }}
                    title={swatch}
                    aria-label={`Select ${swatch}`}
                  />
                );
              })}
            </div>
            <input
              type="color"
              className="color-picker"
              value={getActiveTextColor()}
              onChange={(e) => {
                setActiveTextColor(e.target.value);
                setHexInputValue(normalizeHexColor(e.target.value));
              }}
              title="Choose color"
              aria-label="Choose color"
            />
            <input
              type="text"
              className="input color-hex-input"
              value={hexInputValue}
              onChange={(e) => {
                const value = e.target.value.toUpperCase();
                setHexInputValue(value);
                if (isValidHexColor(value)) {
                  setActiveTextColor(value);
                }
              }}
              onBlur={() => {
                if (isValidHexColor(hexInputValue)) {
                  const normalized = normalizeHexColor(hexInputValue);
                  setActiveTextColor(normalized);
                  setHexInputValue(normalized);
                } else {
                  setHexInputValue(getActiveTextColor());
                }
              }}
              maxLength={7}
              placeholder="#000000"
              title="Enter HEX color"
              aria-label="HEX color"
            />
          </div>

          {/* Dimensions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-xs)",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              W:
            </span>
            <input
              type="number"
              value={
                typeof placementMode === "string" &&
                placementMode.startsWith("custom-")
                  ? customPlaceholders[parseInt(placementMode.split("-")[1])]
                      ?.width
                  : placementMode === "name"
                  ? coordinates.name_width
                  : placementMode === "event"
                  ? coordinates.event_width
                  : placementMode === "date"
                  ? coordinates.date_width
                  : coordinates.link_width
              }
              onChange={(e) => {
                const val = parseInt(e.target.value) || 100;
                if (
                  typeof placementMode === "string" &&
                  placementMode.startsWith("custom-")
                ) {
                  const idx = parseInt(placementMode.split("-")[1]);
                  setCustomPlaceholders((prev) => {
                    const updated = [...prev];
                    updated[idx] = { ...updated[idx], width: val };
                    return updated;
                  });
                } else {
                  setCoordinates((prev) => ({
                    ...prev,
                    [`${placementMode}_width`]: val,
                  }));
                }
              }}
              className="input"
              style={{ width: "60px", padding: "0.25rem 0.5rem" }}
              min={20}
              title="Width (px)"
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-xs)",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              H:
            </span>
            <input
              type="number"
              value={
                typeof placementMode === "string" &&
                placementMode.startsWith("custom-")
                  ? customPlaceholders[parseInt(placementMode.split("-")[1])]
                      ?.height
                  : placementMode === "name"
                  ? coordinates.name_height
                  : placementMode === "event"
                  ? coordinates.event_height
                  : placementMode === "date"
                  ? coordinates.date_height
                  : coordinates.link_height
              }
              onChange={(e) => {
                const val = parseInt(e.target.value) || 20;
                if (
                  typeof placementMode === "string" &&
                  placementMode.startsWith("custom-")
                ) {
                  const idx = parseInt(placementMode.split("-")[1]);
                  setCustomPlaceholders((prev) => {
                    const updated = [...prev];
                    updated[idx] = { ...updated[idx], height: val };
                    return updated;
                  });
                } else {
                  setCoordinates((prev) => ({
                    ...prev,
                    [`${placementMode}_height`]: val,
                  }));
                }
              }}
              className="input"
              style={{ width: "60px", padding: "0.25rem 0.5rem" }}
              min={10}
              title="Height (px)"
            />
          </div>

          <div
            style={{
              width: "1px",
              height: "24px",
              backgroundColor: "var(--border-primary)",
              marginLeft: "auto",
              marginRight: "var(--space-xs)",
            }}
          />

          {/* Delete Button */}
          <button
            type="button"
            className="btn btn-style-toggle"
            onClick={() => {
              if (
                typeof placementMode === "string" &&
                placementMode.startsWith("custom-")
              ) {
                const idx = parseInt(placementMode.split("-")[1]);
                setCustomPlaceholders((prev) =>
                  prev.filter((_, i) => i !== idx)
                );
                setPlacementMode("name");
              } else if (placementMode === "event") {
                setCoordinates((prev) => ({
                  ...prev,
                  event_x: null,
                  event_y: null,
                }));
              } else if (placementMode === "date") {
                setCoordinates((prev) => ({
                  ...prev,
                  date_x: null,
                  date_y: null,
                }));
              }
            }}
            disabled={
              placementMode === "name" ||
              placementMode === "link" ||
              (placementMode === "event" && coordinates.event_x === null) ||
              (placementMode === "date" && coordinates.date_x === null)
            }
            title="Delete Placeholder"
            style={{
              padding: "0.4rem",
              color: "var(--accent-danger)",
              opacity:
                placementMode === "name" ||
                placementMode === "link" ||
                (placementMode === "event" && coordinates.event_x === null) ||
                (placementMode === "date" && coordinates.date_x === null)
                  ? 0.5
                  : 1,
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Add Font Dialog (Contextual) */}
        {showAddFont && (
          <div
            style={{
              background: "var(--bg-tertiary)",
              padding: "var(--space-md)",
              borderRadius: "var(--radius-md)",
              marginBottom: "var(--space-md)",
              border: "1px solid var(--border-color)",
              display: "flex",
              gap: "var(--space-xs)",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
              Add Font Family:
            </span>
            <input
              type="text"
              value={newFontName}
              onChange={(e) => setNewFontName(e.target.value)}
              placeholder="e.g., Garamond Pro"
              className="input"
              style={{ flex: 1, maxWidth: "300px" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFontName.trim()) {
                  e.preventDefault();
                  // Require file to be selected before adding font family
                  if (!fontFile) {
                    setError("Please select a font file before adding a font family.");
                    return;
                  }
                  if (!customFonts.includes(newFontName.trim())) {
                    setCustomFonts([...customFonts, newFontName.trim()]);
                  }
                  setNewFontName("");
                }
              }}
            />
            <input
              type="file"
              accept=".otf,.ttf,font/otf,font/ttf"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setFontFile(file);
                if (file && !newFontName.trim()) {
                  setNewFontName(inferFontNameFromFile(file.name));
                }
              }}
              className="input"
              style={{ maxWidth: "220px" }}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (
                  newFontName.trim() &&
                  !customFonts.includes(newFontName.trim())
                ) {
                  // Only add to custom_fonts if we have a file to upload
                  // Otherwise, user must upload the file first
                  if (fontFile) {
                    setCustomFonts([...customFonts, newFontName.trim()]);
                    setNewFontName("");
                  } else {
                    setError("Please select a font file before adding a font family.");
                  }
                }
              }}
              disabled={!newFontName.trim() || !fontFile}
              style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
            >
              <Plus size={14} /> Add & Upload
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleFontUpload}
              disabled={!fontFile || isUploadingFont}
              style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
            >
              {isUploadingFont ? "Uploading..." : "Upload OTF/TTF"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAddFont(false)}
            >
              Done
            </button>
          </div>
        )}

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
                src={template.image_url}
                alt="Template preview"
              />

              {/* Crosshair Alignment Guides (unified for all marker types) */}
              {(isDragging || selectedMarker) &&
                imageRef.current &&
                (() => {
                  const currentMode = selectedMarker;
                  if (!currentMode) return null;

                  // Unified: get coords for any marker type
                  const coords = getMarkerCoords(currentMode);
                  if (!coords) return null;

                  const { x: currentX, y: currentY } = coords;

                  const pos = getMarkerPosition(currentX, currentY);
                  if (!pos || (pos.left === 0 && pos.top === 0)) return null;

                  const containerRect =
                    imageRef.current.getBoundingClientRect();
                  const centerX = containerRect.width / 2;
                  const centerY = containerRect.height / 2;

                  // Check if near center (within 10px for snapping indicator)
                  const isNearCenterX = Math.abs(pos.left - centerX) < 10;
                  const isNearCenterY = Math.abs(pos.top - centerY) < 10;

                  return (
                    <>
                      {/* Center vertical guideline (always visible when dragging) */}
                      <div
                        className={`crosshair-center-line crosshair-center-vertical ${
                          isNearCenterX ? "active" : ""
                        }`}
                        style={{
                          left: centerX,
                          top: 0,
                          height: "100%",
                        }}
                      />
                      {/* Center horizontal guideline (always visible when dragging) */}
                      <div
                        className={`crosshair-center-line crosshair-center-horizontal ${
                          isNearCenterY ? "active" : ""
                        }`}
                        style={{
                          top: centerY,
                          left: 0,
                          width: "100%",
                        }}
                      />
                      {/* Horizontal Line (follows cursor) */}
                      <div
                        className="crosshair-line crosshair-horizontal"
                        style={{
                          top: pos.top,
                          left: 0,
                          width: "100%",
                        }}
                      />
                      {/* Vertical Line (follows cursor) */}
                      <div
                        className="crosshair-line crosshair-vertical"
                        style={{
                          left: pos.left,
                          top: 0,
                          height: "100%",
                        }}
                      />
                      {/* Position indicator */}
                      <div
                        className="crosshair-position"
                        style={{
                          left: Math.min(
                            pos.left + 10,
                            containerRect.width - 100
                          ),
                          top: Math.min(
                            pos.top + 10,
                            containerRect.height - 30
                          ),
                        }}
                      >
                        X: {currentX}, Y: {currentY}
                        {isNearCenterX && " (center)"}
                      </div>
                    </>
                  );
                })()}

              {/* Link Marker */}
              <div
                className={`coordinate-marker marker-link ${
                  selectedMarker === "link" ? "selected" : ""
                } ${isDragging && selectedMarker === "link" ? "dragging" : ""}`}
                style={{
                  ...getMarkerPosition(coordinates.link_x, coordinates.link_y),
                  width:
                    coordinates.link_width *
                    (imageRef.current
                      ? imageRef.current.getBoundingClientRect().width /
                        template.image_width
                      : 1),
                  height:
                    coordinates.link_height *
                    (imageRef.current
                      ? imageRef.current.getBoundingClientRect().height /
                        template.image_height
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
                    isDragging && selectedMarker === "name" ? "dragging" : ""
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
                          template.image_width
                        : 1),
                    height:
                      coordinates.name_height *
                      (imageRef.current
                        ? imageRef.current.getBoundingClientRect().height /
                          template.image_height
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
                    color: coordinates.name_color,
                    fontWeight: coordinates.name_bold ? "bold" : "normal",
                    fontStyle: coordinates.name_italic ? "italic" : "normal",
                    textDecoration: coordinates.name_underline
                      ? "underline"
                      : "none",
                    fontFamily: coordinates.name_font_family,
                    textShadow: "0 0 4px rgba(255,255,255,0.8)",
                    whiteSpace: "nowrap",
                    cursor: "grab",
                    pointerEvents: "auto",
                    border: "1px dashed rgba(0,0,0,0.1)",
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
                  {previewName}
                </div>
              ) : (
                <div
                  className={`coordinate-marker marker-name ${
                    selectedMarker === "name" ? "selected" : ""
                  } ${
                    isDragging && selectedMarker === "name" ? "dragging" : ""
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
                      isDragging && selectedMarker === "event" ? "dragging" : ""
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
                            template.image_width
                          : 1),
                      height:
                        coordinates.event_height *
                        (imageRef.current
                          ? imageRef.current.getBoundingClientRect().height /
                            template.image_height
                          : 1),
                      fontSize: `${getScaledFontSize(
                        coordinates.event_font_size ?? 24
                      )}px`,
                      textAlign: coordinates.event_alignment,
                      transform:
                        coordinates.event_alignment === "center"
                          ? "translate(-50%, -50%)"
                          : coordinates.event_alignment === "right"
                          ? "translate(-100%, -50%)"
                          : "translate(0%, -50%)",
                      color: coordinates.event_color,
                      fontWeight: coordinates.event_bold ? "bold" : "normal",
                      fontStyle: coordinates.event_italic ? "italic" : "normal",
                      textDecoration: coordinates.event_underline
                        ? "underline"
                        : "none",
                      fontFamily: coordinates.event_font_family || "sans-serif",
                      textShadow: "0 0 4px rgba(255,255,255,0.8)",
                      whiteSpace: "nowrap",
                      cursor: "grab",
                      pointerEvents: "auto",
                      border: "1px dashed rgba(0,0,0,0.1)",
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
                    Sample Event Name
                  </div>
                ) : (
                  <div
                    className={`coordinate-marker marker-event ${
                      selectedMarker === "event" ? "selected" : ""
                    } ${
                      isDragging && selectedMarker === "event" ? "dragging" : ""
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
                      isDragging && selectedMarker === "date" ? "dragging" : ""
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
                            template.image_width
                          : 1),
                      height:
                        coordinates.date_height *
                        (imageRef.current
                          ? imageRef.current.getBoundingClientRect().height /
                            template.image_height
                          : 1),
                      fontSize: `${getScaledFontSize(
                        coordinates.date_font_size ?? 18
                      )}px`,
                      textAlign: coordinates.date_alignment,
                      transform:
                        coordinates.date_alignment === "center"
                          ? "translate(-50%, -50%)"
                          : coordinates.date_alignment === "right"
                          ? "translate(-100%, -50%)"
                          : "translate(0%, -50%)",
                      color: coordinates.date_color,
                      fontWeight: coordinates.date_bold ? "bold" : "normal",
                      fontStyle: coordinates.date_italic ? "italic" : "normal",
                      textDecoration: coordinates.date_underline
                        ? "underline"
                        : "none",
                      fontFamily: coordinates.date_font_family || "sans-serif",
                      textShadow: "0 0 4px rgba(255,255,255,0.8)",
                      whiteSpace: "nowrap",
                      cursor: "grab",
                      pointerEvents: "auto",
                      border: "1px dashed rgba(0,0,0,0.1)",
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
                    January 7, 2026
                  </div>
                ) : (
                  <div
                    className={`coordinate-marker marker-date ${
                      selectedMarker === "date" ? "selected" : ""
                    } ${
                      isDragging && selectedMarker === "date" ? "dragging" : ""
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

              {/* Custom Placeholder Markers */}
              {customPlaceholders.map((placeholder, idx) =>
                showPreview ? (
                  <div
                    key={`custom-${idx}`}
                    className={`text-preview-marker ${
                      selectedMarker === `custom-${idx}` ? "selected" : ""
                    } ${
                      isDragging && selectedMarker === `custom-${idx}`
                        ? "dragging"
                        : ""
                    }`}
                    style={{
                      ...getMarkerPosition(placeholder.x, placeholder.y),
                      width:
                        placeholder.width *
                        (imageRef.current
                          ? imageRef.current.getBoundingClientRect().width /
                            template.image_width
                          : 1),
                      height:
                        placeholder.height *
                        (imageRef.current
                          ? imageRef.current.getBoundingClientRect().height /
                            template.image_height
                          : 1),
                      fontSize: getScaledFontSize(placeholder.fontSize),
                      fontFamily: placeholder.fontFamily,
                      textAlign: placeholder.alignment as
                        | "left"
                        | "center"
                        | "right",
                      // Unified: same transform logic as built-in placeholders
                      transform:
                        placeholder.alignment === "center"
                          ? "translate(-50%, -50%)"
                          : placeholder.alignment === "right"
                          ? "translate(-100%, -50%)"
                          : "translate(0%, -50%)",
                      color: normalizeHexColor(placeholder.color),
                      fontWeight: placeholder.bold ? "bold" : "normal",
                      fontStyle: placeholder.italic ? "italic" : "normal",
                      textDecoration: placeholder.underline
                        ? "underline"
                        : "none",
                      textShadow: "0 0 4px rgba(255,255,255,0.8)",
                      whiteSpace: "nowrap",
                      cursor: "grab",
                      pointerEvents: "auto",
                      border: "1px dashed rgba(0,0,0,0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent:
                        placeholder.alignment === "center"
                          ? "center"
                          : placeholder.alignment === "right"
                          ? "flex-end"
                          : "flex-start",
                    }}
                    onMouseDown={(e) =>
                      handleMarkerMouseDown(e, `custom-${idx}`)
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMarker(`custom-${idx}`);
                      setPlacementMode(`custom-${idx}`);
                    }}
                  >
                    [Sample {placeholder.label}]
                  </div>
                ) : (
                  <div
                    key={`custom-${idx}`}
                    className={`coordinate-marker marker-custom ${
                      selectedMarker === `custom-${idx}` ? "selected" : ""
                    } ${
                      isDragging && selectedMarker === `custom-${idx}`
                        ? "dragging"
                        : ""
                    }`}
                    style={{
                      ...getMarkerPosition(placeholder.x, placeholder.y),
                      // Unified: same transform logic as built-in markers
                      transform: "translate(-50%, -50%)",
                    }}
                    onMouseDown={(e) =>
                      handleMarkerMouseDown(e, `custom-${idx}`)
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMarker(`custom-${idx}`);
                      setPlacementMode(`custom-${idx}`);
                    }}
                  >
                    <span className="marker-label">{placeholder.label}</span>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="editor-sidebar">
            {/* Placement Mode */}
            <div className="editor-panel">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "var(--space-md)",
                }}
              >
                <h3 className="panel-title" style={{ marginBottom: 0 }}>
                  📍 Click to Place
                </h3>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowAddPlaceholder(!showAddPlaceholder)}
                  title="Add custom placeholder"
                >
                  +
                </button>
              </div>
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
                {/* Custom Placeholders */}
                {customPlaceholders.map((ph, idx) => (
                  <label
                    key={`custom-${idx}`}
                    className={`placement-mode ${
                      placementMode === `custom-${idx}` ? "active" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="placementMode"
                      checked={placementMode === `custom-${idx}`}
                      onChange={() => setPlacementMode(`custom-${idx}`)}
                    />
                    <div
                      className="placement-mode-indicator"
                      style={{
                        background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                      }}
                    />
                    <div className="placement-mode-text">
                      <div className="placement-mode-title">{ph.label}</div>
                      <div className="placement-mode-desc">
                        {ph.key}
                        {ph.isLink ? " 🔗" : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCustomPlaceholders(
                          customPlaceholders.filter((_, i) => i !== idx)
                        );
                        if (placementMode === `custom-${idx}`) {
                          setPlacementMode("name");
                        }
                      }}
                      style={{ marginLeft: "auto" }}
                      title="Delete this placeholder"
                    >
                      ✕
                    </button>
                  </label>
                ))}
              </div>

              {showAddPlaceholder && (
                <div
                  style={{
                    background: "var(--bg-tertiary)",
                    padding: "var(--space-md)",
                    borderRadius: "var(--radius-md)",
                    marginTop: "var(--space-md)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div className="input-group">
                    <label className="input-label">Placeholder Key</label>
                    <input
                      type="text"
                      value={newPlaceholderKey}
                      onChange={(e) =>
                        setNewPlaceholderKey(
                          e.target.value.toLowerCase().replace(/\s+/g, "_")
                        )
                      }
                      className="input"
                      placeholder="e.g., achievement_level"
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Label</label>
                    <input
                      type="text"
                      value={newPlaceholderLabel}
                      onChange={(e) => setNewPlaceholderLabel(e.target.value)}
                      className="input"
                      placeholder="e.g., Achievement Level"
                    />
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-xs)",
                      cursor: "pointer",
                      marginBottom: "var(--space-md)",
                    }}
                  >
                    <input
                      type="checkbox"
                      id="isLink"
                      style={{ accentColor: "var(--accent-primary)" }}
                    />
                    <span style={{ fontSize: "0.875rem" }}>Clickable link</span>
                  </label>
                  <div style={{ display: "flex", gap: "var(--space-xs)" }}>
                    <button
                      type="button"
                      className="btn btn-success flex-1"
                      onClick={() => {
                        if (
                          !newPlaceholderKey.trim() ||
                          !newPlaceholderLabel.trim()
                        )
                          return;
                        const isLink = (
                          document.getElementById("isLink") as HTMLInputElement
                        ).checked;
                        const newPlaceholder: Placeholder = {
                          key: newPlaceholderKey,
                          label: newPlaceholderLabel,
                          x: template.image_width / 2,
                          y: template.image_height * 0.7,
                          width: 300,
                          height: 60,
                          fontSize: 24,
                          fontFamily: "sans-serif",
                          alignment: "center",
                          bold: false,
                          italic: false,
                          underline: false,
                          color: DEFAULT_TEXT_COLOR,
                          isLink,
                        };
                        setCustomPlaceholders([
                          ...customPlaceholders,
                          newPlaceholder,
                        ]);
                        setNewPlaceholderKey("");
                        setNewPlaceholderLabel("");
                        setShowAddPlaceholder(false);
                        setPlacementMode(`custom-${customPlaceholders.length}`);
                      }}
                      disabled={
                        !newPlaceholderKey.trim() || !newPlaceholderLabel.trim()
                      }
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary flex-1"
                      onClick={() => {
                        setShowAddPlaceholder(false);
                        setNewPlaceholderKey("");
                        setNewPlaceholderLabel("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Name Preview helper - Moved from Settings Panel */}
            {placementMode === "name" && (
              <div className="editor-panel">
                <div className="input-group">
                  <label className="input-label">Preview Text</label>
                  <input
                    type="text"
                    value={previewName}
                    onChange={(e) => setPreviewName(e.target.value)}
                    className="input"
                    placeholder="Enter sample name"
                  />
                </div>
              </div>
            )}

            {/* Actions moved to page header */}
          </div>
        </div>
      </form>
    </div>
  );
}
