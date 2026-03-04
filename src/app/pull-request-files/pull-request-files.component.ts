import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { ReviewWiseApiService } from '../services/reviewwise-api.service';
import * as ReviewDataActions from '../state/review-data/review-data.actions';
import {
  selectReviewError,
  selectReviewLoading,
  selectReviewMeta,
  selectReviewRetryAfterSeconds,
  selectReviewStatusMessage,
  selectReviewText
} from '../state/review-data/review-data.selectors';

interface PullRequestFileItem {
  path: string;
  status: string;
  patch?: string | null;
  oldPath?: string | null;
  newPath?: string | null;
  url?: string | null;
  downloadUrl?: string | null;
}

interface DiffRow {
  marker: '+' | '-' | ' ' | '@';
  oldLineNumber: number | null;
  newLineNumber: number | null;
  text: string;
  html: string;
  kind: 'context' | 'added' | 'removed' | 'hunk';
}

interface SideBySideRow {
  oldLineNumber: number | null;
  oldText: string;
  newLineNumber: number | null;
  newText: string;
  oldHtml: string;
  newHtml: string;
  kind: 'context' | 'added' | 'removed' | 'changed';
}

interface PullRequestFileContentResponse {
  oldContent?: string | null;
  newContent?: string | null;
  oldTooLarge?: boolean;
  newTooLarge?: boolean;
  sizeCapBytes?: number;
}

interface TokenDiffOp {
  type: 'equal' | 'remove' | 'add';
  token: string;
}

interface FileTreeNode {
  key: string;
  name: string;
  type: 'folder' | 'file';
  path: string;
  children: FileTreeNode[];
}

interface FileTreeEntry {
  key: string;
  type: 'folder' | 'file';
  name: string;
  depth: number;
  path: string;
  expanded?: boolean;
}

interface FileChangeSummary {
  total: number;
  added: number;
  removed: number;
  modified: number;
  renamed: number;
}

interface PullRequestComparisonInfo {
  provider?: string | null;
  diffMode?: string | null;
  baseRef?: string | null;
  baseSha?: string | null;
  headRef?: string | null;
  headSha?: string | null;
  mergeBaseSha?: string | null;
  summary?: string | null;
}

@Component({
  selector: 'app-pull-request-files',
  imports: [CommonModule, RouterLink],
  templateUrl: './pull-request-files.component.html',
  styleUrls: ['./pull-request-files.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PullRequestFilesComponent implements OnInit {
  private readonly maxRenderableLines = 1500;
  private readonly maxRenderableCharacters = 80_000;
  private readonly maxInlineHighlightLineLength = 1200;
  private readonly maxSideBySideInlineHighlightRows = 250;
  private readonly maxUnifiedInlineHighlightPairs = 200;

  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReviewWiseApiService);
  private readonly store = inject(Store);
  private readonly destroyRef = inject(DestroyRef);

  readonly owner = signal('');
  readonly repo = signal('');
  readonly prNumber = signal<number | null>(null);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly files = signal<PullRequestFileItem[]>([]);
  readonly selectedFilePath = signal<string | null>(null);
  readonly expandedFolderKeys = signal<Set<string>>(new Set<string>());
  readonly viewMode = signal<'side-by-side' | 'unified'>('side-by-side');
  readonly wrapLines = signal(true);

  readonly fileContentLoading = signal(false);
  readonly fileContentError = signal<string | null>(null);
  readonly selectedOldContent = signal<string | null>(null);
  readonly selectedNewContent = signal<string | null>(null);
  readonly oldContentTooLarge = signal(false);
  readonly newContentTooLarge = signal(false);
  readonly contentSizeCapBytes = signal(0);
  readonly performanceRenderWarning = signal<string | null>(null);
  readonly comparisonInfo = signal<PullRequestComparisonInfo | null>(null);
  readonly reviewLoading = toSignal(this.store.select(selectReviewLoading), { initialValue: false });
  readonly reviewError = toSignal(this.store.select(selectReviewError), { initialValue: null });
  readonly reviewText = toSignal(this.store.select(selectReviewText), { initialValue: null });
  readonly reviewMeta = toSignal(this.store.select(selectReviewMeta), { initialValue: null });
  readonly reviewStatusMessage = toSignal(this.store.select(selectReviewStatusMessage), { initialValue: null });
  readonly reviewRetryAfterSeconds = toSignal(this.store.select(selectReviewRetryAfterSeconds), { initialValue: null });
  readonly reviewRetryCountdown = signal(0);

  readonly selectedFile = computed(() => {
    const path = this.selectedFilePath();
    if (!path) {
      return null;
    }

    return this.files().find((file) => file.path === path) ?? null;
  });

  readonly subtitle = computed(() => {
    const base = `${this.owner()}/${this.repo()}`;
    const selectedFile = this.selectedFile();
    if (!selectedFile) {
      return base;
    }

    return `${base} • ${selectedFile.path}`;
  });

  readonly selectedFileDiffRows = computed(() => {
    if (this.selectedFileRenderBlockMessage()) {
      return [] as DiffRow[];
    }

    const file = this.selectedFile();
    if (!file?.patch) {
      return [] as DiffRow[];
    }

    if (file.patch.length > this.maxRenderableCharacters) {
      return [] as DiffRow[];
    }

    if (file.patch.split('\n').length > this.maxRenderableLines) {
      return [] as DiffRow[];
    }

    return this.parseUnifiedDiff(file.patch);
  });

  readonly selectedFileSideBySideRows = computed(() => {
    if (this.selectedOldContent() === null && this.selectedNewContent() === null) {
      return [] as SideBySideRow[];
    }

    return this.buildSideBySideRows(this.selectedOldContent(), this.selectedNewContent());
  });

  readonly selectedFileTooLargeMessage = computed(() => {
    const oldTooLarge = this.oldContentTooLarge();
    const newTooLarge = this.newContentTooLarge();
    if (!oldTooLarge && !newTooLarge) {
      return null;
    }

    const capBytes = this.contentSizeCapBytes();
    const capLabel = capBytes > 0
      ? `${(capBytes / 1024 / 1024).toFixed(1)} MB`
      : 'the configured limit';

    const sideLabel = oldTooLarge && newTooLarge
      ? 'old and new file versions'
      : oldTooLarge
        ? 'the old file version'
        : 'the new file version';

    return `Cannot render ${sideLabel} because it exceeds ${capLabel}. Use Open provider diff to view or download raw.`;
  });

  readonly selectedFileRenderBlockMessage = computed(() => {
    return this.selectedFileTooLargeMessage() ?? this.performanceRenderWarning();
  });

  readonly selectedFileDownloadUrl = computed(() => {
    const selectedFile = this.selectedFile();
    return selectedFile?.downloadUrl ?? null;
  });

  readonly fileTreeEntries = computed(() => {
    const tree = this.buildFileTree(this.files());
    return this.flattenTree(tree, this.expandedFolderKeys());
  });

  readonly fileStatusByPath = computed(() => {
    const statusMap = new Map<string, string>();
    for (const file of this.files()) {
      statusMap.set(file.path, this.normalizeStatus(file.status));
    }

    return statusMap;
  });

  readonly selectedFileStatus = computed(() => {
    const selectedFile = this.selectedFile();
    return this.normalizeStatus(selectedFile?.status);
  });

  readonly fileChangeSummary = computed<FileChangeSummary>(() => {
    const summary: FileChangeSummary = {
      total: this.files().length,
      added: 0,
      removed: 0,
      modified: 0,
      renamed: 0
    };

    for (const file of this.files()) {
      const normalizedStatus = this.normalizeStatus(file.status);
      if (normalizedStatus === 'added') {
        summary.added += 1;
      } else if (normalizedStatus === 'removed') {
        summary.removed += 1;
      } else if (normalizedStatus === 'renamed') {
        summary.renamed += 1;
      } else {
        summary.modified += 1;
      }
    }

    return summary;
  });

  readonly comparisonSummaryLine = computed(() => {
    const info = this.comparisonInfo();
    if (!info) {
      return null;
    }

    const diffMode = (info.diffMode ?? 'three-dot').trim();
    const baseRef = info.baseRef ?? 'base';
    const headRef = info.headRef ?? 'head';
    const mergeBase = info.mergeBaseSha?.slice(0, 7) ?? 'unknown';

    return `${baseRef}…${headRef} (${diffMode}, merge-base ${mergeBase})`;
  });

  readonly isGenerateButtonDisabled = computed(() => {
    return this.reviewLoading() || this.reviewRetryCountdown() > 0;
  });

  readonly generateButtonLabel = computed(() => {
    if (this.reviewLoading()) {
      return 'Generating review…';
    }

    if (this.reviewRetryCountdown() > 0) {
      return `Try again in ${this.reviewRetryCountdown()}s`;
    }

    return 'Generate review';
  });

  private retryCountdownIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      this.handleRetryAfterSeconds(this.reviewRetryAfterSeconds());
    });

    this.destroyRef.onDestroy(() => {
      this.clearRetryCountdownInterval();
    });
  }

  ngOnInit(): void {
    this.loadFromRoute();
  }

  selectFile(path: string): void {
    this.selectedFilePath.set(path);
    this.ensureAncestorsExpanded(path);
    this.loadSelectedFileContent();
  }

  toggleFolder(key: string): void {
    this.expandedFolderKeys.update((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  setViewMode(mode: 'side-by-side' | 'unified'): void {
    this.viewMode.set(mode);
  }

  toggleWrapLines(): void {
    this.wrapLines.update((current) => !current);
  }

  private loadFromRoute(): void {
    const owner = this.route.snapshot.paramMap.get('owner') ?? '';
    const repo = this.route.snapshot.paramMap.get('repo') ?? '';
    const prNumberRaw = this.route.snapshot.paramMap.get('prNumber') ?? '';
    const prNumber = Number(prNumberRaw);

    this.owner.set(owner);
    this.repo.set(repo);

    if (!owner || !repo || Number.isNaN(prNumber) || prNumber <= 0) {
      this.error.set('Could not determine pull request details from the URL.');
      this.loading.set(false);
      return;
    }

    this.prNumber.set(prNumber);
    this.loadLatestReview();

    this.api.getPullRequestComparison(owner, repo, prNumber).subscribe({
      next: (response: unknown) => {
        this.comparisonInfo.set(this.normalizeComparisonInfo(response));
      },
      error: () => {
        this.comparisonInfo.set(null);
      }
    });

    this.api.getPullRequestFiles(owner, repo, prNumber).subscribe({
      next: (response: unknown) => {
        const files = this.normalizeFiles(response);
        this.files.set(files);
        this.selectedFilePath.set(files[0]?.path ?? null);
        this.expandedFolderKeys.set(this.collectAllFolderKeys(files));
        if (files[0]?.path) {
          this.ensureAncestorsExpanded(files[0].path);
        }
        this.loadSelectedFileContent();
        this.error.set(null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load changed files for this pull request.');
        this.loading.set(false);
      }
    });
  }

  generateReview(): void {
    const owner = this.owner();
    const repo = this.repo();
    const prNumber = this.prNumber();

    if (!owner || !repo || !prNumber || this.isGenerateButtonDisabled()) {
      return;
    }

    this.store.dispatch(ReviewDataActions.generateReview({ owner, repo, prNumber }));
  }

  viewLatestReview(): void {
    this.loadLatestReview();
  }

  private loadLatestReview(): void {
    const owner = this.owner();
    const repo = this.repo();
    const prNumber = this.prNumber();

    if (!owner || !repo || !prNumber) {
      return;
    }

    this.store.dispatch(ReviewDataActions.loadLatestReview({ owner, repo, prNumber }));
  }

  private handleRetryAfterSeconds(retryAfterSeconds: number | null): void {
    if (!retryAfterSeconds || retryAfterSeconds <= 0) {
      this.reviewRetryCountdown.set(0);
      this.clearRetryCountdownInterval();
      return;
    }

    this.reviewRetryCountdown.set(retryAfterSeconds);
    this.clearRetryCountdownInterval();
    this.retryCountdownIntervalId = setInterval(() => {
      this.reviewRetryCountdown.update((current) => {
        if (current <= 1) {
          this.clearRetryCountdownInterval();
          return 0;
        }

        return current - 1;
      });
    }, 1000);
  }

  private clearRetryCountdownInterval(): void {
    if (this.retryCountdownIntervalId) {
      clearInterval(this.retryCountdownIntervalId);
      this.retryCountdownIntervalId = null;
    }
  }

  private normalizeFiles(response: unknown): PullRequestFileItem[] {
    if (!Array.isArray(response)) {
      return [];
    }

    return response
      .map((item): PullRequestFileItem | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const file = item as {
          path?: unknown;
          status?: unknown;
          patch?: unknown;
          oldPath?: unknown;
          old_path?: unknown;
          newPath?: unknown;
          new_path?: unknown;
          url?: unknown;
          downloadUrl?: unknown;
        };

        const path = typeof file.path === 'string' && file.path.trim().length > 0 ? file.path : null;
        if (!path) {
          return null;
        }

        return {
          path,
          status: typeof file.status === 'string' ? file.status : 'modified',
          patch: typeof file.patch === 'string' ? file.patch : null,
          oldPath: typeof file.oldPath === 'string' ? file.oldPath : (typeof file.old_path === 'string' ? file.old_path : null),
          newPath: typeof file.newPath === 'string' ? file.newPath : (typeof file.new_path === 'string' ? file.new_path : null),
          url: typeof file.url === 'string' ? file.url : null,
          downloadUrl: typeof file.downloadUrl === 'string' ? file.downloadUrl : null
        };
      })
      .filter((file): file is PullRequestFileItem => file !== null)
      .sort((left, right) => left.path.localeCompare(right.path, undefined, { sensitivity: 'base' }));
  }

  private normalizeComparisonInfo(response: unknown): PullRequestComparisonInfo | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    const value = response as {
      provider?: unknown;
      diffMode?: unknown;
      baseRef?: unknown;
      baseSha?: unknown;
      headRef?: unknown;
      headSha?: unknown;
      mergeBaseSha?: unknown;
      summary?: unknown;
    };

    return {
      provider: typeof value.provider === 'string' ? value.provider : null,
      diffMode: typeof value.diffMode === 'string' ? value.diffMode : null,
      baseRef: typeof value.baseRef === 'string' ? value.baseRef : null,
      baseSha: typeof value.baseSha === 'string' ? value.baseSha : null,
      headRef: typeof value.headRef === 'string' ? value.headRef : null,
      headSha: typeof value.headSha === 'string' ? value.headSha : null,
      mergeBaseSha: typeof value.mergeBaseSha === 'string' ? value.mergeBaseSha : null,
      summary: typeof value.summary === 'string' ? value.summary : null
    };
  }

  private loadSelectedFileContent(): void {
    const owner = this.owner();
    const repo = this.repo();
    const prNumber = this.prNumber();
    const selectedFile = this.selectedFile();

    this.fileContentError.set(null);
    this.selectedOldContent.set(null);
    this.selectedNewContent.set(null);
    this.oldContentTooLarge.set(false);
    this.newContentTooLarge.set(false);
    this.contentSizeCapBytes.set(0);
    this.performanceRenderWarning.set(null);

    if (!owner || !repo || !prNumber || !selectedFile) {
      return;
    }

    const patchRenderWarning = this.getPatchRenderWarning(selectedFile.patch);
    if (patchRenderWarning) {
      this.performanceRenderWarning.set(patchRenderWarning);
      return;
    }

    this.fileContentLoading.set(true);
    this.api.getPullRequestFileContent(owner, repo, prNumber, {
      path: selectedFile.path,
      oldPath: selectedFile.oldPath,
      newPath: selectedFile.newPath,
      status: selectedFile.status
    }).subscribe({
      next: (response: PullRequestFileContentResponse) => {
        const oldContent = typeof response?.oldContent === 'string' ? response.oldContent : null;
        const newContent = typeof response?.newContent === 'string' ? response.newContent : null;

        const performanceWarning = this.getPerformanceRenderWarning(oldContent, newContent);
        if (performanceWarning) {
          this.selectedOldContent.set(null);
          this.selectedNewContent.set(null);
          this.performanceRenderWarning.set(performanceWarning);
        } else {
          this.selectedOldContent.set(oldContent);
          this.selectedNewContent.set(newContent);
        }

        this.oldContentTooLarge.set(response?.oldTooLarge === true);
        this.newContentTooLarge.set(response?.newTooLarge === true);
        this.contentSizeCapBytes.set(typeof response?.sizeCapBytes === 'number' ? response.sizeCapBytes : 0);
        this.fileContentLoading.set(false);
      },
      error: () => {
        this.fileContentError.set('Failed to load full file content for side-by-side view.');
        this.fileContentLoading.set(false);
      }
    });
  }

  private getPerformanceRenderWarning(oldContent: string | null, newContent: string | null): string | null {
    const oldLength = oldContent?.length ?? 0;
    const newLength = newContent?.length ?? 0;
    const maxCharacters = Math.max(oldLength, newLength);

    if (maxCharacters > this.maxRenderableCharacters) {
      return `This file is very large (${maxCharacters.toLocaleString()} characters). Rendering is disabled to keep the page responsive. Use Download raw or Open provider diff.`;
    }

    const oldLineCount = oldContent ? oldContent.split('\n').length : 0;
    const newLineCount = newContent ? newContent.split('\n').length : 0;
    const maxLines = Math.max(oldLineCount, newLineCount);

    if (maxLines > this.maxRenderableLines) {
      return `This file has ${maxLines.toLocaleString()} lines, above the in-app render limit (${this.maxRenderableLines.toLocaleString()}). Use Download raw or Open provider diff.`;
    }

    return null;
  }

  private getPatchRenderWarning(patch: string | null | undefined): string | null {
    if (!patch) {
      return null;
    }

    if (patch.length > this.maxRenderableCharacters) {
      return `This diff is very large (${patch.length.toLocaleString()} characters). In-app preview is disabled to keep the page responsive. Use Download raw or Open provider diff.`;
    }

    const patchLineCount = patch.split('\n').length;
    if (patchLineCount > this.maxRenderableLines) {
      return `This diff has ${patchLineCount.toLocaleString()} lines, above the in-app render limit (${this.maxRenderableLines.toLocaleString()}). Use Download raw or Open provider diff.`;
    }

    return null;
  }

  private parseUnifiedDiff(patch: string): DiffRow[] {
    const rows: DiffRow[] = [];
    const lines = patch.split('\n');
    let oldLineNumber = 0;
    let newLineNumber = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        const match = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
        if (!match) {
          continue;
        }

        oldLineNumber = Number(match[1]);
        newLineNumber = Number(match[2]);
        rows.push({
          marker: '@',
          oldLineNumber: null,
          newLineNumber: null,
          text: line,
          html: this.escapeHtml(line),
          kind: 'hunk'
        });
        continue;
      }

      if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('index ')) {
        continue;
      }

      if (line.startsWith('+')) {
        rows.push({
          marker: '+',
          oldLineNumber: null,
          newLineNumber,
          text: line.slice(1),
          html: this.escapeHtml(line.slice(1)),
          kind: 'added'
        });
        newLineNumber += 1;
        continue;
      }

      if (line.startsWith('-')) {
        rows.push({
          marker: '-',
          oldLineNumber,
          newLineNumber: null,
          text: line.slice(1),
          html: this.escapeHtml(line.slice(1)),
          kind: 'removed'
        });
        oldLineNumber += 1;
        continue;
      }

      if (line.startsWith(' ')) {
        rows.push({
          marker: ' ',
          oldLineNumber,
          newLineNumber,
          text: line.slice(1),
          html: this.escapeHtml(line.slice(1)),
          kind: 'context'
        });
        oldLineNumber += 1;
        newLineNumber += 1;
      }
    }

    this.applyUnifiedInlineHighlights(rows);
    return rows;
  }

  private buildSideBySideRows(oldContent: string | null, newContent: string | null): SideBySideRow[] {
    const oldLines = (oldContent ?? '').split('\n');
    const newLines = (newContent ?? '').split('\n');
    const maxLength = Math.max(oldLines.length, newLines.length);

    const rows: SideBySideRow[] = [];
    let highlightedChangedRows = 0;

    for (let index = 0; index < maxLength; index += 1) {
      const oldLine = index < oldLines.length ? oldLines[index] : null;
      const newLine = index < newLines.length ? newLines[index] : null;

      let kind: SideBySideRow['kind'] = 'context';
      if (oldLine === null && newLine !== null) {
        kind = 'added';
      } else if (oldLine !== null && newLine === null) {
        kind = 'removed';
      } else if (oldLine !== newLine) {
        kind = 'changed';
      }

      rows.push({
        oldLineNumber: oldLine === null ? null : index + 1,
        oldText: oldLine ?? '',
        newLineNumber: newLine === null ? null : index + 1,
        newText: newLine ?? '',
        oldHtml: '',
        newHtml: '',
        kind
      });

      const currentRow = rows[rows.length - 1];
      if (
        kind === 'changed'
        && oldLine !== null
        && newLine !== null
        && highlightedChangedRows < this.maxSideBySideInlineHighlightRows
      ) {
        const highlighted = this.buildInlineHighlights(oldLine, newLine);
        currentRow.oldHtml = highlighted.oldHtml;
        currentRow.newHtml = highlighted.newHtml;
        highlightedChangedRows += 1;
      } else {
        currentRow.oldHtml = this.escapeHtml(currentRow.oldText);
        currentRow.newHtml = this.escapeHtml(currentRow.newText);
      }
    }

    return rows;
  }

  private buildInlineHighlights(oldLine: string, newLine: string): { oldHtml: string; newHtml: string } {
    if (oldLine.length > this.maxInlineHighlightLineLength || newLine.length > this.maxInlineHighlightLineLength) {
      return {
        oldHtml: this.escapeHtml(oldLine),
        newHtml: this.escapeHtml(newLine)
      };
    }

    const oldTokens = this.tokenizeLine(oldLine);
    const newTokens = this.tokenizeLine(newLine);

    const operations = this.buildTokenDiffOperations(oldTokens, newTokens);
    const oldHtml = this.renderTokenDiffHtml(operations, 'old');
    const newHtml = this.renderTokenDiffHtml(operations, 'new');

    return { oldHtml, newHtml };
  }

  private tokenizeLine(line: string): string[] {
    const tokens = line.match(/[A-Za-z0-9_]+|\s+|[^A-Za-z0-9_\s]/g);
    return tokens ?? [''];
  }

  private collectAllFolderKeys(files: PullRequestFileItem[]): Set<string> {
    const folderKeys = new Set<string>();

    for (const file of files) {
      const segments = file.path.split('/').filter((segment) => segment.length > 0);
      let currentPath = '';

      for (let index = 0; index < segments.length - 1; index += 1) {
        currentPath = currentPath ? `${currentPath}/${segments[index]}` : segments[index];
        folderKeys.add(currentPath);
      }
    }

    return folderKeys;
  }

  private buildFileTree(files: PullRequestFileItem[]): FileTreeNode {
    const root: FileTreeNode = {
      key: 'root',
      name: '',
      type: 'folder',
      path: '',
      children: []
    };

    const nodeMap = new Map<string, FileTreeNode>();
    nodeMap.set('root', root);

    for (const file of files) {
      const segments = file.path.split('/').filter((segment) => segment.length > 0);
      let parentKey = 'root';
      let currentPath = '';

      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const isFile = index === segments.length - 1;
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        const key = currentPath;

        if (!nodeMap.has(key)) {
          const node: FileTreeNode = {
            key,
            name: segment,
            type: isFile ? 'file' : 'folder',
            path: currentPath,
            children: []
          };

          nodeMap.set(key, node);
          const parent = nodeMap.get(parentKey);
          parent?.children.push(node);
        }

        parentKey = key;
      }
    }

    return root;
  }

  private flattenTree(root: FileTreeNode, expandedFolderKeys: Set<string>): FileTreeEntry[] {
    const entries: FileTreeEntry[] = [];

    const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
      return [...nodes].sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === 'folder' ? -1 : 1;
        }

        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      });
    };

    const walk = (nodes: FileTreeNode[], depth: number) => {
      for (const node of sortNodes(nodes)) {
        if (node.type === 'folder') {
          const expanded = expandedFolderKeys.has(node.key);
          entries.push({
            key: node.key,
            type: 'folder',
            name: node.name,
            depth,
            path: node.path,
            expanded
          });

          if (expanded) {
            walk(node.children, depth + 1);
          }

          continue;
        }

        entries.push({
          key: node.key,
          type: 'file',
          name: node.name,
          depth,
          path: node.path
        });
      }
    };

    walk(root.children, 0);
    return entries;
  }

  private ensureAncestorsExpanded(path: string): void {
    const segments = path.split('/').filter((segment) => segment.length > 0);
    if (segments.length < 2) {
      return;
    }

    this.expandedFolderKeys.update((current) => {
      const next = new Set(current);
      let currentPath = '';

      for (let index = 0; index < segments.length - 1; index += 1) {
        currentPath = currentPath ? `${currentPath}/${segments[index]}` : segments[index];
        next.add(currentPath);
      }

      return next;
    });
  }

  private buildTokenDiffOperations(oldTokens: string[], newTokens: string[]): TokenDiffOp[] {
    const oldLength = oldTokens.length;
    const newLength = newTokens.length;

    const lcs: number[][] = Array.from({ length: oldLength + 1 }, () => Array.from({ length: newLength + 1 }, () => 0));

    for (let oldIndex = 1; oldIndex <= oldLength; oldIndex += 1) {
      for (let newIndex = 1; newIndex <= newLength; newIndex += 1) {
        if (oldTokens[oldIndex - 1] === newTokens[newIndex - 1]) {
          lcs[oldIndex][newIndex] = lcs[oldIndex - 1][newIndex - 1] + 1;
        } else {
          lcs[oldIndex][newIndex] = Math.max(lcs[oldIndex - 1][newIndex], lcs[oldIndex][newIndex - 1]);
        }
      }
    }

    const operations: TokenDiffOp[] = [];
    let oldIndex = oldLength;
    let newIndex = newLength;

    while (oldIndex > 0 || newIndex > 0) {
      if (oldIndex > 0 && newIndex > 0 && oldTokens[oldIndex - 1] === newTokens[newIndex - 1]) {
        operations.push({ type: 'equal', token: oldTokens[oldIndex - 1] });
        oldIndex -= 1;
        newIndex -= 1;
        continue;
      }

      if (newIndex > 0 && (oldIndex === 0 || lcs[oldIndex][newIndex - 1] >= lcs[oldIndex - 1][newIndex])) {
        operations.push({ type: 'add', token: newTokens[newIndex - 1] });
        newIndex -= 1;
        continue;
      }

      operations.push({ type: 'remove', token: oldTokens[oldIndex - 1] });
      oldIndex -= 1;
    }

    operations.reverse();
    return operations;
  }

  private renderTokenDiffHtml(operations: TokenDiffOp[], side: 'old' | 'new'): string {
    const visibleType = side === 'old' ? 'remove' : 'add';
    const markClass = side === 'old' ? 'word-removed' : 'word-added';

    let html = '';
    let highlightedBuffer = '';

    const flushHighlighted = () => {
      if (!highlightedBuffer) {
        return;
      }

      html += `<mark class="${markClass}">${this.escapeHtml(highlightedBuffer)}</mark>`;
      highlightedBuffer = '';
    };

    for (const operation of operations) {
      if (operation.type === 'equal') {
        flushHighlighted();
        html += this.escapeHtml(operation.token);
        continue;
      }

      if (operation.type === visibleType) {
        highlightedBuffer += operation.token;
        continue;
      }

      flushHighlighted();
    }

    flushHighlighted();
    return html;
  }

  private applyUnifiedInlineHighlights(rows: DiffRow[]): void {
    let index = 0;
    let processedPairs = 0;

    while (index < rows.length) {
      if (rows[index].kind !== 'removed') {
        index += 1;
        continue;
      }

      let removedEnd = index;
      while (removedEnd < rows.length && rows[removedEnd].kind === 'removed') {
        removedEnd += 1;
      }

      let addedEnd = removedEnd;
      while (addedEnd < rows.length && rows[addedEnd].kind === 'added') {
        addedEnd += 1;
      }

      const pairCount = Math.min(removedEnd - index, addedEnd - removedEnd);
      for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
        if (processedPairs >= this.maxUnifiedInlineHighlightPairs) {
          break;
        }

        const removedRow = rows[index + pairIndex];
        const addedRow = rows[removedEnd + pairIndex];
        const highlighted = this.buildInlineHighlights(removedRow.text, addedRow.text);
        removedRow.html = highlighted.oldHtml;
        addedRow.html = highlighted.newHtml;
        processedPairs += 1;
      }

      index = addedEnd > removedEnd ? addedEnd : removedEnd;
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  getStatusBadgeClass(status: string | null | undefined): string {
    return `status-pill--${this.normalizeStatus(status)}`;
  }

  getStatusBadgeLabel(status: string | null | undefined): string {
    const normalizedStatus = this.normalizeStatus(status);
    if (normalizedStatus === 'added') {
      return 'Added';
    }

    if (normalizedStatus === 'removed') {
      return 'Removed';
    }

    if (normalizedStatus === 'renamed') {
      return 'Renamed';
    }

    return 'Modified';
  }

  getFileStatus(path: string): string {
    return this.fileStatusByPath().get(path) ?? 'modified';
  }

  private normalizeStatus(status: string | null | undefined): 'added' | 'removed' | 'renamed' | 'modified' {
    const normalizedStatus = (status ?? 'modified').trim().toLowerCase();

    if (normalizedStatus === 'added') {
      return 'added';
    }

    if (normalizedStatus === 'removed' || normalizedStatus === 'deleted') {
      return 'removed';
    }

    if (normalizedStatus === 'renamed') {
      return 'renamed';
    }

    return 'modified';
  }
}
