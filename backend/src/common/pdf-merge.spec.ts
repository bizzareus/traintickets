import { PDFDocument } from 'pdf-lib';
import { mergePdfBuffers } from './pdf-merge';

describe('pdf-merge utility', () => {
  it('throws error if empty array or zero buffers are provided', async () => {
    await expect(mergePdfBuffers([])).rejects.toThrow(
      'At least one valid PDF buffer is required for merging',
    );
  });

  it('returns single buffer unchanged if only one is provided', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const bytes = await doc.save();
    const result = await mergePdfBuffers([Buffer.from(bytes)]);
    expect(Buffer.isBuffer(result)).toBe(true);
    const loaded = await PDFDocument.load(result);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('merges multiple PDF buffers in order and combines their pages', async () => {
    const doc1 = await PDFDocument.create();
    doc1.addPage([200, 200]);
    const bytes1 = await doc1.save();

    const doc2 = await PDFDocument.create();
    doc2.addPage([300, 300]);
    doc2.addPage([400, 400]);
    const bytes2 = await doc2.save();

    const merged = await mergePdfBuffers([Buffer.from(bytes1), Buffer.from(bytes2)]);
    const loadedMerged = await PDFDocument.load(merged);
    expect(loadedMerged.getPageCount()).toBe(3);
  });
});
