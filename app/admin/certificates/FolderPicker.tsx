"use client";

import { useMemo, useState } from "react";
import { FolderPlus, FolderTree, Layers } from "lucide-react";
import { createFolder } from "@/app/actions/certificates";
import type { Folder } from "@/lib/types/database";

interface FolderPickerProps {
  folders: Folder[];
  selectedFolderId: string;
  onSelectFolder: (folderId: string) => void;
  disabled?: boolean;
}

interface FolderOption {
  id: string;
  name: string;
  depth: number;
  path: string;
}

function buildFolderOptions(folders: Folder[]): FolderOption[] {
  const byParent = new Map<string | null, Folder[]>();

  folders.forEach((folder) => {
    const key = folder.parent_id;
    const existing = byParent.get(key) || [];
    existing.push(folder);
    byParent.set(key, existing);
  });

  byParent.forEach((group) => {
    group.sort((a, b) => a.name.localeCompare(b.name));
  });

  const options: FolderOption[] = [];
  const seen = new Set<string>();

  const walk = (parentId: string | null, depth: number, prefix: string) => {
    const children = byParent.get(parentId) || [];
    children.forEach((folder) => {
      if (seen.has(folder.id)) {
        return;
      }
      seen.add(folder.id);

      const path = prefix ? `${prefix} / ${folder.name}` : folder.name;
      options.push({
        id: folder.id,
        name: folder.name,
        depth,
        path,
      });

      walk(folder.id, depth + 1, path);
    });
  };

  walk(null, 0, "");

  // Keep orphaned rows visible even if parent data is inconsistent.
  folders.forEach((folder) => {
    if (seen.has(folder.id)) {
      return;
    }
    options.push({
      id: folder.id,
      name: folder.name,
      depth: 0,
      path: folder.name,
    });
  });

  return options;
}

export default function FolderPicker({
  folders,
  selectedFolderId,
  onSelectFolder,
  disabled = false,
}: FolderPickerProps) {
  const [folderList, setFolderList] = useState<Folder[]>(folders);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [createMode, setCreateMode] = useState<"root" | "subfolder">("root");
  const [newFolderName, setNewFolderName] = useState("");
  const [parentFolderId, setParentFolderId] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const folderOptions = useMemo(() => buildFolderOptions(folderList), [folderList]);

  const handleCreateFolder = async () => {
    setCreateError(null);

    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      setCreateError("Folder name is required");
      return;
    }

    if (createMode === "subfolder" && !parentFolderId) {
      setCreateError("Please choose a parent folder for the subfolder");
      return;
    }

    setIsCreatingFolder(true);
    try {
      const result = await createFolder({
        name: trimmedName,
        parent_id: createMode === "subfolder" ? parentFolderId : null,
      });

      if (!result.success || !result.folder) {
        setCreateError(result.error || "Failed to create folder");
        return;
      }

      setFolderList((prev) => [...prev, result.folder as Folder]);
      onSelectFolder(result.folder.id);
      setNewFolderName("");
      setParentFolderId("");
      setShowCreatePanel(false);
    } catch {
      setCreateError("Failed to create folder");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  return (
    <div className="form-section">
      <h3 className="form-section-title">
        <FolderTree size={20} /> Certificate Folder
      </h3>

      <div className="input-group">
        <label htmlFor="folder_id" className="input-label">
          Select Existing Folder *
        </label>
        <select
          id="folder_id"
          name="folder_id"
          className="input"
          value={selectedFolderId}
          onChange={(e) => onSelectFolder(e.target.value)}
          required
          disabled={disabled}
        >
          <option value="">Choose a folder</option>
          {folderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {`${"\u00A0\u00A0".repeat(folder.depth)}${folder.path}`}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: "var(--space-md)", display: "flex", gap: "var(--space-sm)" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setShowCreatePanel((prev) => !prev);
            setCreateError(null);
          }}
          disabled={disabled}
        >
          <FolderPlus size={16} />
          {showCreatePanel ? "Cancel" : "Create New Folder"}
        </button>
      </div>

      {showCreatePanel && (
        <div
          style={{
            marginTop: "var(--space-md)",
            padding: "var(--space-md)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-secondary)",
          }}
        >
          <div style={{ display: "flex", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)" }}>
              <input
                type="radio"
                name="create_folder_mode"
                checked={createMode === "root"}
                onChange={() => {
                  setCreateMode("root");
                  setParentFolderId("");
                }}
              />
              <Layers size={14} /> Root Folder
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)" }}>
              <input
                type="radio"
                name="create_folder_mode"
                checked={createMode === "subfolder"}
                onChange={() => setCreateMode("subfolder")}
              />
              <FolderTree size={14} /> Subfolder
            </label>
          </div>

          {createMode === "subfolder" && (
            <div className="input-group" style={{ marginBottom: "var(--space-md)" }}>
              <label htmlFor="parent_folder_id" className="input-label">
                Parent Folder *
              </label>
              <select
                id="parent_folder_id"
                className="input"
                value={parentFolderId}
                onChange={(e) => setParentFolderId(e.target.value)}
                disabled={disabled || isCreatingFolder}
              >
                <option value="">Choose parent folder</option>
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.path}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="input-group">
            <label htmlFor="new_folder_name" className="input-label">
              {createMode === "subfolder" ? "Subfolder Name *" : "Folder Name *"}
            </label>
            <input
              id="new_folder_name"
              type="text"
              className="input"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={createMode === "subfolder" ? "e.g. Batch A" : "e.g. InnoVision"}
              disabled={disabled || isCreatingFolder}
            />
          </div>

          {createError && (
            <div className="login-error" style={{ marginTop: "var(--space-sm)" }}>
              {createError}
            </div>
          )}

          <div style={{ marginTop: "var(--space-md)", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreateFolder}
              disabled={disabled || isCreatingFolder}
            >
              {isCreatingFolder ? "Creating..." : createMode === "subfolder" ? "Create Subfolder" : "Create Folder"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
