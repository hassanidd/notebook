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
  FileText,
  FolderOpen,
  LogOut,
  Mail,
  MessageSquare,
  Plus,
  SendHorizontal,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
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
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return bytes + " B";
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return kb.toFixed(1) + " KB";
  }

  const mb = kb / 1024;
  return mb.toFixed(1) + " MB";
}

function panelClass(active: boolean): string {
  return active
    ? "inline-flex items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-[0_10px_22px_rgba(37,99,235,0.32)]"
    : "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 hover:shadow-sm";
}

function panelTitle(panel: WorkspacePanel): string {
  if (panel === "chat") {
    return "Chat";
  }
  if (panel === "project") {
    return "Projects";
  }
  if (panel === "files") {
    return "Files";
  }
  return "Invitations";
}

type WorkspacePageProps = {
  panel: WorkspacePanel;
};

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
  const [sharePermission, setSharePermission] =
    useState<SharePermission>("viewer");

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
    (panel: WorkspacePanel) => {
      if (panel === activePanel) {
        return;
      }
      navigate(PANEL_PATHS[panel]);
    },
    [activePanel, navigate],
  );

  const activeProject = useMemo(() => {
    if (projectFilter === ALL_PROJECTS_FILTER) {
      return null;
    }

    return projects.find((project) => project.id === projectFilter) ?? null;
  }, [projectFilter, projects]);

  const isProjectOwner = Boolean(
    activeProject && user && activeProject.owner_id === user.id,
  );

  const filteredChats = useMemo(() => {
    if (projectFilter === ALL_PROJECTS_FILTER) {
      return chats;
    }

    return chats.filter((chat) => chat.project_id === projectFilter);
  }, [chats, projectFilter]);

  const workspaceHighlights = useMemo(
    () => [
      {
        label: "Projects",
        value: projects.length,
        icon: FolderOpen,
      },
      {
        label: "Chats",
        value: chats.length,
        icon: MessageSquare,
      },
      {
        label: "Invites",
        value: invitations.length,
        icon: Mail,
      },
    ],
    [chats.length, invitations.length, projects.length],
  );

  const refreshProjects = useCallback(async () => {
    const projectData = await backendApi.listProjects();
    setProjects(projectData);
  }, []);

  const refreshChats = useCallback(async () => {
    const chatData = await backendApi.listChats();
    setChats(sortChatsByActivity(chatData));

    if (chatData.length === 0) {
      setActiveChatId(null);
      setMessages([]);
      return;
    }

    if (activeChatId && chatData.some((chat) => chat.id === activeChatId)) {
      return;
    }

    setActiveChatId(chatData[0].id);
  }, [activeChatId]);
  const refreshChatsRef = useRef(refreshChats);

  const refreshInvitations = useCallback(async () => {
    setLoadingInvitations(true);
    try {
      const invitationData = await backendApi.listPendingInvitations();
      setInvitations(invitationData);
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

  const refreshProjectFiles = useCallback(async (projectId: string) => {
    setLoadingFiles(true);
    try {
      const files = await backendApi.listProjectFiles(projectId);
      setProjectFiles(files);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const refreshSingleProject = useCallback(async (projectId: string) => {
    const freshProject = await backendApi.getProject(projectId);
    setProjects((previous) =>
      previous.map((project) =>
        project.id === freshProject.id ? freshProject : project,
      ),
    );
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

      if (chatData.length > 0) {
        setActiveChatId(chatData[0].id);
      }
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
    if (!user?.id) {
      return;
    }

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
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send("ping");
          }
        }, 25000);
      };

      socket.onmessage = (event) => {
        let payload: ChatRealtimeEvent;
        try {
          payload = JSON.parse(event.data) as ChatRealtimeEvent;
        } catch {
          return;
        }

        if (payload.type === "pong" || payload.type === "ws_connected") {
          return;
        }

        if (payload.type === "chat_created") {
          if (payload.actor_user_id === userIdRef.current) {
            return;
          }

          const currentProjectFilter = projectFilterRef.current;
          if (
            currentProjectFilter !== ALL_PROJECTS_FILTER &&
            payload.chat.project_id !== currentProjectFilter
          ) {
            return;
          }

          void refreshChatsRef.current();
          return;
        }

        if (payload.type === "chat_deleted") {
          setChats((previous) =>
            previous.filter((chat) => chat.id !== payload.chat_id),
          );

          if (activeChatIdRef.current === payload.chat_id) {
            setActiveChatId(null);
            setMessages([]);
          }
          return;
        }

        if (payload.type === "message_created") {
          if (payload.actor_user_id && payload.actor_user_id === userIdRef.current) {
            return;
          }

          void refreshChatsRef.current();

          if (activeChatIdRef.current !== payload.chat_id) {
            return;
          }

          const streamingId =
            REALTIME_STREAMING_MESSAGE_PREFIX + "-" + payload.chat_id;
          setMessages((previous) => {
            if (previous.some((message) => message.id === payload.message.id)) {
              return previous;
            }
            const withoutStreaming = previous.filter(
              (message) => message.id !== streamingId,
            );
            const nextMessages = [...withoutStreaming, payload.message];

            if (payload.message.role !== "user") {
              return nextMessages;
            }

            return [
              ...nextMessages,
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
          if (payload.actor_user_id && payload.actor_user_id === userIdRef.current) {
            return;
          }
          if (activeChatIdRef.current !== payload.chat_id) {
            return;
          }

          const streamingId =
            REALTIME_STREAMING_MESSAGE_PREFIX + "-" + payload.chat_id;
          setMessages((previous) => {
            const copy = [...previous];
            const index = copy.findIndex((message) => message.id === streamingId);

            if (index === -1) {
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

            copy[index] = {
              ...copy[index],
              content: copy[index].content + payload.content,
            };
            return copy;
          });
          return;
        }

        if (payload.type === "assistant_done") {
          if (payload.actor_user_id && payload.actor_user_id === userIdRef.current) {
            return;
          }

          void refreshChatsRef.current();

          if (
            activeChatIdRef.current === payload.chat_id &&
            !sendingMessageRef.current
          ) {
            void backendApi
              .getChat(payload.chat_id)
              .then((chat) => {
                if (activeChatIdRef.current === payload.chat_id) {
                  setMessages(chat.messages);
                }
              })
              .catch(() => {});
          }
        }
      };

      socket.onclose = () => {
        clearTimers();
        if (closedByCleanup) {
          return;
        }
        reconnectTimer = window.setTimeout(() => {
          connect();
        }, 2000);
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
      if (!sendingMessage) {
        setMessages([]);
      }
      return;
    }

    if (sendingMessage) {
      return;
    }

    const chatId = activeChatId;

    let cancelled = false;

    async function loadActiveChat() {
      setLoadingChat(true);

      try {
        const chat = await backendApi.getChat(chatId);
        if (!cancelled) {
          setMessages(chat.messages);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(getApiErrorMessage(error, "Failed to load chat."));
        }
      } finally {
        if (!cancelled) {
          setLoadingChat(false);
        }
      }
    }

    void loadActiveChat();

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
    if (!name) {
      return;
    }

    setCreatingProject(true);
    try {
      const project = await backendApi.createProject({
        name,
        description: projectDescriptionInput.trim() || undefined,
      });

      setProjects((previous) => [project, ...previous]);
      setProjectFilter(project.id);
      navigateToPanel("project");
      setProjectNameInput("");
      setProjectDescriptionInput("");
      toast.success("Project created.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to create project."));
    } finally {
      setCreatingProject(false);
    }
  }

  async function handleSaveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeProject) {
      return;
    }

    setSavingProject(true);
    try {
      const updated = await backendApi.updateProject(activeProject.id, {
        name: editName.trim(),
        description: editDescription.trim() === "" ? null : editDescription.trim(),
        instructions: editInstructions.trim() === "" ? null : editInstructions.trim(),
        is_archived: editArchived,
        is_favorite: editFavorite,
      });

      setProjects((previous) =>
        previous.map((project) =>
          project.id === updated.id ? updated : project,
        ),
      );
      toast.success("Project saved.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to save project."));
    } finally {
      setSavingProject(false);
    }
  }

  async function handleDeleteProjectById(project: Project) {
    const shouldDelete = window.confirm("Delete project '" + project.name + "'?");
    if (!shouldDelete) {
      return;
    }

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
    if (!activeProject) {
      return;
    }

    await handleDeleteProjectById(activeProject);
  }

  async function handleDeleteChat(chat: ChatWithMessages) {
    if (sendingMessage) {
      toast.error("Wait for the current response to finish before deleting a chat.");
      return;
    }

    const shouldDelete = window.confirm("Delete chat '" + chat.title + "'?");
    if (!shouldDelete) {
      return;
    }

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

    if (!activeProject) {
      return;
    }

    const email = shareEmail.trim();
    if (!email) {
      return;
    }

    setAddingShare(true);
    try {
      await backendApi.shareProject(activeProject.id, {
        user_email: email,
        permission: sharePermission,
      });
      setShareEmail("");
      setSharePermission("viewer");
      await refreshSingleProject(activeProject.id);
      toast.success("Share invitation sent.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to share project."));
    } finally {
      setAddingShare(false);
    }
  }

  async function handleUpdateSharePermission(
    shareId: string,
    permission: SharePermission,
  ) {
    if (!activeProject) {
      return;
    }

    setUpdatingShareId(shareId);
    try {
      await backendApi.updateProjectSharePermission(
        activeProject.id,
        shareId,
        permission,
      );
      await refreshSingleProject(activeProject.id);
      toast.success("Permission updated.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update permission."));
    } finally {
      setUpdatingShareId(null);
    }
  }

  async function handleRemoveShare(shareId: string) {
    if (!activeProject) {
      return;
    }

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
    if (!token) {
      return;
    }

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
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !activeProject) {
      return;
    }

    setUploadingProjectFile(true);
    try {
      const uploaded = await backendApi.uploadProjectFile(activeProject.id, file);
      toast.success("Uploaded " + uploaded.filename + ".");
      await refreshProjectFiles(activeProject.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to upload file."));
    } finally {
      setUploadingProjectFile(false);
    }
  }

  async function handleChatFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !activeChatId) {
      return;
    }

    setUploadingChatFile(true);
    try {
      const uploaded = await backendApi.uploadChatFile(activeChatId, file);
      await backendApi.confirmFileUpload(uploaded.id);
      toast.success("Chat file uploaded and queued.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to upload chat file."));
    } finally {
      setUploadingChatFile(false);
    }
  }

  async function handleConfirmFile(fileId: string) {
    setConfirmingFileId(fileId);
    try {
      await backendApi.confirmFileUpload(fileId);
      if (activeProject) {
        await refreshProjectFiles(activeProject.id);
      }
      toast.success("File processing started.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to confirm file."));
    } finally {
      setConfirmingFileId(null);
    }
  }

  async function handleDeleteFile(fileId: string) {
    setDeletingFileId(fileId);
    try {
      await backendApi.deleteFile(fileId);
      if (activeProject) {
        await refreshProjectFiles(activeProject.id);
      }
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
    if (!content || sendingMessage) {
      return;
    }

    setSendingMessage(true);
    setMessageInput("");

    const userMessage: ChatMessage = {
      id: "local-user-" + Date.now(),
      chat_id: activeChatId ?? "pending-chat",
      sender: null,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };

    const assistantMessage: ChatMessage = {
      id: STREAMING_MESSAGE_ID,
      chat_id: activeChatId ?? "pending-chat",
      sender: null,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
    };

    setMessages((previous) => [...previous, userMessage, assistantMessage]);

    let resolvedChatId = activeChatId;

    try {
      const nextChatId = await backendApi.sendChatMessage(
        {
          message: content,
          chat_id: activeChatId ?? undefined,
          project_id:
            projectFilter === ALL_PROJECTS_FILTER ? undefined : projectFilter,
        },
        {
          onChatId: (chatId) => {
            resolvedChatId = chatId;
            setActiveChatId(chatId);
          },
          onChunk: (chunk) => {
            setMessages((previous) => {
              const copy = [...previous];
              const index = copy.findIndex(
                (message) => message.id === STREAMING_MESSAGE_ID,
              );

              if (index === -1) {
                copy.push({
                  id: STREAMING_MESSAGE_ID,
                  chat_id: resolvedChatId ?? "pending-chat",
                  sender: null,
                  role: "assistant",
                  content: chunk,
                  created_at: new Date().toISOString(),
                });
                return copy;
              }

              copy[index] = {
                ...copy[index],
                content: copy[index].content + chunk,
              };

              return copy;
            });
          },
        },
      );

      if (nextChatId) {
        resolvedChatId = nextChatId;
      }

      await refreshChats();

      if (resolvedChatId) {
        const chat = await backendApi.getChat(resolvedChatId);
        setMessages(chat.messages);
      }
    } catch (error) {
      setMessages((previous) =>
        previous.filter((message) => message.id !== STREAMING_MESSAGE_ID),
      );
      toast.error(getApiErrorMessage(error, "Failed to send message."));
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleSignOut() {
    await backendApi.logout();
    navigate("/auth", { replace: true });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,transparent_38%),radial-gradient(circle_at_85%_2%,#fde68a_0%,transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(51,65,85,0.06)_1px,transparent_1px)] bg-[size:16px_16px] opacity-35" />
      <div className="pointer-events-none absolute -top-28 -left-20 h-72 w-72 rounded-full bg-blue-200/35 blur-3xl animate-[drift_17s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute right-[-90px] bottom-[-90px] h-80 w-80 rounded-full bg-amber-200/35 blur-3xl animate-[drift_20s_ease-in-out_infinite]" />

      <div className="relative mx-auto flex w-full max-w-[1500px] flex-col gap-4">
        <nav className="sticky top-2 z-40 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_16px_34px_rgba(15,23,42,0.12)] backdrop-blur-xl animate-[riseIn_400ms_ease-out] sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-3 py-1.5 shadow-sm">
              <Sparkles className="h-4 w-4 text-amber-200" />
              <div>
                <p className="text-[10px] font-semibold tracking-[0.16em] text-blue-200 uppercase">
                  FMate
                </p>
                <p className="text-sm font-semibold text-white">
                  {panelTitle(activePanel)}
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              <button
                type="button"
                className={panelClass(activePanel === "chat")}
                onClick={() => navigateToPanel("chat")}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Chat
              </button>
              <button
                type="button"
                className={panelClass(activePanel === "project")}
                onClick={() => navigateToPanel("project")}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Projects
              </button>
              <button
                type="button"
                className={panelClass(activePanel === "files")}
                onClick={() => navigateToPanel("files")}
              >
                <FileText className="h-3.5 w-3.5" />
                Files
              </button>
              <button
                type="button"
                className={panelClass(activePanel === "invitations")}
                onClick={() => navigateToPanel("invitations")}
              >
                <Mail className="h-3.5 w-3.5" />
                Invitations
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
                <UserRound className="h-4 w-4 text-slate-500" />
                {user ? user.first_name + " " + user.last_name : "User"}
              </div>
              <Button
                variant="outline"
                onClick={handleSignOut}
                className="rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            <button
              type="button"
              className={panelClass(activePanel === "chat")}
              onClick={() => navigateToPanel("chat")}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </button>
            <button
              type="button"
              className={panelClass(activePanel === "project")}
              onClick={() => navigateToPanel("project")}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Projects
            </button>
            <button
              type="button"
              className={panelClass(activePanel === "files")}
              onClick={() => navigateToPanel("files")}
            >
              <FileText className="h-3.5 w-3.5" />
              Files
            </button>
            <button
              type="button"
              className={panelClass(activePanel === "invitations")}
              onClick={() => navigateToPanel("invitations")}
            >
              <Mail className="h-3.5 w-3.5" />
              Invitations
            </button>
          </div>
        </nav>

        <header className="rounded-[28px] border border-blue-900/25 bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_65%,#0f172a_100%)] px-5 py-5 shadow-[0_20px_50px_rgba(30,58,138,0.35)] backdrop-blur-xl sm:px-6 animate-[riseIn_500ms_ease-out]">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.22em] text-blue-200 uppercase">
              <Sparkles className="h-3.5 w-3.5 text-amber-200" />
              FMate Workspace
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white sm:text-3xl [font-family:'Iowan_Old_Style','Palatino_Linotype','Book_Antiqua',Palatino,serif]">
              {activeProject ? activeProject.name : "All Projects"}
            </h1>
            <p className="text-xs text-blue-100 sm:text-sm">
              {activeProject
                ? "Project context active"
                : "Global context active"}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {workspaceHighlights.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-200/25 bg-white/12 px-3 py-1.5 text-xs text-blue-50 shadow-sm backdrop-blur"
                  >
                    <Icon className="h-3.5 w-3.5 text-amber-200" />
                    <span className="font-semibold text-white">{item.value}</span>
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </header>

        <section className="grid min-h-[78vh] gap-4 lg:grid-cols-[368px_1fr]">
          <aside className="flex flex-col gap-4 rounded-[28px] border border-slate-900/80 bg-slate-900/95 p-4 text-slate-100 shadow-[0_16px_36px_rgba(15,23,42,0.24)] backdrop-blur-xl animate-[riseIn_650ms_ease-out] lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)]">
            <nav className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-sm">
              <p className="text-xs font-semibold tracking-[0.14em] text-slate-300 uppercase">
                Navigation
              </p>
              <div className="grid gap-2">
                <button
                  type="button"
                  className={panelClass(activePanel === "chat")}
                  onClick={() => navigateToPanel("chat")}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Chat
                </button>
                <button
                  type="button"
                  className={panelClass(activePanel === "project")}
                  onClick={() => navigateToPanel("project")}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Projects
                </button>
                <button
                  type="button"
                  className={panelClass(activePanel === "files")}
                  onClick={() => navigateToPanel("files")}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Files
                </button>
                <button
                  type="button"
                  className={panelClass(activePanel === "invitations")}
                  onClick={() => navigateToPanel("invitations")}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Invitations
                </button>
              </div>
            </nav>

            <form
              onSubmit={handleCreateProject}
              className="space-y-3 rounded-2xl border border-white/10 bg-slate-800/70 p-4 shadow-sm"
            >
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Sparkles className="h-4 w-4 text-blue-300" />
                Create project
              </p>
              <Input
                value={projectNameInput}
                onChange={(event) => setProjectNameInput(event.target.value)}
                placeholder="Project name"
                className="rounded-xl border-slate-600 bg-slate-900/80 text-slate-100 placeholder:text-slate-400"
                required
              />
              <Textarea
                value={projectDescriptionInput}
                onChange={(event) => setProjectDescriptionInput(event.target.value)}
                placeholder="Description (optional)"
                className="min-h-18 rounded-xl border-slate-600 bg-slate-900/80 text-slate-100 placeholder:text-slate-400"
              />
              <Button
                className="w-full rounded-xl bg-blue-600 text-white hover:bg-blue-500"
                disabled={creatingProject}
              >
                <Plus className="h-4 w-4" />
                {creatingProject ? "Creating..." : "Add Project"}
              </Button>
            </form>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-100">Project filter</p>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setProjectFilter(ALL_PROJECTS_FILTER)}
                  className={
                    projectFilter === ALL_PROJECTS_FILTER
                      ? "rounded-xl border border-blue-500 bg-blue-600 px-3 py-2 text-left text-sm font-medium text-white shadow-sm"
                      : "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-left text-sm text-slate-100 transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-sm"
                  }
                >
                  All conversations
                </button>
                {projects.map((project) => {
                  const canDeleteProject = user?.id === project.owner_id;
                  const isDeletingProject = deletingProjectId === project.id;

                  return (
                    <div key={project.id} className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => setProjectFilter(project.id)}
                        className={
                          projectFilter === project.id
                            ? "min-w-0 flex-1 rounded-xl border border-blue-500 bg-blue-600 px-3 py-2 text-left shadow-sm"
                            : "min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-sm"
                        }
                      >
                        <p
                          className={
                            projectFilter === project.id
                              ? "truncate text-sm font-medium text-white"
                              : "truncate text-sm font-medium text-slate-100"
                          }
                        >
                          {project.name}
                        </p>
                        <p
                          className={
                            projectFilter === project.id
                              ? "mt-1 text-xs text-blue-100"
                              : "mt-1 text-xs text-slate-300"
                          }
                        >
                          {project.description || "No description"}
                        </p>
                      </button>

                      {canDeleteProject && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-xl border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
                          disabled={isDeletingProject}
                          onClick={() => void handleDeleteProjectById(project)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {isDeletingProject ? "..." : "Remove"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex items-center justify-between">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <Activity className="h-4 w-4 text-blue-300" />
                  Chats
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
                  onClick={handleStartNewChat}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New
                </Button>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {loadingWorkspace ? (
                  <p className="text-sm text-slate-300">Loading workspace...</p>
                ) : filteredChats.length === 0 ? (
                  <p className="text-sm text-slate-300">No chats yet.</p>
                ) : (
                  filteredChats.map((chat) => (
                    <div key={chat.id} className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveChatId(chat.id);
                          navigateToPanel("chat");
                        }}
                        className={
                          activeChatId === chat.id
                            ? "min-w-0 flex-1 rounded-xl border border-blue-500 bg-blue-600 px-3 py-2 text-left shadow-sm"
                            : "min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-sm"
                        }
                      >
                        <p
                          className={
                            activeChatId === chat.id
                              ? "truncate text-sm font-medium text-white"
                              : "truncate text-sm font-medium text-slate-100"
                          }
                        >
                          {chat.title}
                        </p>
                        <p
                          className={
                            activeChatId === chat.id
                              ? "mt-1 text-xs text-blue-100"
                              : "mt-1 text-xs text-slate-300"
                          }
                        >
                          {formatDate(chat.last_message_at)}
                        </p>
                      </button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-xl border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
                        disabled={deletingChatId === chat.id || sendingMessage}
                        onClick={() => void handleDeleteChat(chat)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deletingChatId === chat.id ? "..." : "Remove"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_52px_rgba(15,23,42,0.12)] backdrop-blur-xl animate-[riseIn_800ms_ease-out]">
            {activePanel === "chat" && (
              <>
                <div className="border-b border-slate-200 bg-[linear-gradient(90deg,#f8fafc,#eff6ff)] px-5 py-4 sm:px-6">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                    {activeChatId
                      ? "Conversation"
                      : "Start a new conversation with your assistant"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {activeProject
                      ? "Project context: " + activeProject.name
                      : "Project context: global"}
                  </p>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#f8fbff,#eef4ff)] px-5 py-5 sm:px-6">
                  {messages.length === 0 ? (
                    loadingChat ? (
                      <p className="text-sm text-slate-500 animate-pulse">
                        Loading conversation...
                      </p>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 shadow-sm">
                        Send your first message to begin.
                      </div>
                    )
                  ) : (
                    <>
                      {messages.map((message) => {
                        const isAssistant = message.role === "assistant";
                        const isStreamingAssistantPlaceholder =
                          isAssistant &&
                          !message.content &&
                          (message.id === STREAMING_MESSAGE_ID ||
                            message.id.startsWith(
                              REALTIME_STREAMING_MESSAGE_PREFIX,
                            ));
                        const isCurrentUserMessage =
                          message.role === "user" &&
                          (message.id.startsWith("local-user-") ||
                            (user?.id !== undefined &&
                              user?.id !== null &&
                              message.sender?.id === user.id));
                        const isOtherUserMessage =
                          message.role === "user" && !isCurrentUserMessage;

                        let senderLabel = "Assistant";
                        if (isCurrentUserMessage) {
                          senderLabel = "You";
                        } else if (isOtherUserMessage) {
                          const fullName = [
                            message.sender?.first_name,
                            message.sender?.last_name,
                          ]
                            .filter(Boolean)
                            .join(" ")
                            .trim();
                          senderLabel = fullName || message.sender?.email || "Teammate";
                        }

                        return (
                          <article
                            key={message.id}
                            className={
                              isCurrentUserMessage
                                ? "ml-auto max-w-[86%] rounded-2xl border border-blue-600 bg-[linear-gradient(140deg,#2563eb,#1d4ed8)] px-4 py-3 text-sm leading-6 text-white shadow-[0_14px_26px_rgba(37,99,235,0.3)]"
                                : isAssistant
                                  ? "max-w-[86%] rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 shadow-sm"
                                  : "max-w-[86%] rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-sm leading-6 text-slate-800 shadow-sm"
                            }
                          >
                            <p
                              className={
                                isCurrentUserMessage
                                  ? "mb-1 text-[10px] font-semibold tracking-[0.14em] text-blue-100 uppercase"
                                  : isAssistant
                                    ? "mb-1 text-[10px] font-semibold tracking-[0.14em] text-blue-700 uppercase"
                                    : "mb-1 text-[10px] font-semibold tracking-[0.14em] text-indigo-700 uppercase"
                              }
                            >
                              {senderLabel} · {formatDate(message.created_at)}
                            </p>
                            {isStreamingAssistantPlaceholder ? (
                              <span className="inline-flex items-center gap-1 text-slate-500 animate-pulse">
                                Assistant is typing...
                              </span>
                            ) : (
                              message.content || "..."
                            )}
                          </article>
                        );
                      })}
                      {loadingChat && (
                        <p className="text-xs text-slate-500 animate-pulse">
                          Syncing messages...
                        </p>
                      )}
                    </>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                <form
                  onSubmit={handleSendMessage}
                  className="border-t border-slate-200 bg-white px-5 py-4 sm:px-6"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      onClick={() => chatFileInputRef.current?.click()}
                      disabled={!activeChatId || uploadingChatFile}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingChatFile ? "Uploading..." : "Upload chat file"}
                    </Button>
                    <input
                      ref={chatFileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleChatFileSelected}
                    />
                    {!activeChatId && (
                      <p className="text-xs text-slate-500">
                        Start a chat first to attach files.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Textarea
                      value={messageInput}
                      onChange={(event) => setMessageInput(event.target.value)}
                      placeholder="Ask anything about your project..."
                      className="min-h-24 resize-y rounded-2xl border-blue-200 bg-white shadow-sm focus-visible:ring-blue-200"
                      required
                    />
                    <Button
                      type="submit"
                      disabled={sendingMessage || loadingWorkspace}
                      className="rounded-xl bg-blue-600 px-5 text-white hover:bg-blue-500 sm:self-end"
                    >
                      <SendHorizontal className="h-4 w-4" />
                      {sendingMessage ? "Sending..." : "Send"}
                    </Button>
                  </div>
                </form>
              </>
            )}

            {activePanel === "project" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 sm:px-6">
                {!activeProject ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 shadow-sm">
                    Select a project to edit settings and shares.
                  </div>
                ) : (
                  <div className="space-y-6">
                    <form
                      onSubmit={handleSaveProject}
                      className="space-y-3 rounded-2xl border border-slate-200 bg-[linear-gradient(160deg,#ffffff,#f0f7ff)] p-4 shadow-sm"
                    >
                      <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <FolderOpen className="h-4 w-4 text-slate-700" />
                        Project settings
                      </p>

                      <Input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        placeholder="Project name"
                        className="rounded-xl border-slate-300 bg-white"
                        required
                      />

                      <Textarea
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                        placeholder="Description"
                        className="min-h-18 rounded-xl border-slate-300 bg-white"
                      />

                      <Textarea
                        value={editInstructions}
                        onChange={(event) => setEditInstructions(event.target.value)}
                        placeholder="Instructions for assistant"
                        className="min-h-24 rounded-xl border-slate-300 bg-white"
                      />

                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={editFavorite}
                          onChange={(event) => setEditFavorite(event.target.checked)}
                        />
                        Mark as favorite
                      </label>

                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={editArchived}
                          onChange={(event) => setEditArchived(event.target.checked)}
                        />
                        Archive project
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="submit"
                          className="rounded-xl bg-blue-600 text-white hover:bg-blue-500"
                          disabled={savingProject}
                        >
                          {savingProject ? "Saving..." : "Save Project"}
                        </Button>

                        {isProjectOwner && (
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDeleteProject}
                            disabled={deletingProjectId === activeProject.id}
                          >
                            <Trash2 className="h-4 w-4" />
                            {deletingProjectId === activeProject.id
                              ? "Deleting..."
                              : "Delete Project"}
                          </Button>
                        )}
                      </div>
                    </form>

                    <section className="space-y-3 rounded-2xl border border-slate-200 bg-[linear-gradient(160deg,#ffffff,#f0f7ff)] p-4 shadow-sm">
                      <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Mail className="h-4 w-4 text-slate-700" />
                        Sharing
                      </p>

                      {isProjectOwner ? (
                        <form onSubmit={handleAddShare} className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                          <Input
                            type="email"
                            placeholder="teammate@example.com"
                            value={shareEmail}
                            onChange={(event) => setShareEmail(event.target.value)}
                            className="rounded-xl border-slate-300 bg-white"
                            required
                          />

                          <select
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={sharePermission}
                            onChange={(event) =>
                              setSharePermission(event.target.value as SharePermission)
                            }
                          >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Admin</option>
                          </select>

                          <Button
                            type="submit"
                            className="rounded-xl bg-blue-600 text-white hover:bg-blue-500"
                            disabled={addingShare}
                          >
                            {addingShare ? "Sharing..." : "Share"}
                          </Button>
                        </form>
                      ) : (
                        <p className="text-sm text-slate-500">
                          Only owners can manage shares.
                        </p>
                      )}

                      <div className="space-y-2">
                        {(activeProject.shares ?? []).length === 0 ? (
                          <p className="text-sm text-slate-500">No shared users.</p>
                        ) : (
                          (activeProject.shares ?? []).map((share) => (
                            <div
                              key={share.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                            >
                              <div>
                                <p className="text-sm font-medium text-slate-900">
                                  {share.user_email}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {share.is_pending
                                    ? "Invitation pending"
                                    : "Accepted"}
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                <select
                                  className="rounded-xl border border-slate-300 bg-white px-2 py-1 text-sm"
                                  value={share.permission}
                                  disabled={!isProjectOwner || updatingShareId === share.id}
                                  onChange={(event) =>
                                    void handleUpdateSharePermission(
                                      share.id,
                                      event.target.value as SharePermission,
                                    )
                                  }
                                >
                                  <option value="viewer">Viewer</option>
                                  <option value="editor">Editor</option>
                                  <option value="admin">Admin</option>
                                </select>

                                {isProjectOwner && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={removingShareId === share.id}
                                    onClick={() => void handleRemoveShare(share.id)}
                                  >
                                    {removingShareId === share.id ? "Removing..." : "Remove"}
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  </div>
                )}
              </div>
            )}

            {activePanel === "files" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 sm:px-6">
                {!activeProject ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 shadow-sm">
                    Select a project to manage files.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        onClick={() => projectFileInputRef.current?.click()}
                        className="rounded-xl bg-blue-600 text-white hover:bg-blue-500"
                        disabled={uploadingProjectFile}
                      >
                        <Upload className="h-4 w-4" />
                        {uploadingProjectFile ? "Uploading..." : "Upload Project File"}
                      </Button>
                      <input
                        ref={projectFileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleProjectFileSelected}
                      />
                      <p className="text-xs text-slate-500">
                        Files are tied to project: {activeProject.name}
                      </p>
                    </div>

                    {loadingFiles ? (
                      <p className="text-sm text-slate-500">Loading files...</p>
                    ) : projectFiles.length === 0 ? (
                      <p className="text-sm text-slate-500">No files uploaded.</p>
                    ) : (
                      <div className="space-y-2">
                        {projectFiles.map((file) => (
                          <article
                            key={file.id}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-slate-900">
                                  {file.filename}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {formatBytes(file.file_size)} · {file.file_type} · {file.processing_status}
                                </p>
                                <p className="text-xs text-slate-500">
                                  Uploaded {formatDate(file.created_at)}
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={confirmingFileId === file.id}
                                  onClick={() => void handleConfirmFile(file.id)}
                                >
                                  {confirmingFileId === file.id ? "Confirming..." : "Confirm"}
                                </Button>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  disabled={deletingFileId === file.id}
                                  onClick={() => void handleDeleteFile(file.id)}
                                >
                                  {deletingFileId === file.id ? "Deleting..." : "Delete"}
                                </Button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activePanel === "invitations" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 sm:px-6">
                <div className="space-y-4">
                  <form
                    onSubmit={handleAcceptInvitationToken}
                    className="rounded-2xl border border-slate-200 bg-[linear-gradient(160deg,#ffffff,#f0f7ff)] p-4 shadow-sm"
                  >
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Mail className="h-4 w-4 text-slate-700" />
                      Accept invitation by token
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Paste token from invitation email link.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={manualInvitationToken}
                        onChange={(event) =>
                          setManualInvitationToken(event.target.value)
                        }
                        placeholder="Invitation token"
                        className="rounded-xl border-slate-300 bg-white"
                      />
                      <Button
                        type="submit"
                        className="rounded-xl bg-blue-600 text-white hover:bg-blue-500"
                        disabled={acceptingToken}
                      >
                        {acceptingToken ? "Accepting..." : "Accept"}
                      </Button>
                    </div>
                  </form>

                  <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(160deg,#ffffff,#f8f8f5)] p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">
                        Pending invitations
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void refreshInvitations()}
                        disabled={loadingInvitations}
                      >
                        {loadingInvitations ? "Refreshing..." : "Refresh"}
                      </Button>
                    </div>

                    {invitations.length === 0 ? (
                      <p className="text-sm text-slate-500">No pending invitations.</p>
                    ) : (
                      <div className="space-y-2">
                        {invitations.map((invite) => (
                          <article
                            key={invite.id}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                          >
                            <p className="text-sm font-medium text-slate-900">
                              {invite.project.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              Permission: {invite.permission}
                            </p>
                            <p className="text-xs text-slate-500">
                              Invited at {formatDate(invite.invited_at)}
                            </p>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
