"use client";

import Link from "next/link";
import { Plus, FolderInput } from "lucide-react";
import BulkPdfGenerator from "./BulkPdfGenerator";
import BulkEmailSender from "./BulkEmailSender";
import type { Certificate } from "@/lib/types/database";

interface CertificatesHeaderProps {
  certificates: Certificate[];
}

export default function CertificatesHeader({
  certificates,
}: CertificatesHeaderProps) {
  return (
    <div className="certificates-header">
      <div>
        <h1 className="page-title">Certificates</h1>
        <p className="page-subtitle">Manage all your certificates</p>
      </div>
      <div className="header-actions">
        <Link href="/admin/circulation" className="btn btn-secondary">Circulation</Link>
        <BulkPdfGenerator certificates={certificates} />
        <BulkEmailSender certificates={certificates} />
        <Link href="/admin/certificates/bulk" className="btn btn-secondary">
          <FolderInput size={16} /> Bulk Import
        </Link>
        <Link href="/admin/certificates/create" className="btn btn-primary">
          <Plus size={16} /> Create Certificate
        </Link>
      </div>
    </div>
  );
}
