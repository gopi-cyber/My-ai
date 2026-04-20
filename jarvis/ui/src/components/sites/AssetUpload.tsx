import React, { useState, useCallback } from "react";

type Props = {
  projectId: string;
  onUploadComplete: (file: { name: string; path: string }) => void;
};

export function AssetUpload({ projectId, onUploadComplete }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/sites/projects/${projectId}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Upload failed");
      }

      const result = await response.json();
      onUploadComplete({ name: result.filename, path: result.path });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown upload error");
    } finally {
      setUploading(false);
    }
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  }, [projectId]);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div 
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          ...dropZoneStyle,
          borderColor: dragActive ? "var(--j-accent)" : "var(--j-border)",
          background: dragActive ? "rgba(0, 212, 255, 0.05)" : "var(--j-surface)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>📁</div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--j-text)" }}>
            Drag & Drop Assets
          </div>
          <div style={{ fontSize: "10px", color: "var(--j-text-muted)", marginTop: "4px" }}>
            PNG, JPG, SVG, etc.
          </div>
          <label style={uploadBtnStyle}>
            Browse Files
            <input type="file" style={{ display: "none" }} onChange={onFileSelect} />
          </label>
        </div>
      </div>

      {uploading && (
        <div style={progressStyle}>
          <div style={progressBarFill} />
          <span style={{ fontSize: "10px", color: "var(--j-accent)" }}>Uploading...</span>
        </div>
      )}

      {error && (
        <div style={errorStyle}>{error}</div>
      )}
    </div>
  );
}

const dropZoneStyle: React.CSSProperties = {
  border: "2px dashed var(--j-border)",
  borderRadius: "8px",
  padding: "24px",
  cursor: "pointer",
  transition: "all 0.2s",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const uploadBtnStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: "12px",
  padding: "6px 12px",
  fontSize: "11px",
  fontWeight: 600,
  background: "var(--j-accent)",
  color: "#000",
  borderRadius: "4px",
  cursor: "pointer",
};

const progressStyle: React.CSSProperties = {
  height: "4px",
  background: "var(--j-border)",
  borderRadius: "2px",
  position: "relative",
  overflow: "hidden",
};

const progressBarFill: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  height: "100%",
  width: "40%", // Simulating progress
  background: "var(--j-accent)",
  animation: "progressMove 2s infinite linear",
};

const errorStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--j-error)",
  textAlign: "center",
  padding: "4px",
};
