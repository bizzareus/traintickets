import { PDFDocument } from 'pdf-lib';

/**
 * Merges multiple PDF buffers or Uint8Arrays into a single unified PDF document.
 * If only one buffer is passed, returns that buffer directly.
 */
export async function mergePdfBuffers(
  buffers: (Buffer | Uint8Array)[],
): Promise<Buffer> {
  const validBuffers = buffers.filter((b) => b && b.length > 0);
  if (validBuffers.length === 0) {
    throw new Error('At least one valid PDF buffer is required for merging');
  }

  if (validBuffers.length === 1) {
    const single = validBuffers[0];
    return Buffer.isBuffer(single) ? single : Buffer.from(single);
  }

  const mergedPdf = await PDFDocument.create();

  for (const buffer of validBuffers) {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    for (const page of copiedPages) {
      mergedPdf.addPage(page);
    }
  }

  const mergedBytes = await mergedPdf.save();
  return Buffer.from(mergedBytes);
}
