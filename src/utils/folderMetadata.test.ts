import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeFolderPdfsWithMetadata,
  parseFolderMetadata,
  serializeFolderMetadata,
} from './folderMetadata';

test('parseFolderMetadata handles empty, invalid, and valid JSON cleanly', () => {
  const empty = parseFolderMetadata(null);
  assert.equal(empty.version, 1);
  assert.deepEqual(empty.documents, {});

  const invalid = parseFolderMetadata('{not valid json');
  assert.deepEqual(invalid.documents, {});

  const valid = parseFolderMetadata(
    JSON.stringify({
      version: 1,
      updatedAt: 500,
      documents: {
        'notes.pdf': {
          id: 'p1',
          name: 'notes.pdf',
          greyscale: true,
          opacity: 0.4,
          variants: [
            { id: 'base', name: 'Base', isBase: true, highlights: [], createdAt: 1 },
            {
              id: 'v1',
              name: 'Exam',
              isBase: false,
              highlights: [
                { id: 'h1', pageIndex: 0, xStart: 0.1, xEnd: 0.5, yCenter: 0.3, heightRatio: 0.018, createdAt: 2 },
              ],
              createdAt: 2,
            },
          ],
        },
      },
    })
  );
  assert.equal(valid.documents['notes.pdf'].greyscale, true);
  assert.equal(valid.documents['notes.pdf'].opacity, 0.4);
  assert.equal(valid.documents['notes.pdf'].variants[1].name, 'Exam');
  assert.equal(valid.documents['notes.pdf'].variants[1].highlights[0].color, '#FDE047');
});

test('mergeFolderPdfsWithMetadata preserves existing metadata and creates Base for new PDFs', () => {
  const existing = parseFolderMetadata(
    JSON.stringify({
      version: 1,
      updatedAt: 100,
      documents: {
        'chapter1.pdf': {
          id: 'doc_1',
          name: 'chapter1.pdf',
          opacity: 0.3,
          greyscale: true,
          variants: [
            { id: 'base', name: 'Base', isBase: true, highlights: [], createdAt: 1 },
            { id: 'v1', name: 'Summary', isBase: false, highlights: [], createdAt: 2 },
          ],
        },
      },
    })
  );

  const { activeDocuments, metadata } = mergeFolderPdfsWithMetadata(
    [
      { name: 'chapter2.pdf', fileSize: 2048, lastModified: 200 },
      { name: 'chapter1.pdf', fileSize: 1024, lastModified: 150 },
    ],
    existing,
    300
  );

  assert.equal(activeDocuments.length, 2);
  assert.equal(activeDocuments[0].name, 'chapter1.pdf');
  assert.equal(activeDocuments[0].opacity, 0.3);
  assert.equal(activeDocuments[0].variants.length, 2);

  assert.equal(activeDocuments[1].name, 'chapter2.pdf');
  assert.equal(activeDocuments[1].variants.length, 1);
  assert.equal(activeDocuments[1].variants[0].isBase, true);
  assert.equal(metadata.documents['chapter2.pdf'].fileSize, 2048);
});

test('serializeFolderMetadata writes updated records while keeping existing map entries', () => {
  const existing = parseFolderMetadata(
    JSON.stringify({
      version: 1,
      updatedAt: 100,
      documents: {
        'archived.pdf': { id: 'old', name: 'archived.pdf' },
      },
    })
  );

  const { activeDocuments } = mergeFolderPdfsWithMetadata(
    [{ name: 'active.pdf', fileSize: 512 }],
    existing,
    200
  );

  const json = serializeFolderMetadata(activeDocuments, existing, 500);
  const reparsed = parseFolderMetadata(json);
  assert.ok(reparsed.documents['active.pdf']);
  assert.ok(reparsed.documents['archived.pdf']);
  assert.equal(reparsed.updatedAt, 500);
});

test('parseFolderMetadata migrates and deduplicates legacy per-variant imagePins into universal doc.imagePins', () => {
  const legacyPin = {
    id: 'img_legacy_1',
    pageIndex: 0,
    x: 0.3,
    y: 0.5,
    assetFileName: 'asset_legacy.png',
    originalName: 'photo.png',
    mimeType: 'image/png',
    createdAt: 10,
  };
  const parsed = parseFolderMetadata(
    JSON.stringify({
      version: 1,
      updatedAt: 200,
      documents: {
        'legacy.pdf': {
          id: 'doc_leg',
          name: 'legacy.pdf',
          variants: [
            { id: 'base', name: 'Base', isBase: true, highlights: [], imagePins: [], createdAt: 1 },
            { id: 'v1', name: 'V1', isBase: false, highlights: [], imagePins: [legacyPin], createdAt: 2 },
            { id: 'v2', name: 'V1 Copy', isBase: false, highlights: [], imagePins: [{ ...legacyPin, id: 'img_legacy_dup' }], createdAt: 3 },
          ],
        },
      },
    })
  );

  const doc = parsed.documents['legacy.pdf'];
  assert.equal(doc.imagePins?.length, 1);
  assert.equal(doc.imagePins?.[0].assetFileName, 'asset_legacy.png');
  assert.equal(doc.variants[1].imagePins.length, 0);
  assert.equal(doc.variants[2].imagePins.length, 0);
});

test('mergeFolderPdfsWithMetadata keeps nested relative-path identity distinct across sibling subfolders', () => {
  const existing = parseFolderMetadata(
    JSON.stringify({
      version: 1,
      updatedAt: 400,
      documents: {
        'Physics/Unit 1.pdf': {
          id: 'doc_phys',
          name: 'Physics/Unit 1.pdf',
          opacity: 0.45,
          variants: [
            { id: 'b1', name: 'Base', isBase: true, highlights: [], createdAt: 1 },
            { id: 'v_phys', name: 'Mechanics', isBase: false, highlights: [], createdAt: 2 },
          ],
        },
        'Chemistry/Unit 1.pdf': {
          id: 'doc_chem',
          name: 'Chemistry/Unit 1.pdf',
          opacity: 0.85,
          variants: [{ id: 'b2', name: 'Base', isBase: true, highlights: [], createdAt: 1 }],
        },
      },
    })
  );

  const { activeDocuments, metadata } = mergeFolderPdfsWithMetadata(
    [
      { name: 'Chemistry/Unit 1.pdf', fileSize: 1200 },
      { name: 'Physics/Unit 1.pdf', fileSize: 2400 },
      { name: 'Physics/Optics/Unit 1.pdf', fileSize: 3600 },
    ],
    existing,
    500
  );

  assert.equal(activeDocuments.length, 3);
  const phys = metadata.documents['Physics/Unit 1.pdf'];
  const chem = metadata.documents['Chemistry/Unit 1.pdf'];
  const optics = metadata.documents['Physics/Optics/Unit 1.pdf'];

  assert.equal(phys.id, 'doc_phys');
  assert.equal(phys.variants.length, 2);
  assert.equal(phys.opacity, 0.45);
  assert.equal(chem.id, 'doc_chem');
  assert.equal(chem.variants.length, 1);
  assert.equal(chem.opacity, 0.85);
  assert.ok(optics.id && optics.id !== 'doc_phys' && optics.id !== 'doc_chem');
});
