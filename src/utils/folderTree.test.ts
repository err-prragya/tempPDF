import test from 'node:test';
import assert from 'node:assert/strict';
import type { PdfDocumentRecord } from '../types/pdf';
import {
  buildFolderTree,
  collectAllSubfolderPaths,
  getPdfDisplayName,
  joinRelativePath,
  normalizeRelativePath,
  splitParentAndBaseName,
} from './folderTree';

function makeDoc(name: string, id = name): PdfDocumentRecord {
  return {
    id,
    name,
    fileSize: 1024,
    pageCount: 1,
    addedAt: 100,
    greyscale: false,
    opacity: 1,
    highlightColor: '#FDE047',
    highlightWidth: 0.02,
    activeVariantIndex: 0,
    variants: [{ id: 'base', name: 'Base', isBase: true, highlights: [], imagePins: [], createdAt: 100 }],
    imagePins: [],
  };
}

test('path helpers normalize, join, split, and extract clean display filenames', () => {
  assert.equal(normalizeRelativePath('/Physics\\Mechanics//Ch 1.pdf/'), 'Physics/Mechanics/Ch 1.pdf');
  assert.equal(joinRelativePath('', 'Root.pdf'), 'Root.pdf');
  assert.equal(joinRelativePath('Physics/Mechanics', 'Ch 1.pdf'), 'Physics/Mechanics/Ch 1.pdf');
  assert.deepEqual(splitParentAndBaseName('Root.pdf'), { parentPath: '', baseName: 'Root.pdf' });
  assert.deepEqual(splitParentAndBaseName('Physics/Mechanics/Ch 1.pdf'), {
    parentPath: 'Physics/Mechanics',
    baseName: 'Ch 1.pdf',
  });
  assert.equal(getPdfDisplayName('Physics/Mechanics/Ch 1.pdf'), 'Ch 1.pdf');
  assert.equal(getPdfDisplayName('Root.pdf'), 'Root.pdf');
});

test('buildFolderTree preserves nested subfolders, duplicate basenames in sibling folders, and empty folders', () => {
  const docs = [
    makeDoc('Syllabus.pdf', 'd1'),
    makeDoc('Physics/Unit 1.pdf', 'd2'),
    makeDoc('Physics/Mechanics/Chapter 2.pdf', 'd3'),
    makeDoc('Physics/Mechanics/Chapter 10.pdf', 'd4'),
    makeDoc('Chemistry/Unit 1.pdf', 'd5'),
  ];

  const tree = buildFolderTree(docs, ['Biology/Empty Sub', 'Physics', 'Physics/Mechanics', 'Chemistry']);

  assert.equal(tree.documents.length, 1);
  assert.equal(tree.documents[0].name, 'Syllabus.pdf');
  assert.equal(tree.totalPdfCount, 5);

  assert.deepEqual(
    tree.subfolders.map((f) => f.name),
    ['Biology', 'Chemistry', 'Physics']
  );

  const biology = tree.subfolders[0];
  assert.equal(biology.path, 'Biology');
  assert.equal(biology.totalPdfCount, 0);
  assert.equal(biology.subfolders.length, 1);
  assert.equal(biology.subfolders[0].path, 'Biology/Empty Sub');
  assert.equal(biology.subfolders[0].totalPdfCount, 0);

  const chemistry = tree.subfolders[1];
  assert.equal(chemistry.documents[0].id, 'd5');
  assert.equal(getPdfDisplayName(chemistry.documents[0].name), 'Unit 1.pdf');

  const physics = tree.subfolders[2];
  assert.equal(physics.totalPdfCount, 3);
  assert.equal(physics.documents[0].id, 'd2');
  assert.equal(physics.subfolders[0].name, 'Mechanics');
  assert.equal(physics.subfolders[0].path, 'Physics/Mechanics');
  // Natural numeric sort: Chapter 2 before Chapter 10
  assert.deepEqual(
    physics.subfolders[0].documents.map((d) => getPdfDisplayName(d.name)),
    ['Chapter 2.pdf', 'Chapter 10.pdf']
  );

  assert.deepEqual(collectAllSubfolderPaths(tree), [
    'Biology',
    'Biology/Empty Sub',
    'Chemistry',
    'Physics',
    'Physics/Mechanics',
  ]);
});
