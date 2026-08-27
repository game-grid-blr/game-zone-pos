"use client";

import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import { Button } from "@/components/Button";

export function PasswordChangeModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    });

    setSaving(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Could not change password");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("Password changed");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-md bg-paper p-5 text-ink shadow-pos dark:bg-[#171a1d] dark:text-white">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-md bg-pool text-white">
              <KeyRound size={22} />
            </div>
            <h2 className="text-2xl font-black">Change Password</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-md bg-white ring-1 ring-black/10 dark:bg-white/10 dark:ring-white/10" title="Close">
            <X size={22} />
          </button>
        </div>

        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-bold">Current Password</span>
          <input
            className="h-12 w-full rounded-md border border-black/15 bg-white px-3 outline-none focus:border-pool dark:border-white/15 dark:bg-black/20"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-bold">New Password</span>
          <input
            className="h-12 w-full rounded-md border border-black/15 bg-white px-3 outline-none focus:border-pool dark:border-white/15 dark:bg-black/20"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>

        <label className="mb-5 block">
          <span className="mb-2 block text-sm font-bold">Confirm New Password</span>
          <input
            className="h-12 w-full rounded-md border border-black/15 bg-white px-3 outline-none focus:border-pool dark:border-white/15 dark:bg-black/20"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>

        {error ? <div className="mb-4 rounded-md bg-fire/10 p-3 text-sm font-bold text-fire">{error}</div> : null}
        {message ? <div className="mb-4 rounded-md bg-pool/10 p-3 text-sm font-bold text-pool">{message}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Button type="button" tone="quiet" size="lg" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" tone="success" size="lg" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}
