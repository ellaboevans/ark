export interface GistFile {
  filename: string;
  content: string;
}

export interface GistResponse {
  id: string;
  files: Record<string, GistFile>;
  html_url: string;
}

export interface GistCreatePayload {
  description: string;
  public: boolean;
  files: Record<string, { content: string }>;
}

export interface GistUpdatePayload {
  description: string;
  files: Record<string, { content: string }>;
}
