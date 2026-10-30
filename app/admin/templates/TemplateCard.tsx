"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit, Trash2 } from "lucide-react";
import type { Template } from "@/lib/types/database";
import { deleteTemplate } from "@/app/actions/templates";

interface TemplateCardProps {
  template: Template;
}

export default function TemplateCard({ template }: TemplateCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteTemplate(template.id);
    } catch {
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <div className="template-card">
        <img
          src={template.image_url}
          alt={template.name}
          className="template-card-image"
        />
        <div className="template-card-content">
          <h3 className="template-card-name">{template.name}</h3>
          <p className="template-card-meta">
            {template.image_width} × {template.image_height}px
          </p>
          <div className="template-card-actions">
            <Link
              href={`/admin/templates/${template.id}`}
              className="btn btn-secondary btn-sm"
            >
              <Edit size={16} /> Edit
            </Link>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowConfirm(true)}
              style={{ color: "var(--accent-danger)" }}
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="success-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm-title">
              <Trash2 size={24} /> Delete Template
            </h3>
            <p className="confirm-message">
              Are you sure you want to delete &quot;{template.name}&quot;? This
              action cannot be undone.
            </p>
            <div className="confirm-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
