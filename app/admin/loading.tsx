"use client";

import GradientLoader from "@/components/GradientLoader";
import "./admin.css";

export default function AdminLoading() {
  return (
    <div className="admin-loading">
      <GradientLoader size={200} />
    </div>
  );
}
