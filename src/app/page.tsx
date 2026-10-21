"use client";

import { useState, useEffect, useCallback } from "react";
import { PREDEFINED_USERS } from "@/lib/users";

interface RequestLog {
  id: string;
  timestamp: string;
  apiKey: string;
  status: number;
  statusText: string;
  remaining?: string | null;
  retryAfter?: string | null;
  body: unknown;
  durationMs: number;
}

interface UserUsage {
  userId: string;
  userName: string;
  apiKey: string;
  limit: number;
  used: number;
  remaining: number;
  retryAfter: number;
  resetInSeconds: number;
  isRateLimited: boolean;
}

export default function Dashboard() {
  const [selectedApiKey, setSelectedApiKey] = useState<string>("user_123");
  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [isCustom, setIsCustom] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [burstLoading, setBurstLoading] = useState<boolean>(false);
  const [allUsersUsage, setAllUsersUsage] = useState<UserUsage[]>([]);
  const [currentUsage, setCurrentUsage] = useState<{
    used: number;
    limit: number;
    remaining: number;
    resetInSeconds: number;
    retryAfter: number;
    isRateLimited: boolean;
  }>({
    used: 0,
    limit: 10,
    remaining: 10,
    resetInSeconds: 0,
    retryAfter: 0,
    isRateLimited: false,
  });

  const [lastResponse, setLastResponse] = useState<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: unknown;
    timestamp: string;
  } | null>(null);

  const [logs, setLogs] = useState<RequestLog[]>([]);

  const activeKey = isCustom ? customApiKey.trim() : selectedApiKey;

  // Fetch current usage without consuming quota
  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      if (res.ok) {
        const data = await res.json();
        if (data.users) {
          setAllUsersUsage(data.users);
          const found = data.users.find(
            (u: UserUsage) => u.apiKey === activeKey
          );
          if (found) {
            setCurrentUsage({
              used: found.used,
              limit: found.limit,
              remaining: found.remaining,
              resetInSeconds: found.resetInSeconds,
              retryAfter: found.retryAfter,
              isRateLimited: found.isRateLimited,
            });
          } else {
            // For custom key
            if (activeKey) {
              const singleRes = await fetch(
                `/api/usage?key=${encodeURIComponent(activeKey)}`
              );
              if (singleRes.ok) {
                const singleData = await singleRes.json();
                setCurrentUsage({
                  used: singleData.used,
                  limit: singleData.limit,
                  remaining: singleData.remaining,
                  resetInSeconds: singleData.resetInSeconds,
                  retryAfter: singleData.retryAfter,
                  isRateLimited: singleData.isRateLimited,
                });
              } else {
                setCurrentUsage({
                  used: 0,
                  limit: 10,
                  remaining: 10,
                  resetInSeconds: 0,
                  retryAfter: 0,
                  isRateLimited: false,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch usage:", err);
    }
  }, [activeKey]);

  useEffect(() => {
    fetchUsage();
    // Poll usage every 2 seconds to keep countdown fresh
    const interval = setInterval(fetchUsage, 2000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  // Handle single request to /api/data
  const handleCallApi = async (overrideKey?: string) => {
    const keyToUse = overrideKey !== undefined ? overrideKey : activeKey;
    setLoading(true);
    const start = performance.now();

    try {
      const headers: HeadersInit = {};
      if (keyToUse) {
        headers["X-API-Key"] = keyToUse;
      }

      const res = await fetch("/api/data", {
        method: "GET",
        headers,
      });

      const durationMs = Math.round(performance.now() - start);
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        data = { error: "Failed to parse JSON" };
      }

      const capturedHeaders: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        if (
          key.toLowerCase().startsWith("x-ratelimit-") ||
          key.toLowerCase() === "retry-after" ||
          key.toLowerCase() === "content-type"
        ) {
          capturedHeaders[key] = val;
        }
      });

      const logItem: RequestLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        apiKey: keyToUse || "(None)",
        status: res.status,
        statusText: res.statusText,
        remaining: res.headers.get("X-RateLimit-Remaining"),
        retryAfter: res.headers.get("Retry-After"),
        body: data,
        durationMs,
      };

      setLogs((prev) => [logItem, ...prev.slice(0, 49)]);
      setLastResponse({
        status: res.status,
        statusText: res.statusText,
        headers: capturedHeaders,
        body: data,
        timestamp: new Date().toLocaleTimeString(),
      });

      await fetchUsage();
    } catch (err) {
      console.error("API call error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Burst test: Send multiple requests rapidly
  const handleBurst = async (count: number) => {
    setBurstLoading(true);
    for (let i = 0; i < count; i++) {
      await handleCallApi();
    }
    setBurstLoading(false);
  };

  // Reset rate limits
  const handleReset = async () => {
    try {
      await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: activeKey }),
      });
      await fetchUsage();
      setLogs([]);
      setLastResponse(null);
    } catch (err) {
      console.error("Failed to reset:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="border-b border-slate-800 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              Next.js 16 • In-Memory Sliding Window
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Rate-Limited API Dashboard
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Test per-user rate limiting (10 requests / 60 seconds) on{" "}
              <code className="text-indigo-300 font-mono">GET /api/data</code>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700 flex items-center gap-1.5 cursor-pointer"
              title="Reset rate limiter memory for current key"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Reset Limit
            </button>
            <a
              href="#test-scenarios"
              className="text-xs px-3 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 transition-colors border border-indigo-500/30"
            >
              Test Cases Guide ↓
            </a>
          </div>
        </header>

        {/* User / API Key Selector */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg backdrop-blur">
          <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase mb-4">
            Step 1: Select API Key / User Identity
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {PREDEFINED_USERS.map((user) => {
              const isSelected = !isCustom && selectedApiKey === user.apiKey;
              const usage = allUsersUsage.find((u) => u.apiKey === user.apiKey);

              return (
                <button
                  key={user.id}
                  onClick={() => {
                    setIsCustom(false);
                    setSelectedApiKey(user.apiKey);
                  }}
                  className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-950/40 shadow-sm shadow-indigo-500/20 ring-1 ring-indigo-500"
                      : "border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 text-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-white">
                      {user.name}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        usage?.isRateLimited
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {usage ? `${usage.used}/10` : "0/10"}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-indigo-300 mt-1">
                    {user.apiKey}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {user.description}
                  </div>
                </button>
              );
            })}

            {/* Custom / Invalid Key Option */}
            <div
              className={`p-3.5 rounded-xl border transition-all ${
                isCustom
                  ? "border-amber-500 bg-amber-950/20 shadow-sm ring-1 ring-amber-500"
                  : "border-slate-800 bg-slate-900/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <label
                  onClick={() => setIsCustom(true)}
                  className="font-semibold text-sm text-amber-200 cursor-pointer flex items-center gap-1.5"
                >
                  <input
                    type="radio"
                    checked={isCustom}
                    onChange={() => setIsCustom(true)}
                    className="accent-amber-500"
                  />
                  Custom / Invalid Key
                </label>
              </div>
              <input
                type="text"
                placeholder="e.g. unknown_key_999"
                value={customApiKey}
                onFocus={() => setIsCustom(true)}
                onChange={(e) => {
                  setIsCustom(true);
                  setCustomApiKey(e.target.value);
                }}
                className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <div className="text-[10px] text-slate-400 mt-1">
                Test 401 Unauthorized handling
              </div>
            </div>
          </div>
        </section>

        {/* Live Metrics Cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Requests Used */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5">
            <span className="text-xs text-slate-400 font-medium">
              Used in Window
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-white">
                {currentUsage.used}
              </span>
              <span className="text-sm text-slate-400">/ {currentUsage.limit}</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  currentUsage.used >= currentUsage.limit
                    ? "bg-rose-500"
                    : currentUsage.used >= 7
                    ? "bg-amber-400"
                    : "bg-indigo-500"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    (currentUsage.used / currentUsage.limit) * 100
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Requests Remaining */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5">
            <span className="text-xs text-slate-400 font-medium">
              Requests Remaining
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold tracking-tight ${
                  currentUsage.remaining === 0
                    ? "text-rose-400"
                    : currentUsage.remaining <= 3
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {currentUsage.remaining}
              </span>
              <span className="text-sm text-slate-400">allowed</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-3 font-mono">
              X-RateLimit-Remaining
            </div>
          </div>

          {/* Rate Limit Status */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5">
            <span className="text-xs text-slate-400 font-medium">
              Rate Limit Status
            </span>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  currentUsage.isRateLimited
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                    currentUsage.isRateLimited
                      ? "bg-rose-400 animate-ping"
                      : "bg-emerald-400"
                  }`}
                />
                {currentUsage.isRateLimited ? "Rate Limited (429)" : "Allowed (200)"}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-3">
              {currentUsage.isRateLimited
                ? "Next request will be rejected"
                : "Requests will succeed"}
            </div>
          </div>

          {/* Window Reset / Retry-After */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5">
            <span className="text-xs text-slate-400 font-medium">
              {currentUsage.isRateLimited ? "Retry After" : "Window Reset"}
            </span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight text-white font-mono">
                {currentUsage.isRateLimited
                  ? currentUsage.retryAfter
                  : currentUsage.resetInSeconds}
              </span>
              <span className="text-sm text-slate-400">seconds</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-3 font-mono">
              {currentUsage.isRateLimited ? "Retry-After Header" : "60s sliding window"}
            </div>
          </div>
        </section>

        {/* Action Panel & API Triggers */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Step 2: Trigger Rate-Limited API Requests
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Sends HTTP GET requests with header{" "}
                <code className="text-indigo-300 font-mono">
                  X-API-Key: {activeKey || "(none)"}
                </code>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Active Header:</span>
              <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-indigo-300">
                X-API-Key: {activeKey || "<none>"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Single Request */}
            <button
              onClick={() => handleCallApi()}
              disabled={loading || burstLoading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white font-medium text-sm transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              )}
              Send 1 Request (GET /api/data)
            </button>

            {/* Burst 5 Requests */}
            <button
              onClick={() => handleBurst(5)}
              disabled={loading || burstLoading}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 text-slate-200 font-medium text-sm transition-all border border-slate-700 flex items-center gap-2 cursor-pointer"
            >
              {burstLoading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : null}
              Send Burst (5x)
            </button>

            {/* Burst 11 Requests to trigger 429 */}
            <button
              onClick={() => handleBurst(11)}
              disabled={loading || burstLoading}
              className="px-4 py-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 active:scale-95 disabled:opacity-50 text-rose-200 font-medium text-sm transition-all border border-rose-800/50 flex items-center gap-2 cursor-pointer"
            >
              {burstLoading ? (
                <span className="w-4 h-4 border-2 border-rose-200/30 border-t-rose-200 rounded-full animate-spin" />
              ) : null}
              Test Limit Breaker (11x Burst)
            </button>

            {/* Test Missing Key */}
            <button
              onClick={() => handleCallApi("")}
              disabled={loading || burstLoading}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 font-medium text-xs transition-all border border-slate-700/60 cursor-pointer"
              title="Call /api/data without any X-API-Key header to test 401 Missing Key"
            >
              Test Missing Key (No Header)
            </button>

            {/* Refresh Usage */}
            <button
              onClick={fetchUsage}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 font-medium text-xs transition-all border border-slate-700/60 cursor-pointer ml-auto"
            >
              Refresh Status
            </button>
          </div>
        </section>

        {/* Live Inspector: Last Response & Headers */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Last Response Inspector */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Latest HTTP Response</span>
                {lastResponse && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-md font-mono font-bold ${
                      lastResponse.status === 200
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : lastResponse.status === 429
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    {lastResponse.status} {lastResponse.statusText}
                  </span>
                )}
              </h2>
              {lastResponse && (
                <span className="text-xs text-slate-500 font-mono">
                  {lastResponse.timestamp}
                </span>
              )}
            </div>

            {lastResponse ? (
              <div className="space-y-3">
                {/* Headers */}
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Response Headers
                  </span>
                  <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 font-mono text-xs space-y-1">
                    {Object.entries(lastResponse.headers).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-slate-400">{k}:</span>
                        <span className="text-indigo-300 font-semibold">{v}</span>
                      </div>
                    ))}
                    {Object.keys(lastResponse.headers).length === 0 && (
                      <span className="text-slate-600">No custom headers</span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Response JSON Body
                  </span>
                  <pre className="bg-slate-950 rounded-xl p-3 border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto">
                    {JSON.stringify(lastResponse.body, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="h-44 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
                <span>Click &quot;Send 1 Request&quot; to inspect response</span>
              </div>
            )}
          </div>

          {/* User Isolation Overview */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">
                  Multi-User Isolation Status
                </h2>
                <span className="text-xs text-slate-400">Independent Windows</span>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Demonstrates requirement:{" "}
                <span className="text-slate-200">
                  &quot;Two different API keys: Each user has an independent rate limit&quot;
                </span>
              </p>

              <div className="space-y-3">
                {PREDEFINED_USERS.map((user) => {
                  const usage = allUsersUsage.find((u) => u.apiKey === user.apiKey);
                  const used = usage?.used || 0;
                  const remaining = usage?.remaining ?? 10;
                  const isExceeded = usage?.isRateLimited || false;

                  return (
                    <div
                      key={user.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-semibold text-white flex items-center gap-2">
                          <span>{user.name}</span>
                          <span className="font-mono text-[10px] text-slate-500">
                            ({user.apiKey})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {user.description}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-mono font-bold ${
                              isExceeded ? "text-rose-400" : "text-emerald-400"
                            }`}
                          >
                            {used} / 10 used
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${
                              isExceeded
                                ? "bg-rose-500/20 text-rose-300"
                                : "bg-emerald-500/20 text-emerald-300"
                            }`}
                          >
                            {remaining} left
                          </span>
                        </div>
                        <button
                          onClick={() => handleCallApi(user.apiKey)}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline mt-1 cursor-pointer block text-right ml-auto"
                        >
                          + Send request as {user.name.split(" ")[0]}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
              Each user maintains a separate 60-second sliding window log.
            </div>
          </div>
        </section>

        {/* Request History Log */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>Request History</span>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                {logs.length} calls
              </span>
            </h2>
            {logs.length > 0 && (
              <button
                onClick={() => setLogs([])}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Clear Log
              </button>
            )}
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              No requests recorded yet. Click &quot;Send 1 Request&quot; or &quot;Burst&quot;
              above.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">API Key</th>
                    <th className="py-2.5 px-3">Remaining</th>
                    <th className="py-2.5 px-3">Retry-After</th>
                    <th className="py-2.5 px-3">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-slate-400">
                        {log.timestamp}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.status === 200
                              ? "bg-emerald-500/20 text-emerald-300"
                              : log.status === 429
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-indigo-300">{log.apiKey}</td>
                      <td className="py-2 px-3 text-slate-300">
                        {log.remaining ?? "—"}
                      </td>
                      <td className="py-2 px-3 text-rose-300">
                        {log.retryAfter ? `${log.retryAfter}s` : "—"}
                      </td>
                      <td className="py-2 px-3 text-slate-400">
                        {log.durationMs}ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Section 6 Test Cases Reference (from Assignment PDF) */}
        <section
          id="test-scenarios"
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5"
        >
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span>Assignment Test Scenarios (from Specification)</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              <span className="font-semibold text-indigo-300 block mb-1">
                1. First request with a valid API key
              </span>
              <p className="text-slate-400">
                Succeeds with HTTP 200, returns Hello World, and sets
                X-RateLimit-Remaining to 9.
              </p>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              <span className="font-semibold text-indigo-300 block mb-1">
                2. 10 requests within 60s window
              </span>
              <p className="text-slate-400">
                All 10 requests succeed with HTTP 200. Remaining decreases from 9
                to 0.
              </p>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              <span className="font-semibold text-rose-300 block mb-1">
                3. 11th request within window
              </span>
              <p className="text-slate-400">
                Rejected with HTTP 429 Too Many Requests, returns retry_after
                seconds.
              </p>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              <span className="font-semibold text-emerald-300 block mb-1">
                4. Request after window resets
              </span>
              <p className="text-slate-400">
                After the sliding window expires, requests succeed again with
                HTTP 200.
              </p>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              <span className="font-semibold text-amber-300 block mb-1">
                5. Unknown / missing API key
              </span>
              <p className="text-slate-400">
                Rejected with HTTP 401 Unauthorized and informative error
                message.
              </p>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              <span className="font-semibold text-purple-300 block mb-1">
                6. Two different API keys
              </span>
              <p className="text-slate-400">
                Each user (Alice, Bob, Charlie) has an independent rate limit
                counter.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
