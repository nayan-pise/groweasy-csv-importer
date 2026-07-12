const { processRecordsWithAI } = require('../services/llmService');

/**
 * POST /api/import
 *
 * Accepts an array of raw parsed CSV row objects.
 * Responds with a Server-Sent Events (SSE) stream so the client
 * can display real-time batch progress and the final result.
 *
 * Event types:
 *   { type: 'progress', currentBatch, totalBatches, percentComplete, totalProcessed, totalSkipped }
 *   { type: 'complete', processed_records, skipped_count, total_received, total_batches }
 *   { type: 'error',   error: <message> }
 */
exports.handleImport = async (req, res) => {
  const data = req.body;

  // Basic validation before we open the stream
  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Payload must be a non-empty array of parsed CSV row objects.',
    });
  }

  // --- Open the SSE stream ---
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx proxy buffering

  // Flush headers immediately so the client knows the connection is open
  if (res.flushHeaders) res.flushHeaders();

  const sendEvent = (eventData) => {
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
  };

  console.log(`Received ${data.length} raw CSV records. Starting AI processing...`);

  try {
    const result = await processRecordsWithAI(data, (progress) => {
      sendEvent({ type: 'progress', ...progress });
    });

    console.log(
      `AI processing complete. Processed: ${result.processed_records.length}, Skipped: ${result.skipped_count}`
    );

    sendEvent({
      type: 'complete',
      success: true,
      message: 'CSV data processed successfully.',
      total_received: data.length,
      total_batches: result.total_batches,
      skipped_count: result.skipped_count,
      processed_count: result.processed_records.length,
      processed_records: result.processed_records,
    });
  } catch (error) {
    console.error('[Import SSE Error]:', error.message);
    sendEvent({
      type: 'error',
      success: false,
      error: error.message,
    });
  } finally {
    res.end();
  }
};
