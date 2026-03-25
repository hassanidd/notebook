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
  Activity,
  Bot,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  LogOut,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  SendHorizontal,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X,
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
  const [projectsExpanded, setProjectsExpanded] = useState(true);

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

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const activeChatIdRef = useRef<string | null>(activeChatId);
  const projectFilterRef = useRef<string>(projectFilter);
  const sendingMessageRef = useRef<boolean>(sendingMessage);
  const userIdRef = useRef<string | null>(user?.id ?? null);

  const activePanel = panel;

  const navigateToPanel = useCallback(
    (p: WorkspacePanel) => { if (p !== activePanel) navigate(PANEL_PATHS[p]); },
    [activePanel, navigate],
  );

  const activeProject = useMemo(
    () => projectFilter === ALL_PROJECTS_FILTER ? null : projects.find((p) => p.id === projectFilter) ?? null,
    [projectFilter, projects],
  );

  const isProjectOwner = Boolean(activeProject && user && activeProject.owner_id === user.id);

  const filteredChats = useMemo(
    () => projectFilter === ALL_PROJECTS_FILTER ? chats : chats.filter((c) => c.project_id === projectFilter),
    [chats, projectFilter],
  );

  const refreshProjects = useCallback(async () => {
    const data = await backendApi.listProjects();
    setProjects(data);
  }, []);

  const refreshChats = useCallback(async () => {
    const data = await backendApi.listChats();
    setChats(sortChatsByActivity(data));
    if (data.length === 0) { setActiveChatId(null); setMessages([]); return; }
    if (activeChatId && data.some((c) => c.id === activeChatId)) return;
    setActiveChatId(data[0].id);
  }, [activeChatId]);
  const refreshChatsRef = useRef(refreshChats);

  const refreshInvitations = useCallback(async () => {
    setLoadingInvitations(true);
    try { setInvitations(await backendApi.listPendingInvitations()); }
    finally { setLoadingInvitations(false); }
  }, []);

  const refreshProjectFiles = useCallback(async (projectId: string) => {
    setLoadingFiles(true);
    try { setProjectFiles(await backendApi.listProjectFiles(projectId)); }
    finally { setLoadingFiles(false); }
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

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);
  useEffect(() => { projectFilterRef.current = projectFilter; }, [projectFilter]);
  useEffect(() => { sendingMessageRef.current = sendingMessage; }, [sendingMessage]);
  useEffect(() => { userIdRef.current = user?.id ?? null; }, [user?.id]);
  useEffect(() => { refreshChatsRef.current = refreshChats; }, [refreshChats]);

  useEffect(() => {
    if (!user?.id) return;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let closedByCleanup = false;

    function clearTimers() {
      if (reconnectTimer !== null) { window.clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (pingTimer !== null) { window.clearInterval(pingTimer); pingTimer = null; }
    }

    function connect() {
      let socketUrl: string;
      try { socketUrl = backendApi.getChatRealtimeSocketUrl(); } catch { return; }
      socket = new WebSocket(socketUrl);
      socket.onopen = () => {
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
        }, 25000);
      };
      socket.onmessage = (event) => {
        let payload: ChatRealtimeEvent;
        try { payload = JSON.parse(event.data) as ChatRealtimeEvent; } catch { return; }
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
          if (activeChatIdRef.current === payload.chat_id) { setActiveChatId(null); setMessages([]); }
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
            return [...next, { id: streamingId, chat_id: payload.chat_id, sender: null, role: "assistant", content: "", created_at: new Date().toISOString() }];
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
              copy.push({ id: streamingId, chat_id: payload.chat_id, sender: null, role: "assistant", content: payload.content, created_at: new Date().toISOString() });
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
            void backendApi.getChat(payload.chat_id).then((chat) => {
              if (activeChatIdRef.current === payload.chat_id) setMessages(chat.messages);
            }).catch(() => {});
          }
        }
      };
      socket.onclose = () => {
        clearTimers();
        if (!closedByCleanup) reconnectTimer = window.setTimeout(connect, 2000);
      };
      socket.onerror = () => { socket?.close(); };
    }

    connect();
    return () => { closedByCleanup = true; clearTimers(); socket?.close(); };
  }, [user?.id]);

  useEffect(() => {
    if (!activeChatId) { if (!sendingMessage) setMessages([]); return; }
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
    return () => { cancelled = true; };
  }, [activeChatId, sendingMessage]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!activeProject) {
      setEditName(""); setEditDescription(""); setEditInstructions(""); setEditArchived(false); setEditFavorite(false); setProjectFiles([]);
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
      const project = await backendApi.createProject({ name, description: projectDescriptionInput.trim() || undefined });
      setProjects((prev) => [project, ...prev]);
      setProjectFilter(project.id);
      navigateToPanel("project");
      setProjectNameInput(""); setProjectDescriptionInput(""); setShowNewProject(false);
      toast.success("Project created.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to create project."));
    } finally { setCreatingProject(false); }
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
    } finally { setSavingProject(false); }
  }

  async function handleDeleteProjectById(project: Project) {
    if (!window.confirm(`Delete "${project.name}"?`)) return;
    setDeletingProjectId(project.id);
    try {
      await backendApi.deleteProject(project.id);
      toast.success("Project deleted.");
      if (projectFilter === project.id) { setProjectFilter(ALL_PROJECTS_FILTER); navigateToPanel("chat"); }
      await Promise.all([refreshProjects(), refreshChats()]);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to delete project."));
    } finally { setDeletingProjectId(null); }
  }

  async function handleDeleteProject() {
    if (activeProject) await handleDeleteProjectById(activeProject);
  }

  async function handleDeleteChat(chat: ChatWithMessages) {
    if (sendingMessage) { toast.error("Wait for the current response to finish."); return; }
    if (!window.confirm(`Delete "${chat.title}"?`)) return;
    setDeletingChatId(chat.id);
    try {
      await backendApi.deleteChat(chat.id);
      if (activeChatId === chat.id) { setActiveChatId(null); setMessages([]); }
      await refreshChats();
      toast.success("Chat deleted.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to delete chat."));
    } finally { setDeletingChatId(null); }
  }

  async function handleAddShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProject) return;
    const email = shareEmail.trim();
    if (!email) return;
    setAddingShare(true);
    try {
      await backendApi.shareProject(activeProject.id, { user_email: email, permission: sharePermission });
      setShareEmail(""); setSharePermission("viewer");
      await refreshSingleProject(activeProject.id);
      toast.success("Invitation sent.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to share project."));
    } finally { setAddingShare(false); }
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
    } finally { setUpdatingShareId(null); }
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
    } finally { setRemovingShareId(null); }
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
    } finally { setAcceptingToken(false); }
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
    } finally { setUploadingProjectFile(false); }
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
    } finally { setUploadingChatFile(false); }
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
    } finally { setDeletingFileId(null); }
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
      sender: user ? { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name } : null,
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

    try {
      const newChatId = await backendApi.sendChatMessage(
        { chat_id: activeChatId ?? undefined, project_id: projectFilter !== ALL_PROJECTS_FILTER ? projectFilter : undefined, message: content },
        {
          onChatId: (id) => { if (!activeChatId) setActiveChatId(id); },
          onChunk: (chunk) => {
            setMessages((prev) => prev.map((m) => m.id === STREAMING_MESSAGE_ID ? { ...m, content: m.content + chunk } : m));
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
      setMessages((prev) => prev.filter((m) => m.id !== STREAMING_MESSAGE_ID && m.id !== tempUserMsg.id));
      toast.error(getApiErrorMessage(error, "Failed to send message."));
    } finally { setSendingMessage(false); }
  }

  function handleSignOut() {
    backendApi.signOut();
    navigate("/auth", { replace: true });
  }

  const navItems = [
    { key: "chat" as WorkspacePanel, label: "Chat", icon: MessageSquare },
    { key: "project" as WorkspacePanel, label: "Projects", icon: FolderOpen },
    { key: "files" as WorkspacePanel, label: "Files", icon: FileText },
    { key: "invitations" as WorkspacePanel, label: "Invitations", icon: Mail, badge: invitations.length || undefined },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ── Sidebar ── */}
      <aside className="flex w-64 flex-shrink-0 flex-col bg-gray-950 text-gray-100 border-r border-gray-800">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-gray-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-900/40">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">FMate</span>
        </div>

        {/* Nav */}
        <nav className="px-2 py-3 space-y-0.5">
          {navItems.map(({ key, label, icon: Icon, badge }) => {
            const active = activePanel === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => navigateToPanel(key)}
                className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors relative ${
                  active
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mx-2 my-1 h-px bg-gray-800" />

        {/* Projects section */}
        <div className="px-2 py-2">
          <button
            type="button"
            onClick={() => setProjectsExpanded((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:text-gray-300 transition-colors"
          >
            {projectsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Projects
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowNewProject(true); navigateToPanel("project"); }}
              className="ml-auto flex h-4 w-4 items-center justify-center rounded hover:bg-gray-700 hover:text-white"
            >
              <Plus className="h-3 w-3" />
            </button>
          </button>

          {projectsExpanded && (
            <div className="mt-1 space-y-0.5">
              <button
                type="button"
                onClick={() => setProjectFilter(ALL_PROJECTS_FILTER)}
                className={`w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  projectFilter === ALL_PROJECTS_FILTER
                    ? "bg-gray-800 text-gray-100"
                    : "text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                }`}
              >
                <Activity className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">All conversations</span>
              </button>

              {loadingWorkspace ? (
                <div className="px-3 py-1 text-xs text-gray-600">Loading...</div>
              ) : (
                projects.map((project) => (
                  <div key={project.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setProjectFilter(project.id)}
                      className={`flex-1 min-w-0 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                        projectFilter === project.id
                          ? "bg-gray-800 text-gray-100"
                          : "text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                      }`}
                    >
                      <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{project.name}</span>
                    </button>
                    {user?.id === project.owner_id && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteProjectById(project)}
                        disabled={deletingProjectId === project.id}
                        className="hidden group-hover:flex h-6 w-6 items-center justify-center rounded text-gray-600 hover:bg-gray-800 hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="mx-2 my-1 h-px bg-gray-800" />

        {/* Chats section */}
        <div className="flex min-h-0 flex-1 flex-col px-2 py-2">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase flex-1">Chats</span>
            <button
              type="button"
              onClick={handleStartNewChat}
              className="flex h-4 w-4 items-center justify-center rounded hover:bg-gray-700 hover:text-white text-gray-500 transition-colors"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
            {loadingWorkspace ? (
              <div className="px-3 py-1 text-xs text-gray-600">Loading...</div>
            ) : filteredChats.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-600">No chats yet.</div>
            ) : (
              filteredChats.map((chat) => (
                <div key={chat.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setActiveChatId(chat.id); navigateToPanel("chat"); }}
                    className={`flex-1 min-w-0 flex flex-col rounded-md px-3 py-1.5 text-left transition-colors ${
                      activeChatId === chat.id
                        ? "bg-gray-800 text-gray-100"
                        : "text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                    }`}
                  >
                    <span className="truncate text-sm leading-tight">{chat.title}</span>
                    <span className="text-[11px] text-gray-600 mt-0.5">{formatDate(chat.last_message_at)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteChat(chat)}
                    disabled={deletingChatId === chat.id || sendingMessage}
                    className="hidden group-hover:flex h-6 w-6 items-center justify-center rounded text-gray-600 hover:bg-gray-800 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* User */}
        <div className="border-t border-gray-800 px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
              {user ? (user.first_name[0] ?? "U").toUpperCase() : "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-200">
                {user ? `${user.first_name} ${user.last_name}` : "User"}
              </p>
              <p className="truncate text-xs text-gray-500">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-800 hover:text-gray-200 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-4 border-b border-gray-200 bg-white px-6 py-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-gray-900 truncate">
              {activePanel === "chat" && (activeChatId ? (chats.find((c) => c.id === activeChatId)?.title ?? "Chat") : "New conversation")}
              {activePanel === "project" && (activeProject ? activeProject.name : "Projects")}
              {activePanel === "files" && "Files"}
              {activePanel === "invitations" && "Invitations"}
            </h1>
            <p className="text-xs text-gray-500">
              {activeProject ? `Project: ${activeProject.name}` : "All projects"}
            </p>
          </div>
          {activePanel === "chat" && (
            <Button
              size="sm"
              onClick={handleStartNewChat}
              className="gap-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              New chat
            </Button>
          )}
        </header>

        {/* ── Chat panel ── */}
        {activePanel === "chat" && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Messages */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {messages.length === 0 ? (
                loadingChat ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-sm text-gray-400 animate-pulse">Loading conversation...</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100">
                      <Bot className="h-8 w-8 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-gray-700">Start a conversation</p>
                      <p className="text-sm text-gray-400 mt-1">
                        {activeProject ? `Chatting in project "${activeProject.name}"` : "Ask anything about your projects and files."}
                      </p>
                    </div>
                  </div>
                )
              ) : (
                <div className="mx-auto max-w-3xl space-y-6">
                  {messages.map((message) => {
                    const isAssistant = message.role === "assistant";
                    const isStreamingPlaceholder = isAssistant && !message.content && (message.id === STREAMING_MESSAGE_ID || message.id.startsWith(REALTIME_STREAMING_MESSAGE_PREFIX));
                    const isCurrentUser = message.role === "user" && (message.id.startsWith("local-user-") || (user?.id !== undefined && user?.id !== null && message.sender?.id === user.id));
                    const isOtherUser = message.role === "user" && !isCurrentUser;

                    let senderName = "Assistant";
                    if (isCurrentUser) senderName = "You";
                    else if (isOtherUser) {
                      const full = [message.sender?.first_name, message.sender?.last_name].filter(Boolean).join(" ").trim();
                      senderName = full || message.sender?.email || "Teammate";
                    }

                    if (isAssistant) {
                      return (
                        <div key={message.id} className="flex gap-3">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 border border-indigo-200">
                            <Bot className="h-4 w-4 text-indigo-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="mb-1.5 text-xs font-medium text-gray-400">{senderName}</p>
                            <div className="rounded-2xl rounded-tl-sm bg-white border border-gray-200 px-4 py-3 text-sm leading-relaxed text-gray-800 shadow-sm">
                              {isStreamingPlaceholder ? (
                                <div className="flex gap-1 items-center h-5">
                                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
                                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
                                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
                                </div>
                              ) : (
                                <p className="whitespace-pre-wrap">{message.content || "..."}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={message.id} className={`flex gap-3 ${isCurrentUser ? "flex-row-reverse" : ""}`}>
                        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${isCurrentUser ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-600"}`}>
                          {senderName[0]?.toUpperCase()}
                        </div>
                        <div className={`max-w-[70%] min-w-0 ${isCurrentUser ? "items-end" : "items-start"} flex flex-col`}>
                          <p className={`mb-1.5 text-xs font-medium text-gray-400 ${isCurrentUser ? "text-right" : ""}`}>{senderName}</p>
                          <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${isCurrentUser ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-gray-100 text-gray-800 border border-gray-200 rounded-tl-sm"}`}>
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                          <p className="mt-1 text-[11px] text-gray-400">{formatDate(message.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                  {loadingChat && (
                    <p className="text-center text-xs text-gray-400 animate-pulse">Syncing...</p>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 bg-white px-6 py-4">
              <form onSubmit={handleSendMessage} className="mx-auto max-w-3xl">
                <div className="flex items-end gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 focus-within:border-indigo-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-50 transition-all">
                  <div className="flex-1">
                    <Textarea
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
                      placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
                      className="min-h-[44px] max-h-48 resize-none border-0 bg-transparent p-0 text-sm text-gray-800 placeholder:text-gray-400 focus-visible:ring-0 shadow-none"
                      rows={1}
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-0.5">
                    <button
                      type="button"
                      onClick={() => chatFileInputRef.current?.click()}
                      disabled={!activeChatId || uploadingChatFile}
                      title="Attach file"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-40 transition-colors"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <input ref={chatFileInputRef} type="file" className="hidden" onChange={handleChatFileSelected} />
                    <button
                      type="submit"
                      disabled={sendingMessage || loadingWorkspace || !messageInput.trim()}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <SendHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {uploadingChatFile && (
                  <p className="mt-2 text-xs text-indigo-500 animate-pulse">Uploading file...</p>
                )}
              </form>
            </div>
          </div>
        )}

        {/* ── Projects panel ── */}
        {activePanel === "project" && (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto max-w-3xl space-y-6">
              {/* New project form */}
              {(showNewProject || projects.length === 0) && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <Plus className="h-4 w-4 text-indigo-600" />
                      New project
                    </h2>
                    {projects.length > 0 && (
                      <button type="button" onClick={() => setShowNewProject(false)} className="text-gray-400 hover:text-gray-700">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <form onSubmit={handleCreateProject} className="space-y-3">
                    <Input
                      value={projectNameInput}
                      onChange={(e) => setProjectNameInput(e.target.value)}
                      placeholder="Project name"
                      className="rounded-xl border-gray-200 bg-gray-50 focus:bg-white text-sm"
                      required
                    />
                    <Textarea
                      value={projectDescriptionInput}
                      onChange={(e) => setProjectDescriptionInput(e.target.value)}
                      placeholder="Description (optional)"
                      className="rounded-xl border-gray-200 bg-gray-50 focus:bg-white text-sm min-h-[72px]"
                    />
                    <Button disabled={creatingProject} className="w-full rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 text-sm">
                      {creatingProject ? "Creating..." : "Create project"}
                    </Button>
                  </form>
                </div>
              )}

              {/* Project settings */}
              {!activeProject ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
                  <FolderOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-500">Select a project from the sidebar to edit it</p>
                  {!showNewProject && (
                    <button
                      type="button"
                      onClick={() => setShowNewProject(true)}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
                    >
                      <Plus className="h-4 w-4" /> New project
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Settings card */}
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Settings className="h-4 w-4 text-gray-500" /> Project settings
                    </h2>
                    <form onSubmit={handleSaveProject} className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Name</label>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-xl border-gray-200 text-sm" required />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
                        <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="No description" className="rounded-xl border-gray-200 text-sm min-h-[72px]" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Instructions for AI</label>
                        <Textarea value={editInstructions} onChange={(e) => setEditInstructions(e.target.value)} placeholder="Custom instructions..." className="rounded-xl border-gray-200 text-sm min-h-[100px]" />
                      </div>
                      <div className="flex items-center gap-4 pt-1">
                        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                          <input type="checkbox" checked={editArchived} onChange={(e) => setEditArchived(e.target.checked)} className="rounded border-gray-300" />
                          Archived
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                          <input type="checkbox" checked={editFavorite} onChange={(e) => setEditFavorite(e.target.checked)} className="rounded border-gray-300" />
                          Favorite
                        </label>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button disabled={savingProject} className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 text-sm">
                          {savingProject ? "Saving..." : "Save changes"}
                        </Button>
                        {isProjectOwner && (
                          <Button type="button" variant="outline" onClick={() => void handleDeleteProject()} disabled={!!deletingProjectId} className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-sm">
                            <Trash2 className="h-3.5 w-3.5" />
                            {deletingProjectId ? "Deleting..." : "Delete"}
                          </Button>
                        )}
                      </div>
                    </form>
                  </div>

                  {/* Files card */}
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-500" /> Files
                      </h2>
                      <button
                        type="button"
                        onClick={() => projectFileInputRef.current?.click()}
                        disabled={uploadingProjectFile}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {uploadingProjectFile ? "Uploading..." : "Upload"}
                      </button>
                      <input ref={projectFileInputRef} type="file" className="hidden" onChange={handleProjectFileSelected} />
                    </div>
                    {loadingFiles ? (
                      <p className="text-sm text-gray-400 animate-pulse">Loading files...</p>
                    ) : projectFiles.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center">
                        <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-xs text-gray-400">No files uploaded yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {projectFiles.map((file) => (
                          <div key={file.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-gray-800">{file.filename}</p>
                              <p className="text-xs text-gray-400">{formatBytes(file.file_size)} · {formatDate(file.created_at)}</p>
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
                      <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-gray-500" /> Sharing
                      </h2>
                      <form onSubmit={handleAddShare} className="flex gap-2 mb-4">
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
                          onChange={(e) => setSharePermission(e.target.value as SharePermission)}
                          className="rounded-xl border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                        <Button disabled={addingShare} className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 text-sm whitespace-nowrap">
                          {addingShare ? "Sending..." : "Invite"}
                        </Button>
                      </form>
                      {activeProject.shares && activeProject.shares.length > 0 && (
                        <div className="space-y-2">
                          {activeProject.shares.map((share) => (
                            <div key={share.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
                                {share.user_email?.[0]?.toUpperCase() ?? "?"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-gray-800">{share.user_email}</p>
                              </div>
                              <select
                                value={share.permission}
                                onChange={(e) => void handleUpdateSharePermission(share.id, e.target.value as SharePermission)}
                                disabled={updatingShareId === share.id}
                                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300"
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
        {activePanel === "files" && (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto max-w-3xl">
              {!activeProject ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
                  <FolderOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-500">Select a project from the sidebar to view its files</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-900">{activeProject.name} — Files</h2>
                    <button
                      type="button"
                      onClick={() => projectFileInputRef.current?.click()}
                      disabled={uploadingProjectFile}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingProjectFile ? "Uploading..." : "Upload file"}
                    </button>
                    <input ref={projectFileInputRef} type="file" className="hidden" onChange={handleProjectFileSelected} />
                  </div>
                  {loadingFiles ? (
                    <p className="text-sm text-gray-400 animate-pulse">Loading...</p>
                  ) : projectFiles.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center">
                      <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-400">No files yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {projectFiles.map((file) => (
                        <div key={file.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                          <FileText className="h-5 w-5 flex-shrink-0 text-indigo-400" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-800">{file.filename}</p>
                            <p className="text-xs text-gray-400">{formatBytes(file.file_size)} · {formatDate(file.created_at)}</p>
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
        {activePanel === "invitations" && (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto max-w-3xl space-y-4">
              {/* Accept by token */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-500" /> Accept an invitation
                </h2>
                <form onSubmit={handleAcceptInvitationToken} className="flex gap-2">
                  <Input
                    value={manualInvitationToken}
                    onChange={(e) => setManualInvitationToken(e.target.value)}
                    placeholder="Paste invitation token..."
                    className="flex-1 rounded-xl border-gray-200 text-sm"
                    required
                  />
                  <Button disabled={acceptingToken} className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 text-sm whitespace-nowrap">
                    {acceptingToken ? "Accepting..." : "Accept"}
                  </Button>
                </form>
              </div>

              {/* Pending invitations */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-900">Pending invitations</h2>
                  <button
                    type="button"
                    onClick={() => void refreshInvitations()}
                    className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    Refresh
                  </button>
                </div>
                {loadingInvitations ? (
                  <p className="text-sm text-gray-400 animate-pulse">Loading...</p>
                ) : invitations.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
                    <Mail className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No pending invitations</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {invitations.map((inv) => (
                      <div key={inv.id} className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                          {inv.project?.name?.[0]?.toUpperCase() ?? "P"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800">{inv.project?.name ?? "Unknown project"}</p>
                          <p className="text-xs text-gray-500">Invited by {inv.invited_by ?? "someone"} · {inv.permission}</p>
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
                            } finally { setAcceptingToken(false); }
                          }}
                          disabled={acceptingToken}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
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
  );
}
