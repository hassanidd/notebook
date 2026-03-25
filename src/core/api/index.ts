import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";

import { env } from "@/config/env";
import { useGlobalStore } from "@/core/global-store";
import type {
  AuthTokens,
  ChatCreateInput,
  ChatStreamEvent,
  ChatWithMessages,
  FileUploadResponse,
  Project,
  ProjectCreateInput,
  ProjectFile,
  ProjectInvitation,
  ProjectShare,
  ProjectUpdateInput,
  SharePermission,
  SignInInput,
  SignUpInput,
  User,
} from "@/core/types";

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

type StreamHandlers = {
  onChunk: (chunk: string) => void;
  onChatId?: (chatId: string) => void;
  onDone?: () => void;
};

function normalizeProject(project: Project): Project {
  return {
    ...project,
    shares: project.shares ?? [],
    chats: project.chats ?? [],
  };
}

export function getApiErrorMessage(
  error: unknown,
  fallback = "Request failed.",
): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;

    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }

    if (Array.isArray(detail)) {
      const first = detail[0];
      if (typeof first === "string") {
        return first;
      }
      if (first && typeof first.msg === "string") {
        return first.msg;
      }
    }

    if (typeof error.response?.data?.message === "string") {
      return error.response.data.message;
    }

    if (typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

class BackendApi {
  private readonly api: AxiosInstance;
  private readonly baseURL: string;
  private refreshPromise: Promise<AuthTokens> | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.api = axios.create({
      baseURL,
    });

    const accessToken = this.getStoredAccessToken();
    if (accessToken) {
      this.api.defaults.headers.common["Authorization"] =
        `Bearer ${accessToken}`;
    }

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as RetryableRequestConfig | undefined;
        if (!originalRequest) {
          return Promise.reject(error);
        }

        const isUnauthorized = error.response?.status === 401;
        const isRefreshCall = originalRequest.url?.includes("/refresh");

        if (!isUnauthorized || isRefreshCall || originalRequest._retry) {
          return Promise.reject(error);
        }

        originalRequest._retry = true;

        const refreshToken = this.getStoredRefreshToken();
        if (!refreshToken) {
          this.clearSession();
          return Promise.reject(error);
        }

        try {
          const tokens = await this.refreshWithLock(refreshToken);
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers["Authorization"] =
            `Bearer ${tokens.access_token}`;
          return this.api(originalRequest);
        } catch (refreshError) {
          this.clearSession();
          return Promise.reject(refreshError);
        }
      },
    );
  }

  private async refreshWithLock(refreshToken: string): Promise<AuthTokens> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refresh(refreshToken)
        .then((tokens) => {
          this.saveTokens(tokens);
          return tokens;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    return this.refreshPromise;
  }

  private getStoredAccessToken(): string | null {
    return window.localStorage.getItem("access_token");
  }

  private getStoredRefreshToken(): string | null {
    return window.localStorage.getItem("refresh_token");
  }

  private saveTokens(tokens: AuthTokens): void {
    window.localStorage.setItem("access_token", tokens.access_token);
    window.localStorage.setItem("refresh_token", tokens.refresh_token);
    this.api.defaults.headers.common["Authorization"] =
      `Bearer ${tokens.access_token}`;
  }

  private clearSession(): void {
    window.localStorage.removeItem("access_token");
    window.localStorage.removeItem("refresh_token");
    delete this.api.defaults.headers.common["Authorization"];
    useGlobalStore.getState().clearUser();
  }

  isAuthenticated(): boolean {
    return Boolean(this.getStoredAccessToken());
  }

  signOut(): void {
    this.clearSession();
  }

  async logout(): Promise<void> {
    const refreshToken = this.getStoredRefreshToken();
    if (!refreshToken) {
      this.clearSession();
      return;
    }

    try {
      await this.api.post("/logout", { refresh_token: refreshToken });
    } catch {
      // Always clear local session even if backend logout fails.
    } finally {
      this.clearSession();
    }
  }

  async signUp(data: SignUpInput): Promise<AuthTokens> {
    const response = await this.api.post<AuthTokens>("/signup", data);
    this.saveTokens(response.data);
    return response.data;
  }

  async signIn(data: SignInInput): Promise<AuthTokens> {
    const body = new URLSearchParams();
    body.set("username", data.email);
    body.set("password", data.password);

    const response = await this.api.post<AuthTokens>("/login", body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    this.saveTokens(response.data);
    return response.data;
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const response = await this.api.post<AuthTokens>("/refresh", {
      refresh_token: refreshToken,
    });

    return response.data;
  }

  async getMe(): Promise<User> {
    const response = await this.api.get<User>("/me");
    return response.data;
  }

  async listProjects(): Promise<Project[]> {
    const response = await this.api.get<Project[]>("/projects", {
      params: {
        include_shared: true,
        include_archived: false,
        include_chats: true,
      },
    });

    return response.data.map(normalizeProject);
  }

  async getProject(projectId: string): Promise<Project> {
    const response = await this.api.get<Project>(`/projects/${projectId}`, {
      params: {
        include_chats: true,
        include_shares: true,
      },
    });

    return normalizeProject(response.data);
  }

  async createProject(input: ProjectCreateInput): Promise<Project> {
    const response = await this.api.post<Project>("/projects", {
      name: input.name,
      description: input.description ?? null,
      instructions: input.instructions ?? null,
      memory_type: input.memory_type ?? "default",
      memory_project_ids: input.memory_project_ids ?? [],
      shared_with: input.shared_with ?? [],
    });

    return normalizeProject(response.data);
  }

  async updateProject(
    projectId: string,
    input: ProjectUpdateInput,
  ): Promise<Project> {
    await this.api.patch(`/projects/${projectId}`, input);
    return this.getProject(projectId);
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.api.delete(`/projects/${projectId}`);
  }

  async shareProject(
    projectId: string,
    input: { user_email: string; permission: SharePermission },
  ): Promise<ProjectShare> {
    const response = await this.api.post<ProjectShare>(
      `/projects/${projectId}/shares`,
      input,
    );

    return response.data;
  }

  async updateProjectSharePermission(
    projectId: string,
    shareId: string,
    permission: SharePermission,
  ): Promise<ProjectShare> {
    const response = await this.api.patch<ProjectShare>(
      `/projects/${projectId}/shares/${shareId}`,
      {
        permission,
      },
    );

    return response.data;
  }

  async deleteProjectShare(projectId: string, shareId: string): Promise<void> {
    await this.api.delete(`/projects/${projectId}/shares/${shareId}`);
  }

  async listPendingInvitations(): Promise<ProjectInvitation[]> {
    const response = await this.api.get<ProjectInvitation[]>(
      "/projects/shares/invitations",
    );

    return response.data;
  }

  async acceptInvitationByToken(token: string): Promise<ProjectShare> {
    const response = await this.api.post<ProjectShare>(
      "/projects/invitations/accept",
      null,
      {
        params: {
          token,
        },
      },
    );

    return response.data;
  }

  async listProjectFiles(projectId: string): Promise<ProjectFile[]> {
    const response = await this.api.get<ProjectFile[]>(
      `/projects/${projectId}/files`,
    );

    return response.data;
  }

  private async uploadFile(formData: FormData): Promise<FileUploadResponse> {
    const response = await this.api.post<FileUploadResponse>(
      "/files/upload",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    return response.data;
  }

  async uploadProjectFile(
    projectId: string,
    file: File,
  ): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.set("project_id", projectId);
    formData.set("file", file);
    return this.uploadFile(formData);
  }

  async uploadChatFile(chatId: string, file: File): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.set("chat_id", chatId);
    formData.set("file", file);
    return this.uploadFile(formData);
  }

  async confirmFileUpload(fileId: string): Promise<{ detail: string }> {
    const response = await this.api.post<{ detail: string }>(
      `/files/${fileId}/confirm`,
    );

    return response.data;
  }

  async deleteFile(fileId: string): Promise<{ detail: string }> {
    const response = await this.api.delete<{ detail: string }>(`/files/${fileId}`);

    return response.data;
  }

  async listChats(): Promise<ChatWithMessages[]> {
    const response = await this.api.get<ChatWithMessages[]>("/chats", {
      params: {
        include_messages: false,
      },
    });

    return response.data;
  }

  async getChat(chatId: string): Promise<ChatWithMessages> {
    const response = await this.api.get<ChatWithMessages>(`/chats/${chatId}`, {
      params: {
        include_messages: true,
      },
    });

    return response.data;
  }

  async deleteChat(chatId: string): Promise<void> {
    await this.api.delete(`/chats/${chatId}`);
  }

  getChatRealtimeSocketUrl(): string {
    const accessToken = this.getStoredAccessToken();
    if (!accessToken) {
      throw new Error("You need to sign in first.");
    }

    const base = this.baseURL.endsWith("/") ? this.baseURL : `${this.baseURL}/`;
    const url = new URL("chats/ws", base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("token", accessToken);
    return url.toString();
  }

  private getChatStreamURL(): string {
    const base = this.baseURL.endsWith("/") ? this.baseURL : `${this.baseURL}/`;
    return new URL("chats/", base).toString();
  }

  private async postChatStream(
    payload: ChatCreateInput,
    accessToken: string,
  ): Promise<Response> {
    return fetch(this.getChatStreamURL(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  async sendChatMessage(
    payload: ChatCreateInput,
    handlers: StreamHandlers,
  ): Promise<string | null> {
    let accessToken = this.getStoredAccessToken();
    if (!accessToken) {
      throw new Error("You need to sign in first.");
    }

    let response = await this.postChatStream(payload, accessToken);

    if (response.status === 401) {
      const refreshToken = this.getStoredRefreshToken();
      if (!refreshToken) {
        this.clearSession();
        throw new Error("Session expired. Please sign in again.");
      }

      const tokens = await this.refreshWithLock(refreshToken);
      accessToken = tokens.access_token;
      response = await this.postChatStream(payload, accessToken);
    }

    if (!response.ok) {
      let errorMessage = `Chat request failed with status ${response.status}`;
      try {
        const errorData = (await response.json()) as { detail?: string };
        if (typeof errorData.detail === "string" && errorData.detail.trim()) {
          errorMessage = errorData.detail;
        }
      } catch {
        // Ignore parsing errors and keep fallback message.
      }
      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error("Chat stream response body is empty.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let activeChatId: string | null = payload.chat_id ?? null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const eventSeparator = /\r?\n\r?\n/;
      let separatorMatch = eventSeparator.exec(buffer);

      while (separatorMatch) {
        const rawEvent = buffer.slice(0, separatorMatch.index).trim();
        buffer = buffer.slice(separatorMatch.index + separatorMatch[0].length);

        if (rawEvent) {
          const dataLines = rawEvent
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart());

          if (dataLines.length > 0) {
            const jsonPayload = dataLines.join("\n").trim();
            const event = JSON.parse(jsonPayload) as ChatStreamEvent;

            if ("chat_id" in event && event.chat_id) {
              activeChatId = event.chat_id;
              handlers.onChatId?.(event.chat_id);
            }

            if (event.type === "message_chunk") {
              if (event.done) {
                handlers.onDone?.();
              } else if (event.content) {
                handlers.onChunk(event.content);
              }
            }

            if (event.type === "error") {
              throw new Error(event.error);
            }
          }
        }

        separatorMatch = eventSeparator.exec(buffer);
      }
    }

    return activeChatId;
  }
}

export const backendApi = new BackendApi(env.VITE_BACKEND_URL);
