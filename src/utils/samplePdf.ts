/**
 * Generates a deterministic, valid 3-page PDF 1.4 document in memory (no network fetch needed).
 * Landscape-friendly page size (792 x 612 pts, US Letter Landscape) with clear study text,
 * headings, and colored callout bars so greyscale, opacity, and straight-line highlights
 * are immediately demonstrable.
 */
function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

interface PageTextSpec {
  title: string;
  subtitle: string;
  accentRgb: [number, number, number];
  paragraphs: string[];
}

const SAMPLE_PAGES: PageTextSpec[] = [
  {
    title: 'Active Recall & Selective Visual Focus',
    subtitle: 'Page 1 of 3  |  Cognitive Study Methodologies',
    accentRgb: [0.12, 0.35, 0.72],
    paragraphs: [
      '1. Selective Attention in Dense Technical Reading',
      'When reviewing complex textbooks or research papers, full-page visual density often',
      'competes with working memory. Lowering surrounding page opacity while preserving',
      'key horizontal lines at full opacity trains rapid retrieval and pattern recognition.',
      '',
      '2. Straight-Line Horizontal Anchoring',
      'Swipe horizontally across any sentence or formula in an editable variant to lock',
      'a crisp straight-line focus strip at 100% opacity. Swipe vertically to scroll.',
      '',
      '3. Multi-Variant Study Passes',
      'Keep the Base document untouched as your canonical reference, then create multiple',
      'variants for first-pass definitions, second-pass equations, or exam review.',
    ],
  },
  {
    title: 'Memory Consolidation & Retrieval Curves',
    subtitle: 'Page 2 of 3  |  Spaced Repetition Principles',
    accentRgb: [0.76, 0.38, 0.08],
    paragraphs: [
      '1. The Testing Effect and Desirable Difficulty',
      'Passive re-reading creates an illusion of competence because fluent text feels',
      'familiar. Reducing background contrast forces active reconstruction of context',
      'from highlighted anchor phrases rather than relying on peripheral cues.',
      '',
      '2. Greyscale Mode for Chromatic Neutrality',
      'Enabling greyscale removes decorative color bias from diagrams and callout boxes,',
      'allowing structural typography and highlighted focal bands to guide your eye.',
      '',
      '3. Key Equation Reference',
      'Retention Probability:  R(t) = exp( -t / S )   where S scales after each recall.',
    ],
  },
  {
    title: 'Synthesis Checklist & Field Workflow',
    subtitle: 'Page 3 of 3  |  Practical Implementation',
    accentRgb: [0.09, 0.48, 0.36],
    paragraphs: [
      '1. First Pass — Structural Skeleton',
      'Create Variant 1 and highlight only section headers and core thesis statements.',
      'Set whole-PDF opacity to 35% to verify that the outline reads coherently alone.',
      '',
      '2. Second Pass — Supporting Evidence',
      'Duplicate Variant 1 into Variant 2 and add key quantitative thresholds or dates.',
      'Slide between Base, Variant 1, and Variant 2 using the fixed bottom track.',
      '',
      '3. Final Review — Rapid Sweep',
      'Lower PDF opacity to 15% before an exam or briefing to test instant recall',
      'using only your full-opacity horizontal highlight bands.',
    ],
  },
];

function buildPageStream(spec: PageTextSpec): string {
  const [r, g, b] = spec.accentRgb;
  const lines: string[] = [];

  // Subtle colored header accent bar (demonstrates greyscale filter clearly)
  lines.push(`${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg`);
  lines.push('48 530 696 8 re f');

  // Header title
  lines.push('0.06 0.09 0.16 rg');
  lines.push('BT');
  lines.push('/F2 22 Tf');
  lines.push(`48 492 Td (${escapePdfText(spec.title)}) Tj`);
  lines.push('ET');

  // Subtitle
  lines.push(`${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg`);
  lines.push('BT');
  lines.push('/F1 11 Tf');
  lines.push(`48 468 Td (${escapePdfText(spec.subtitle)}) Tj`);
  lines.push('ET');

  // Divider line
  lines.push('0.82 0.85 0.90 RG 1 w 48 452 m 744 452 l S');

  // Body paragraphs
  let y = 418;
  for (const line of spec.paragraphs) {
    if (line === '') {
      y -= 14;
      continue;
    }
    const isHeading = /^[1-3]\.\s/.test(line);
    lines.push('BT');
    lines.push(isHeading ? '/F2 14 Tf' : '/F1 12.5 Tf');
    if (isHeading) {
      lines.push('0.06 0.09 0.16 rg');
    } else {
      lines.push('0.20 0.25 0.33 rg');
    }
    lines.push(`48 ${y} Td (${escapePdfText(line)}) Tj`);
    lines.push('ET');
    y -= isHeading ? 24 : 21;
  }

  return lines.join('\n');
}

export function createSamplePdfBytes(): Uint8Array {
  const objects: string[] = [];

  // 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages (3 pages: objects 5, 7, 9)
  objects.push('2 0 obj\n<< /Type /Pages /Kids [5 0 R 7 0 R 9 0 R] /Count 3 >>\nendobj\n');

  // 3: Font Regular
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  // 4: Font Bold
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');

  SAMPLE_PAGES.forEach((spec, idx) => {
    const pageObjNum = 5 + idx * 2;
    const contentObjNum = pageObjNum + 1;
    const stream = buildPageStream(spec);

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}
