import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ScrollText, CheckCircle, XCircle, Image } from "lucide-react";

async function getDashboardStats() {
  const supabase = await createClient();

  // Get total certificates
  const { count: totalCertificates } = await supabase
    .from("certificates")
    .select("*", { count: "exact", head: true });

  // Get valid certificates
  const { count: validCertificates } = await supabase
    .from("certificates")
    .select("*", { count: "exact", head: true })
    .eq("is_valid", true);

  // Get revoked certificates
  const { count: revokedCertificates } = await supabase
    .from("certificates")
    .select("*", { count: "exact", head: true })
    .eq("is_valid", false);

  // Get templates count
  const { count: templatesCount } = await supabase
    .from("templates")
    .select("*", { count: "exact", head: true });

  return {
    total: totalCertificates || 0,
    valid: validCertificates || 0,
    revoked: revokedCertificates || 0,
    templates: templatesCount || 0,
  };
}

async function getRecentCertificates() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("certificates")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  return data || [];
}

export default async function AdminDashboard() {
  const stats = await getDashboardStats();
  const recentCertificates = await getRecentCertificates();

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Overview of your certificate system</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-icon primary">
              <ScrollText size={24} />
            </div>
          </div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Certificates</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-icon success">
              <CheckCircle size={24} />
            </div>
          </div>
          <div className="stat-value">{stats.valid}</div>
          <div className="stat-label">Valid Certificates</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-icon danger">
              <XCircle size={24} />
            </div>
          </div>
          <div className="stat-value">{stats.revoked}</div>
          <div className="stat-label">Revoked Certificates</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-icon warning">
              <Image size={24} />
            </div>
          </div>
          <div className="stat-value">{stats.templates}</div>
          <div className="stat-label">Templates</div>
        </div>
      </div>

      {/* Recent Certificates */}
      <div className="section-header">
        <h2 className="section-title">Recent Certificates</h2>
        <Link href="/admin/certificates" className="btn btn-secondary btn-sm">
          View All →
        </Link>
      </div>

      {recentCertificates.length === 0 ? (
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
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Event</th>
                <th>Code</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentCertificates.map((cert) => (
                <tr key={cert.id}>
                  <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                    {cert.name}
                  </td>
                  <td>{cert.event_name}</td>
                  <td>
                    <code
                      className="verify-code"
                      style={{
                        background: "rgba(99, 102, 241, 0.1)",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "0.8rem",
                      }}
                    >
                      {cert.certificate_code}
                    </code>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        cert.is_valid ? "badge-success" : "badge-danger"
                      }`}
                    >
                      {cert.is_valid ? "Valid" : "Revoked"}
                    </span>
                  </td>
                  <td>{new Date(cert.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
