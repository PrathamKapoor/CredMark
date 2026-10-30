"use client";

import { useState, useMemo, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, ShieldAlert, Trash2, X } from "lucide-react";
import type { Certificate, Folder } from "@/lib/types/database";
import {
  superDeleteFolderTarget,
  type SuperDeleteScope,
} from "@/app/actions/certificates";
import CertificateCard from "./CertificateCard";
import "./certificates.css";

interface CertificatesSearchProps {
  certificates: Certificate[];
  folders: Folder[];
}

interface SuperDeleteTarget {
  folderId: string;
  folderName: string;
  directCertificateCount: number;
  branchCertificateCount: number;
  subfolderCount: number;
}

function FolderSvgIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      className="folder-svg-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <path
        d="M3 6.75C3 5.78 3.78 5 4.75 5H9l2 2h8.25c.97 0 1.75.78 1.75 1.75V9H3V6.75Z"
        fill={isOpen ? "#fbbf24" : "#60a5fa"}
        opacity="0.9"
      />
      <path
        d="M3 9h18v8.25c0 .97-.78 1.75-1.75 1.75H4.75A1.75 1.75 0 0 1 3 17.25V9Z"
        fill={isOpen ? "#f59e0b" : "#3b82f6"}
      />
    </svg>
  );
}

function ChevronSvgIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      className={`folder-chevron ${isOpen ? "open" : ""}`}
      viewBox="0 0 20 20"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path
        d="M7 5l6 5-6 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export default function CertificatesSearch({
  certificates,
  folders,
}: CertificatesSearchProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    new Set()
  );
  const [superDeleteTarget, setSuperDeleteTarget] =
    useState<SuperDeleteTarget | null>(null);
  const [superDeleteScope, setSuperDeleteScope] =
    useState<SuperDeleteScope>("delete_folder_tree");
  const [superDeletePassword, setSuperDeletePassword] = useState("");
  const [superDeleteConfirmation, setSuperDeleteConfirmation] = useState("");
  const [superDeleteError, setSuperDeleteError] = useState<string | null>(null);
  const [superDeleteNotice, setSuperDeleteNotice] = useState<string | null>(null);
  const [isSuperDeleting, setIsSuperDeleting] = useState(false);

  const folderData = useMemo(() => {
    const foldersById = new Map<string, Folder>();
    const childrenByParent = new Map<string | null, Folder[]>();

    folders.forEach((folder) => {
      foldersById.set(folder.id, folder);
      const key = folder.parent_id;
      const children = childrenByParent.get(key) || [];
      children.push(folder);
      childrenByParent.set(key, children);
    });

    childrenByParent.forEach((children) => {
      children.sort((a, b) => a.name.localeCompare(b.name));
    });

    const pathCache = new Map<string, string>();
    const buildPath = (folderId: string, seen = new Set<string>()): string => {
      const cached = pathCache.get(folderId);
      if (cached) {
        return cached;
      }

      const folder = foldersById.get(folderId);
      if (!folder) {
        return "";
      }

      if (seen.has(folderId)) {
        return folder.name;
      }

      seen.add(folderId);

      if (!folder.parent_id) {
        pathCache.set(folderId, folder.name);
        return folder.name;
      }

      const parentPath = buildPath(folder.parent_id, seen);
      const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
      pathCache.set(folderId, path);
      return path;
    };

    folders.forEach((folder) => {
      buildPath(folder.id);
    });

    const rootFolders = folders
      .filter((folder) => !folder.parent_id || !foldersById.has(folder.parent_id))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      foldersById,
      childrenByParent,
      pathCache,
      rootFolders,
    };
  }, [folders]);

  // Filter certificates based on unified search term
  const filteredCertificates = useMemo(() => {
    if (!searchTerm.trim()) {
      return certificates;
    }

    const lowerSearch = searchTerm.toLowerCase();
    return certificates.filter((cert) => {
      const nameMatch = cert.name.toLowerCase().includes(lowerSearch);
      const eventMatch = cert.event_name.toLowerCase().includes(lowerSearch);
      const emailMatch = cert.email.toLowerCase().includes(lowerSearch);
      const folderPath = cert.folder_id
        ? folderData.pathCache.get(cert.folder_id) || ""
        : "";
      const folderMatch = folderPath.toLowerCase().includes(lowerSearch);

      return nameMatch || eventMatch || emailMatch || folderMatch;
    });
  }, [certificates, searchTerm, folderData.pathCache]);

  const certificatesByFolder = useMemo(() => {
    const map = new Map<string, Certificate[]>();

    filteredCertificates.forEach((cert) => {
      const key = cert.folder_id || "";
      const list = map.get(key) || [];
      list.push(cert);
      map.set(key, list);
    });

    map.forEach((list) => {
      list.sort((a, b) => {
        const dateDiff =
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }
        return a.name.localeCompare(b.name);
      });
    });

    return map;
  }, [filteredCertificates]);

  const allCertificatesByFolder = useMemo(() => {
    const map = new Map<string, Certificate[]>();

    certificates.forEach((certificate) => {
      const key = certificate.folder_id || "";
      const list = map.get(key) || [];
      list.push(certificate);
      map.set(key, list);
    });

    return map;
  }, [certificates]);

  const folderCountCache = useMemo(() => {
    const cache = new Map<string, number>();

    const countForFolder = (folderId: string): number => {
      const cached = cache.get(folderId);
      if (cached !== undefined) {
        return cached;
      }

      const ownCount = certificatesByFolder.get(folderId)?.length || 0;
      const childFolders = folderData.childrenByParent.get(folderId) || [];
      const childCount = childFolders.reduce(
        (sum, child) => sum + countForFolder(child.id),
        0
      );
      const total = ownCount + childCount;
      cache.set(folderId, total);
      return total;
    };

    folderData.foldersById.forEach((_, folderId) => {
      countForFolder(folderId);
    });

    return cache;
  }, [certificatesByFolder, folderData.childrenByParent, folderData.foldersById]);

  const allFolderCountCache = useMemo(() => {
    const cache = new Map<string, number>();

    const countForFolder = (folderId: string): number => {
      const cached = cache.get(folderId);
      if (cached !== undefined) {
        return cached;
      }

      const ownCount = allCertificatesByFolder.get(folderId)?.length || 0;
      const childFolders = folderData.childrenByParent.get(folderId) || [];
      const childCount = childFolders.reduce(
        (sum, child) => sum + countForFolder(child.id),
        0
      );
      const total = ownCount + childCount;
      cache.set(folderId, total);
      return total;
    };

    folderData.foldersById.forEach((_, folderId) => {
      countForFolder(folderId);
    });

    return cache;
  }, [allCertificatesByFolder, folderData.childrenByParent, folderData.foldersById]);

  const folderDescendantCountCache = useMemo(() => {
    const cache = new Map<string, number>();

    const countDescendants = (folderId: string): number => {
      const cached = cache.get(folderId);
      if (cached !== undefined) {
        return cached;
      }

      const childFolders = folderData.childrenByParent.get(folderId) || [];
      const total = childFolders.reduce(
        (sum, child) => sum + 1 + countDescendants(child.id),
        0
      );
      cache.set(folderId, total);
      return total;
    };

    folderData.foldersById.forEach((_, folderId) => {
      countDescendants(folderId);
    });

    return cache;
  }, [folderData.childrenByParent, folderData.foldersById]);

  const clearSearch = () => {
    setSearchTerm("");
  };

  const hasActiveSearch = searchTerm.trim().length > 0;
  const uncategorizedCertificates = certificatesByFolder.get("") || [];

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const closeSuperDeleteModal = () => {
    setSuperDeleteTarget(null);
    setSuperDeletePassword("");
    setSuperDeleteConfirmation("");
    setSuperDeleteError(null);
    setIsSuperDeleting(false);
  };

  const openSuperDeleteModal = (folder: Folder) => {
    setSuperDeleteTarget({
      folderId: folder.id,
      folderName: folder.name,
      directCertificateCount: allCertificatesByFolder.get(folder.id)?.length || 0,
      branchCertificateCount: allFolderCountCache.get(folder.id) || 0,
      subfolderCount: folderDescendantCountCache.get(folder.id) || 0,
    });
    setSuperDeleteScope("delete_folder_tree");
    setSuperDeletePassword("");
    setSuperDeleteConfirmation("");
    setSuperDeleteError(null);
  };

  const requiredConfirmationText = superDeleteTarget
    ? `DELETE ${superDeleteTarget.folderName}`
    : "";

  const isConfirmationPhraseValid =
    superDeleteTarget !== null &&
    superDeleteConfirmation.trim() === requiredConfirmationText;

  const getScopeSummary = () => {
    if (!superDeleteTarget) {
      return {
        certificateCount: 0,
        folderCount: 0,
        message: "",
      };
    }

    if (superDeleteScope === "delete_folder_tree") {
      return {
        certificateCount: superDeleteTarget.branchCertificateCount,
        folderCount: superDeleteTarget.subfolderCount + 1,
        message:
          "This will permanently delete the selected folder, all subfolders, and all certificates in this branch.",
      };
    }

    if (superDeleteScope === "delete_folder_certificates_only") {
      return {
        certificateCount: superDeleteTarget.directCertificateCount,
        folderCount: 0,
        message:
          "This will permanently delete only certificates directly inside the selected folder. Subfolders and their certificates stay intact.",
      };
    }

    return {
      certificateCount: superDeleteTarget.branchCertificateCount,
      folderCount: 0,
      message:
        "This will permanently delete all certificates in the selected folder and every subfolder, while keeping the folder structure.",
    };
  };

  const scopeSummary = getScopeSummary();

  const handleConfirmSuperDelete = async () => {
    if (!superDeleteTarget) {
      return;
    }

    setIsSuperDeleting(true);
    setSuperDeleteError(null);

    try {
      const result = await superDeleteFolderTarget({
        folder_id: superDeleteTarget.folderId,
        scope: superDeleteScope,
        password: superDeletePassword,
        confirmation_text: superDeleteConfirmation.trim(),
      });

      if (!result.success) {
        setSuperDeleteError(result.error || "Super Delete failed");
        return;
      }

      const deletedCertificates = result.summary?.deletedCertificates ?? 0;
      const deletedFolders = result.summary?.deletedFolders ?? 0;
      const storageFailures = result.summary?.storageCleanupFailures ?? 0;

      const noticeParts = [`Deleted ${deletedCertificates} certificate(s)`];
      if (deletedFolders > 0) {
        noticeParts.push(`removed ${deletedFolders} folder(s)`);
      }
      if (storageFailures > 0) {
        noticeParts.push(`storage cleanup failed for ${storageFailures} file(s)`);
      }

      setSuperDeleteNotice(noticeParts.join("; "));
      closeSuperDeleteModal();
      router.refresh();
    } finally {
      setIsSuperDeleting(false);
    }
  };

  const renderFolderSection = (folder: Folder, depth: number): ReactElement | null => {
    const folderCertificates = certificatesByFolder.get(folder.id) || [];
    const childFolders = folderData.childrenByParent.get(folder.id) || [];
    const totalInBranch = folderCountCache.get(folder.id) || 0;
    const hasChildren = childFolders.length > 0 || folderCertificates.length > 0;
    const isExpanded = hasActiveSearch || expandedFolderIds.has(folder.id);

    if (hasActiveSearch && totalInBranch === 0) {
      return null;
    }

    return (
      <section
        key={folder.id}
        className="folder-section"
        style={{ marginLeft: `${depth * 1.25}rem` }}
      >
        <div className="folder-header-row">
          <button
            type="button"
            className="folder-toggle-button"
            onClick={() => toggleFolder(folder.id)}
            disabled={!hasChildren}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${folder.name}`}
          >
            <span className="folder-leading-icons">
              <ChevronSvgIcon isOpen={isExpanded} />
              <FolderSvgIcon isOpen={isExpanded} />
            </span>
            <span className="folder-title-group">
              <h3 className="folder-title">{folder.name}</h3>
              <span className="folder-path-text">
                {folderData.pathCache.get(folder.id)}
              </span>
            </span>
          </button>
          <div className="folder-header-actions">
            <span className="folder-count-badge">{totalInBranch}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm folder-super-delete-btn"
              title={`Super Delete ${folder.name}`}
              aria-label={`Super Delete ${folder.name}`}
              onClick={() => openSuperDeleteModal(folder)}
            >
              <Trash2 size={14} />
              <span>Super Delete</span>
            </button>
          </div>
        </div>

        {isExpanded && (
          <>
            {childFolders.length > 0 && (
              <div className="folder-children">
                {childFolders.map((child) => renderFolderSection(child, depth + 1))}
              </div>
            )}

            {folderCertificates.length > 0 && (
              <div className="certificates-grid">
                {folderCertificates.map((cert) => (
                  <CertificateCard key={cert.id} certificate={cert} />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    );
  };

  return (
    <div>
      {/* Unified Search Filter */}
      <div className="search-container">
        <div className={`search-input-group unified ${isFocused ? "focused" : ""}`}>
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Search by name, event, email, or folder..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="search-input unified"
            autoFocus
          />
          {searchTerm && (
            <button
              className="clear-input"
              onClick={clearSearch}
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Results Count */}
      {hasActiveSearch && (
        <div className="search-results-info">
          <strong>{filteredCertificates.length}</strong> of{" "}
          <strong>{certificates.length}</strong> certificates found
          {filteredCertificates.length === 0 && " - try different search terms"}
        </div>
      )}

      {superDeleteNotice && (
        <div className="search-results-info super-delete-notice">
          {superDeleteNotice}
        </div>
      )}

      {/* Results Grid */}
      {filteredCertificates.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Search size={48} />
          </div>
          <h3 className="empty-title">No Certificates Found</h3>
          <p className="empty-description">
            {hasActiveSearch
              ? `No matches for "${searchTerm}"`
              : "No certificates available"}
          </p>
          {hasActiveSearch && (
            <button onClick={clearSearch} className="btn btn-primary">
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <div className="folder-tree-container">
          {folderData.rootFolders.map((folder) => renderFolderSection(folder, 0))}

          {uncategorizedCertificates.length > 0 && (
            <section className="folder-section">
              <div className="folder-header-row">
                <div className="folder-title-group">
                  <h3 className="folder-title">Uncategorized</h3>
                  <span className="folder-path-text">
                    Certificates without a folder assignment
                  </span>
                </div>
                <span className="folder-count-badge">
                  {uncategorizedCertificates.length}
                </span>
              </div>

              <div className="certificates-grid">
                {uncategorizedCertificates.map((cert) => (
                  <CertificateCard key={cert.id} certificate={cert} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {superDeleteTarget && (
        <div className="success-overlay" onClick={closeSuperDeleteModal}>
          <div
            className="confirm-dialog super-delete-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="super-delete-headline">
              <ShieldAlert size={22} />
              <h3 className="confirm-title">Super Delete</h3>
            </div>

            <p className="confirm-message super-delete-message">
              Target folder: <strong>{superDeleteTarget.folderName}</strong>
            </p>

            <div className="super-delete-scope-group">
              <label className="super-delete-scope-option">
                <input
                  type="radio"
                  name="super-delete-scope"
                  value="delete_folder_tree"
                  checked={superDeleteScope === "delete_folder_tree"}
                  onChange={() => setSuperDeleteScope("delete_folder_tree")}
                />
                <span>Delete folder, all subfolders, and all certificates</span>
              </label>

              <label className="super-delete-scope-option">
                <input
                  type="radio"
                  name="super-delete-scope"
                  value="delete_folder_certificates_only"
                  checked={superDeleteScope === "delete_folder_certificates_only"}
                  onChange={() =>
                    setSuperDeleteScope("delete_folder_certificates_only")
                  }
                />
                <span>Delete certificates in this folder only</span>
              </label>

              <label className="super-delete-scope-option">
                <input
                  type="radio"
                  name="super-delete-scope"
                  value="delete_subtree_certificates_keep_folders"
                  checked={
                    superDeleteScope ===
                    "delete_subtree_certificates_keep_folders"
                  }
                  onChange={() =>
                    setSuperDeleteScope(
                      "delete_subtree_certificates_keep_folders"
                    )
                  }
                />
                <span>
                  Delete certificates in this folder and all subfolders, keep
                  folders
                </span>
              </label>
            </div>

            <div className="super-delete-warning-box">
              <p>{scopeSummary.message}</p>
              <p>
                This action deletes <strong>{scopeSummary.certificateCount}</strong>{" "}
                certificate(s)
                {scopeSummary.folderCount > 0 ? (
                  <>
                    {" "}and <strong>{scopeSummary.folderCount}</strong> folder(s)
                  </>
                ) : (
                  ""
                )}
                .
              </p>
            </div>

            <div className="input-group super-delete-input-group">
              <label htmlFor="super-delete-password" className="input-label">
                Confirm admin password
              </label>
              <input
                id="super-delete-password"
                type="password"
                className="input"
                value={superDeletePassword}
                onChange={(event) => setSuperDeletePassword(event.target.value)}
                placeholder="Enter current admin password"
                autoComplete="current-password"
              />
            </div>

            <div className="input-group super-delete-input-group">
              <label
                htmlFor="super-delete-confirmation-text"
                className="input-label"
              >
                Type <strong>{requiredConfirmationText}</strong>
              </label>
              <input
                id="super-delete-confirmation-text"
                type="text"
                className="input"
                value={superDeleteConfirmation}
                onChange={(event) =>
                  setSuperDeleteConfirmation(event.target.value)
                }
                placeholder={requiredConfirmationText}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            {superDeleteError && (
              <p className="super-delete-error">{superDeleteError}</p>
            )}

            <div className="confirm-actions super-delete-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeSuperDeleteModal}
                disabled={isSuperDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmSuperDelete}
                disabled={
                  isSuperDeleting ||
                  !superDeletePassword.trim() ||
                  !isConfirmationPhraseValid
                }
              >
                {isSuperDeleting ? (
                  <span className="super-delete-progress">
                    <Loader2 size={16} className="spinner-icon" /> Deleting...
                  </span>
                ) : (
                  "Delete Permanently"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
