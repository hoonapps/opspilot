import { Injectable } from "@nestjs/common";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { DocumentsService } from "./documents.service";
import { SyncGithubDocumentsDto } from "./dto/sync-github-documents.dto";

export type GithubSyncDocument = {
  path: string;
  title: string;
  chunks: number;
  changed: boolean;
};

export type GithubSyncResult = {
  source: string;
  owner: string;
  repo: string;
  branch: string;
  rootPath: string;
  documents: GithubSyncDocument[];
};

type GithubTreeResponse = {
  tree?: Array<{
    path: string;
    type: string;
  }>;
};

@Injectable()
export class GithubSyncService {
  constructor(private readonly documentsService: DocumentsService) {}

  async sync(input: SyncGithubDocumentsDto): Promise<GithubSyncResult> {
    const branch = input.branch ?? "main";
    const rootPath = normalizeRootPath(input.rootPath ?? "");
    const prefix = normalizePrefix(input.sourcePrefix ?? `github/${input.owner}/${input.repo}`);
    const tree = await fetchGithubTree(input.owner, input.repo, branch);
    const markdownPaths = (tree.tree ?? [])
      .filter((item) => item.type === "blob")
      .map((item) => item.path)
      .filter((path) => path.endsWith(".md") && isUnderRoot(path, rootPath))
      .sort();

    const documents: GithubSyncDocument[] = [];
    for (const markdownPath of markdownPaths) {
      const raw = await fetchGithubRaw(input.owner, input.repo, branch, markdownPath);
      const relativePath = rootPath ? relativeGithubPath(rootPath, markdownPath) : markdownPath;
      documents.push(await this.documentsService.ingestMarkdown(`${prefix}/${relativePath}`, raw));
    }

    return {
      source: "github",
      owner: input.owner,
      repo: input.repo,
      branch,
      rootPath,
      documents
    };
  }

  async syncLocalFixture(input: {
    owner: string;
    repo: string;
    branch?: string;
    rootDir: string;
    sourcePrefix?: string;
  }): Promise<GithubSyncResult> {
    const branch = input.branch ?? "main";
    const prefix = normalizePrefix(input.sourcePrefix ?? `github/${input.owner}/${input.repo}`);
    const files = await findMarkdownFiles(input.rootDir);
    const documents: GithubSyncDocument[] = [];

    for (const file of files) {
      const raw = await readFile(file, "utf8");
      const path = relative(input.rootDir, file);
      documents.push(await this.documentsService.ingestMarkdown(`${prefix}/${path}`, raw));
    }

    return {
      source: "local-fixture",
      owner: input.owner,
      repo: input.repo,
      branch,
      rootPath: input.rootDir,
      documents
    };
  }
}

async function fetchGithubTree(owner: string, repo: string, branch: string): Promise<GithubTreeResponse> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: githubHeaders() }
  );

  if (!response.ok) {
    throw new Error(`GitHub tree sync failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as GithubTreeResponse;
}

async function fetchGithubRaw(owner: string, repo: string, branch: string, path: string): Promise<string> {
  const response = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/${encodePath(branch)}/${encodePath(path)}`,
    { headers: githubHeaders() }
  );

  if (!response.ok) {
    throw new Error(`GitHub raw download failed for ${path}: ${response.status} ${await response.text()}`);
  }

  return response.text();
}

function githubHeaders(): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    "user-agent": "opspilot",
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
  };
}

function normalizeRootPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

function normalizePrefix(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

function isUnderRoot(path: string, rootPath: string): boolean {
  return !rootPath || path === rootPath || path.startsWith(`${rootPath}/`);
}

function relativeGithubPath(rootPath: string, path: string): string {
  return path === rootPath ? path.split("/").pop() ?? path : path.slice(rootPath.length + 1);
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        return findMarkdownFiles(fullPath);
      }
      return entry.name.endsWith(".md") ? [fullPath] : [];
    })
  );
  return files.flat().sort();
}
