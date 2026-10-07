/**
 * Builds the onboarding PDFs in docs/ from docs/src/*.md.
 *
 *   npm run docs:build              all guides
 *   npm run docs:build -- turf      only guides whose source name contains "turf"
 *
 * Code is never copy-pasted into the Markdown. A line like
 *
 *   @snippet docs/examples/turf/04-recipes.test.ts#geofence
 *
 * is replaced at build time with the lines between `// #region geofence` and `// #endregion`
 * in that file (or `#fn:name` for an exported function, or no `#` for the whole file).
 * Those files are run by `npm test`, so every snippet in the PDFs compiles and passes.
 *
 * Needs Node 22.18+ (runs TypeScript directly) and Chromium for Playwright:
 *   npx playwright install chromium-headless-shell
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked, type Tokens } from 'marked';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'node_modules/dejavu-fonts-ttf/ttf');
/** Code lines longer than this wrap in the PDF (7.8pt mono across 170 mm, minus padding). */
const MAX_CODE_COLS = 96;

const GUIDES = [
  { src: 'docs/src/fast-check.md', out: 'docs/fast-check-onboarding.pdf' },
  { src: 'docs/src/turf.md', out: 'docs/turf-onboarding.pdf' },
];

// ---------------------------------------------------------------------------------------------
// Snippets

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function dedent(lines: string[]): string[] {
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length);
  const cut = Math.min(...indents);
  return lines.map((l) => l.slice(cut));
}

function extractRegion(file: string, lines: string[], name: string): string[] {
  const start = lines.findIndex((l) => l.trim() === `// #region ${name}`);
  if (start < 0) throw new Error(`${file}: no "// #region ${name}"`);
  const out: string[] = [];
  let depth = 0;
  for (const line of lines.slice(start + 1)) {
    const t = line.trim();
    if (t.startsWith('// #region ')) { depth++; continue; }
    if (t === '// #endregion') {
      if (depth === 0) return out;
      depth--;
      continue;
    }
    out.push(line);
  }
  throw new Error(`${file}: region "${name}" has no // #endregion`);
}

/** An exported function, with its JSDoc, up to the closing brace in column 0. */
function extractFunction(file: string, lines: string[], name: string): string[] {
  const decl = lines.findIndex((l) => new RegExp(`^export (async )?function ${name}\\b`).test(l));
  if (decl < 0) throw new Error(`${file}: no exported function ${name}`);
  let start = decl;
  if (lines[decl - 1]?.trim() === '*/') while (!lines[start]!.trim().startsWith('/**')) start--;
  const end = lines.findIndex((l, i) => i > decl && l === '}');
  return lines.slice(start, end + 1);
}

type Snippet = { file: string; code: string };

function loadSnippet(ref: string): Snippet {
  const [file, selector] = ref.split('#') as [string, string | undefined];
  const lines = read(file).replace(/\s+$/, '').split('\n');
  let picked: string[];
  if (!selector) picked = lines.filter((l) => !/^\s*\/\/ #(end)?region\b/.test(l));
  else if (selector.startsWith('fn:')) picked = extractFunction(file, lines, selector.slice(3));
  else picked = extractRegion(file, lines, selector);
  const code = dedent(picked).join('\n').replace(/^\n+|\n+$/g, '');
  for (const [i, l] of code.split('\n').entries()) {
    if (l.length > MAX_CODE_COLS) console.warn(`  ! ${ref} line ${i + 1}: ${l.length} cols (wraps)`);
  }
  return { file, code };
}

// ---------------------------------------------------------------------------------------------
// Markdown -> HTML

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Grey out comments, as in the MapLibre guide. Strings are skipped so '//' in a URL survives. */
function highlight(code: string, lang: string): string {
  if (!['ts', 'tsx', 'js', 'json'].includes(lang)) return esc(code);
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i]!;
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== c && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1;
      out += esc(code.slice(i, j + 1));
      i = j + 1;
    } else if (c === '/' && code[i + 1] === '/') {
      const j = code.indexOf('\n', i);
      const end = j < 0 ? code.length : j;
      out += `<span class="c">${esc(code.slice(i, end))}</span>`;
      i = end;
    } else if (c === '/' && code[i + 1] === '*') {
      const j = code.indexOf('*/', i + 2);
      const end = j < 0 ? code.length : j + 2;
      out += `<span class="c">${esc(code.slice(i, end))}</span>`;
      i = end;
    } else {
      out += esc(c);
      i++;
    }
  }
  return out;
}

const codeBlock = (code: string, lang: string, caption?: string) =>
  `<figure class="code">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}` +
  `<pre><code>${highlight(code, lang)}</code></pre></figure>\n`;

function renderMarkdown(md: string): string {
  let section = 0;
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const text = this.parser.parseInline(tokens);
        if (depth !== 2) return `<h${depth}>${text}</h${depth}>\n`;
        section++;
        const num = String(section).padStart(2, '0');
        return `<h2 id="s${num}"><span class="num">${num}</span> ${text}</h2>\n`;
      },
      code({ text, lang }: Tokens.Code) {
        return codeBlock(text, lang ?? '');
      },
    },
  });

  // Generated HTML goes in after Markdown parsing, through placeholders: a blank line inside
  // raw HTML would end the HTML block and the rest would be parsed as Markdown.
  const blocks: string[] = [];
  const placeholder = (html: string) => `\n<!--block:${blocks.push(html) - 1}-->\n`;

  // @snippet path#selector -> a captioned code block, straight from the tested file
  md = md.replace(/^@snippet (\S+)$/gm, (_m, ref: string) => {
    const { file, code } = loadSnippet(ref);
    const lang = file.endsWith('.json') ? 'json' : 'ts';
    return placeholder(codeBlock(code, lang, file));
  });

  // :::warning / :::note blocks -> callouts (Markdown inside)
  md = md.replace(/^:::(warning|note)\n([\s\S]*?)^:::$/gm, (_m, kind: string, body: string) =>
    placeholder(`<div class="callout ${kind}">\n${marked.parse(body) as string}</div>`),
  );

  let html = marked.parse(md) as string;
  // Callouts can contain snippet placeholders, so substitute until none are left.
  while (/<!--block:\d+-->/.test(html)) {
    html = html.replace(/<!--block:(\d+)-->/g, (_m, i: string) => blocks[Number(i)]!);
  }
  return html;
}

// ---------------------------------------------------------------------------------------------
// Page

type FrontMatter = { title: string; kicker: string; lede: string };

function parseFrontMatter(src: string): { meta: FrontMatter; body: string } {
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error('missing front matter');
  const meta = Object.fromEntries(
    m[1]!.split('\n').map((l) => {
      const i = l.indexOf(':');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
  ) as FrontMatter;
  return { meta, body: src.slice(m[0].length) };
}

function fontFaces(): string {
  const faces: Array<[family: string, file: string, weight: number, style: string]> = [
    ['DejaVu Sans', 'DejaVuSans.ttf', 400, 'normal'],
    ['DejaVu Sans', 'DejaVuSans-Bold.ttf', 700, 'normal'],
    ['DejaVu Sans', 'DejaVuSans-Oblique.ttf', 400, 'italic'],
    ['DejaVu Sans', 'DejaVuSans-BoldOblique.ttf', 700, 'italic'],
    ['DejaVu Sans Condensed', 'DejaVuSansCondensed-Bold.ttf', 700, 'normal'],
    ['DejaVu Sans Mono', 'DejaVuSansMono.ttf', 400, 'normal'],
    ['DejaVu Sans Mono', 'DejaVuSansMono-Bold.ttf', 700, 'normal'],
  ];
  return faces
    .map(([family, file, weight, style]) => {
      const data = readFileSync(join(FONT_DIR, file)).toString('base64');
      return `@font-face { font-family: '${family}'; font-weight: ${weight}; font-style: ${style};
        src: url(data:font/ttf;base64,${data}) format('truetype'); }`;
    })
    .join('\n');
}

function page(meta: FrontMatter, bodyHtml: string, css: string): string {
  const footer = `${meta.title} · Onboarding`.replace(/"/g, '\\"');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(meta.title)} — Onboarding Guide</title>
<style>
${fontFaces()}
${css}
@page { @bottom-left { content: "${footer}"; } }
@page :first { @bottom-left { content: none; } }
</style></head>
<body>
<header class="masthead">
  <p class="kicker">${esc(meta.kicker)}</p>
  <h1>${esc(meta.title)}</h1>
  <p class="lede">${esc(meta.lede)}</p>
</header>
${bodyHtml}
</body></html>`;
}

/**
 * Runs in the page before printing.
 * - Keeps headings, and paragraphs that introduce something ("...:"), with what follows.
 * - Stops "fast-check" (and similar names) from breaking at the hyphen in running text.
 */
function polish() {
  for (const el of Array.from(document.querySelectorAll('h2, h3, p, figcaption'))) {
    const isIntro = el.tagName === 'P' && el.textContent?.trim().endsWith(':');
    if (el.tagName !== 'P' || isIntro) el.classList.add('keep-with-next');
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.parentElement?.closest('pre, code') && /\w-\w/.test(node.data)) hits.push(node);
  }
  for (const node of hits) {
    const span = document.createElement('span');
    span.innerHTML = node.data
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/([\w.]+-[\w-]+)/g, '<span class="nobr">$1</span>');
    node.replaceWith(...Array.from(span.childNodes));
  }
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const filter = process.argv[2];
  const css = read('docs/src/style.css');
  const browser = await chromium.launch();
  try {
    for (const g of GUIDES.filter((x) => !filter || x.src.includes(filter))) {
      console.log(`${g.src} -> ${g.out}`);
      const { meta, body } = parseFrontMatter(read(g.src));
      const html = page(meta, renderMarkdown(body), css);
      const tab = await browser.newPage();
      await tab.setContent(html, { waitUntil: 'load' });
      await tab.evaluate(polish);
      await tab.evaluate(() => document.fonts.ready);
      const pdf = await tab.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
      writeFileSync(join(ROOT, g.out), pdf);
      await tab.close();
      console.log(`  ${relative(ROOT, join(ROOT, g.out))}: ${(pdf.length / 1024).toFixed(0)} KB`);
    }
  } finally {
    await browser.close();
  }
}

await main();
