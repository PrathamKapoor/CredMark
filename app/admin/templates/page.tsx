import Link from "next/link";
import { getTemplates } from "@/app/actions/templates";
import { Plus, Image } from "lucide-react";
import TemplateCard from "./TemplateCard";
import "./templates.css";

export default async function TemplatesPage() {
  const templates = await getTemplates();

  return (
    <>
      <div className="templates-header">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">Manage your certificate templates</p>
        </div>
        <Link href="/admin/templates/create" className="btn btn-primary">
          <Plus size={16} /> Add Template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Image size={48} />
          </div>
          <h3 className="empty-title">No Templates Yet</h3>
          <p className="empty-description">
            Upload a certificate template image to get started.
          </p>
          <Link href="/admin/templates/create" className="btn btn-primary">
            Add Template
          </Link>
        </div>
      ) : (
        <div className="templates-grid">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      )}
    </>
  );
}
