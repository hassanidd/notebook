export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type SignUpInput = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type User = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
};

export type SharePermission = "viewer" | "editor" | "admin";
export type MemoryType = "default" | "project_only";

export type ProjectShare = {
  id: string;
  project_id: string;
  user_email: string;
  permission: SharePermission;
  invited_by: string;
  invited_at: string;
  accepted_at: string | null;
  is_pending: boolean;
};

export type ChatSummary = {
  id: string;
  title: string;
  project_id: string | null;
  owner_id: string;
  status: "active" | "archived";
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  memory_type: MemoryType;
  memory_project_ids: string[];
  owner_id: string;
  is_archived: boolean;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  shares?: ProjectShare[];
  chats?: ChatSummary[];
};

export type ProjectCreateInput = {
  name: string;
  description?: string | null;
  instructions?: string | null;
  memory_type?: MemoryType;
  memory_project_ids?: string[];
  shared_with?: Array<{ user_email: string; permission: SharePermission }>;
};

export type ProjectUpdateInput = {
  name?: string;
  description?: string | null;
  instructions?: string | null;
  memory_type?: MemoryType;
  memory_project_ids?: string[];
  is_archived?: boolean;
  is_favorite?: boolean;
};

export type ProjectInvitation = ProjectShare & {
  project: {
    id: string;
    name: string;
    description: string | null;
    instructions: string | null;
    memory_type: MemoryType;
    memory_project_ids: string[];
    owner_id: string;
    is_archived: boolean;
    is_favorite: boolean;
    created_at: string;
    updated_at: string;
  };
};

export type ProjectFile = {
  id: string;
  filename: string;
  file_size: number;
  project_id: string;
  created_at: string;
  processing_status: string;
  file_type: string;
};

export type FileUploadResponse = {
  id: string;
  filename: string;
  file_size: number;
  processing_status: string;
};

export type ChatSender = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  profile_image: string | null;
  create_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  chat_id: string;
  sender: ChatSender | null;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type ChatWithMessages = {
  id: string;
  title: string;
  project_id: string | null;
  owner_id: string;
  status: "active" | "archived";
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  messages: ChatMessage[];
};

export type ChatCreateInput = {
  message: string;
  chat_id?: string;
  project_id?: string;
};

export type ChatStreamEvent =
  | {
      type: "user_info";
      user: {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        profile_image: string | null;
      };
      chat_id: string;
    }
  | {
      type: "reply_to_message";
      message: ChatMessage;
      chat_id: string;
    }
  | {
      type: "message_chunk";
      content: string;
      chat_id: string;
      done: boolean;
    }
  | {
      type: "error";
      error: string;
      chat_id: string;
      done: true;
    };

export type ChatRealtimeEvent =
  | {
      type: "ws_connected";
      user_id: string;
    }
  | {
      type: "pong";
    }
  | {
      type: "chat_created";
      chat: ChatSummary;
      actor_user_id: string;
    }
  | {
      type: "chat_deleted";
      chat_id: string;
      project_id: string | null;
      actor_user_id: string;
    }
  | {
      type: "message_created";
      chat_id: string;
      project_id: string | null;
      message: ChatMessage;
      actor_user_id: string | null;
    }
  | {
      type: "assistant_chunk";
      chat_id: string;
      project_id: string | null;
      content: string;
      actor_user_id: string | null;
    }
  | {
      type: "assistant_done";
      chat_id: string;
      project_id: string | null;
      actor_user_id: string | null;
    };
