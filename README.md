# GrowEasy AI-Powered CSV Importer

An intelligent CSV-to-CRM data importer that uses Google Gemini AI to extract and map lead data from **any CSV format** into the GrowEasy CRM schema.

---

## Features

- **Any CSV format** — Facebook Lead exports, Google Ads, Excel sheets, real estate CRMs, etc.
- **Drag & Drop upload** with client-side CSV parsing (PapaParse)
- **Raw data preview** before sending anything to the server
- **Confirm to import** — no AI calls until you approve
- **Real-time progress** — Server-Sent Events (SSE) stream live batch progress as AI processes
- **Retry with backoff** — failed AI batches are retried up to 3 times automatically
- **AI field mapping** using Gemini 2.0 Flash
- **Status badges** for CRM lead status (GOOD_LEAD_FOLLOW_UP, DID_NOT_CONNECT, BAD_LEAD, SALE_DONE)
- **Export results** as a clean CRM-ready CSV
- **Dark mode UI** — modern glassmorphism design

---

## Project Structure

```
.
├── express-csv-import/       # Node.js + Express backend
│   ├── src/
│   │   ├── index.js          # Server entry point
│   │   ├── routes/
│   │   │   └── importRoutes.js
│   │   ├── controllers/
│   │   │   └── importController.js   # SSE streaming response
│   │   ├── services/
│   │   │   └── llmService.js         # Gemini AI + batching + retry
│   │   └── middleware/
│   │       └── errorHandler.js
│   ├── .env.example
│   └── package.json
│
└── frontend-csv-import/      # Next.js frontend
    ├── src/app/
    │   ├── page.js           # 4-step import UI
    │   ├── layout.js
    │   └── globals.css
    ├── .env.local
    └── package.json
```

---

## Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- A **Google Gemini API key** — get one free at [Google AI Studio](https://aistudio.google.com/app/apikey)

---

## Setup & Running Locally

### Step 1 — Clone the repository

```bash
git clone <your-repo-url>
cd <repo-folder>
```

### Step 2 — Setup the Backend

```bash
cd express-csv-import
npm install
```

Create your `.env` file:

```bash
cp .env.example .env
```

Open `.env` and add your Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

Start the backend:

```bash
npm run dev
```

✅ Server running at: `http://localhost:3000`

---

### Step 3 — Setup the Frontend

Open a **new terminal**:

```bash
cd frontend-csv-import
npm install
npm run dev
```

✅ Frontend running at: `http://localhost:3001`

---

## API Reference

### `POST /api/import`

Accepts an array of parsed CSV row objects and streams AI-processed CRM records back via SSE.

**Request:**
```http
POST /api/import
Content-Type: application/json

[
  { "Full Name": "John Doe", "Contact Email": "john@example.com", "Phone": "9876543210" },
  ...
]
```

**SSE Events streamed in response:**

| Event Type | Payload |
|---|---|
| `progress` | `{ currentBatch, totalBatches, percentComplete, totalProcessed, totalSkipped }` |
| `complete` | `{ processed_records: [...], skipped_count, total_received, total_batches }` |
| `error` | `{ error: "message" }` |

---

## CRM Output Schema

| Field | Description |
|---|---|
| `created_at` | Lead creation date |
| `name` | Lead name |
| `email` | Primary email |
| `country_code` | Country dial code |
| `mobile_without_country_code` | Mobile number |
| `company` | Company name |
| `city` | City |
| `state` | State |
| `country` | Country |
| `lead_owner` | Assigned lead owner |
| `crm_status` | One of: `GOOD_LEAD_FOLLOW_UP`, `DID_NOT_CONNECT`, `BAD_LEAD`, `SALE_DONE` |
| `crm_note` | Remarks, extra emails/phones, follow-up notes |
| `data_source` | One of: `leads_on_demand`, `meridian_tower`, `eden_park`, `varah_swamy`, `sarjapur_plots` |
| `possession_time` | Property possession timeline |
| `description` | Additional details |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, Tailwind CSS, react-dropzone, PapaParse |
| Backend | Node.js, Express |
| AI | Google Gemini 2.0 Flash (`@google/genai`) |
| Streaming | Server-Sent Events (SSE) via Express |

---

## How It Works

1. **Upload** — User drops a CSV file; PapaParse parses it client-side into JSON rows
2. **Preview** — Raw data shown in a scrollable table; no AI calls yet
3. **Confirm** — User clicks "Confirm & Start AI Import"
4. **Batch Processing** — Backend splits records into batches of 20 and sends each to Gemini sequentially
5. **Live Progress** — Backend streams SSE events for each batch; frontend updates a progress bar in real time
6. **Results** — Final CRM records displayed in a table with status badges; export to CSV available

---

## Submitted By

**Position Applied For:** Software Developer Intern / Full-Time  
**Assignment:** GrowEasy AI-Powered CSV Importer  
**Submitted to:** varun@groweasy.ai
