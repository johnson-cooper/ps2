/*
 * PS2 OSDSYS Portfolio controller v8
 * Mouse-only navigation + click-locked submenus + Markdown-driven site/project manifests.
 */
(function () {
  'use strict';

  const SITE_MANIFEST = 'content/site.md';

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

    static navigationLinks(markdown) {
      const { body } = PS2Markdown.parseDocument(markdown);
      const links = [];
      const pattern = /^\s*(?:[-+*]\s+|\d+[.)]\s+)?\[([^\]]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)\s*$/gm;
      let match;

      while ((match = pattern.exec(body)) !== null) {
        links.push({
          label: PS2Markdown.plainText(match[1]),
          path: match[2].trim()
        });
      }

      return links;
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

      this.menu = this.root.querySelector('[data-project-menu]');
      this.detailStage = this.root.querySelector('.ps2-stage--detail');
      this.siteTitle = this.root.querySelector('[data-site-title]');
      this.backButton = this.root.querySelector('[data-ps2-back]');
      this.mainItems = [];
      this.projects = [];
      this.mainIndex = 0;
      this.activeProject = null;
      this.subIndex = 0;
      this.mdCache = new Map();
      this.requestCounter = 0;

      this.root.addEventListener('mousedown', event => {
        if (event.target.closest('button, a')) event.preventDefault();
      });
      this.bindBack();
      this.init();
    }

    async init() {
      try {
        await this.buildFromMarkdown();
        this.refreshCollections();
        this.disableKeyboardFocus();
        this.bindMain();
        this.bindProjects();
        this.selectMain(0);
      } catch (error) {
        this.showConfigurationError(error);
      }
    }

    async buildFromMarkdown() {
      const site = await this.getMarkdown(SITE_MANIFEST);
      const siteDoc = PS2Markdown.parseDocument(site.markdown);
      const siteMeta = PS2Markdown.inferMenuMetadata(site.markdown);
      const title = siteDoc.meta.title || siteMeta.title || '';

      if (this.siteTitle) {
        this.siteTitle.textContent = title;
        if (title) this.siteTitle.setAttribute('aria-label', title);
      }
      if (title) {
        document.title = title;
        this.root.querySelector('.ps2-stage--main')?.setAttribute('aria-label', title);
      }

      const uiLabels = [
        ['[data-ui-select-label]', siteDoc.meta['select-label']],
        ['[data-ui-back-label]', siteDoc.meta['back-label']],
        ['[data-ui-input-label]', siteDoc.meta['input-label']]
      ];
      uiLabels.forEach(([selector, value]) => {
        const node = this.root.querySelector(selector);
        if (node) node.textContent = value || '';
      });

      const projectLinks = PS2Markdown.navigationLinks(site.markdown);
      if (!projectLinks.length) {
        throw new Error('The site manifest does not contain any project links.');
      }

      const projectConfigs = await Promise.all(projectLinks.map(async (projectRef, index) => {
        const manifest = await this.getMarkdown(projectRef.path, site.url);
        const metadata = PS2Markdown.inferMenuMetadata(manifest.markdown);
        const sections = PS2Markdown.navigationLinks(manifest.markdown);

        if (!sections.length) {
          throw new Error(`Project manifest has no section links: ${projectRef.path}`);
        }

        const titleText = metadata.title || projectRef.label || `Project ${index + 1}`;
        return {
          id: this.makeProjectId(titleText, index),
          title: titleText,
          subtitle: metadata.subtitle || '',
          eyebrow: metadata.eyebrow || '',
          manifestUrl: manifest.url,
          sections
        };
      }));

      this.renderProjects(projectConfigs);
    }

    renderProjects(projects) {
      if (!this.menu || !this.detailStage) {
        throw new Error('Portfolio shell is missing required menu/detail containers.');
      }

      this.menu.replaceChildren();
      this.detailStage.replaceChildren();

      projects.forEach((project, projectIndex) => {
        const menuButton = document.createElement('button');
        menuButton.type = 'button';
        menuButton.tabIndex = -1;
        menuButton.className = 'ps2-menu-item';
        if (projectIndex === 0) menuButton.classList.add('is-selected');
        menuButton.dataset.project = project.id;

        const menuTitle = document.createElement('span');
        menuTitle.className = 'ps2-menu-title';
        menuTitle.textContent = project.title;

        const menuSubtitle = document.createElement('span');
        menuSubtitle.className = 'ps2-menu-subtitle';
        menuSubtitle.textContent = project.subtitle;
        menuSubtitle.hidden = !project.subtitle;

        menuButton.append(menuTitle, menuSubtitle);
        this.menu.appendChild(menuButton);

        const article = document.createElement('article');
        article.className = 'ps2-project';
        article.id = project.id;
        article.setAttribute('aria-hidden', 'true');

        const heading = document.createElement('div');
        heading.className = 'ps2-project-heading';

        const eyebrow = document.createElement('p');
        eyebrow.className = 'ps2-project-eyebrow';
        eyebrow.textContent = project.eyebrow;
        eyebrow.hidden = !project.eyebrow;

        const h1 = document.createElement('h1');
        h1.textContent = project.title;
        heading.append(eyebrow, h1);

        const submenu = document.createElement('nav');
        submenu.className = 'ps2-submenu';
        submenu.setAttribute('aria-label', `${project.title} information`);

        project.sections.forEach((section, sectionIndex) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.tabIndex = -1;
          if (sectionIndex === 0) button.classList.add('is-selected');
          button.dataset.md = section.path;
          button.dataset.mdBase = project.manifestUrl;
          button.textContent = section.label;
          submenu.appendChild(button);
        });

        const copy = document.createElement('div');
        copy.className = 'ps2-detail-copy';
        const markdownTarget = document.createElement('div');
        markdownTarget.className = 'ps2-markdown';
        markdownTarget.dataset.mdTarget = '';
        copy.appendChild(markdownTarget);

        article.append(heading, submenu, copy);
        this.detailStage.appendChild(article);
      });
    }

    refreshCollections() {
      this.mainItems = [...this.root.querySelectorAll('.ps2-menu [data-project]')];
      this.projects = [...this.root.querySelectorAll('.ps2-project')];
      this.mainIndex = Math.max(0, this.mainItems.findIndex(el => el.classList.contains('is-selected')));
    }

    makeProjectId(title, index) {
      const slug = String(title || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `project-${index + 1}`;
      return `project-${slug}-${index + 1}`;
    }

    disableKeyboardFocus() {
      this.root.querySelectorAll('button, a').forEach(el => { el.tabIndex = -1; });
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
      this.detailStage?.setAttribute('aria-hidden', 'false');

      const items = this.getSubItems(project);
      if (items.length) {
        const selected = items.findIndex(el => el.classList.contains('is-selected'));
        this.subIndex = selected >= 0 ? selected : 0;
        this.selectSub(this.subIndex, true);
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
      this.detailStage?.setAttribute('aria-hidden', 'true');
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
        const path = button.dataset.md;
        const baseUrl = button.dataset.mdBase || null;
        const target = this.activeProject.querySelector('[data-md-target]');
        if (path && target) this.loadMarkdown(path, target, baseUrl);
      }
    }

    getSubItems(project = this.activeProject) {
      return project ? [...project.querySelectorAll('.ps2-submenu [data-md]')] : [];
    }

    candidateUrls(path, baseUrl = null) {
      const raw = String(path || '').trim();
      if (!raw) return [];
      if (/^(javascript|vbscript|data):/i.test(raw)) return [];

      try {
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) {
          return [new URL(raw, window.location.href).href];
        }

        const normalized = raw.replace(/^\.\//, '').replace(/^\/+/, '');

        if (normalized.startsWith('ps2/')) {
          const candidates = [
            new URL('/' + normalized, window.location.origin).href,
            new URL(normalized.slice('ps2/'.length), new URL('.', document.baseURI)).href
          ];
          return [...new Set(candidates)];
        }

        if (raw.startsWith('/')) {
          return [new URL(raw, window.location.origin).href];
        }

        return [new URL(raw, baseUrl || document.baseURI).href];
      } catch (_) {
        return [raw];
      }
    }

    getMarkdown(path, baseUrl = null) {
      const cacheKey = `${baseUrl || ''}::${path}`;
      if (!this.mdCache.has(cacheKey)) {
        this.mdCache.set(cacheKey, (async () => {
          const candidates = this.candidateUrls(path, baseUrl);
          let lastError = null;

          for (const url of candidates) {
            try {
              const response = await fetch(url, { cache: 'no-cache' });
              if (!response.ok) {
                lastError = new Error(`${response.status} ${response.statusText}`);
                continue;
              }
              return { markdown: await response.text(), url };
            } catch (error) {
              lastError = error;
            }
          }

          throw lastError || new Error(`Could not resolve ${path}`);
        })());
      }
      return this.mdCache.get(cacheKey);
    }

    async loadMarkdown(path, target, baseUrl = null) {
      if (!path || !target) return;
      const requestId = ++this.requestCounter;
      target.dataset.requestId = String(requestId);
      target.classList.remove('is-error');
      target.classList.add('is-loading');
      target.innerHTML = '<p>Reading data...</p>';

      try {
        const result = await this.getMarkdown(path, baseUrl);
        if (target.dataset.requestId !== String(requestId)) return;
        target.innerHTML = PS2Markdown.render(result.markdown, result.url);
        target.classList.remove('is-loading');
        target.querySelectorAll('a').forEach(link => {
          link.tabIndex = -1;
          link.addEventListener('mousedown', event => event.preventDefault());
        });
        target.parentElement.scrollTop = 0;
        this.root.dispatchEvent(new CustomEvent('ps2:markdownloaded', { detail: { url: result.url } }));
      } catch (error) {
        if (target.dataset.requestId !== String(requestId)) return;
        target.classList.remove('is-loading');
        target.classList.add('is-error');
        target.innerHTML = `<p>Could not load ${PS2Markdown.escapeHtml(path)}.</p><p>${PS2Markdown.escapeHtml(error.message)}</p>`;
      }
    }

    showConfigurationError(error) {
      if (this.menu) {
        this.menu.replaceChildren();
        const message = document.createElement('div');
        message.className = 'ps2-menu-item is-selected';
        const title = document.createElement('span');
        title.className = 'ps2-menu-title';
        title.textContent = 'Content unavailable';
        const subtitle = document.createElement('span');
        subtitle.className = 'ps2-menu-subtitle';
        subtitle.textContent = error?.message || 'Could not load the Markdown configuration.';
        message.append(title, subtitle);
        this.menu.appendChild(message);
      }
    }
  }

  window.PS2Markdown = PS2Markdown;
  window.PS2Portfolio = PS2Portfolio;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-ps2-portfolio]').forEach(root => new PS2Portfolio(root));
  });
})();
