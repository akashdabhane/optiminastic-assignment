# Rate-Limited API & Dashboard

A full-stack application built with **Next.js (App Router)** and **TypeScript** implementing per-user rate limiting (10 requests per 60 seconds) with an interactive inspection dashboard.

---

## 🚀 Features

- **Backend Rate Limiting**: Sliding-window log algorithm enforcing **10 requests per 60 seconds** per API key.
- **API Key Identification**: Users identified via the `X-API-Key` HTTP header.
- **RFC-Compliant Rate Limit Headers**:
  - `X-RateLimit-Limit`: Maximum requests permitted per window (10).
  - `X-RateLimit-Remaining`: Remaining request quota in the current sliding window.
  - `X-RateLimit-Reset`: Unix timestamp when the oldest request leaves the sliding window.
  - `Retry-After`: Seconds to wait before retrying when rate-limited.
- **HTTP 429 & 401 Error Handling**:
  - `429 Too Many Requests`: Exceeded limit returns `{ "error": "Rate limit exceeded", "retry_after": <seconds> }`.
  - `401 Unauthorized`: Missing or unknown API keys are rejected with descriptive JSON errors.
- **Interactive Inspection Dashboard**:
  - Live metric cards showing current usage, remaining requests, and countdown timer.
  - Multi-user isolation view (switch between Alice, Bob, Charlie, or custom/invalid keys).
  - Burst simulation controls (e.g. fire 11 requests to test limit breach).
  - Live HTTP response viewer (status, headers, body) and history log.
- **Automated Test Suite**: Unit and scenario tests verifying all 6 assignment requirements without external test dependencies.

---

## 🛠️ Technology Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router & Route Handlers)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Testing**: Node.js Native Test Runner (`node:test`, `node:assert`)
- **Runtime**: Node.js (v20+)

---

## 📋 Predefined API Keys

For review convenience, the following users and API keys are pre-configured:

| User Name | API Key | Role |
| :--- | :--- | :--- |
| **Alice Smith** | `user_123` | Standard User |
| **Bob Jones** | `user_456` | Developer Account |
| **Charlie Brown** | `user_789` | QA Tester |

> You can also supply any unknown key (e.g. `unknown_user_999`) to test `401 Unauthorized` handling.

---

## ⚙️ Configuration & Environment Variables

Create `.env.local` (or copy from `.env.example`):

```bash
# Maximum requests allowed per sliding window
RATE_LIMIT_MAX_REQUESTS=10

# Sliding window duration in seconds
RATE_LIMIT_WINDOW_SECONDS=60
```

---

## 🏃 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to interact with the dashboard.

### 3. Run Automated Tests

```bash
npm test
```

Runs all 8 test scenarios covering:
- First request succeeds with 200 and remaining = 9
- 10 requests within window all succeed
- 11th request returns 429 with retry_after
- Window expiration resets quota
- Missing and invalid API keys rejected with 401
- Independent per-user rate limit counters
- Burst / rapid repeated request correctness
- Usage inspection without quota consumption

### 4. Build for Production

```bash
npm run build
npm start
```

---

## 📡 API Reference

### 1. Rate-Limited Data Endpoint

- **Method**: `GET`
- **Route**: `/api/data`
- **Headers**: `X-API-Key: <api_key>`

#### Success Response (200 OK)
```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 1792565201
Content-Type: application/json

{
  "message": "Request successful",
  "data": {
    "value": "Hello World"
  }
}
```

#### Rate Limit Exceeded Response (429 Too Many Requests)
```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
Retry-After: 45
X-RateLimit-Reset: 1792565246
Content-Type: application/json

{
  "error": "Rate limit exceeded",
  "retry_after": 45
}
```

#### Missing / Invalid Key Response (401 Unauthorized)
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "Missing API key",
  "message": "Please provide an API key using the 'X-API-Key' header."
}
```

---

### 2. Rate-Limit Usage Endpoint (Inspection)

- **Method**: `GET`
- **Route**: `/api/usage` (inspect all users or pass `?key=user_123` / `X-API-Key: user_123`)
- **Note**: Does **not** consume rate limit quota.

#### Response Example
```json
{
  "apiKey": "user_123",
  "limit": 10,
  "used": 3,
  "remaining": 7,
  "retryAfter": 0,
  "resetInSeconds": 42,
  "resetAt": "2026-10-21T06:46:31.466Z",
  "isRateLimited": false
}
```

---

### 3. Reset Endpoint (Testing Helper)

- **Method**: `POST`
- **Route**: `/api/reset`
- **Body**: `{ "apiKey": "user_123" }` (or empty to reset all)

---

## 🔍 Architecture & Design Decisions

### Sliding Window Log Algorithm
- Rather than a fixed-window counter (which suffers from edge-burst attacks where 20 requests could pass at the boundary of two windows), this project implements an **in-memory sliding window log**.
- For each API key, timestamp records of requests within the preceding 60 seconds are retained.
- On each incoming request:
  1. Expired timestamps (`< now - windowMs`) are pruned.
  2. If the active timestamp count is `< maxRequests`: the current timestamp is appended and the request is permitted.
  3. If the active timestamp count is `>= maxRequests`: the request is rejected with HTTP `429`, calculating `retry_after = Math.ceil((oldestTimestamp + windowMs - now) / 1000)`.
- **In-Memory Store Persistence**: Attached to `globalThis` during development to prevent counter resets when Next.js fast-refreshes modules.
- **Clean Extensibility**: The `InMemoryRateLimiter` class is decoupled and can be swapped for a distributed Redis-backed implementation in multi-instance production environments.

---

## 🧪 Verification via CLI (cURL)

```bash
# 1. Valid request
curl -i -H "X-API-Key: user_123" http://localhost:3000/api/data

# 2. Missing key (401)
curl -i http://localhost:3000/api/data

# 3. Invalid key (401)
curl -i -H "X-API-Key: invalid_key" http://localhost:3000/api/data

# 4. Check usage
curl -i http://localhost:3000/api/usage
```
