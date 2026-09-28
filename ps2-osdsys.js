/*
 * PS2 OSDSYS Portfolio controller v7
 * Mouse-only navigation + click-locked submenus + dependency-free Markdown loading/rendering.
 */
(function () {
  'use strict';

  class PS2Markdown {
    static escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    static safeUrl(value, baseUrl = null) {
      const raw = String(value || '').trim();
      if (!raw) return '#';
      if (/^(javascript|vbscript|data):/i.test(raw)) return '#';

      // Resolve relative Markdown links/images from the Markdown file itself,
      // not from index.html. Absolute URLs, hashes, mailto:, etc. are retained.
      try {
        if (baseUrl && !/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith('#')) {
          const mdUrl = new URL(baseUrl, window.location.href);
          return PS2Markdown.escapeHtml(new URL(raw, mdUrl).href);
        }
      } catch (_) {}

      return PS2Markdown.escapeHtml(raw);
    }

    static parseDocument(markdown) {
      const source = String(markdown || '').replace(/\r\n?/g, '\n');
      const meta = {};
      let body = source;

      // Small dependency-free front-matter parser for simple key: value data.
      if (source.startsWith('---\n')) {
        const end = source.indexOf('\n---\n', 4);
        if (end !== -1) {
          const header = source.slice(4, end);
          body = source.slice(end + 5);
          header.split('\n').forEach(line => {
            const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
            if (!match) return;
            let value = match[2].trim();
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            meta[match[1].toLowerCase()] = value;
          });
        }
      }

      return { meta, body };
    }

    static plainText(value) {
      return String(value || '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`>#~-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    static inferMenuMetadata(markdown) {
      const { meta, body } = PS2Markdown.parseDocument(markdown);
      const lines = body.split('\n');
      const headingLine = lines.find(line => /^#{1,4}\s+/.test(line.trim()));
      const firstParagraph = lines.find(line => {
        const text = line.trim();
        return text &&
          !/^#{1,4}\s+/.test(text) &&
          !/^[-+*]\s+/.test(text) &&
          !/^\d+[.)]\s+/.test(text) &&
          !/^>/.test(text) &&
          !/^```/.test(text) &&
          !/^---+$/.test(text);
      });

      const inferredTitle = headingLine
        ? PS2Markdown.plainText(headingLine.replace(/^#{1,4}\s+/, ''))
        : '';
      const inferredSubtitle = firstParagraph ? PS2Markdown.plainText(firstParagraph) : '';

      return {
        title: meta.title || meta['menu-title'] || inferredTitle,
        subtitle: meta.subtitle || meta['menu-subtitle'] || inferredSubtitle,
        eyebrow: meta.eyebrow || ''
      };
    }

    static inline(source, baseUrl = null) {
      let text = PS2Markdown.escapeHtml(source);
      const code = [];

      text = text.replace(/`([^`]+)`/g, (_, value) => {
        const token = `@@PS2CODE${code.length}@@`;
        code.push(`<code>${value}</code>`);
        return token;
      });

      text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
        (_, alt, url) => `<img src="${PS2Markdown.safeUrl(url, baseUrl)}" alt="${alt}" loading="lazy">`);

      text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
        (_, label, url) => `<a href="${PS2Markdown.safeUrl(url, baseUrl)}" target="_blank" rel="noopener noreferrer" tabindex="-1">${label}</a>`);

      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      text = text.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
      text = text.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');

      code.forEach((html, index) => {
        text = text.replace(`@@PS2CODE${index}@@`, html);
      });
      return text;
    }

    static render(markdown, baseUrl = null) {
      const { body } = PS2Markdown.parseDocument(markdown);
      const lines = body.replace(/\r\n?/g, '\n').split('\n');
      const out = [];
      let paragraph = [];
      let listType = null;
      let listItems = [];
      let inFence = false;
      let fenceLang = '';
      let fenceLines = [];
      let quoteLines = [];

      const flushParagraph = () => {
        if (!paragraph.length) return;
        out.push(`<p>${PS2Markdown.inline(paragraph.join(' '), baseUrl)}</p>`);
        paragraph = [];
      };

      const flushList = () => {
        if (!listType || !listItems.length) return;
        out.push(`<${listType}>${listItems.map(item => `<li>${PS2Markdown.inline(item, baseUrl)}</li>`).join('')}</${listType}>`);
        listType = null;
        listItems = [];
      };

      const flushQuote = () => {
        if (!quoteLines.length) return;
        out.push(`<blockquote><p>${PS2Markdown.inline(quoteLines.join(' '), baseUrl)}</p></blockquote>`);
        quoteLines = [];
      };

      const flushEverything = () => {
        flushParagraph();
        flushList();
        flushQuote();
      };

      for (const rawLine of lines) {
        const line = rawLine.replace(/\s+$/, '');

        if (inFence) {
          if (/^```/.test(line.trim())) {
            const lang = fenceLang ? ` class="language-${PS2Markdown.escapeHtml(fenceLang)}"` : '';
            out.push(`<pre><code${lang}>${PS2Markdown.escapeHtml(fenceLines.join('\n'))}</code></pre>`);
            inFence = false;
            fenceLang = '';
            fenceLines = [];
          } else {
            fenceLines.push(rawLine);
          }
          continue;
        }

        const fence = line.match(/^```\s*([^\s`]*)/);
        if (fence) {
          flushEverything();
          inFence = true;
          fenceLang = fence[1] || '';
          continue;
        }

        if (!line.trim()) {
          flushEverything();
          continue;
        }

        const heading = line.match(/^(#{1,4})\s+(.+)$/);
        if (heading) {
          flushEverything();
          const level = heading[1].length;
          out.push(`<h${level}>${PS2Markdown.inline(heading[2], baseUrl)}</h${level}>`);
          continue;
        }

        if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
          flushEverything();
          out.push('<hr>');
          continue;
        }

        const quote = line.match(/^>\s?(.*)$/);
        if (quote) {
          flushParagraph();
          flushList();
          quoteLines.push(quote[1]);
          continue;
        } else {
          flushQuote();
        }

        const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
        if (unordered) {
          flushParagraph();
          flushQuote();
          if (listType && listType !== 'ul') flushList();
          listType = 'ul';
          listItems.push(unordered[1]);
          continue;
        }

        const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
        if (ordered) {
          flushParagraph();
          flushQuote();
          if (listType && listType !== 'ol') flushList();
          listType = 'ol';
          listItems.push(ordered[1]);
          continue;
        }

        flushList();
        paragraph.push(line.trim());
      }

      if (inFence) {
        out.push(`<pre><code>${PS2Markdown.escapeHtml(fenceLines.join('\n'))}</code></pre>`);
      }
      flushEverything();
      return out.join('\n');
    }
  }

  class PS2Portfolio {
    constructor(root) {
      this.root = typeof root === 'string' ? document.querySelector(root) : root;
      if (!this.root) throw new Error('PS2Portfolio: root not found');

      this.mainItems = [...this.root.querySelectorAll('.ps2-menu [data-project]')];
      this.projects = [...this.root.querySelectorAll('.ps2-project')];
      this.backButton = this.root.querySelector('[data-ps2-back]');
      this.mainIndex = Math.max(0, this.mainItems.findIndex(el => el.classList.contains('is-selected')));
      this.activeProject = null;
      this.subIndex = 0;
      this.mdCache = new Map();
      this.requestCounter = 0;

      this.disableKeyboardFocus();
      this.bindMain();
      this.bindProjects();
      this.bindBack();
      this.selectMain(this.mainIndex);
      this.hydrateMenuMetadata();
    }

    disableKeyboardFocus() {
      this.root.querySelectorAll('button, a').forEach(el => { el.tabIndex = -1; });
      this.root.addEventListener('mousedown', event => {
        if (event.target.closest('button, a')) event.preventDefault();
      });
    }

    async hydrateMenuMetadata() {
      await Promise.all(this.mainItems.map(async item => {
        const projectId = item.dataset.project;
        const project = projectId ? this.root.querySelector(`#${CSS.escape(projectId)}`) : null;
        const overview = project?.querySelector('.ps2-submenu [data-md*="overview"]') ||
                         project?.querySelector('.ps2-submenu [data-md]');
        const url = overview?.dataset.md;
        if (!project || !url) return;

        try {
          const markdown = await this.getMarkdown(url);
          const metadata = PS2Markdown.inferMenuMetadata(markdown);
          const titleNode = item.querySelector('.ps2-menu-title');
          const subtitleNode = item.querySelector('.ps2-menu-subtitle');
          const heading = project.querySelector('.ps2-project-heading h1');
          const eyebrow = project.querySelector('.ps2-project-eyebrow');

          if (metadata.title) {
            if (titleNode) titleNode.textContent = metadata.title;
            if (heading) heading.textContent = metadata.title;
          }
          if (subtitleNode) {
            subtitleNode.textContent = metadata.subtitle || '';
            subtitleNode.hidden = !metadata.subtitle;
          }
          if (eyebrow && metadata.eyebrow) eyebrow.textContent = metadata.eyebrow;
        } catch (_) {
          const titleNode = item.querySelector('.ps2-menu-title');
          const subtitleNode = item.querySelector('.ps2-menu-subtitle');
          if (titleNode && titleNode.textContent === 'Loading...') {
            titleNode.textContent = projectId.replace(/^project-/, '').replace(/-/g, ' ');
          }
          if (subtitleNode) subtitleNode.hidden = true;
        }
      }));
    }

    bindMain() {
      this.mainItems.forEach((item, index) => {
        item.addEventListener('mouseenter', () => {
          if (this.activeProject) return;
          this.selectMain(index);
        });

        item.addEventListener('click', () => {
          this.selectMain(index);
          this.openProject(item.dataset.project);
        });
      });
    }

    bindProjects() {
      this.projects.forEach(project => {
        const buttons = this.getSubItems(project);
        buttons.forEach((button, index) => {
          // Submenu selection is deliberately click-locked. Hovering another
          // option may give visual feedback, but it never swaps the Markdown
          // content or changes the selected item.
          button.addEventListener('click', () => {
            if (project !== this.activeProject) return;
            this.selectSub(index, true);
          });
        });
      });
    }

    bindBack() {
      this.backButton?.addEventListener('click', () => this.closeProject());
    }

    selectMain(index) {
      if (!this.mainItems.length) return;
      this.mainIndex = Math.max(0, Math.min(this.mainItems.length - 1, index));
      this.mainItems.forEach((item, i) => {
        item.classList.toggle('is-selected', i === this.mainIndex);
      });
    }

    openProject(id) {
      const project = this.root.querySelector(`#${CSS.escape(id)}`);
      if (!project) return;

      this.projects.forEach(p => {
        const open = p === project;
        p.classList.toggle('is-open', open);
        p.setAttribute('aria-hidden', open ? 'false' : 'true');
      });

      this.activeProject = project;
      this.root.classList.add('has-project');
      this.root.querySelector('.ps2-stage--detail')?.setAttribute('aria-hidden', 'false');

      const items = this.getSubItems(project);
      if (items.length) {
        const selected = items.findIndex(el => el.classList.contains('is-selected'));
        this.subIndex = selected >= 0 ? selected : 0;
        this.selectSub(this.subIndex, true);
      } else if (project.dataset.md) {
        this.loadMarkdown(project.dataset.md, project.querySelector('[data-md-target]'));
      }

      this.root.dispatchEvent(new CustomEvent('ps2:projectopen', { detail: { id } }));
    }

    closeProject() {
      if (!this.activeProject) return;
      const id = this.activeProject.id;
      this.activeProject.classList.remove('is-open');
      this.activeProject.setAttribute('aria-hidden', 'true');
      this.activeProject = null;
      this.root.classList.remove('has-project');
      this.root.querySelector('.ps2-stage--detail')?.setAttribute('aria-hidden', 'true');
      this.root.dispatchEvent(new CustomEvent('ps2:projectclose', { detail: { id } }));
    }

    selectSub(index, load = true) {
      if (!this.activeProject) return;
      const buttons = this.getSubItems(this.activeProject);
      if (!buttons.length) return;

      this.subIndex = Math.max(0, Math.min(buttons.length - 1, index));
      buttons.forEach((button, i) => button.classList.toggle('is-selected', i === this.subIndex));

      if (load) {
        const button = buttons[this.subIndex];
        const url = button.dataset.md;
        const target = this.activeProject.querySelector('[data-md-target]');
        if (url && target) this.loadMarkdown(url, target);
      }
    }

    getSubItems(project = this.activeProject) {
      return project ? [...project.querySelectorAll('.ps2-submenu [data-md]')] : [];
    }

    getMarkdown(url) {
      if (!this.mdCache.has(url)) {
        this.mdCache.set(url, fetch(url, { cache: 'no-cache' }).then(response => {
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          return response.text();
        }));
      }
      return this.mdCache.get(url);
    }

    async loadMarkdown(url, target) {
      if (!url || !target) return;
      const requestId = ++this.requestCounter;
      target.dataset.requestId = String(requestId);
      target.classList.remove('is-error');
      target.classList.add('is-loading');
      target.innerHTML = '<p>Reading data...</p>';

      try {
        const markdown = await this.getMarkdown(url);
        if (target.dataset.requestId !== String(requestId)) return;
        target.innerHTML = PS2Markdown.render(markdown, url);
        target.classList.remove('is-loading');
        target.querySelectorAll('a').forEach(link => {
          link.tabIndex = -1;
          link.addEventListener('mousedown', event => event.preventDefault());
        });
        target.parentElement.scrollTop = 0;
        this.root.dispatchEvent(new CustomEvent('ps2:markdownloaded', { detail: { url } }));
      } catch (error) {
        if (target.dataset.requestId !== String(requestId)) return;
        target.classList.remove('is-loading');
        target.classList.add('is-error');
        target.innerHTML = `<p>Could not load ${PS2Markdown.escapeHtml(url)}.</p><p>${PS2Markdown.escapeHtml(error.message)}</p>`;
      }
    }
  }

  window.PS2Markdown = PS2Markdown;
  window.PS2Portfolio = PS2Portfolio;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-ps2-portfolio]').forEach(root => new PS2Portfolio(root));
  });
})();
