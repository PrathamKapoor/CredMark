import Link from "next/link";
import { getCertificates, getFolders } from "@/app/actions/certificates";
import { ScrollText } from "lucide-react";
import CertificatesHeader from "./CertificatesHeader";
import CertificatesSearch from "./CertificatesSearch";
import "./certificates.css";

export default async function CertificatesPage() {
  const [certificates, folders] = await Promise.all([
    getCertificates(),
    getFolders(),
  ]);

  return (
    <>
      <CertificatesHeader certificates={certificates} />

      {certificates.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <ScrollText size={48} />
          </div>
          <h3 className="empty-title">No Certificates Yet</h3>
          <p className="empty-description">
            Create your first certificate to get started.
          </p>
          <Link href="/admin/certificates/create" className="btn btn-primary">
            Create Certificate
          </Link>
        </div>
      ) : (
        <CertificatesSearch certificates={certificates} folders={folders} />
      )}
    </>
  );
}
