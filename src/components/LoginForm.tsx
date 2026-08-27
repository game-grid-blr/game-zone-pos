"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/Button";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    setLoading(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Login failed");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md rounded-md bg-white p-6 shadow-pos dark:bg-white/10">
      <div className="mb-6">
        <div className="mb-3 grid h-14 w-14 place-items-center rounded-md bg-pool text-xl font-black text-white">FG</div>
        <h1 className="text-3xl font-black">Fort Game Zone POS</h1>
        <p className="mt-1 text-sm font-semibold text-black/55 dark:text-white/60">Staff sign in</p>
      </div>

      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-bold">Username</span>
        <input
          className="h-[52px] w-full rounded-md border border-black/15 bg-white px-4 py-3 text-lg outline-none focus:border-pool dark:border-white/15 dark:bg-black/20"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
        />
      </label>

      <label className="mb-5 block">
        <span className="mb-2 block text-sm font-bold">Password</span>
        <input
          className="h-[52px] w-full rounded-md border border-black/15 bg-white px-4 py-3 text-lg outline-none focus:border-pool dark:border-white/15 dark:bg-black/20"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
        />
      </label>

      {error ? <div className="mb-4 rounded-md bg-fire/10 p-3 text-sm font-bold text-fire">{error}</div> : null}

      <Button className="w-full" size="lg" type="submit" disabled={loading} icon={<LogIn size={22} />}>
        {loading ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  );
}
