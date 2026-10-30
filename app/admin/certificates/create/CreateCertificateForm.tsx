"use client";

import { useState } from "react";
import Link from "next/link";
import {
  User,
  Award,
  LayoutTemplate,
  Edit3,
  GraduationCap,
  CheckCircle,
} from "lucide-react";
import type {
  Template,
  Certificate,
  Folder,
  CreateCertificateInput,
} from "@/lib/types/database";
import { createCertificate } from "@/app/actions/certificates";
import FolderPicker from "../FolderPicker";
import "../certificates.css";

interface CreateCertificateFormProps {
  templates: Template[];
  folders: Folder[];
}

export default function CreateCertificateForm({
  templates,
  folders,
}: CreateCertificateFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [selectedTemplateObj, setSelectedTemplateObj] =
    useState<Template | null>(null);
  const [createdCertificate, setCreatedCertificate] =
    useState<Certificate | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    const input: CreateCertificateInput = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      event_name: formData.get("event_name") as string,
      date_of_issue: formData.get("date_of_issue") as string,
      template_id: formData.get("template_id") as string,
      folder_id: selectedFolderId,
    };

    // Add custom fields from custom placeholders
    if (selectedTemplateObj?.placeholders) {
      const customFields: Record<string, string> = {};
      selectedTemplateObj.placeholders.forEach((placeholder) => {
        const value = formData.get(`custom_${placeholder.key}`) as string;
        if (value) {
          customFields[placeholder.key] = value;
        }
      });
      if (Object.keys(customFields).length > 0) {
        input.custom_fields = customFields;
      }
    }

    if (!input.folder_id) {
      setError("Please select a folder");
      setIsLoading(false);
      return;
    }

    if (!input.template_id) {
      setError("Please select a template");
      setIsLoading(false);
      return;
    }

    try {
      const result = await createCertificate(input);

      if (result.success && result.certificate) {
        setCreatedCertificate(result.certificate);
      } else {
        setError(result.error || "Failed to create certificate");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAnother = () => {
    setCreatedCertificate(null);
    setSelectedFolderId("");
    setSelectedTemplate(null);
    setSelectedTemplateObj(null);
  };

  if (createdCertificate) {
    return (
      <div
        className="success-overlay"
        style={{
          position: "relative",
          minHeight: "80vh",
          background: "transparent",
        }}
      >
        <div className="success-modal">
          <div className="success-icon">
            <CheckCircle size={48} strokeWidth={2.5} />
          </div>
          <h2 className="success-title">Certificate Created!</h2>
          <p className="success-message">
            Certificate for {createdCertificate.name} has been created
            successfully.
          </p>
          <div className="success-code">
            {createdCertificate.certificate_code}
          </div>
          <div className="success-actions">
            <button onClick={handleCreateAnother} className="btn btn-secondary">
              Create Another
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
    <div className="create-form-container">
      <div className="page-header">
        <h1 className="page-title">Create Certificate</h1>
        <p className="page-subtitle">
          Generate a new certificate for a recipient
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

        {/* Recipient Information */}
        <div className="form-section">
          <h3 className="form-section-title">
            <User size={20} /> Recipient Information
          </h3>

          <div className="form-row">
            <div className="input-group">
              <label htmlFor="name" className="input-label">
                Full Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="input"
                placeholder="John Doe"
              />
            </div>

            <div className="input-group">
              <label htmlFor="email" className="input-label">
                Email Address *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="input"
                placeholder="john@example.com"
              />
            </div>
          </div>
        </div>

        {/* Certificate Details */}
        <div className="form-section">
          <h3 className="form-section-title">
            <Award size={20} /> Certificate Details
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
                defaultValue={new Date().toISOString().split("T")[0]}
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

        {/* Custom Placeholder Fields */}
        {selectedTemplateObj?.placeholders &&
          selectedTemplateObj.placeholders.length > 0 && (
            <div className="form-section">
              <h3 className="form-section-title">
                <Edit3 size={20} /> Custom Fields
              </h3>

              <div
                className="form-row"
                style={{ flexDirection: "column", gap: "var(--space-md)" }}
              >
                {selectedTemplateObj.placeholders.map((placeholder) => (
                  <div key={placeholder.key} className="input-group">
                    <label
                      htmlFor={`custom_${placeholder.key}`}
                      className="input-label"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      {placeholder.label}
                      {placeholder.isLink && (
                        <span style={{ color: "#94a3b8" }}>🔗</span>
                      )}
                    </label>
                    <input
                      id={`custom_${placeholder.key}`}
                      name={`custom_${placeholder.key}`}
                      type={placeholder.isLink ? "url" : "text"}
                      className="input"
                      placeholder={
                        placeholder.isLink
                          ? "https://example.com"
                          : `Enter ${placeholder.label}`
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Actions */}
        <div className="form-actions">
          <Link href="/admin/certificates" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={isLoading || templates.length === 0}
          >
            {isLoading ? (
              <>
                <span
                  className="spinner"
                  style={{ width: 20, height: 20 }}
                ></span>
                Creating...
              </>
            ) : (
              <>
                <GraduationCap size={20} /> Create Certificate
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
