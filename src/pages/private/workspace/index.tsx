import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  ArrowUpRight,
  Bell,
  Bot,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  FileText,
  FolderOpen,
  FolderPlus,
  HardDrive,
  HelpCircle,
  LayoutGrid,
  Leaf,
  Lightbulb,
  Link2,
  LogOut,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,
  Star,
  Trash2,
  Upload,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { backendApi, getApiErrorMessage } from "@/core/api";
import { useGlobalStore } from "@/core/global-store";
import type {
  ChatMessage,
  ChatRealtimeEvent,
  ChatWithMessages,
  Project,
  ProjectFile,
  ProjectInvitation,
  SharePermission,
} from "@/core/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const ALL_PROJECTS_FILTER = "__all_projects__";
const STREAMING_MESSAGE_ID = "__streaming_assistant__";
const REALTIME_STREAMING_MESSAGE_PREFIX = "__realtime_assistant__";

export type WorkspacePanel = "chat" | "project" | "files" | "invitations";

const PANEL_PATHS: Record<WorkspacePanel, string> = {
  chat: "/chat",
  project: "/projects",
  files: "/files",
  invitations: "/invitations",
};

const AGENT_THEMES = [
  { icon: Code2, bg: "bg-blue-100", color: "text-blue-600" },
  { icon: Zap, bg: "bg-red-100", color: "text-red-500" },
  { icon: Leaf, bg: "bg-green-100", color: "text-green-600" },
  { icon: Sparkles, bg: "bg-amber-100", color: "text-amber-600" },
  { icon: Lightbulb, bg: "bg-violet-100", color: "text-violet-600" },
];

const STATIC_SUGGESTIONS = [
  "What's the status of my project?",
  "Summarise recent documents",
  "Find maintenance issues",
  "Show production report",
  "List pending tasks",
  "What changed this week?",
  "Generate a summary",
  "Analyse my files",
];

function sortChatsByActivity(chats: ChatWithMessages[]): ChatWithMessages[] {
  return [...chats].sort((a, b) => {
    const aDate = new Date(a.last_message_at ?? a.updated_at).getTime();
    const bDate = new Date(b.last_message_at ?? b.updated_at).getTime();
    return bDate - aDate;
  });
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + " KB";
  return (kb / 1024).toFixed(1) + " MB";
}

function formatRelativeDate(value: string | null): string {
  if (!value) return "—";
  const diffMs = Date.now() - new Date(value).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs} sec ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months !== 1 ? "s" : ""} ago`;
}

function FileTypeIcon({ filename, className }: { filename: string; className?: string }) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return <FileText className={`${className ?? ""} text-red-500`} />;
  if (["doc", "docx"].includes(ext)) return <FileText className={`${className ?? ""} text-blue-500`} />;
  if (["xls", "xlsx"].includes(ext)) return <FileText className={`${className ?? ""} text-green-600`} />;
  return <FileText className={`${className ?? ""} text-gray-400`} />;
}

function AgentCard({
  project,
  index,
  onClick,
}: {
  project: Project;
  index: number;
  onClick: () => void;
}) {
  const theme = AGENT_THEMES[index % AGENT_THEMES.length];
  const Icon = theme.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-violet-200 hover:shadow-sm transition-all w-full"
    >
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${theme.bg}`}>
        <Icon className={`h-4 w-4 ${theme.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800 truncate">{project.name}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
          {project.description || "Click to start chatting in this project"}
        </p>
      </div>
    </button>
  );
}

type WorkspacePageProps = { panel: WorkspacePanel };

export default function WorkspacePage({ panel }: WorkspacePageProps) {
  const navigate = useNavigate();
  const user = useGlobalStore((state) => state.user);

  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [addingShare, setAddingShare] = useState(false);
  const [updatingShareId, setUpdatingShareId] = useState<string | null>(null);
  const [removingShareId, setRemovingShareId] = useState<string | null>(null);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [acceptingToken, setAcceptingToken] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadingProjectFile, setUploadingProjectFile] = useState(false);
  const [uploadingChatFile, setUploadingChatFile] = useState(false);
  const [confirmingFileId, setConfirmingFileId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [memoryType, setMemoryType] = useState<"default" | "project-only">("default");
  const [memoryExpanded, setMemoryExpanded] = useState(false);
  const [createShareEmail, setCreateShareEmail] = useState("");
  const [createInvites, setCreateInvites] = useState<Array<{ email: string; permission: SharePermission }>>([]);
  const [sendingCreateInvite, setSendingCreateInvite] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [chats, setChats] = useState<ChatWithMessages[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>(ALL_PROJECTS_FILTER);
  const [messageInput, setMessageInput] = useState("");
  const [projectNameInput, setProjectNameInput] = useState("");
  const [projectDescriptionInput, setProjectDescriptionInput] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editArchived, setEditArchived] = useState(false);
  const [editFavorite, setEditFavorite] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [sharePermission, setSharePermission] = useState<SharePermission>("viewer");
  const [manualInvitationToken, setManualInvitationToken] = useState("");

  // UI state
  const [chatSearch, setChatSearch] = useState("");
  const [chatTab, setChatTab] = useState<"active" | "archive">("active");
  const [projectTab, setProjectTab] = useState<"active" | "archive">("active");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
  const [projectListMenuId, setProjectListMenuId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const activeChatIdRef = useRef<string | null>(activeChatId);
  const projectFilterRef = useRef<string>(projectFilter);
  const sendingMessageRef = useRef<boolean>(sendingMessage);
  const userIdRef = useRef<string | null>(user?.id ?? null);

  const activePanel = panel;

  const navigateToPanel = useCallback(
    (p: WorkspacePanel) => {
      if (p !== activePanel) navigate(PANEL_PATHS[p]);
    },
    [activePanel, navigate],
  );

  const activeProject = useMemo(
    () =>
      projectFilter === ALL_PROJECTS_FILTER
        ? null
        : projects.find((p) => p.id === projectFilter) ?? null,
    [projectFilter, projects],
  );

  const isProjectOwner = Boolean(
    activeProject && user && activeProject.owner_id === user.id,
  );

  const filteredChats = useMemo(() => {
    let list =
      projectFilter === ALL_PROJECTS_FILTER
        ? chats
        : chats.filter((c) => c.project_id === projectFilter);
    if (chatSearch.trim()) {
      const q = chatSearch.toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(q));
    }
    return list;
  }, [chats, projectFilter, chatSearch]);

  const sidebarProjects = useMemo(
    () =>
      projects.filter((p) =>
        projectTab === "archive" ? p.is_archived : !p.is_archived,
      ),
    [projects, projectTab],
  );

  const filteredProjectsList = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    return projects.filter(
      (p) => !p.is_archived && (!q || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)),
    );
  }, [projects, projectSearch]);

  const refreshProjects = useCallback(async () => {
    const data = await backendApi.listProjects();
    setProjects(data);
  }, []);

  const refreshChats = useCallback(async () => {
    const data = await backendApi.listChats();
    setChats(sortChatsByActivity(data));
    if (data.length === 0) {
      setActiveChatId(null);
      setMessages([]);
      return;
    }
    if (activeChatId && data.some((c) => c.id === activeChatId)) return;
    setActiveChatId(data[0].id);
  }, [activeChatId]);
  const refreshChatsRef = useRef(refreshChats);

  const refreshInvitations = useCallback(async () => {
    setLoadingInvitations(true);
    try {
      setInvitations(await backendApi.listPendingInvitations());
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

  const refreshProjectFiles = useCallback(async (projectId: string) => {
    setLoadingFiles(true);
    try {
      setProjectFiles(await backendApi.listProjectFiles(projectId));
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const refreshSingleProject = useCallback(async (projectId: string) => {
    const fresh = await backendApi.getProject(projectId);
    setProjects((prev) => prev.map((p) => (p.id === fresh.id ? fresh : p)));
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoadingWorkspace(true);
    try {
      const [projectData, chatData, invitationData] = await Promise.all([
        backendApi.listProjects(),
        backendApi.listChats(),
        backendApi.listPendingInvitations(),
      ]);
      setProjects(projectData);
      setChats(sortChatsByActivity(chatData));
      setInvitations(invitationData);
      if (chatData.length > 0) setActiveChatId(chatData[0].id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load workspace."));
    } finally {
      setLoadingWorkspace(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  useEffect(() => {
    projectFilterRef.current = projectFilter;
  }, [projectFilter]);
  useEffect(() => {
    sendingMessageRef.current = sendingMessage;
  }, [sendingMessage]);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);
  useEffect(() => {
    refreshChatsRef.current = refreshChats;
  }, [refreshChats]);

  useEffect(() => {
    if (!user?.id) return;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let closedByCleanup = false;

    function clearTimers() {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (pingTimer !== null) {
        window.clearInterval(pingTimer);
        pingTimer = null;
      }
    }

    function connect() {
      let socketUrl: string;
      try {
        socketUrl = backendApi.getChatRealtimeSocketUrl();
      } catch {
        return;
      }
      socket = new WebSocket(socketUrl);
      socket.onopen = () => {
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
        }, 25000);
      };
      socket.onmessage = (event) => {
        let payload: ChatRealtimeEvent;
        try {
          payload = JSON.parse(event.data) as ChatRealtimeEvent;
        } catch {
          return;
        }
        if (payload.type === "pong" || payload.type === "ws_connected") return;
        if (payload.type === "chat_created") {
          if (payload.actor_user_id === userIdRef.current) return;
          const f = projectFilterRef.current;
          if (f !== ALL_PROJECTS_FILTER && payload.chat.project_id !== f) return;
          void refreshChatsRef.current();
          return;
        }
        if (payload.type === "chat_deleted") {
          setChats((prev) => prev.filter((c) => c.id !== payload.chat_id));
          if (activeChatIdRef.current === payload.chat_id) {
            setActiveChatId(null);
            setMessages([]);
          }
          return;
        }
        if (payload.type === "message_created") {
          if (payload.actor_user_id && payload.actor_user_id === userIdRef.current) return;
          void refreshChatsRef.current();
          if (activeChatIdRef.current !== payload.chat_id) return;
          const streamingId = REALTIME_STREAMING_MESSAGE_PREFIX + "-" + payload.chat_id;
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.message.id)) return prev;
            const without = prev.filter((m) => m.id !== streamingId);
            const next = [...without, payload.message];
            if (payload.message.role !== "user") return next;
            return [
              ...next,
              {
                id: streamingId,
                chat_id: payload.chat_id,
                sender: null,
                role: "assistant",
                content: "",
                created_at: new Date().toISOString(),
              },
            ];
          });
          return;
        }
        if (payload.type === "assistant_chunk") {
          if (payload.actor_user_id && payload.actor_user_id === userIdRef.current) return;
          if (activeChatIdRef.current !== payload.chat_id) return;
          const streamingId = REALTIME_STREAMING_MESSAGE_PREFIX + "-" + payload.chat_id;
          setMessages((prev) => {
            const copy = [...prev];
            const idx = copy.findIndex((m) => m.id === streamingId);
            if (idx === -1) {
              copy.push({
                id: streamingId,
                chat_id: payload.chat_id,
                sender: null,
                role: "assistant",
                content: payload.content,
                created_at: new Date().toISOString(),
              });
              return copy;
            }
            copy[idx] = { ...copy[idx], content: copy[idx].content + payload.content };
            return copy;
          });
          return;
        }
        if (payload.type === "assistant_done") {
          if (payload.actor_user_id && payload.actor_user_id === userIdRef.current) return;
          void refreshChatsRef.current();
          if (activeChatIdRef.current === payload.chat_id && !sendingMessageRef.current) {
            void backendApi
              .getChat(payload.chat_id)
              .then((chat) => {
                if (activeChatIdRef.current === payload.chat_id) setMessages(chat.messages);
              })
              .catch(() => {});
          }
        }
      };
      socket.onclose = () => {
        clearTimers();
        if (!closedByCleanup) reconnectTimer = window.setTimeout(connect, 2000);
      };
      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();
    return () => {
      closedByCleanup = true;
      clearTimers();
      socket?.close();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!activeChatId) {
      if (!sendingMessage) setMessages([]);
      return;
    }
    if (sendingMessage) return;
    const chatId = activeChatId;
    let cancelled = false;
    async function load() {
      setLoadingChat(true);
      try {
        const chat = await backendApi.getChat(chatId);
        if (!cancelled) setMessages(chat.messages);
      } catch (error) {
        if (!cancelled) toast.error(getApiErrorMessage(error, "Failed to load chat."));
      } finally {
        if (!cancelled) setLoadingChat(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeChatId, sendingMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeProject) {
      setEditName("");
      setEditDescription("");
      setEditInstructions("");
      setEditArchived(false);
      setEditFavorite(false);
      setProjectFiles([]);
      return;
    }
    setEditName(activeProject.name);
    setEditDescription(activeProject.description ?? "");
    setEditInstructions(activeProject.instructions ?? "");
    setEditArchived(Boolean(activeProject.is_archived));
    setEditFavorite(Boolean(activeProject.is_favorite));
    void refreshProjectFiles(activeProject.id);
  }, [activeProject, refreshProjectFiles]);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = projectNameInput.trim();
    if (!name) return;
    setCreatingProject(true);
    try {
      const project = await backendApi.createProject({
        name,
        description: projectDescriptionInput.trim() || undefined,
      });
      // Send any pending share invites
      for (const invite of createInvites) {
        try {
          await backendApi.shareProject(project.id, {
            user_email: invite.email,
            permission: invite.permission,
          });
        } catch {
          // non-fatal
        }
      }
      setProjects((prev) => [project, ...prev]);
      setProjectFilter(project.id);
      navigateToPanel("project");
      setProjectNameInput("");
      setProjectDescriptionInput("");
      setCreateShareEmail("");
      setCreateInvites([]);
      setMemoryType("default");
      setMemoryExpanded(false);
      setShowNewProject(false);
      toast.success("Project created.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to create project."));
    } finally {
      setCreatingProject(false);
    }
  }

  function handleAddCreateInvite() {
    const email = createShareEmail.trim();
    if (!email) return;
    if (createInvites.some((i) => i.email === email)) return;
    setCreateInvites((prev) => [...prev, { email, permission: "viewer" }]);
    setCreateShareEmail("");
  }

  function handleRemoveCreateInvite(email: string) {
    setCreateInvites((prev) => prev.filter((i) => i.email !== email));
  }

  async function handleSaveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProject) return;
    setSavingProject(true);
    try {
      const updated = await backendApi.updateProject(activeProject.id, {
        name: editName.trim(),
        description: editDescription.trim() === "" ? null : editDescription.trim(),
        instructions: editInstructions.trim() === "" ? null : editInstructions.trim(),
        is_archived: editArchived,
        is_favorite: editFavorite,
      });
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success("Project saved.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to save project."));
    } finally {
      setSavingProject(false);
    }
  }

  async function handleDeleteProjectById(project: Project) {
    if (!window.confirm(`Delete "${project.name}"?`)) return;
    setDeletingProjectId(project.id);
    try {
      await backendApi.deleteProject(project.id);
      toast.success("Project deleted.");
      if (projectFilter === project.id) {
        setProjectFilter(ALL_PROJECTS_FILTER);
        navigateToPanel("chat");
      }
      await Promise.all([refreshProjects(), refreshChats()]);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to delete project."));
    } finally {
      setDeletingProjectId(null);
    }
  }

  async function handleDeleteProject() {
    if (activeProject) await handleDeleteProjectById(activeProject);
  }

  async function handleToggleFavorite(project: Project) {
    try {
      await backendApi.updateProject(project.id, { is_favorite: !project.is_favorite });
      await refreshProjects();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update project."));
    }
  }

  async function handleDeleteChat(chat: ChatWithMessages) {
    if (sendingMessage) {
      toast.error("Wait for the current response to finish.");
      return;
    }
    if (!window.confirm(`Delete "${chat.title}"?`)) return;
    setDeletingChatId(chat.id);
    try {
      await backendApi.deleteChat(chat.id);
      if (activeChatId === chat.id) {
        setActiveChatId(null);
        setMessages([]);
      }
      await refreshChats();
      toast.success("Chat deleted.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to delete chat."));
    } finally {
      setDeletingChatId(null);
    }
  }

  async function handleAddShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProject) return;
    const email = shareEmail.trim();
    if (!email) return;
    setAddingShare(true);
    try {
      await backendApi.shareProject(activeProject.id, {
        user_email: email,
        permission: sharePermission,
      });
      setShareEmail("");
      setSharePermission("viewer");
      await refreshSingleProject(activeProject.id);
      toast.success("Invitation sent.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to share project."));
    } finally {
      setAddingShare(false);
    }
  }

  async function handleUpdateSharePermission(shareId: string, permission: SharePermission) {
    if (!activeProject) return;
    setUpdatingShareId(shareId);
    try {
      await backendApi.updateProjectSharePermission(activeProject.id, shareId, permission);
      await refreshSingleProject(activeProject.id);
      toast.success("Permission updated.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update permission."));
    } finally {
      setUpdatingShareId(null);
    }
  }

  async function handleRemoveShare(shareId: string) {
    if (!activeProject) return;
    setRemovingShareId(shareId);
    try {
      await backendApi.deleteProjectShare(activeProject.id, shareId);
      await refreshSingleProject(activeProject.id);
      toast.success("Share removed.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to remove share."));
    } finally {
      setRemovingShareId(null);
    }
  }

  async function handleAcceptInvitationToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = manualInvitationToken.trim();
    if (!token) return;
    setAcceptingToken(true);
    try {
      await backendApi.acceptInvitationByToken(token);
      setManualInvitationToken("");
      await Promise.all([refreshProjects(), refreshInvitations()]);
      toast.success("Invitation accepted.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to accept invitation."));
    } finally {
      setAcceptingToken(false);
    }
  }

  async function handleProjectFileSelected(event: ChangeEvent<HTMLInputElement>) {
    if (!activeProject) return;
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setUploadingProjectFile(true);
    try {
      const result = await backendApi.uploadProjectFile(activeProject.id, file);
      setConfirmingFileId(result.id);
      await backendApi.confirmFileUpload(result.id);
      setConfirmingFileId(null);
      await refreshProjectFiles(activeProject.id);
      toast.success("File uploaded.");
    } catch (error) {
      setConfirmingFileId(null);
      toast.error(getApiErrorMessage(error, "Failed to upload file."));
    } finally {
      setUploadingProjectFile(false);
    }
  }

  async function handleChatFileSelected(event: ChangeEvent<HTMLInputElement>) {
    if (!activeChatId) return;
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setUploadingChatFile(true);
    try {
      const result = await backendApi.uploadChatFile(activeChatId, file);
      setConfirmingFileId(result.id);
      await backendApi.confirmFileUpload(result.id);
      setConfirmingFileId(null);
      toast.success("File attached to chat.");
    } catch (error) {
      setConfirmingFileId(null);
      toast.error(getApiErrorMessage(error, "Failed to upload file."));
    } finally {
      setUploadingChatFile(false);
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!window.confirm("Delete this file?")) return;
    setDeletingFileId(fileId);
    try {
      await backendApi.deleteFile(fileId);
      setProjectFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("File deleted.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to delete file."));
    } finally {
      setDeletingFileId(null);
    }
  }

  function handleStartNewChat() {
    setActiveChatId(null);
    setMessages([]);
    navigateToPanel("chat");
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = messageInput.trim();
    if (!content) return;
    setSendingMessage(true);
    setMessageInput("");

    const tempUserMsg: ChatMessage = {
      id: "local-user-" + Date.now(),
      chat_id: activeChatId ?? "",
      sender: user
        ? { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name }
        : null,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };

    const streamingMsg: ChatMessage = {
      id: STREAMING_MESSAGE_ID,
      chat_id: activeChatId ?? "",
      sender: null,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg, streamingMsg]);
    if (activePanel !== "chat") navigateToPanel("chat");

    try {
      const newChatId = await backendApi.sendChatMessage(
        {
          chat_id: activeChatId ?? undefined,
          project_id:
            projectFilter !== ALL_PROJECTS_FILTER ? projectFilter : undefined,
          message: content,
        },
        {
          onChatId: (id) => {
            if (!activeChatId) setActiveChatId(id);
          },
          onChunk: (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === STREAMING_MESSAGE_ID ? { ...m, content: m.content + chunk } : m,
              ),
            );
          },
          onDone: () => {},
        },
      );
      if (newChatId) setActiveChatId(newChatId);
      await refreshChats();
      if (newChatId ?? activeChatId) {
        const chat = await backendApi.getChat(newChatId ?? activeChatId!);
        setMessages(chat.messages);
      }
    } catch (error) {
      setMessages((prev) =>
        prev.filter(
          (m) => m.id !== STREAMING_MESSAGE_ID && m.id !== tempUserMsg.id,
        ),
      );
      toast.error(getApiErrorMessage(error, "Failed to send message."));
    } finally {
      setSendingMessage(false);
    }
  }

  function handleSignOut() {
    backendApi.signOut();
    navigate("/auth", { replace: true });
  }

  const isHomeState =
    activePanel === "chat" && !activeChatId && messages.length === 0 && !sendingMessage;

  const activeChat = chats.find((c) => c.id === activeChatId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      {/* ── Top navigation bar ── */}
      <header className="flex h-11 flex-shrink-0 items-center border-b border-gray-200 bg-white px-3 gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-violet-600 text-[10px] font-bold text-white">
              F
            </div>
            <span className="text-sm font-semibold text-gray-800">F-Mate</span>
          </div>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-500">Mate</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {invitations.length > 0 && (
            <button
              type="button"
              onClick={() => navigateToPanel("invitations")}
              className="relative rounded-full p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <Mail className="h-4 w-4" />
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-violet-600 text-[9px] font-bold text-white">
                {invitations.length}
              </span>
            </button>
          )}
          <button
            type="button"
            className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Bell className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            title="Sign out"
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700 hover:bg-violet-200 transition-colors"
          >
            {user ? (user.first_name[0] ?? "U").toUpperCase() : "U"}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        {!sidebarCollapsed && (
          <aside className="flex w-52 flex-shrink-0 flex-col border-r border-gray-200 bg-white overflow-hidden">
            {/* MATE header */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">
                MATE
              </span>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="rounded p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-3 mb-2">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search chats"
                  className="flex-1 bg-transparent text-xs text-gray-700 placeholder:text-gray-400 outline-none"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                />
              </div>
            </div>

            {/* New chat + New project buttons */}
            <div className="flex gap-1.5 px-3 mb-3">
              <button
                type="button"
                onClick={handleStartNewChat}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Plus className="h-3 w-3" />
                New chat
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewProject(true);
                  navigateToPanel("project");
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FolderPlus className="h-3 w-3" />
                New project
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {/* ── All chats ── */}
              <div className="px-3 mb-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-gray-500" />
                  <span className="text-xs font-semibold text-gray-700">All chats</span>
                </div>
                {/* Active / Archive tabs */}
                <div className="flex rounded-lg bg-gray-100 p-0.5 mb-2">
                  <button
                    type="button"
                    className={`flex-1 rounded-md py-1 text-[11px] font-medium transition-colors ${
                      chatTab === "active"
                        ? "bg-white shadow-sm text-gray-800"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                    onClick={() => setChatTab("active")}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-md py-1 text-[11px] font-medium transition-colors ${
                      chatTab === "archive"
                        ? "bg-white shadow-sm text-gray-800"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                    onClick={() => setChatTab("archive")}
                  >
                    Archive
                  </button>
                </div>
                {/* Chat list */}
                <div className="space-y-0.5">
                  {loadingWorkspace ? (
                    <div className="px-2 py-1 text-[11px] text-gray-400">Loading…</div>
                  ) : filteredChats.length === 0 ? (
                    <div className="px-2 py-1 text-[11px] text-gray-400">No chats yet</div>
                  ) : (
                    filteredChats.map((chat) => (
                      <div key={chat.id} className="group flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveChatId(chat.id);
                            navigateToPanel("chat");
                          }}
                          className={`flex-1 min-w-0 truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                            activeChatId === chat.id
                              ? "bg-gray-100 text-gray-900 font-medium"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          }`}
                        >
                          {chat.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteChat(chat)}
                          disabled={deletingChatId === chat.id || sendingMessage}
                          className="hidden group-hover:flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mx-3 my-1 h-px bg-gray-100" />

              {/* ── All projects ── */}
              <div className="px-3 mb-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <FolderOpen className="h-3.5 w-3.5 text-gray-500" />
                  <span className="text-xs font-semibold text-gray-700">All projects</span>
                </div>
                {/* Active / Archive tabs */}
                <div className="flex rounded-lg bg-gray-100 p-0.5 mb-2">
                  <button
                    type="button"
                    className={`flex-1 rounded-md py-1 text-[11px] font-medium transition-colors ${
                      projectTab === "active"
                        ? "bg-white shadow-sm text-gray-800"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                    onClick={() => setProjectTab("active")}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-md py-1 text-[11px] font-medium transition-colors ${
                      projectTab === "archive"
                        ? "bg-white shadow-sm text-gray-800"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                    onClick={() => setProjectTab("archive")}
                  >
                    Archive
                  </button>
                </div>
                {/* Project list */}
                <div className="space-y-0.5">
                  {sidebarProjects.length === 0 ? (
                    <div className="px-2 py-1 text-[11px] text-gray-400">No projects</div>
                  ) : (
                    sidebarProjects.map((project) => (
                      <div key={project.id} className="group relative">
                        <div
                          className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors cursor-pointer ${
                            projectFilter === project.id
                              ? "bg-gray-100 text-gray-900 font-medium"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          }`}
                          onClick={() => {
                            setProjectFilter(project.id);
                            setActiveChatId(null);
                            setMessages([]);
                            navigateToPanel("chat");
                          }}
                        >
                          <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                          <span className="flex-1 truncate">{project.name}</span>
                          {project.is_favorite && (
                            <Star className="h-3 w-3 flex-shrink-0 text-amber-400" />
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenProjectMenuId(
                                openProjectMenuId === project.id ? null : project.id,
                              );
                            }}
                            className="hidden group-hover:flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:text-gray-700"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                        </div>
                        {openProjectMenuId === project.id && (
                          <div className="absolute right-2 top-7 z-20 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenProjectMenuId(null);
                                void handleToggleFavorite(project);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              <Star className={`h-3 w-3 ${project.is_favorite ? "fill-amber-400 text-amber-400" : "text-gray-400"}`} />
                              {project.is_favorite ? "Unfavorite" : "Favorite"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenProjectMenuId(null);
                                setProjectFilter(project.id);
                                navigateToPanel("project");
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              <Pencil className="h-3 w-3 text-gray-400" />
                              Edit details
                            </button>
                            <div className="my-1 h-px bg-gray-100" />
                            <button
                              type="button"
                              onClick={() => {
                                setOpenProjectMenuId(null);
                                void handleDeleteProjectById(project);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ── AI Drive (active project files) ── */}
              {activeProject && (
                <>
                  <div className="mx-3 my-1 h-px bg-gray-100" />
                  <div className="px-3 mb-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <HardDrive className="h-3.5 w-3.5 text-gray-500" />
                        <span className="text-xs font-semibold text-gray-700">AI drive</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => projectFileInputRef.current?.click()}
                        disabled={uploadingProjectFile}
                        className="text-[10px] text-violet-600 hover:text-violet-800 transition-colors"
                      >
                        {uploadingProjectFile ? "Uploading…" : "+ Upload"}
                      </button>
                      <input
                        ref={projectFileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleProjectFileSelected}
                      />
                    </div>
                    {loadingFiles ? (
                      <div className="px-2 py-1 text-[11px] text-gray-400 animate-pulse">
                        Loading…
                      </div>
                    ) : projectFiles.length === 0 ? (
                      <div className="px-2 py-1 text-[11px] text-gray-400">No files yet</div>
                    ) : (
                      <div className="space-y-0.5">
                        {projectFiles.map((file) => (
                          <div
                            key={file.id}
                            className="group flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                          >
                            <FileTypeIcon filename={file.filename} className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="flex-1 truncate">{file.filename}</span>
                            <button
                              type="button"
                              onClick={() => void handleDeleteFile(file.id)}
                              disabled={deletingFileId === file.id}
                              className="hidden group-hover:flex text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ── Bottom: Import conversations ── */}
            <div className="border-t border-gray-100 px-3 py-2.5">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
              >
                <Download className="h-3.5 w-3.5 flex-shrink-0" />
                Import conversations
              </button>
            </div>
          </aside>
        )}

        {/* Collapsed sidebar toggle */}
        {sidebarCollapsed && (
          <div className="flex w-10 flex-shrink-0 flex-col items-center border-r border-gray-200 bg-white py-3 gap-3">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Main content ── */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">

          {/* ── Create Project full-page form ── */}
          {showNewProject && (
            <div className="flex-1 overflow-y-auto">
              <form
                onSubmit={handleCreateProject}
                className="mx-auto max-w-2xl px-8 py-10"
              >
                <h1 className="mb-8 text-3xl font-bold text-gray-900">Create Project</h1>

                {/* Info card */}
                <div className="mb-8 rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <p className="mb-2 text-sm font-semibold text-gray-800">How to use your project</p>
                  <p className="text-sm leading-relaxed text-gray-500">
                    Your project will help you stay organized and keep track of your progress across
                    different tasks. Upload notes, documents, designs, or code to build a structured
                    collection that you can reference anytime. Start by giving your project a clear
                    and memorable name, and describe your main goals, ideas, or challenges. You'll
                    always be able to update it later as your work evolves.
                  </p>
                </div>

                {/* Project name */}
                <div className="mb-6">
                  <label className="mb-2 block text-sm font-semibold text-gray-800">
                    What are you project name
                  </label>
                  <input
                    type="text"
                    value={projectNameInput}
                    onChange={(e) => setProjectNameInput(e.target.value)}
                    placeholder="Name your project"
                    required
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 transition-all"
                  />
                </div>

                {/* Memory */}
                <div className="mb-6">
                  <label className="mb-2 block text-sm font-semibold text-gray-800">Memory</label>
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    {/* Collapsed header */}
                    <button
                      type="button"
                      onClick={() => setMemoryExpanded((v) => !v)}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-800 bg-white hover:bg-gray-50 transition-colors"
                    >
                      <span>{memoryType === "default" ? "Default" : "Project-only"}</span>
                      {memoryExpanded ? (
                        <ChevronRight className="h-4 w-4 -rotate-90 text-gray-400 transition-transform" />
                      ) : (
                        <ChevronRight className="h-4 w-4 rotate-90 text-gray-400 transition-transform" />
                      )}
                    </button>
                    {/* Expanded options */}
                    {memoryExpanded && (
                      <div className="border-t border-gray-200">
                        <button
                          type="button"
                          onClick={() => { setMemoryType("default"); setMemoryExpanded(false); }}
                          className={`w-full px-4 py-3 text-left transition-colors ${memoryType === "default" ? "bg-gray-50" : "bg-white hover:bg-gray-50"}`}
                        >
                          <p className="text-sm font-medium text-gray-800">Default</p>
                          <p className="text-xs text-gray-500 mt-0.5">Project can access memories from outside chats</p>
                        </button>
                        <div className="h-px bg-gray-100 mx-4" />
                        <button
                          type="button"
                          onClick={() => { setMemoryType("project-only"); setMemoryExpanded(false); }}
                          className={`w-full px-4 py-3 text-left transition-colors ${memoryType === "project-only" ? "bg-gray-50" : "bg-white hover:bg-gray-50"}`}
                        >
                          <p className="text-sm font-medium text-gray-800">Project-only</p>
                          <p className="text-xs text-gray-500 mt-0.5">Project can only access its own memories. Its memories are hidden from outside chats</p>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Add project chips (linked projects) */}
                  {!memoryExpanded && (
                    <div className="mt-3">
                      <p className="mb-2 text-xs font-medium text-gray-600">Add project</p>
                      <div className="flex flex-wrap gap-2">
                        {projects
                          .filter((p) => p.name !== projectNameInput.trim())
                          .slice(0, 6)
                          .map((p) => (
                            <span
                              key={p.id}
                              className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600"
                            >
                              <FolderOpen className="h-3 w-3 text-gray-400" />
                              {p.name}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Share to select */}
                <div className="mb-6">
                  <label className="mb-2 block text-sm font-semibold text-gray-800">
                    Share to select
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={createShareEmail}
                      onChange={(e) => setCreateShareEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); handleAddCreateInvite(); }
                      }}
                      placeholder="Email"
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 transition-all"
                    />
                    <button
                      type="button"
                      onClick={handleAddCreateInvite}
                      disabled={!createShareEmail.trim()}
                      className="rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-40 transition-colors"
                    >
                      Invite
                    </button>
                  </div>
                  {/* Pending invites */}
                  {createInvites.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {createInvites.map((inv) => (
                        <div key={inv.email} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2">
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600">
                            {inv.email[0]?.toUpperCase()}
                          </div>
                          <span className="flex-1 text-sm text-gray-500">{inv.email} (invite sent)</span>
                          <span className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                            Viewer
                            <ChevronRight className="h-3 w-3 rotate-90 text-gray-400" />
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCreateInvite(inv.email)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="mb-10">
                  <label className="mb-2 block text-sm font-semibold text-gray-800">
                    What are you project Description
                  </label>
                  <textarea
                    value={projectDescriptionInput}
                    onChange={(e) => setProjectDescriptionInput(e.target.value)}
                    placeholder="Describe your project, subject, etc..."
                    rows={4}
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 transition-all resize-none"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewProject(false);
                      setProjectNameInput("");
                      setProjectDescriptionInput("");
                      setCreateShareEmail("");
                      setCreateInvites([]);
                      setMemoryType("default");
                      setMemoryExpanded(false);
                    }}
                    className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingProject || !projectNameInput.trim()}
                    className="rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {creatingProject ? "Creating…" : "Create project"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── General home state (no project selected) ── */}
          {!showNewProject && isHomeState && projectFilter === ALL_PROJECTS_FILTER && (
            <div className="flex flex-1 flex-col items-center justify-center px-8 py-10">
              <p className="mb-1 text-[11px] font-bold tracking-widest text-gray-400 uppercase">
                F-MATE
              </p>
              <h1 className="mb-8 text-3xl font-bold text-gray-900">
                What are you working on today?
              </h1>

              {/* Agent cards */}
              {loadingWorkspace ? (
                <div className="mb-8 text-sm text-gray-400 animate-pulse">Loading projects…</div>
              ) : projects.length === 0 ? (
                <div className="mb-8 text-center">
                  <p className="text-sm text-gray-500">No projects yet. Create one to get started.</p>
                </div>
              ) : (
                <div className="mb-8 w-full max-w-2xl space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    {projects.slice(0, 3).map((project, i) => (
                      <AgentCard
                        key={project.id}
                        project={project}
                        index={i}
                        onClick={() => { setProjectFilter(project.id); }}
                      />
                    ))}
                  </div>
                  {projects.length > 3 && (
                    <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: "repeat(2, 1fr)", paddingLeft: "calc(33.33333% / 2 - 6px)", paddingRight: "calc(33.33333% / 2 - 6px)" }}>
                      {projects.slice(3, 5).map((project, i) => (
                        <AgentCard
                          key={project.id}
                          project={project}
                          index={i + 3}
                          onClick={() => { setProjectFilter(project.id); }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Message input */}
              <div className="w-full max-w-2xl">
                <form onSubmit={handleSendMessage}>
                  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-50 transition-all">
                    <Textarea
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="Message to F-mate..."
                      className="min-h-[40px] max-h-40 resize-none border-0 bg-transparent p-0 text-sm text-gray-800 placeholder:text-gray-400 focus-visible:ring-0 shadow-none"
                      rows={1}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => chatFileInputRef.current?.click()}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                        title="Attach file"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                        title="Code"
                      >
                        <Code2 className="h-3.5 w-3.5" />
                      </button>
                      {activeProject && (
                        <span className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                          <FolderOpen className="h-3 w-3" />
                          {activeProject.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Sparkles className="h-3 w-3 text-violet-500" />
                        GPT 4.0
                        <ChevronRight className="h-3 w-3 rotate-90 text-gray-400" />
                      </button>
                      <button
                        type="submit"
                        disabled={sendingMessage || !messageInput.trim()}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <SendHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    ref={chatFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleChatFileSelected}
                  />
                </form>

                {/* Suggestion chips */}
                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {STATIC_SUGGESTIONS.slice(0, 4).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setMessageInput(s)}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-violet-200 hover:text-violet-700 transition-colors"
                      >
                        {s}
                        <ArrowUpRight className="h-3 w-3 flex-shrink-0 text-gray-400" />
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {STATIC_SUGGESTIONS.slice(4).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setMessageInput(s)}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-violet-200 hover:text-violet-700 transition-colors"
                      >
                        {s}
                        <ArrowUpRight className="h-3 w-3 flex-shrink-0 text-gray-400" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Project home state (project selected, no active chat) ── */}
          {!showNewProject && isHomeState && projectFilter !== ALL_PROJECTS_FILTER && activeProject && (
            <div className="flex flex-1 flex-col">
              {/* Header: folder icon + name + description */}
              <div className="flex-shrink-0 border-b border-gray-100 px-10 py-10">
                <div className="flex items-center gap-3 mb-2">
                  <FolderOpen className="h-8 w-8 text-gray-700" />
                  <h1 className="text-2xl font-bold text-gray-900">{activeProject.name}</h1>
                </div>
                {activeProject.description && (
                  <p className="ml-11 text-sm text-gray-500">{activeProject.description}</p>
                )}
              </div>

              {/* Message input */}
              <div className="flex-shrink-0 px-10 pt-6">
                <form onSubmit={handleSendMessage}>
                  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-50 transition-all">
                    <Textarea
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="Message to F-mate..."
                      className="min-h-[40px] max-h-40 resize-none border-0 bg-transparent p-0 text-sm text-gray-800 placeholder:text-gray-400 focus-visible:ring-0 shadow-none"
                      rows={1}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => chatFileInputRef.current?.click()}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                        <Code2 className="h-3.5 w-3.5" />
                      </button>
                      <span className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                        <FolderOpen className="h-3 w-3" />
                        {activeProject.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                        <Sparkles className="h-3 w-3 text-violet-500" />
                        F-mate 4.0
                        <ChevronRight className="h-3 w-3 rotate-90 text-gray-400" />
                      </button>
                      <button
                        type="submit"
                        disabled={sendingMessage || !messageInput.trim()}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <SendHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <input ref={chatFileInputRef} type="file" className="hidden" onChange={handleChatFileSelected} />
                </form>
              </div>

              {/* Chat list for this project */}
              <div className="flex-1 overflow-y-auto px-10 pt-6 pb-6">
                {filteredChats.length === 0 ? (
                  <p className="text-sm text-gray-400">No conversations in this project yet. Start one above.</p>
                ) : (
                  <div className="space-y-px">
                    {filteredChats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => setActiveChatId(chat.id)}
                        className="flex w-full items-start justify-between rounded-xl px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">{chat.title}</p>
                          {chat.messages.length > 0 && (
                            <p className="mt-0.5 truncate text-xs text-gray-400">
                              {chat.messages[chat.messages.length - 1]?.content}
                            </p>
                          )}
                        </div>
                        <span className="ml-4 flex-shrink-0 text-xs text-gray-400">
                          {formatDate(chat.last_message_at ?? chat.updated_at)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Chat panel (active conversation) ── */}
          {!showNewProject && activePanel === "chat" && !isHomeState && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Chat header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-gray-800">
                    {activeChat?.title ?? "New conversation"}
                  </h2>
                  {activeProject && (
                    <p className="text-xs text-gray-400">{activeProject.name}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleStartNewChat}
                  className="ml-4 flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New chat
                </button>
              </div>

              {/* Messages */}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {messages.length === 0 ? (
                  loadingChat ? (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-sm text-gray-400 animate-pulse">Loading conversation…</p>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 border border-violet-100">
                        <Bot className="h-6 w-6 text-violet-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600">
                        {activeProject
                          ? `Chatting in "${activeProject.name}"`
                          : "Start a new conversation"}
                      </p>
                    </div>
                  )
                ) : (
                  <div className="mx-auto max-w-3xl space-y-6">
                    {messages.map((message) => {
                      const isAssistant = message.role === "assistant";
                      const isStreaming =
                        isAssistant &&
                        !message.content &&
                        (message.id === STREAMING_MESSAGE_ID ||
                          message.id.startsWith(REALTIME_STREAMING_MESSAGE_PREFIX));
                      const isCurrentUser =
                        message.role === "user" &&
                        (message.id.startsWith("local-user-") ||
                          (user?.id != null && message.sender?.id === user.id));
                      const isOtherUser = message.role === "user" && !isCurrentUser;

                      let senderName = "F-Mate";
                      if (isCurrentUser) senderName = "You";
                      else if (isOtherUser) {
                        const full = [message.sender?.first_name, message.sender?.last_name]
                          .filter(Boolean)
                          .join(" ")
                          .trim();
                        senderName = full || message.sender?.email || "Teammate";
                      }

                      if (isAssistant) {
                        return (
                          <div key={message.id} className="flex gap-3">
                            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 border border-violet-200">
                              <Bot className="h-3.5 w-3.5 text-violet-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="mb-1 text-[11px] font-medium text-gray-400">
                                {senderName}
                              </p>
                              <div className="rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed text-gray-800 shadow-sm">
                                {isStreaming ? (
                                  <div className="flex h-5 items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
                                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
                                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
                                  </div>
                                ) : (
                                  <p className="whitespace-pre-wrap">{message.content || "…"}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${isCurrentUser ? "flex-row-reverse" : ""}`}
                        >
                          <div
                            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                              isCurrentUser
                                ? "bg-violet-600 text-white"
                                : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {senderName[0]?.toUpperCase()}
                          </div>
                          <div
                            className={`max-w-[70%] min-w-0 flex flex-col ${
                              isCurrentUser ? "items-end" : "items-start"
                            }`}
                          >
                            <p
                              className={`mb-1 text-[11px] font-medium text-gray-400 ${
                                isCurrentUser ? "text-right" : ""
                              }`}
                            >
                              {senderName}
                            </p>
                            <div
                              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                isCurrentUser
                                  ? "bg-violet-600 text-white rounded-tr-sm"
                                  : "border border-gray-200 bg-gray-50 text-gray-800 rounded-tl-sm"
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{message.content}</p>
                            </div>
                            <p className="mt-1 text-[10px] text-gray-400">
                              {formatDate(message.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {loadingChat && (
                      <p className="text-center text-xs text-gray-400 animate-pulse">
                        Syncing…
                      </p>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input bar */}
              <div className="border-t border-gray-100 bg-white px-6 py-4">
                <form onSubmit={handleSendMessage} className="mx-auto max-w-3xl">
                  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-50 transition-all shadow-sm">
                    <Textarea
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="Message to F-mate..."
                      className="min-h-[40px] max-h-48 resize-none border-0 bg-transparent p-0 text-sm text-gray-800 placeholder:text-gray-400 focus-visible:ring-0 shadow-none"
                      rows={1}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => chatFileInputRef.current?.click()}
                        disabled={!activeChatId || uploadingChatFile}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                        title="Attach file"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        <Code2 className="h-3.5 w-3.5" />
                      </button>
                      {activeProject && (
                        <span className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                          <FolderOpen className="h-3 w-3" />
                          {activeProject.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Sparkles className="h-3 w-3 text-violet-500" />
                        GPT 4.0
                        <ChevronRight className="h-3 w-3 rotate-90 text-gray-400" />
                      </button>
                      <button
                        type="submit"
                        disabled={sendingMessage || loadingWorkspace || !messageInput.trim()}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <SendHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    ref={chatFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleChatFileSelected}
                  />
                  {uploadingChatFile && (
                    <p className="mt-1 text-[11px] text-violet-500 animate-pulse">
                      Uploading file…
                    </p>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* ── Projects panel ── */}
          {!showNewProject && activePanel === "project" && (
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="mx-auto max-w-3xl space-y-5">

                {/* Project settings */}
                {!activeProject ? (
                  <div
                    role="button"
                    tabIndex={-1}
                    onClick={() => setProjectListMenuId(null)}
                    onKeyDown={() => setProjectListMenuId(null)}
                    className="min-h-full"
                  >
                    {/* Header */}
                    <div className="mb-8 flex items-center justify-between">
                      <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
                      <button
                        type="button"
                        onClick={() => setShowNewProject(true)}
                        className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
                      >
                        <Plus className="h-4 w-4" /> New project
                      </button>
                    </div>

                    {/* Search */}
                    <div className="mb-6 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm focus-within:border-violet-300 transition-colors">
                      <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      <input
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Search projects..."
                        className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
                      />
                    </div>

                    {/* Grid */}
                    {loadingWorkspace ? (
                      <div className="flex items-center gap-2 py-8 text-sm text-gray-400 animate-pulse">
                        <div className="h-3 w-3 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
                        Loading projects…
                      </div>
                    ) : filteredProjectsList.length === 0 ? (
                      <div className="py-16 text-center">
                        <FolderOpen className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                        <p className="text-sm font-medium text-gray-500">
                          {projectSearch ? "No projects match your search" : "No projects yet"}
                        </p>
                        {!projectSearch && (
                          <button
                            type="button"
                            onClick={() => setShowNewProject(true)}
                            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-50 px-4 py-2 text-sm font-medium text-violet-600 hover:bg-violet-100 transition-colors"
                          >
                            <Plus className="h-4 w-4" /> New project
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        {filteredProjectsList.map((project) => (
                          <div
                            key={project.id}
                            className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 hover:border-gray-300 hover:shadow-sm transition-all"
                            onClick={() => {
                              setProjectListMenuId(null);
                              setProjectFilter(project.id);
                              navigateToPanel("chat");
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-semibold text-gray-900 leading-snug">{project.name}</h3>

                              {/* 3-dot context menu */}
                              <div className="relative flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setProjectListMenuId(
                                      projectListMenuId === project.id ? null : project.id,
                                    );
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                                {projectListMenuId === project.id && (
                                  <div className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleToggleFavorite(project);
                                        setProjectListMenuId(null);
                                      }}
                                      className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                      <Star className={`h-4 w-4 ${project.is_favorite ? "fill-amber-400 text-amber-400" : "text-gray-400"}`} />
                                      {project.is_favorite ? "Unfavorite" : "Favorite"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setProjectFilter(project.id);
                                        setProjectListMenuId(null);
                                      }}
                                      className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                      <Pencil className="h-4 w-4 text-gray-400" />
                                      Edit details
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void navigator.clipboard.writeText(window.location.origin + "/projects/" + project.id);
                                        toast.success("Link copied");
                                        setProjectListMenuId(null);
                                      }}
                                      className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                      <Link2 className="h-4 w-4 text-gray-400" />
                                      Copy link
                                    </button>
                                    <div className="my-1 h-px bg-gray-100" />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleDeleteProjectById(project);
                                        setProjectListMenuId(null);
                                      }}
                                      className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            {project.description ? (
                              <p className="mt-2 text-sm text-gray-500 line-clamp-2 leading-relaxed">
                                {project.description}
                              </p>
                            ) : (
                              <p className="mt-2 text-sm text-gray-300 italic">No description</p>
                            )}
                            <p className="mt-4 text-xs text-gray-400">
                              Last updated {formatRelativeDate(project.updated_at)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Back to projects */}
                    <button
                      type="button"
                      onClick={() => setProjectFilter(ALL_PROJECTS_FILTER)}
                      className="mb-2 flex items-center gap-1.5 text-sm text-gray-500 hover:text-violet-600 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" /> Back to projects
                    </button>

                    {/* Settings card */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <Settings className="h-4 w-4 text-gray-500" /> Project settings
                      </h2>
                      <form onSubmit={handleSaveProject} className="space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Name
                          </label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="rounded-xl border-gray-200 text-sm"
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Description
                          </label>
                          <Textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="No description"
                            className="min-h-[72px] rounded-xl border-gray-200 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Instructions for AI
                          </label>
                          <Textarea
                            value={editInstructions}
                            onChange={(e) => setEditInstructions(e.target.value)}
                            placeholder="Custom instructions…"
                            className="min-h-[100px] rounded-xl border-gray-200 text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-4 pt-1">
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                            <input
                              type="checkbox"
                              checked={editArchived}
                              onChange={(e) => setEditArchived(e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            Archived
                          </label>
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                            <input
                              type="checkbox"
                              checked={editFavorite}
                              onChange={(e) => setEditFavorite(e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            Favourite
                          </label>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            disabled={savingProject}
                            className="rounded-xl bg-violet-600 text-white hover:bg-violet-500 text-sm"
                          >
                            {savingProject ? "Saving…" : "Save changes"}
                          </Button>
                          {isProjectOwner && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void handleDeleteProject()}
                              disabled={!!deletingProjectId}
                              className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-sm"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {deletingProjectId ? "Deleting…" : "Delete"}
                            </Button>
                          )}
                        </div>
                      </form>
                    </div>

                    {/* Files card */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                          <FileText className="h-4 w-4 text-gray-500" /> Files
                        </h2>
                        <button
                          type="button"
                          onClick={() => projectFileInputRef.current?.click()}
                          disabled={uploadingProjectFile}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-600 hover:bg-violet-100 disabled:opacity-50 transition-colors"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {uploadingProjectFile ? "Uploading…" : "Upload"}
                        </button>
                        <input
                          ref={projectFileInputRef}
                          type="file"
                          className="hidden"
                          onChange={handleProjectFileSelected}
                        />
                      </div>
                      {loadingFiles ? (
                        <p className="animate-pulse text-sm text-gray-400">Loading files…</p>
                      ) : projectFiles.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center">
                          <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                          <p className="text-xs text-gray-400">No files uploaded yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {projectFiles.map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
                            >
                              <FileTypeIcon filename={file.filename} className="h-4 w-4 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-gray-800">{file.filename}</p>
                                <p className="text-xs text-gray-400">
                                  {formatBytes(file.file_size)} · {formatDate(file.created_at)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleDeleteFile(file.id)}
                                disabled={deletingFileId === file.id}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sharing card */}
                    {isProjectOwner && (
                      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                          <UserRound className="h-4 w-4 text-gray-500" /> Sharing
                        </h2>
                        <form onSubmit={handleAddShare} className="mb-4 flex gap-2">
                          <Input
                            type="email"
                            value={shareEmail}
                            onChange={(e) => setShareEmail(e.target.value)}
                            placeholder="teammate@example.com"
                            className="flex-1 rounded-xl border-gray-200 text-sm"
                            required
                          />
                          <select
                            value={sharePermission}
                            onChange={(e) =>
                              setSharePermission(e.target.value as SharePermission)
                            }
                            className="rounded-xl border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                          </select>
                          <Button
                            disabled={addingShare}
                            className="whitespace-nowrap rounded-xl bg-violet-600 text-white hover:bg-violet-500 text-sm"
                          >
                            {addingShare ? "Sending…" : "Invite"}
                          </Button>
                        </form>
                        {activeProject.shares && activeProject.shares.length > 0 && (
                          <div className="space-y-2">
                            {activeProject.shares.map((share) => (
                              <div
                                key={share.id}
                                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
                              >
                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
                                  {share.user_email?.[0]?.toUpperCase() ?? "?"}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm text-gray-800">
                                    {share.user_email}
                                  </p>
                                </div>
                                <select
                                  value={share.permission}
                                  onChange={(e) =>
                                    void handleUpdateSharePermission(
                                      share.id,
                                      e.target.value as SharePermission,
                                    )
                                  }
                                  disabled={updatingShareId === share.id}
                                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-300"
                                >
                                  <option value="viewer">Viewer</option>
                                  <option value="editor">Editor</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveShare(share.id)}
                                  disabled={removingShareId === share.id}
                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Files panel ── */}
          {!showNewProject && activePanel === "files" && (
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="mx-auto max-w-3xl">
                {!activeProject ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
                    <FolderOpen className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <p className="text-sm font-medium text-gray-500">
                      Select a project from the sidebar to view its files
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-gray-900">
                        {activeProject.name} — Files
                      </h2>
                      <button
                        type="button"
                        onClick={() => projectFileInputRef.current?.click()}
                        disabled={uploadingProjectFile}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-600 hover:bg-violet-100 disabled:opacity-50 transition-colors"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {uploadingProjectFile ? "Uploading…" : "Upload file"}
                      </button>
                      <input
                        ref={projectFileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleProjectFileSelected}
                      />
                    </div>
                    {loadingFiles ? (
                      <p className="animate-pulse text-sm text-gray-400">Loading…</p>
                    ) : projectFiles.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center">
                        <FileText className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                        <p className="text-sm text-gray-400">No files yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {projectFiles.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
                          >
                            <FileTypeIcon filename={file.filename} className="h-5 w-5 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-800">
                                {file.filename}
                              </p>
                              <p className="text-xs text-gray-400">
                                {formatBytes(file.file_size)} · {formatDate(file.created_at)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleDeleteFile(file.id)}
                              disabled={deletingFileId === file.id}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Invitations panel ── */}
          {!showNewProject && activePanel === "invitations" && (
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="mx-auto max-w-3xl space-y-4">
                {/* Accept by token */}
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Mail className="h-4 w-4 text-gray-500" /> Accept an invitation
                  </h2>
                  <form onSubmit={handleAcceptInvitationToken} className="flex gap-2">
                    <Input
                      value={manualInvitationToken}
                      onChange={(e) => setManualInvitationToken(e.target.value)}
                      placeholder="Paste invitation token…"
                      className="flex-1 rounded-xl border-gray-200 text-sm"
                      required
                    />
                    <Button
                      disabled={acceptingToken}
                      className="whitespace-nowrap rounded-xl bg-violet-600 text-white hover:bg-violet-500 text-sm"
                    >
                      {acceptingToken ? "Accepting…" : "Accept"}
                    </Button>
                  </form>
                </div>

                {/* Pending invitations */}
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-900">Pending invitations</h2>
                    <button
                      type="button"
                      onClick={() => void refreshInvitations()}
                      className="text-xs text-violet-600 hover:text-violet-800 transition-colors"
                    >
                      Refresh
                    </button>
                  </div>
                  {loadingInvitations ? (
                    <p className="animate-pulse text-sm text-gray-400">Loading…</p>
                  ) : invitations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
                      <Mail className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                      <p className="text-sm text-gray-400">No pending invitations</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {invitations.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
                        >
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
                            {inv.project?.name?.[0]?.toUpperCase() ?? "P"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-800">
                              {inv.project?.name ?? "Unknown project"}
                            </p>
                            <p className="text-xs text-gray-500">
                              Invited by {inv.invited_by ?? "someone"} · {inv.permission}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              setAcceptingToken(true);
                              try {
                                await backendApi.acceptInvitationByToken(inv.id);
                                await Promise.all([refreshProjects(), refreshInvitations()]);
                                toast.success("Invitation accepted.");
                              } catch (error) {
                                toast.error(getApiErrorMessage(error, "Failed to accept."));
                              } finally {
                                setAcceptingToken(false);
                              }
                            }}
                            disabled={acceptingToken}
                            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
                          >
                            Accept
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Click-away to close project menu */}
      {openProjectMenuId && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setOpenProjectMenuId(null)}
        />
      )}
    </div>
  );
}
