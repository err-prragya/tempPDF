import type { PdfDocumentRecord } from '../types/pdf';

export interface FolderTreeNode {
  name: string;
  path: string;
  subfolders: FolderTreeNode[];
  documents: PdfDocumentRecord[];
  totalPdfCount: number;
}

export function normalizeRelativePath(rawPath: string): string {
  return rawPath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.')
    .join('/');
}

export function joinRelativePath(parentPath: string, name: string): string {
  const cleanParent = normalizeRelativePath(parentPath);
  const cleanName = normalizeRelativePath(name);
  if (!cleanParent) return cleanName;
  if (!cleanName) return cleanParent;
  return `${cleanParent}/${cleanName}`;
}

export function splitParentAndBaseName(relativePath: string): {
  parentPath: string;
  baseName: string;
} {
  const normalized = normalizeRelativePath(relativePath);
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) {
    return { parentPath: '', baseName: normalized };
  }
  return {
    parentPath: normalized.slice(0, lastSlash),
    baseName: normalized.slice(lastSlash + 1),
  };
}

export function getPdfDisplayName(relativePath: string): string {
  const { baseName } = splitParentAndBaseName(relativePath);
  return baseName || relativePath;
}

const naturalCompare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export function buildFolderTree(
  documents: PdfDocumentRecord[],
  folderPaths: string[] = []
): FolderTreeNode {
  const root: FolderTreeNode = {
    name: '',
    path: '',
    subfolders: [],
    documents: [],
    totalPdfCount: 0,
  };

  const nodeMap = new Map<string, FolderTreeNode>();
  nodeMap.set('', root);

  const ensureFolder = (rawFolderPath: string): FolderTreeNode => {
    const clean = normalizeRelativePath(rawFolderPath);
    if (!clean) return root;
    const existing = nodeMap.get(clean);
    if (existing) return existing;

    const segments = clean.split('/');
    let currentPath = '';
    let parentNode = root;

    for (const seg of segments) {
      currentPath = currentPath ? `${currentPath}/${seg}` : seg;
      let node = nodeMap.get(currentPath);
      if (!node) {
        node = {
          name: seg,
          path: currentPath,
          subfolders: [],
          documents: [],
          totalPdfCount: 0,
        };
        nodeMap.set(currentPath, node);
        parentNode.subfolders.push(node);
      }
      parentNode = node;
    }

    return parentNode;
  };

  for (const fp of folderPaths) {
    ensureFolder(fp);
  }

  for (const doc of documents) {
    const { parentPath } = splitParentAndBaseName(doc.name);
    const parentNode = ensureFolder(parentPath);
    parentNode.documents.push(doc);
  }

  const finalizeNode = (node: FolderTreeNode): number => {
    node.subfolders.sort((a, b) => naturalCompare(a.name, b.name));
    node.documents.sort((a, b) =>
      naturalCompare(getPdfDisplayName(a.name), getPdfDisplayName(b.name))
    );

    let total = node.documents.length;
    for (const child of node.subfolders) {
      total += finalizeNode(child);
    }
    node.totalPdfCount = total;
    return total;
  };

  finalizeNode(root);
  return root;
}

export function collectAllSubfolderPaths(root: FolderTreeNode): string[] {
  const paths: string[] = [];
  const visit = (node: FolderTreeNode) => {
    for (const child of node.subfolders) {
      paths.push(child.path);
      visit(child);
    }
  };
  visit(root);
  return paths;
}

export function getFolderNodeAtPath(
  root: FolderTreeNode,
  rawPath: string
): FolderTreeNode {
  const cleanPath = normalizeRelativePath(rawPath);
  if (!cleanPath) return root;

  const segments = cleanPath.split('/');
  let current = root;
  for (const segment of segments) {
    const next = current.subfolders.find((child) => child.name === segment);
    if (!next) {
      return current;
    }
    current = next;
  }
  return current;
}

export interface FolderBreadcrumb {
  label: string;
  path: string;
}

export function getBreadcrumbs(
  rootLabel: string,
  rawPath: string
): FolderBreadcrumb[] {
  const crumbs: FolderBreadcrumb[] = [{ label: rootLabel, path: '' }];
  const cleanPath = normalizeRelativePath(rawPath);
  if (!cleanPath) return crumbs;

  let acc = '';
  for (const segment of cleanPath.split('/')) {
    acc = acc ? `${acc}/${segment}` : segment;
    crumbs.push({ label: segment, path: acc });
  }
  return crumbs;
}
