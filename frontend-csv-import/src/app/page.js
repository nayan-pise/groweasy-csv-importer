"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';

// ─── Constants ───────────────────────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const CRM_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'mobile_without_country_code', label: 'Mobile' },
  { key: 'country_code', label: 'Code' },
  { key: 'company', label: 'Company' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'crm_status', label: 'Status' },
  { key: 'data_source', label: 'Source' },
  { key: 'lead_owner', label: 'Owner' },
  { key: 'possession_time', label: 'Possession' },
  { key: 'created_at', label: 'Created At' },
  { key: 'crm_note', label: 'Notes' },
  { key: 'description', label: 'Description' },
];

const STATUS_STYLES = {
  GOOD_LEAD_FOLLOW_UP: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  DID_NOT_CONNECT: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  BAD_LEAD: 'bg-red-500/15 text-red-400 border border-red-500/30',
  SALE_DONE: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
};

const STEPS = ['Upload', 'Preview', 'Processing', 'Results'];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepIndicator({ currentStep }) {
  const stepIndex = STEPS.indexOf(currentStep);
  return (
    <div className="flex items-center justify-center mb-10 select-none">
      {STEPS.map((step, i) => (
        <React.Fragment key={step}>
          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300
              ${i < stepIndex ? 'bg-cyan-500 border-cyan-500 text-white' :
                i === stepIndex ? 'bg-transparent border-cyan-400 text-cyan-400' :
                'bg-transparent border-slate-700 text-slate-600'}`}
            >
              {i < stepIndex ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : i + 1}
            </div>
            <span className={`mt-1.5 text-xs font-medium transition-colors duration-300
              ${i === stepIndex ? 'text-cyan-400' : i < stepIndex ? 'text-slate-300' : 'text-slate-600'}`}>
              {step}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-16 sm:w-24 h-0.5 mx-2 mb-5 transition-all duration-500
              ${i < stepIndex ? 'bg-cyan-500' : 'bg-slate-700'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function StatCard({ label, value, color = 'cyan', icon }) {
  const colorMap = {
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  };
  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-2 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 opacity-80">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-3xl font-extrabold">{value}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status) return <span className="text-slate-600">—</span>;
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_STYLES[status] || 'bg-slate-700 text-slate-300'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Export Helper ────────────────────────────────────────────────────────────

function exportToCSV(records) {
  const headers = CRM_COLUMNS.map((c) => c.key);
  const rows = records.map((r) =>
    headers.map((h) => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `groweasy_crm_import_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState('Upload');
  const [fileName, setFileName] = useState('');
  const [rawData, setRawData] = useState([]);
  const [previewColumns, setPreviewColumns] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState(null);
  const [importError, setImportError] = useState(null);

  // ── Step 1: Drop / Pick CSV ─────────────────────────────────────────────────
  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    if (rejectedFiles.length > 0) {
      setParseError('Please upload a valid .csv file.');
      return;
    }
    setParseError(null);
    const file = acceptedFiles[0];
    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setParseError('Error parsing CSV. Please check the file.');
          return;
        }
        setRawData(results.data);
        setPreviewColumns(results.meta?.fields || Object.keys(results.data[0] || {}));
        setStep('Preview');
      },
      error: (err) => setParseError(err.message),
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  });

  // ── Step 3: Confirm & Stream ─────────────────────────────────────────────────
  const handleConfirmImport = async () => {
    setStep('Processing');
    setImportError(null);
    setProgress({ currentBatch: 0, totalBatches: 1, percentComplete: 0, totalProcessed: 0, totalSkipped: 0 });

    try {
      const response = await fetch(`${API_URL}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rawData),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'progress') {
              setProgress(event);
            } else if (event.type === 'complete') {
              setResults(event);
              setStep('Results');
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (e) {
            if (e.message !== 'Unexpected end of JSON input') {
              throw e;
            }
          }
        }
      }
    } catch (err) {
      setImportError(err.message);
      setStep('Preview');
    }
  };

  // ── Reset ────────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setStep('Upload');
    setFileName('');
    setRawData([]);
    setPreviewColumns([]);
    setParseError(null);
    setProgress(null);
    setResults(null);
    setImportError(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold mb-4 tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            AI-Powered CSV Importer
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-500 tracking-tight mb-3">
            GrowEasy CRM Import
          </h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Upload any CSV format. Our AI intelligently extracts and maps your data into CRM-ready records.
          </p>
        </header>

        {/* Step Indicator */}
        <StepIndicator currentStep={step} />

        {/* ── STEP 1: UPLOAD ───────────────────────────────────────────────── */}
        {step === 'Upload' && (
          <div
            {...getRootProps()}
            className={`relative cursor-pointer w-full p-16 rounded-3xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center
              ${isDragActive
                ? 'border-cyan-400 bg-cyan-900/10 shadow-[0_0_40px_rgba(34,211,238,0.15)]'
                : 'border-slate-700 hover:border-blue-500 bg-slate-900/50 hover:bg-slate-800/60'}`}
          >
            <input {...getInputProps()} />
            <div className={`p-5 rounded-2xl mb-5 transition-all duration-300 ${isDragActive ? 'bg-cyan-500/20 scale-110' : 'bg-slate-800'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-14 w-14 transition-colors duration-300 ${isDragActive ? 'text-cyan-400' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-2xl font-semibold text-slate-200 mb-2">
              {isDragActive ? 'Drop it here!' : 'Drag & drop your CSV'}
            </p>
            <p className="text-slate-500 text-sm mb-6">or click to browse from your computer</p>
            <span className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-shadow">
              Browse Files
            </span>
            {parseError && (
              <p className="mt-6 text-red-400 text-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {parseError}
              </p>
            )}
          </div>
        )}

        {/* ── STEP 2: PREVIEW ──────────────────────────────────────────────── */}
        {step === 'Preview' && (
          <div className="space-y-6 animate-[fadeUp_0.4s_ease-out]">
            {/* File info bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-100 text-sm">{fileName}</p>
                  <p className="text-xs text-slate-500">{rawData.length} rows · {previewColumns.length} columns detected</p>
                </div>
              </div>
              <button onClick={handleReset} className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Upload different file
              </button>
            </div>

            {importError && (
              <div className="p-4 rounded-xl bg-red-900/20 border border-red-500/40 text-red-300 text-sm flex items-start gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div><strong>Import failed:</strong> {importError}</div>
              </div>
            )}

            {/* Preview Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-slate-100">Raw CSV Preview</h2>
                <span className="text-xs text-slate-500">Showing first {Math.min(rawData.length, 100)} of {rawData.length} rows</span>
              </div>
              <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900/60">
                <div className="overflow-x-auto overflow-y-auto max-h-72 custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead className="bg-slate-800/90 sticky top-0 z-10 backdrop-blur-sm">
                      <tr>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700 whitespace-nowrap">#</th>
                        {previewColumns.map((col, i) => (
                          <th key={i} className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {rawData.slice(0, 100).map((row, ri) => (
                        <tr key={ri} className="hover:bg-slate-800/30 transition-colors duration-100">
                          <td className="px-4 py-3 text-xs text-slate-600">{ri + 1}</td>
                          {previewColumns.map((col, ci) => (
                            <td key={ci} className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap max-w-[200px] truncate">
                              {row[col] || <span className="text-slate-700">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Confirm Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleConfirmImport}
                className="group relative px-8 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                Confirm & Start AI Import
                <span className="ml-1 px-2 py-0.5 rounded-lg bg-white/15 text-xs">{rawData.length} rows</span>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: PROCESSING ───────────────────────────────────────────── */}
        {step === 'Processing' && progress && (
          <div className="max-w-xl mx-auto animate-[fadeUp_0.4s_ease-out]">
            <div className="p-8 rounded-3xl border border-slate-800 bg-slate-900/60 text-center space-y-8">
              {/* Animated icon */}
              <div className="flex justify-center">
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-cyan-400 border-r-cyan-400/50 border-b-transparent border-l-transparent animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xl font-bold text-slate-100 mb-1">AI is processing your data</p>
                <p className="text-sm text-slate-500">
                  Batch {progress.currentBatch} of {progress.totalBatches} — please wait
                </p>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{progress.percentComplete}% complete</span>
                  <span>{progress.totalProcessed} records processed</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700 ease-out relative"
                    style={{ width: `${Math.max(progress.percentComplete, 3)}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                  </div>
                </div>
              </div>

              {/* Mini stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Batches Done', value: progress.currentBatch },
                  { label: 'Processed', value: progress.totalProcessed },
                  { label: 'Skipped', value: progress.totalSkipped },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl bg-slate-800/60 p-3 text-center">
                    <div className="text-xl font-bold text-slate-100">{value}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: RESULTS ──────────────────────────────────────────────── */}
        {step === 'Results' && results && (
          <div className="space-y-8 animate-[fadeUp_0.4s_ease-out]">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total Received" value={results.total_received}
                color="cyan"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg>}
              />
              <StatCard label="Successfully Imported" value={results.processed_count}
                color="green"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>}
              />
              <StatCard label="Skipped Records" value={results.skipped_count}
                color="red"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524L13.478 14.89zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" /></svg>}
              />
              <StatCard label="AI Batches Used" value={results.total_batches}
                color="blue"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" /><path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" /><path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" /></svg>}
              />
            </div>

            {/* Results Table Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                AI-Extracted CRM Records
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => exportToCSV(results.processed_records)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Export CSV
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-shadow"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  New Import
                </button>
              </div>
            </div>

            {/* Results Table */}
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900/60 shadow-2xl">
              <div className="overflow-x-auto overflow-y-auto max-h-[500px] custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-max">
                  <thead className="bg-slate-800/90 sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700">#</th>
                      {CRM_COLUMNS.map((col) => (
                        <th key={col.key} className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700 whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {results.processed_records.map((row, ri) => (
                      <tr key={ri} className="hover:bg-slate-800/30 transition-colors duration-100">
                        <td className="px-4 py-3.5 text-xs text-slate-600">{ri + 1}</td>
                        {CRM_COLUMNS.map((col) => (
                          <td key={col.key} className="px-4 py-3.5 text-sm text-slate-400 whitespace-nowrap max-w-[200px] truncate">
                            {col.key === 'crm_status' ? (
                              <StatusBadge status={row[col.key]} />
                            ) : (
                              row[col.key] || <span className="text-slate-700">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {results.skipped_count > 0 && (
                <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-800/40 text-sm text-amber-400/80 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {results.skipped_count} record{results.skipped_count !== 1 ? 's were' : ' was'} skipped (missing both email and mobile number).
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
