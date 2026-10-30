"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FolderOpen,
  FileText,
  Upload,
  Award,
  LayoutTemplate,
  GraduationCap,
  Download,
  CheckCircle,
  AlertTriangle,
  X,
} from "lucide-react";
import type { Template, Folder } from "@/lib/types/database";
import FolderPicker from "../FolderPicker";
import "../certificates.css";
import "./bulk-import.css";

interface BulkImportFormProps {
  templates: Template[];
  folders: Folder[];
}

interface CSVEntry {
  name: string;
  email: string;
  isValid: boolean;
  error?: string;
  [key: string]: string | boolean | undefined;
}

interface BulkResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    name: string;
    email: string;
    success: boolean;
    certificateCode?: string;
    error?: string;
  }>;
}

interface BulkCreateProgressEvent {
  type: "start" | "progress" | "complete" | "error";
  total?: number;
  current?: number;
  certificate?: {
    name: string;
    email: string;
  };
  status?: "success" | "failed";
  certificateCode?: string;
  reason?: string;
  stats?: {
    successful: number;
    failed: number;
  };
  result?: BulkResult;
}

export default function BulkImportForm({
  templates,
  folders,
}: BulkImportFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [selectedTemplateObj, setSelectedTemplateObj] =
    useState<Template | null>(null);
  const [csvData, setCsvData] = useState<CSVEntry[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [dateOfIssue, setDateOfIssue] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [creationProgress, setCreationProgress] = useState({
    current: 0,
    total: 0,
    successful: 0,
    failed: 0,
  });
  const [currentCreating, setCurrentCreating] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  // Maximum entries per bulk operation (matches backend limit)
  const BULK_CREATE_MAX_ENTRIES = 300;

  const parseCSV = useCallback((content: string): CSVEntry[] => {
    const lines = content.trim().split(/\r?\n/);
    if (lines.length < 2) {
      throw new Error("CSV must have at least a header row and one data row");
    }

    // Parse header
    const headerLine = lines[0].toLowerCase();
    const headers = headerLine
      .split(",")
      .map((h) => h.trim().replace(/["']/g, ""));

    const nameIndex = headers.findIndex((h) => h === "name" || h === "names");
    const emailIndex = headers.findIndex(
      (h) => h === "email" || h === "emails"
    );

    if (nameIndex === -1) {
      throw new Error('CSV must have a "name" or "names" column');
    }
    if (emailIndex === -1) {
      throw new Error('CSV must have an "email" or "emails" column');
    }

    // Identify custom field columns (everything except name and email)
    const customFieldIndices: { header: string; index: number }[] = [];
    headers.forEach((header, index) => {
      if (index !== nameIndex && index !== emailIndex && header) {
        customFieldIndices.push({ header, index });
      }
    });

    // Parse data rows
    const entries: CSVEntry[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Check if we've exceeded the limit before parsing further
      if (entries.length >= BULK_CREATE_MAX_ENTRIES) {
        throw new Error(`CSV contains too many entries. Maximum allowed: ${BULK_CREATE_MAX_ENTRIES}`);
      }

      // Handle quoted values with commas
      const values: string[] = [];
      let current = "";
      let inQuotes = false;

      for (const char of line) {
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const name = values[nameIndex]?.replace(/["']/g, "").trim() || "";
      const email = values[emailIndex]?.replace(/["']/g, "").trim() || "";

      // Validate field lengths
      if (name.length > 120) {
        throw new Error(`Name "${name.substring(0, 30)}..." exceeds 120 character limit`);
      }

      if (email.length > 254) {
        throw new Error(`Email exceeds 254 character limit`);
      }

      // Extract custom fields
      const customFields: Record<string, string> = {};
      customFieldIndices.forEach(({ header, index }) => {
        const value = values[index]?.replace(/["']/g, "").trim();
        if (value) {
          // Validate custom field length
          if (value.length > 500) {
            throw new Error(`Field "${header}" value exceeds 500 character limit`);
          }
          customFields[header] = value;
        }
      });

      // Validate entry
      let isValid = true;
      let entryError: string | undefined;

      if (!name) {
        isValid = false;
        entryError = "Name is required";
      } else if (!email) {
        isValid = false;
        entryError = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        isValid = false;
        entryError = "Invalid email format";
      }

      entries.push({
        name,
        email,
        isValid,
        error: entryError,
        ...customFields,
      });
    }

    return entries;
  }, [BULK_CREATE_MAX_ENTRIES]);

  const handleFileChange = useCallback((file: File) => {
    setError(null);

    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const entries = parseCSV(content);

        if (entries.length === 0) {
          setError("No valid entries found in CSV");
          return;
        }

        setCsvData(entries);
        setFileName(file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse CSV");
        setCsvData([]);
        setFileName(null);
      }
    };
    reader.onerror = () => {
      setError("Failed to read file");
    };
    reader.readAsText(file);
  }, [parseCSV]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileChange(file);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileChange(file);
    }
  }, [handleFileChange]);

  const handleRemoveFile = () => {
    setCsvData([]);
    setFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!selectedTemplate) {
      setError("Please select a template");
      setIsLoading(false);
      return;
    }

    if (!selectedFolderId) {
      setError("Please select a folder");
      setIsLoading(false);
      return;
    }

    if (csvData.length === 0) {
      setError("Please upload a CSV file");
      setIsLoading(false);
      return;
    }

    if (!eventName.trim()) {
      setError("Please enter an event name");
      setIsLoading(false);
      return;
    }

    const validEntries = csvData.filter((entry) => entry.isValid);
    if (validEntries.length === 0) {
      setError("No valid entries found in CSV");
      setIsLoading(false);
      return;
    }

    try {
      setCreationProgress({
        current: 0,
        total: validEntries.length,
        successful: 0,
        failed: 0,
      });
      setCurrentCreating(null);
      setProgressMessage("Preparing bulk creation...");

      const response = await fetch("/api/certificates/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: validEntries.map((entry) => {
            const mapped: Record<string, string> = {
              name: entry.name,
              email: entry.email,
            };

            Object.keys(entry).forEach((key) => {
              if (
                key !== "name" &&
                key !== "email" &&
                key !== "isValid" &&
                key !== "error"
              ) {
                const value = entry[key];
                if (typeof value === "string") {
                  mapped[key] = value;
                }
              }
            });

            return mapped;
          }),
          event_name: eventName.trim(),
          date_of_issue: dateOfIssue,
          template_id: selectedTemplate,
          folder_id: selectedFolderId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start bulk certificate creation");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No progress stream received");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: BulkResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;

          const event: BulkCreateProgressEvent = JSON.parse(chunk.slice(6));

          if (event.type === "start") {
            setCreationProgress((prev) => ({
              ...prev,
              total: event.total || validEntries.length,
            }));
            setProgressMessage("Starting certificate generation...");
            continue;
          }

          if (event.type === "progress") {
            setCreationProgress({
              current: event.current || 0,
              total: event.total || validEntries.length,
              successful: event.stats?.successful || 0,
              failed: event.stats?.failed || 0,
            });
            setCurrentCreating(event.certificate?.name || null);
            setProgressMessage(
              event.status === "success"
                ? `Created certificate for ${event.certificate?.name || "recipient"}`
                : `Failed for ${event.certificate?.name || "recipient"}: ${
                    event.reason || "Unknown error"
                  }`
            );
            continue;
          }

          if (event.type === "complete") {
            finalResult = event.result || null;
            setProgressMessage("Bulk certificate creation completed.");
            continue;
          }

          if (event.type === "error") {
            throw new Error(event.reason || "Bulk creation failed");
          }
        }
      }

      if (!finalResult) {
        throw new Error("Bulk creation ended without a final result");
      }

      setBulkResult(finalResult);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateMore = () => {
    setBulkResult(null);
    setCsvData([]);
    setFileName(null);
    setEventName("");
    setDateOfIssue(new Date().toISOString().split("T")[0]);
    setSelectedFolderId("");
    setSelectedTemplate(null);
    setSelectedTemplateObj(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const validCount = csvData.filter((e) => e.isValid).length;
  const invalidCount = csvData.filter((e) => !e.isValid).length;
  const progressPercent =
    creationProgress.total > 0
      ? (creationProgress.current / creationProgress.total) * 100
      : 0;

  // Success screen
  if (bulkResult) {
    return (
      <div
        className="success-overlay"
        style={{
          position: "relative",
          minHeight: "80vh",
          background: "transparent",
        }}
      >
        <div className="success-modal bulk-success-modal">
          <div
            className={`success-icon ${bulkResult.failed > 0 ? "partial" : ""}`}
          >
            {bulkResult.failed === 0 ? (
              <CheckCircle size={48} strokeWidth={2.5} />
            ) : (
              <AlertTriangle size={48} strokeWidth={2.5} />
            )}
          </div>
          <h2 className="success-title">
            {bulkResult.failed === 0
              ? "All Certificates Created!"
              : "Bulk Import Complete"}
          </h2>
          <p className="success-message">
            Successfully created {bulkResult.successful} of {bulkResult.total}{" "}
            certificates.
          </p>

          <div className="bulk-result-stats">
            <div className="result-stat success">
              <span className="stat-number">{bulkResult.successful}</span>
              <span className="stat-label">Successful</span>
            </div>
            {bulkResult.failed > 0 && (
              <div className="result-stat failed">
                <span className="stat-number">{bulkResult.failed}</span>
                <span className="stat-label">Failed</span>
              </div>
            )}
          </div>

          {bulkResult.results.length > 0 && (
            <div className="bulk-result-details">
              <h4>Created Certificates</h4>
              <div className="result-list">
                {bulkResult.results
                  .filter((r) => r.success)
                  .slice(0, 10)
                  .map((result, idx) => (
                    <div key={idx} className="result-item success">
                      <span className="result-name">{result.name}</span>
                      <code className="result-code">
                        {result.certificateCode}
                      </code>
                    </div>
                  ))}
                {bulkResult.results.filter((r) => r.success).length > 10 && (
                  <div className="result-more">
                    +{bulkResult.results.filter((r) => r.success).length - 10}{" "}
                    more...
                  </div>
                )}
              </div>
            </div>
          )}

          {bulkResult.results.filter((r) => !r.success).length > 0 && (
            <div className="bulk-result-details errors">
              <h4>Failed Entries</h4>
              <div className="result-list">
                {bulkResult.results
                  .filter((r) => !r.success)
                  .map((result, idx) => (
                    <div key={idx} className="result-item failed">
                      <span className="result-name">{result.name}</span>
                      <span className="result-error">{result.error}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="success-actions">
            <button onClick={handleCreateMore} className="btn btn-secondary">
              Import More
            </button>
            <Link href="/admin/certificates" className="btn btn-primary">
              View All Certificates
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="create-form-container bulk-form-container">
      <div className="page-header">
        <h1 className="page-title">Bulk Import Certificates</h1>
        <p className="page-subtitle">
          Import a CSV file to generate certificates in bulk
        </p>
      </div>

      <form onSubmit={handleSubmit} className="form-card">
        {error && (
          <div
            className="login-error"
            style={{ marginBottom: "var(--space-lg)" }}
          >
            {error}
          </div>
        )}

        {/* CSV Upload Section */}
        <div className="form-section">
          <h3 className="form-section-title">
            <FolderOpen size={20} /> Upload CSV File
          </h3>
          <p className="form-section-description">
            Upload a CSV file with columns: <code>name</code> (or{" "}
            <code>names</code>) and <code>email</code> (or <code>emails</code>){" "}
            {selectedTemplateObj?.placeholders &&
              selectedTemplateObj.placeholders.length > 0 && (
                <>
                  <br />
                  <span
                    style={{
                      color: "var(--accent-primary)",
                      marginTop: "0.5rem",
                      display: "inline-block",
                    }}
                  >
                    Optional custom fields:{" "}
                    <strong>
                      {selectedTemplateObj.placeholders
                        .map((p) => p.key)
                        .join(", ")}
                    </strong>
                  </span>
                </>
              )}{" "}
          </p>

          <div
            className={`csv-dropzone ${isDragging ? "dragging" : ""} ${
              fileName ? "has-file" : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !fileName && fileInputRef.current?.click()}
          >
            {fileName ? (
              <div className="file-info">
                <div className="file-icon">
                  <FileText size={32} />
                </div>
                <div className="file-details">
                  <span className="file-name">{fileName}</span>
                  <span className="file-summary">
                    {csvData.length} entries ({validCount} valid, {invalidCount}{" "}
                    invalid)
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm remove-file"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile();
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="dropzone-icon">
                  <Upload size={48} />
                </div>
                <p className="dropzone-text">
                  Drag and drop your CSV file here, or{" "}
                  <span className="dropzone-link">browse</span>
                </p>
                <p className="dropzone-hint">Supported format: .csv</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleInputChange}
              className="file-input-hidden"
            />
          </div>

          {/* Preview Table */}
          {csvData.length > 0 && (
            <div className="csv-preview">
              <h4 className="preview-title">
                Preview ({csvData.length} entries)
              </h4>
              <div className="preview-table-wrapper">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Email</th>
                      {/* Show custom field columns */}
                      {csvData.length > 0 &&
                        Object.keys(csvData[0])
                          .filter(
                            (key) =>
                              key !== "name" &&
                              key !== "email" &&
                              key !== "isValid" &&
                              key !== "error"
                          )
                          .map((key) => <th key={key}>{key}</th>)}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 10).map((entry, idx) => (
                      <tr key={idx} className={entry.isValid ? "" : "invalid"}>
                        <td>{idx + 1}</td>
                        <td>
                          {entry.name || <span className="empty-cell">—</span>}
                        </td>
                        <td>
                          {entry.email || <span className="empty-cell">—</span>}
                        </td>
                        {/* Show custom field values */}
                        {Object.keys(csvData[0])
                          .filter(
                            (key) =>
                              key !== "name" &&
                              key !== "email" &&
                              key !== "isValid" &&
                              key !== "error"
                          )
                          .map((key) => (
                            <td key={key}>
                              {(entry[key] as string) || (
                                <span className="empty-cell">—</span>
                              )}
                            </td>
                          ))}
                        <td>
                          {entry.isValid ? (
                            <span className="status-badge valid">Valid</span>
                          ) : (
                            <span
                              className="status-badge invalid"
                              title={entry.error}
                            >
                              Invalid
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvData.length > 10 && (
                <p className="preview-more">
                  Showing 10 of {csvData.length} entries
                </p>
              )}
            </div>
          )}
        </div>

        {/* Event Details */}
        <div className="form-section">
          <h3 className="form-section-title">
            <Award size={20} /> Event Details
          </h3>

          <div className="form-row">
            <div className="input-group">
              <label htmlFor="event_name" className="input-label">
                Event / Course Name *
              </label>
              <input
                id="event_name"
                name="event_name"
                type="text"
                required
                className="input"
                placeholder="Web Development Bootcamp"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label htmlFor="date_of_issue" className="input-label">
                Date of Issue
              </label>
              <input
                id="date_of_issue"
                name="date_of_issue"
                type="date"
                className="input"
                value={dateOfIssue}
                onChange={(e) => setDateOfIssue(e.target.value)}
              />
            </div>
          </div>
        </div>

        <FolderPicker
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          disabled={isLoading}
        />

        {/* Template Selection */}
        <div className="form-section">
          <h3 className="form-section-title">
            <LayoutTemplate size={20} /> Select Template
          </h3>

          {templates.length === 0 ? (
            <div className="empty-state" style={{ padding: "var(--space-lg)" }}>
              <div className="empty-icon">
                <LayoutTemplate size={48} />
              </div>
              <h3 className="empty-title">No Templates Available</h3>
              <p className="empty-description">
                Please create a template first before creating certificates.
              </p>
              <Link href="/admin/templates" className="btn btn-secondary">
                Go to Templates
              </Link>
            </div>
          ) : (
            <div className="template-select-grid">
              {templates.map((template) => (
                <label
                  key={template.id}
                  className={`template-option ${
                    selectedTemplate === template.id ? "selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="template_id"
                    value={template.id}
                    onChange={() => {
                      setSelectedTemplate(template.id);
                      setSelectedTemplateObj(template);
                    }}
                    required
                  />
                  <img
                    src={template.image_url}
                    alt={template.name}
                    className="template-option-image"
                  />
                  <div className="template-option-name">{template.name}</div>
                  <div className="template-option-check">✓</div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Summary & Actions */}
        <div className="bulk-summary">
          <div className="summary-info">
            {validCount > 0 && (
              <span className="summary-text">
                Ready to create <strong>{validCount}</strong> certificate
                {validCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {isLoading && (
          <div
            style={{
              marginBottom: "var(--space-lg)",
              padding: "1rem",
              borderRadius: "0.75rem",
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(59,130,246,0.08) 100%)",
              border: "1px solid rgba(99,102,241,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.5rem",
                fontWeight: 600,
              }}
            >
              <span>
                Creating certificates ({creationProgress.current}/
                {creationProgress.total || validCount})
              </span>
              <span>{Math.round(progressPercent)}%</span>
            </div>

            <div
              style={{
                width: "100%",
                height: "10px",
                borderRadius: "999px",
                background: "rgba(15, 23, 42, 0.2)",
                overflow: "hidden",
                marginBottom: "0.75rem",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, progressPercent))}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, rgba(34,197,94,1) 0%, rgba(59,130,246,1) 100%)",
                  transition: "width 150ms ease",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: "1rem",
                fontSize: "0.9rem",
                marginBottom: "0.5rem",
              }}
            >
              <span>
                Successful: <strong>{creationProgress.successful}</strong>
              </span>
              <span>
                Failed: <strong>{creationProgress.failed}</strong>
              </span>
            </div>

            {currentCreating && (
              <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                Currently processing: <strong>{currentCreating}</strong>
              </div>
            )}

            {progressMessage && (
              <div style={{ marginTop: "0.35rem", fontSize: "0.82rem", opacity: 0.85 }}>
                {progressMessage}
              </div>
            )}
          </div>
        )}

        <div className="form-actions">
          <Link href="/admin/certificates" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={isLoading || templates.length === 0 || validCount === 0}
          >
            {isLoading ? (
              <>
                <span
                  className="spinner"
                  style={{ width: 20, height: 20 }}
                ></span>
                Creating {validCount} Certificates...
              </>
            ) : (
              <>
                <GraduationCap size={20} /> Create {validCount} Certificate
                {validCount !== 1 ? "s" : ""}
              </>
            )}
          </button>
        </div>
      </form>

      {/* Sample CSV Download */}
      <div className="sample-csv-section">
        <h4>Need a sample CSV?</h4>
        <p>Download our template to get started quickly.</p>
        <a
          href="/sample-certificates.csv"
          download
          className="btn btn-ghost btn-sm"
        >
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Download size={16} />
            <span>Download Sample CSV</span>
          </span>
        </a>
      </div>
    </div>
  );
}
