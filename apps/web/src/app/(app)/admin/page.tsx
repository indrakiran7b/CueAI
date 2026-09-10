"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Building2,
  Check,
  ClipboardList,
  Clock3,
  Cpu,
  Database,
  FilePenLine,
  KeyRound,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  ScrollText,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RequireAdmin } from "@/components/auth/require-admin";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/misc";
import {
  ALL_ADMIN_PERMISSIONS,
  can,
  rolePermissionMatrix,
  type AdminPermission,
  type WorkspaceRole,
} from "@/lib/roles";
import { cn } from "@/lib/utils";

type NavId =
  | "overview"
  | "workspace"
  | "users"
  | "invitations"
  | "roles"
  | "knowledge"
  | "providers"
  | "models"
  | "tokens"
  | "meetings"
  | "resume"
  | "privacy"
  | "retention"
  | "audit"
  | "settings";

const NAV: Array<{
  id: NavId;
  label: string;
  icon: typeof Activity;
  permission: AdminPermission;
}> = [
  { id: "overview", label: "Overview", icon: BarChart3, permission: "admin.access" },
  { id: "workspace", label: "Workspace", icon: Building2, permission: "workspace.read" },
  { id: "users", label: "Users", icon: Users, permission: "users.read" },
  { id: "invitations", label: "Invitations", icon: Mail, permission: "users.read" },
  { id: "roles", label: "Roles", icon: Shield, permission: "users.read" },
  { id: "knowledge", label: "Knowledge", icon: BookOpen, permission: "knowledge.read" },
  { id: "providers", label: "AI Providers", icon: KeyRound, permission: "ai.read" },
  { id: "models", label: "AI Models", icon: Bot, permission: "ai.read" },
  { id: "tokens", label: "Token Usage", icon: Cpu, permission: "usage.read" },
  { id: "meetings", label: "Meeting Minutes", icon: Clock3, permission: "usage.read" },
  { id: "resume", label: "Resume Rewrite", icon: FilePenLine, permission: "usage.read" },
  { id: "privacy", label: "Privacy", icon: Lock, permission: "privacy.read" },
  { id: "retention", label: "Retention", icon: Database, permission: "privacy.read" },
  { id: "audit", label: "Activity Log", icon: ScrollText, permission: "audit.read" },
  { id: "settings", label: "Settings", icon: Settings, permission: "workspace.read" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body as T;
}

type ActivityEvent = {
  id: string;
  createdAt: string;
  actorName: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
};

type Overview = {
  workspace: { id: string; name: string; seats: number; createdAt: string | null };
  metrics: {
    totalUsers: number;
    activeUsers: number;
    invitedUsers: number;
    deactivatedUsers: number;
    pendingInvites: number;
    knowledgeItems: number;
    periodTokenUsage: number;
    periodMeetingMinutes: number;
    periodMeetingSessions: number;
    periodResumeRewrites: number;
    periodLabel: string;
    auditEvents: number;
  };
  recentActivity: ActivityEvent[];
};

type Workspace = {
  id: string;
  name: string;
  seats: number;
  createdAt: string | null;
  memberCount: number;
  invitedCount: number;
  pendingInvites: number;
};

type User = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  createdAt: string;
};

type Invite = {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  invitedBy: string;
  createdAt: string;
  sentAt?: string;
  accountStatus?: string;
};

type KnowledgeItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  sizeLabel: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
};

type AiProvider = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  endpoint: string;
  hasApiKey: boolean;
  apiKeyStatus: string;
  apiKeyMasked: string;
  enabledModelCount: number;
  updatedAt: string | null;
};

type AiModel = {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  capability: string;
  enabled: boolean;
  isDefault: boolean;
  contextWindow: number | null;
  updatedAt: string | null;
};

type AiCatalog = {
  providers: AiProvider[];
  models: AiModel[];
  defaultModel: string;
  activeProvider: string;
};

type UserAggregate = {
  userId: string;
  userName: string;
  quantity: number;
  events: number;
};

type UsageBase = {
  workspaceName: string;
  period: {
    label: string;
    byUser: UserAggregate[];
    overTime: Array<{ date: string; quantity: number }>;
    eventCount: number;
  };
};

type TokenUsage = UsageBase & {
  kind: "tokens";
  period: UsageBase["period"] & {
    total: number;
    inputTokens: number;
    outputTokens: number;
    byProvider: Array<{ provider: string; quantity: number }>;
    byModel: Array<{ model: string; quantity: number }>;
  };
  recent: Array<{
    id: string;
    quantity: number;
    inputTokens: number;
    outputTokens: number;
    userName: string;
    provider: string | null;
    model: string | null;
    createdAt: string;
    feature: string | null;
  }>;
};

type MeetingUsage = UsageBase & {
  kind: "meeting_minutes";
  period: UsageBase["period"] & {
    meetingsProcessed: number;
    totalMinutes: number;
    averageMinutes: number;
  };
  recent: Array<{
    id: string;
    minutes: number;
    userName: string;
    provider: string | null;
    model: string | null;
    createdAt: string;
    label: string | null;
  }>;
};

type ResumeUsage = UsageBase & {
  kind: "resume_rewrite";
  period: UsageBase["period"] & {
    totalRewrites: number;
    operations: number;
    successfulRewrites: number;
    failedRewrites: number;
  };
  recent: Array<{
    id: string;
    rewrites: number;
    userName: string;
    provider: string | null;
    model: string | null;
    createdAt: string;
    status: string;
  }>;
};

type SettingsData = {
  privacy: Record<string, boolean>;
  retention: Record<string, number | boolean>;
};

const selectClass =
  "h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--background-elevated)] px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--primary-muted)]";

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted">{children}</div>;
}

function Banner({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: ReactNode;
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        kind === "error"
          ? "border-red-500/30 bg-red-500/10 text-red-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      )}
    >
      {children}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-subtle">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
    </Card>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Activity;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <h2 className="font-display text-lg font-semibold">{title}</h2>
        </div>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function UsageChart({
  data,
  empty,
}: {
  data: Array<{ date: string; quantity: number }>;
  empty: string;
}) {
  if (!data.length) return <Empty>{empty}</Empty>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="quantity" fill="var(--primary)" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AdminPortalInner() {
  const { session } = useAuth();
  const role = session?.role || "User";
  const [tab, setTab] = useState<NavId>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("User");
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [ai, setAi] = useState<AiCatalog | null>(null);
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
  const [newProvider, setNewProvider] = useState({
    type: "openai",
    name: "",
    endpoint: "",
    apiKey: "",
  });
  const [newModel, setNewModel] = useState({
    providerId: "",
    name: "",
    capability: "chat",
  });
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [meetingUsage, setMeetingUsage] = useState<MeetingUsage | null>(null);
  const [resumeUsage, setResumeUsage] = useState<ResumeUsage | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [audit, setAudit] = useState<ActivityEvent[]>([]);
  const [confirmUser, setConfirmUser] = useState<User | null>(null);

  const visibleNav = useMemo(
    () => NAV.filter((item) => can(role, item.permission)),
    [role],
  );
  const permissions = useMemo(() => rolePermissionMatrix(), []);

  const fail = (cause: unknown, fallback: string) => {
    setError(cause instanceof Error ? cause.message : fallback);
  };

  const flash = (message: string) => {
    setSuccess(message);
    window.setTimeout(() => setSuccess(null), 3500);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const requests: Promise<void>[] = [
        api<Overview>("/api/admin/overview").then(setOverview),
      ];
      if (can(role, "workspace.read")) {
        requests.push(
          api<{ workspace: Workspace }>("/api/admin/workspace").then((data) =>
            setWorkspace(data.workspace),
          ),
        );
      }
      if (can(role, "users.read")) {
        requests.push(
          api<{ users: User[] }>("/api/admin/users").then((data) => setUsers(data.users)),
          api<{ invites: Invite[] }>("/api/admin/invites").then((data) =>
            setInvites(data.invites),
          ),
        );
      }
      if (can(role, "knowledge.read")) {
        requests.push(
          api<{ items: KnowledgeItem[] }>("/api/admin/knowledge").then((data) =>
            setKnowledge(data.items),
          ),
        );
      }
      if (can(role, "ai.read")) {
        requests.push(api<AiCatalog>("/api/admin/ai").then(setAi));
      }
      if (can(role, "privacy.read")) {
        requests.push(api<SettingsData>("/api/admin/settings").then(setSettings));
      }
      if (can(role, "audit.read")) {
        requests.push(
          api<{ events: ActivityEvent[] }>("/api/admin/audit?limit=100").then((data) =>
            setAudit(data.events),
          ),
        );
      }
      await Promise.all(requests);
    } catch (cause) {
      fail(cause, "Failed to load the admin portal.");
    } finally {
      setLoading(false);
    }
  }, [role]);

  const loadUsage = useCallback(async (id: "tokens" | "meetings" | "resume") => {
    setBusy(`usage-${id}`);
    setError(null);
    try {
      if (id === "tokens") {
        setTokenUsage(await api<TokenUsage>("/api/admin/usage?type=tokens"));
      } else if (id === "meetings") {
        setMeetingUsage(
          await api<MeetingUsage>("/api/admin/usage?type=meeting_minutes"),
        );
      } else {
        setResumeUsage(
          await api<ResumeUsage>("/api/admin/usage?type=resume_rewrite"),
        );
      }
    } catch (cause) {
      fail(cause, "Failed to load usage.");
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAll(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    if (tab !== "tokens" && tab !== "meetings" && tab !== "resume") return;
    const timer = window.setTimeout(() => void loadUsage(tab), 0);
    return () => window.clearTimeout(timer);
  }, [loadUsage, tab]);

  async function mutate<T>(
    key: string,
    request: () => Promise<T>,
    message: string,
    after?: (result: T) => void,
  ) {
    setBusy(key);
    setError(null);
    try {
      const result = await request();
      after?.(result);
      flash(message);
      return result;
    } catch (cause) {
      fail(cause, "Request failed.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function searchUsers(value: string) {
    setUserQuery(value);
    try {
      const data = await api<{ users: User[] }>(
        `/api/admin/users?q=${encodeURIComponent(value)}`,
      );
      setUsers(data.users);
    } catch (cause) {
      fail(cause, "User search failed.");
    }
  }

  async function searchKnowledge(value: string) {
    setKnowledgeQuery(value);
    try {
      const data = await api<{ items: KnowledgeItem[] }>(
        `/api/admin/knowledge?q=${encodeURIComponent(value)}`,
      );
      setKnowledge(data.items);
    } catch (cause) {
      fail(cause, "Knowledge search failed.");
    }
  }

  async function reloadKnowledge() {
    const data = await api<{ items: KnowledgeItem[] }>(
      `/api/admin/knowledge?q=${encodeURIComponent(knowledgeQuery)}`,
    );
    setKnowledge(data.items);
  }

  async function patchAi(body: object, message: string) {
    await mutate(
      "ai",
      () =>
        api<AiCatalog>("/api/admin/ai", {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      message,
      setAi,
    );
  }

  const providerName = (id: string) =>
    ai?.providers.find((provider) => provider.id === id)?.name || "Unknown";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 animate-fade-up lg:flex-row">
      <aside className="w-full shrink-0 lg:w-60">
        <nav className="sticky top-20 rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] p-2">
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
            Admin portal
          </p>
          <div className="hidden space-y-1 lg:block">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                    tab === item.id
                      ? "bg-[var(--surface-active)] text-foreground"
                      : "text-muted hover:bg-[var(--surface-hover)] hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="overflow-x-auto lg:hidden">
            <Tabs
              className="min-w-max"
              tabs={visibleNav.map((item) => ({
                id: item.id,
                label: item.label,
              }))}
              active={tab}
              onChange={(id) => setTab(id as NavId)}
            />
          </div>
        </nav>
      </aside>

      <main className="min-w-0 flex-1 space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {NAV.find((item) => item.id === tab)?.label}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Manage your workspace using live workspace data.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void loadAll()}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            {can(role, "users.invite") && (
              <Button variant="gradient" onClick={() => setTab("invitations")}>
                <UserPlus className="h-4 w-4" />
                Invite
              </Button>
            )}
          </div>
        </header>

        {error && <Banner kind="error">{error}</Banner>}
        {success && <Banner kind="success">{success}</Banner>}

        {loading && !overview ? (
          <Card><Empty>Loading admin data…</Empty></Card>
        ) : (
          <>
            {tab === "overview" && overview && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {overview.metrics.activeUsers > 0 && (
                    <Metric icon={Users} label="Active users" value={overview.metrics.activeUsers} />
                  )}
                  {overview.metrics.pendingInvites > 0 && (
                    <Metric icon={Mail} label="Open invites" value={overview.metrics.pendingInvites} />
                  )}
                  {overview.metrics.knowledgeItems > 0 && (
                    <Metric icon={BookOpen} label="Knowledge items" value={overview.metrics.knowledgeItems} />
                  )}
                  {overview.metrics.periodTokenUsage > 0 && (
                    <Metric icon={Cpu} label="Tokens this period" value={overview.metrics.periodTokenUsage.toLocaleString()} />
                  )}
                  {overview.metrics.periodMeetingSessions > 0 && (
                    <Metric icon={Clock3} label="Meetings processed" value={overview.metrics.periodMeetingSessions} />
                  )}
                  {overview.metrics.periodResumeRewrites > 0 && (
                    <Metric icon={FilePenLine} label="Resume rewrites" value={overview.metrics.periodResumeRewrites} />
                  )}
                </div>
                {!overview.metrics.activeUsers &&
                  !overview.metrics.pendingInvites &&
                  !overview.metrics.knowledgeItems &&
                  !overview.metrics.periodTokenUsage &&
                  !overview.metrics.periodMeetingSessions &&
                  !overview.metrics.periodResumeRewrites && (
                    <Card><Empty>No workspace activity yet.</Empty></Card>
                  )}
                <Card className="p-5">
                  <SectionTitle
                    icon={Activity}
                    title="Recent activity"
                    description="Latest administrative changes in this workspace."
                  />
                  {!overview.recentActivity.length ? (
                    <Empty>No recent activity yet.</Empty>
                  ) : (
                    <ul className="mt-4 divide-y divide-[var(--border)] text-sm">
                      {overview.recentActivity.map((event) => (
                        <li key={event.id} className="flex flex-wrap justify-between gap-2 py-3">
                          <span>
                            <strong>{event.actorName}</strong> · {event.action}
                            <span className="text-muted"> · {event.resourceType}</span>
                          </span>
                          <time className="text-xs text-subtle">{formatDate(event.createdAt)}</time>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            )}

            {tab === "workspace" && workspace && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric icon={Users} label="Active members" value={workspace.memberCount} />
                  <Metric icon={Mail} label="Invited members" value={workspace.invitedCount} />
                  <Metric icon={Building2} label="Seats" value={workspace.seats} />
                </div>
                <Card className="space-y-4 p-5">
                  <SectionTitle icon={Building2} title="Workspace details" />
                  <Input
                    label="Workspace name"
                    value={workspace.name}
                    disabled={!can(role, "workspace.write")}
                    onChange={(event) =>
                      setWorkspace({ ...workspace, name: event.target.value })
                    }
                  />
                  <Input
                    label="Seats"
                    type="number"
                    min={1}
                    max={1000}
                    value={workspace.seats}
                    disabled={!can(role, "workspace.write")}
                    onChange={(event) =>
                      setWorkspace({ ...workspace, seats: Number(event.target.value) })
                    }
                  />
                  <p className="text-xs text-muted">Created {formatDate(workspace.createdAt)}</p>
                  {can(role, "workspace.write") && (
                    <Button
                      loading={busy === "workspace"}
                      onClick={() =>
                        void mutate(
                          "workspace",
                          () =>
                            api<{ workspace: Workspace }>("/api/admin/workspace", {
                              method: "PATCH",
                              body: JSON.stringify({
                                name: workspace.name,
                                seats: workspace.seats,
                              }),
                            }),
                          "Workspace updated.",
                          (data) => setWorkspace({ ...workspace, ...data.workspace }),
                        )
                      }
                    >
                      Save workspace
                    </Button>
                  )}
                </Card>
              </div>
            )}

            {tab === "users" && (
              <Card className="p-5">
                <SectionTitle
                  icon={Users}
                  title="Users"
                  action={
                    <Input
                      aria-label="Search users"
                      placeholder="Search users…"
                      value={userQuery}
                      onChange={(event) => void searchUsers(event.target.value)}
                      className="sm:w-72"
                    />
                  }
                />
                {!users.length ? (
                  <Empty>No users found.</Empty>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="text-xs text-subtle">
                        <tr className="border-b border-[var(--border)]">
                          <th className="py-2 pr-3 font-medium">User</th>
                          <th className="py-2 pr-3 font-medium">Role</th>
                          <th className="py-2 pr-3 font-medium">Status</th>
                          <th className="py-2 pr-3 font-medium">Joined</th>
                          <th className="py-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr key={user.id} className="border-b border-[var(--border)]/60">
                            <td className="py-3 pr-3">
                              <div className="font-medium">{user.name}</div>
                              <div className="text-xs text-muted">{user.email}</div>
                            </td>
                            <td className="py-3 pr-3">
                              {can(role, "users.role") ? (
                                <select
                                  className={cn(selectClass, "h-9 w-32")}
                                  value={user.role}
                                  onChange={(event) =>
                                    void mutate(
                                      `role-${user.id}`,
                                      () =>
                                        api<{ user: User }>("/api/admin/users", {
                                          method: "PATCH",
                                          body: JSON.stringify({
                                            userId: user.id,
                                            role: event.target.value,
                                          }),
                                        }),
                                      "User role updated.",
                                      (data) =>
                                        setUsers((current) =>
                                          current.map((item) =>
                                            item.id === data.user.id ? data.user : item,
                                          ),
                                        ),
                                    )
                                  }
                                >
                                  <option value="Admin">Admin</option>
                                  <option value="Manager">Manager</option>
                                  <option value="User">User</option>
                                </select>
                              ) : (
                                <Badge>{user.role}</Badge>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              <Badge variant={user.status === "Active" ? "success" : "warning"}>
                                {user.status}
                              </Badge>
                            </td>
                            <td className="py-3 pr-3 text-xs text-muted">{formatDate(user.createdAt)}</td>
                            <td className="py-3">
                              {can(role, "users.remove") && user.status !== "Deactivated" && (
                                <Button size="sm" variant="danger" onClick={() => setConfirmUser(user)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Deactivate
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {tab === "invitations" && (
              <div className="space-y-4">
                {can(role, "users.invite") && (
                  <Card className="space-y-4 p-5">
                    <SectionTitle
                      icon={UserPlus}
                      title="Add a user"
                      description="Membership and role are applied immediately. The user signs in with this email — no accept link."
                    />
                    <div className="grid gap-3 sm:grid-cols-[1fr_150px_auto]">
                      <Input
                        type="email"
                        placeholder="name@company.com"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                      />
                      <select
                        className={selectClass}
                        value={inviteRole}
                        onChange={(event) => setInviteRole(event.target.value as WorkspaceRole)}
                      >
                        <option value="User">User</option>
                        <option value="Manager">Manager</option>
                        <option value="Admin">Admin</option>
                      </select>
                      <Button
                        variant="gradient"
                        loading={busy === "invite"}
                        disabled={!inviteEmail.trim()}
                        onClick={() =>
                          void mutate(
                            "invite",
                            () =>
                              api<{
                                invite: { status: string; role: string };
                                membership: { role: string; accountStatus: string } | null;
                                emailDelivery: { ok: boolean; error: string | null; configured: boolean };
                                note?: string;
                              }>("/api/admin/invites", {
                                method: "POST",
                                body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
                              }),
                            "User added to workspace.",
                            (data) => {
                              const emailOk = data.emailDelivery?.ok;
                              setInviteNotice(
                                emailOk
                                  ? `Role ${data.membership?.role || data.invite.role} assigned. Notification email was sent.`
                                  : `Role ${data.membership?.role || data.invite.role} assigned. Email not sent${
                                      data.emailDelivery?.error ? `: ${data.emailDelivery.error}` : "."
                                    }`,
                              );
                              setInviteEmail("");
                              void Promise.all([
                                api<{ invites: Invite[] }>("/api/admin/invites").then((result) =>
                                  setInvites(result.invites),
                                ),
                                api<{ users: User[] }>("/api/admin/users").then((result) =>
                                  setUsers(result.users),
                                ),
                              ]);
                            },
                          )
                        }
                      >
                        Send invite
                      </Button>
                    </div>
                    {inviteNotice && (
                      <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-active)] p-3 text-sm text-muted">
                        {inviteNotice}
                      </p>
                    )}
                  </Card>
                )}
                <Card className="p-5">
                  <SectionTitle icon={Mail} title="Invitations" />
                  {!invites.length ? (
                    <Empty>No invitations yet.</Empty>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[860px] text-left text-sm">
                        <thead className="text-xs text-subtle">
                          <tr className="border-b border-[var(--border)]">
                            <th className="py-2 pr-3">Email</th>
                            <th className="py-2 pr-3">Role</th>
                            <th className="py-2 pr-3">Status</th>
                            <th className="py-2 pr-3">Invited by</th>
                            <th className="py-2 pr-3">Created</th>
                            <th className="py-2 pr-3">Account</th>
                            <th className="py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invites.map((invite) => (
                            <tr key={invite.id} className="border-b border-[var(--border)]/60">
                              <td className="py-3 pr-3">{invite.email}</td>
                              <td className="py-3 pr-3">
                                <Badge>{invite.role}</Badge>
                              </td>
                              <td className="py-3 pr-3">
                                <Badge
                                  variant={
                                    invite.status === "active"
                                      ? "success"
                                      : invite.status === "revoked"
                                        ? "danger"
                                        : "warning"
                                  }
                                >
                                  {invite.status}
                                </Badge>
                              </td>
                              <td className="py-3 pr-3 text-xs text-muted">{invite.invitedBy}</td>
                              <td className="py-3 pr-3 text-xs text-muted">
                                {formatDate(invite.sentAt || invite.createdAt)}
                              </td>
                              <td className="py-3 pr-3 text-xs text-muted">
                                {invite.accountStatus || "—"}
                              </td>
                              <td className="py-3">
                                <div className="flex flex-wrap gap-2">
                                  {can(role, "users.invite") &&
                                    invite.status !== "revoked" &&
                                    invite.status !== "expired" && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        loading={busy === `resend-${invite.id}`}
                                        onClick={() =>
                                          void mutate(
                                            `resend-${invite.id}`,
                                            () =>
                                              api<{
                                                emailDelivery: { ok: boolean; error: string | null };
                                              }>("/api/admin/invites", {
                                                method: "PATCH",
                                                body: JSON.stringify({ id: invite.id }),
                                              }),
                                            "Invite resent.",
                                            (data) => {
                                              if (!data.emailDelivery.ok) {
                                                setError(
                                                  data.emailDelivery.error ||
                                                    "Email was not delivered.",
                                                );
                                              }
                                              void api<{ invites: Invite[] }>("/api/admin/invites").then(
                                                (result) => setInvites(result.invites),
                                              );
                                            },
                                          )
                                        }
                                      >
                                        <RefreshCw className="h-3.5 w-3.5" />
                                        Resend
                                      </Button>
                                    )}
                                  {can(role, "users.invite") && invite.status !== "revoked" && (
                                    <Button
                                      size="sm"
                                      variant="danger"
                                      loading={busy === `invite-${invite.id}`}
                                      onClick={() =>
                                        void mutate(
                                          `invite-${invite.id}`,
                                          () =>
                                            api(`/api/admin/invites?id=${encodeURIComponent(invite.id)}`, {
                                              method: "DELETE",
                                            }),
                                          "Invitation revoked.",
                                          () =>
                                            setInvites((current) =>
                                              current.map((item) =>
                                                item.id === invite.id
                                                  ? { ...item, status: "revoked" }
                                                  : item,
                                              ),
                                            ),
                                        )
                                      }
                                    >
                                      Revoke
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {tab === "roles" && (
              <Card className="p-5">
                <SectionTitle
                  icon={Shield}
                  title="Role permissions"
                  description="This matrix is read-only and reflects the permissions enforced by the server."
                />
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="text-xs text-subtle">
                      <tr className="border-b border-[var(--border)]">
                        <th className="py-2 pr-3">Permission</th>
                        <th className="py-2 text-center">Admin</th>
                        <th className="py-2 text-center">Manager</th>
                        <th className="py-2 text-center">User</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_ADMIN_PERMISSIONS.map((permission) => (
                        <tr key={permission} className="border-b border-[var(--border)]/60">
                          <td className="py-3 pr-3 font-mono text-xs">{permission}</td>
                          {(["Admin", "Manager", "User"] as WorkspaceRole[]).map((matrixRole) => (
                            <td key={matrixRole} className="py-3 text-center">
                              {permissions[matrixRole].includes(permission) ? (
                                <Check className="mx-auto h-4 w-4 text-emerald-400" />
                              ) : (
                                <X className="mx-auto h-4 w-4 text-subtle" />
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {tab === "knowledge" && (
              <div className="space-y-4">
                {can(role, "knowledge.write") && (
                  <Card className="space-y-3 p-5">
                    <SectionTitle icon={Plus} title="Add knowledge" />
                    <Input
                      placeholder="Title"
                      value={knowledgeTitle}
                      onChange={(event) => setKnowledgeTitle(event.target.value)}
                    />
                    <textarea
                      className="min-h-32 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--background-elevated)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-muted)]"
                      placeholder="Content"
                      value={knowledgeContent}
                      onChange={(event) => setKnowledgeContent(event.target.value)}
                    />
                    <Button
                      loading={busy === "knowledge-create"}
                      disabled={!knowledgeTitle.trim() || !knowledgeContent.trim()}
                      onClick={() =>
                        void mutate(
                          "knowledge-create",
                          () =>
                            api("/api/admin/knowledge", {
                              method: "POST",
                              body: JSON.stringify({
                                title: knowledgeTitle,
                                content: knowledgeContent,
                                type: "note",
                              }),
                            }),
                          "Knowledge item created.",
                          () => {
                            setKnowledgeTitle("");
                            setKnowledgeContent("");
                            void reloadKnowledge();
                          },
                        )
                      }
                    >
                      Add item
                    </Button>
                  </Card>
                )}
                <Card className="p-5">
                  <SectionTitle
                    icon={BookOpen}
                    title="Knowledge base"
                    action={
                      <Input
                        aria-label="Search knowledge"
                        placeholder="Search…"
                        value={knowledgeQuery}
                        onChange={(event) => void searchKnowledge(event.target.value)}
                        className="sm:w-72"
                      />
                    }
                  />
                  {!knowledge.length ? (
                    <Empty>No knowledge items yet.</Empty>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {knowledge.map((item) => (
                        <li key={item.id} className="rounded-xl border border-[var(--border)] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-medium">{item.title}</h3>
                                <Badge>{item.type}</Badge>
                                <Badge variant={item.status === "indexed" ? "success" : "warning"}>
                                  {item.status}
                                </Badge>
                              </div>
                              <p className="mt-2 text-sm text-muted">{item.preview}</p>
                              <p className="mt-2 text-xs text-subtle">
                                {item.sizeLabel} · Updated {formatDate(item.updatedAt)}
                              </p>
                            </div>
                            {can(role, "knowledge.write") && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    const title = window.prompt("Knowledge title", item.title);
                                    if (!title?.trim()) return;
                                    void mutate(
                                      `knowledge-${item.id}`,
                                      () =>
                                        api("/api/admin/knowledge", {
                                          method: "PATCH",
                                          body: JSON.stringify({ id: item.id, title }),
                                        }),
                                      "Knowledge item updated.",
                                      () => void reloadKnowledge(),
                                    );
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => {
                                    if (!window.confirm(`Delete “${item.title}”?`)) return;
                                    void mutate(
                                      `knowledge-${item.id}`,
                                      () =>
                                        api(`/api/admin/knowledge?id=${encodeURIComponent(item.id)}`, {
                                          method: "DELETE",
                                        }),
                                      "Knowledge item deleted.",
                                      () =>
                                        setKnowledge((current) =>
                                          current.filter((entry) => entry.id !== item.id),
                                        ),
                                    );
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            )}

            {tab === "providers" && (
              <div className="space-y-4">
                {can(role, "ai.write") && (
                  <Card className="space-y-3 p-5">
                    <SectionTitle icon={Plus} title="Add provider" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        aria-label="Provider type"
                        className={selectClass}
                        value={newProvider.type}
                        onChange={(event) =>
                          setNewProvider({ ...newProvider, type: event.target.value })
                        }
                      >
                        <option value="openai">OpenAI</option>
                        <option value="groq">Groq</option>
                        <option value="gemini">Google Gemini</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="custom">Custom</option>
                      </select>
                      <Input
                        placeholder="Display name"
                        value={newProvider.name}
                        onChange={(event) =>
                          setNewProvider({ ...newProvider, name: event.target.value })
                        }
                      />
                      <Input
                        placeholder="Endpoint (optional)"
                        value={newProvider.endpoint}
                        onChange={(event) =>
                          setNewProvider({ ...newProvider, endpoint: event.target.value })
                        }
                      />
                      <Input
                        type="password"
                        placeholder="API key (optional)"
                        value={newProvider.apiKey}
                        onChange={(event) =>
                          setNewProvider({ ...newProvider, apiKey: event.target.value })
                        }
                      />
                    </div>
                    <Button
                      disabled={!newProvider.name.trim()}
                      loading={busy === "ai"}
                      onClick={() => {
                        void patchAi({ provider: newProvider }, "Provider added.");
                        setNewProvider({ type: "openai", name: "", endpoint: "", apiKey: "" });
                      }}
                    >
                      Add provider
                    </Button>
                  </Card>
                )}
                <Card className="p-5">
                  <SectionTitle icon={KeyRound} title="AI providers" />
                  {!ai?.providers.length ? (
                    <Empty>No AI providers configured yet.</Empty>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[980px] text-left text-sm">
                        <thead className="text-xs text-subtle">
                          <tr className="border-b border-[var(--border)]">
                            <th className="py-2 pr-3">Provider</th>
                            <th className="py-2 pr-3">Status</th>
                            <th className="py-2 pr-3">Endpoint</th>
                            <th className="py-2 pr-3">API key</th>
                            <th className="py-2 pr-3">Models</th>
                            <th className="py-2 pr-3">Updated</th>
                            <th className="py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ai.providers.map((provider) => (
                            <tr key={provider.id} className="border-b border-[var(--border)]/60 align-top">
                              <td className="py-3 pr-3">
                                <div className="font-medium">{provider.name}</div>
                                <div className="text-xs text-muted">{provider.type}</div>
                              </td>
                              <td className="py-3 pr-3">
                                <Badge variant={provider.enabled ? "success" : "warning"}>
                                  {provider.enabled ? "Enabled" : "Disabled"}
                                </Badge>
                              </td>
                              <td className="max-w-72 py-3 pr-3">
                                <Input
                                  aria-label={`${provider.name} endpoint`}
                                  className="h-9"
                                  value={provider.endpoint}
                                  disabled={!can(role, "ai.write")}
                                  onChange={(event) =>
                                    setAi({
                                      ...ai,
                                      providers: ai.providers.map((item) =>
                                        item.id === provider.id
                                          ? { ...item, endpoint: event.target.value }
                                          : item,
                                      ),
                                    })
                                  }
                                  onBlur={() =>
                                    void patchAi(
                                      { provider: { id: provider.id, endpoint: provider.endpoint } },
                                      "Provider endpoint saved.",
                                    )
                                  }
                                />
                              </td>
                              <td className="py-3 pr-3">
                                <div>{provider.apiKeyStatus}</div>
                                {provider.apiKeyMasked && (
                                  <code className="text-xs text-muted">{provider.apiKeyMasked}</code>
                                )}
                                {can(role, "ai.write") && (
                                  <Input
                                    aria-label={`${provider.name} API key`}
                                    type="password"
                                    className="mt-2 h-9 w-44"
                                    placeholder="New API key"
                                    value={providerKeys[provider.id] || ""}
                                    onChange={(event) =>
                                      setProviderKeys({
                                        ...providerKeys,
                                        [provider.id]: event.target.value,
                                      })
                                    }
                                  />
                                )}
                              </td>
                              <td className="py-3 pr-3">{provider.enabledModelCount}</td>
                              <td className="py-3 pr-3 text-xs text-muted">{formatDate(provider.updatedAt)}</td>
                              <td className="py-3">
                                {can(role, "ai.write") && (
                                  <div className="flex max-w-56 flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() =>
                                        void patchAi(
                                          { provider: { id: provider.id, enabled: !provider.enabled } },
                                          `Provider ${provider.enabled ? "disabled" : "enabled"}.`,
                                        )
                                      }
                                    >
                                      {provider.enabled ? "Disable" : "Enable"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      disabled={!providerKeys[provider.id]?.trim()}
                                      onClick={() => {
                                        void patchAi(
                                          {
                                            provider: {
                                              id: provider.id,
                                              apiKey: providerKeys[provider.id],
                                            },
                                          },
                                          "API key saved.",
                                        );
                                        setProviderKeys({ ...providerKeys, [provider.id]: "" });
                                      }}
                                    >
                                      Save key
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() =>
                                        void mutate(
                                          `test-${provider.id}`,
                                          () =>
                                            api<{ ok: boolean; message?: string }>("/api/admin/ai", {
                                              method: "POST",
                                              body: JSON.stringify({ providerId: provider.id }),
                                            }),
                                          "Connection successful.",
                                        )
                                      }
                                    >
                                      Test
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="danger"
                                      onClick={() => {
                                        if (!window.confirm(`Delete ${provider.name} and its models?`)) return;
                                        void mutate(
                                          `delete-${provider.id}`,
                                          () =>
                                            api<AiCatalog>(
                                              `/api/admin/ai?providerId=${encodeURIComponent(provider.id)}`,
                                              { method: "DELETE" },
                                            ),
                                          "Provider deleted.",
                                          setAi,
                                        );
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {tab === "models" && (
              <div className="space-y-4">
                {can(role, "ai.write") && (
                  <Card className="space-y-3 p-5">
                    <SectionTitle icon={Plus} title="Add model" />
                    {!ai?.providers.length ? (
                      <p className="text-sm text-muted">Add a provider before adding a model.</p>
                    ) : (
                      <>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <select
                            aria-label="Model provider"
                            className={selectClass}
                            value={newModel.providerId}
                            onChange={(event) =>
                              setNewModel({ ...newModel, providerId: event.target.value })
                            }
                          >
                            <option value="">Select provider</option>
                            {ai.providers.map((provider) => (
                              <option key={provider.id} value={provider.id}>{provider.name}</option>
                            ))}
                          </select>
                          <Input
                            placeholder="Model name"
                            value={newModel.name}
                            onChange={(event) =>
                              setNewModel({ ...newModel, name: event.target.value })
                            }
                          />
                          <select
                            aria-label="Model capability"
                            className={selectClass}
                            value={newModel.capability}
                            onChange={(event) =>
                              setNewModel({ ...newModel, capability: event.target.value })
                            }
                          >
                            <option value="chat">Chat</option>
                            <option value="stt">Speech to text</option>
                            <option value="embedding">Embedding</option>
                          </select>
                        </div>
                        <Button
                          disabled={!newModel.providerId || !newModel.name.trim()}
                          onClick={() => {
                            void patchAi({ model: newModel }, "Model added.");
                            setNewModel({ providerId: "", name: "", capability: "chat" });
                          }}
                        >
                          Add model
                        </Button>
                      </>
                    )}
                  </Card>
                )}
                <Card className="p-5">
                  <SectionTitle
                    icon={Bot}
                    title="Model catalog"
                    description={
                      ai?.defaultModel
                        ? `Default model: ${ai.defaultModel}`
                        : "No default model selected."
                    }
                  />
                  {!ai?.models.length ? (
                    <Empty>No AI models configured yet.</Empty>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[780px] text-left text-sm">
                        <thead className="text-xs text-subtle">
                          <tr className="border-b border-[var(--border)]">
                            <th className="py-2 pr-3">Model</th>
                            <th className="py-2 pr-3">Provider</th>
                            <th className="py-2 pr-3">Capability</th>
                            <th className="py-2 pr-3">Status</th>
                            <th className="py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ai.models.map((model) => (
                            <tr key={model.id} className="border-b border-[var(--border)]/60">
                              <td className="py-3 pr-3">
                                <div className="flex items-center gap-2 font-medium">
                                  {model.name}
                                  {model.isDefault && <Badge variant="info">Default</Badge>}
                                </div>
                              </td>
                              <td className="py-3 pr-3">{model.providerName || providerName(model.providerId)}</td>
                              <td className="py-3 pr-3"><Badge>{model.capability}</Badge></td>
                              <td className="py-3 pr-3">
                                <Badge variant={model.enabled ? "success" : "warning"}>
                                  {model.enabled ? "Enabled" : "Disabled"}
                                </Badge>
                              </td>
                              <td className="py-3">
                                {can(role, "ai.write") && (
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() =>
                                        void patchAi(
                                          {
                                            model: {
                                              id: model.id,
                                              enabled: !model.enabled,
                                              providerId: model.providerId,
                                              name: model.name,
                                              capability: model.capability,
                                            },
                                          },
                                          `Model ${model.enabled ? "disabled" : "enabled"}.`,
                                        )
                                      }
                                    >
                                      {model.enabled ? "Disable" : "Enable"}
                                    </Button>
                                    {!model.isDefault && (
                                      <Button
                                        size="sm"
                                        onClick={() =>
                                          void patchAi(
                                            { setDefaultModelId: model.id },
                                            "Default model updated.",
                                          )
                                        }
                                      >
                                        Set default
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="danger"
                                      onClick={() => {
                                        if (!window.confirm(`Delete model “${model.name}”?`)) return;
                                        void mutate(
                                          `delete-${model.id}`,
                                          () =>
                                            api<AiCatalog>(
                                              `/api/admin/ai?modelId=${encodeURIComponent(model.id)}`,
                                              { method: "DELETE" },
                                            ),
                                          "Model deleted.",
                                          setAi,
                                        );
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {tab === "tokens" && (
              <div className="space-y-4">
                {busy === "usage-tokens" && !tokenUsage ? (
                  <Card><Empty>Loading token usage…</Empty></Card>
                ) : !tokenUsage || tokenUsage.period.eventCount === 0 ? (
                  <Card><Empty>No token usage has been recorded yet.</Empty></Card>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Metric icon={Cpu} label="Total tokens" value={tokenUsage.period.total.toLocaleString()} />
                      <Metric icon={Activity} label="Input tokens" value={tokenUsage.period.inputTokens.toLocaleString()} />
                      <Metric icon={Bot} label="Output tokens" value={tokenUsage.period.outputTokens.toLocaleString()} />
                      <Metric icon={ClipboardList} label="Events" value={tokenUsage.period.eventCount} />
                    </div>
                    <Card className="p-5">
                      <SectionTitle icon={BarChart3} title="Tokens over time" />
                      <UsageChart data={tokenUsage.period.overTime} empty="No token usage in this period." />
                    </Card>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <Card className="p-5">
                        <h3 className="font-semibold">By user</h3>
                        <AggregateList items={tokenUsage.period.byUser.map((item) => ({ label: item.userName, value: item.quantity }))} empty="No per-user token usage." />
                      </Card>
                      <Card className="p-5">
                        <h3 className="font-semibold">By provider and model</h3>
                        <AggregateList
                          items={[
                            ...tokenUsage.period.byProvider.map((item) => ({ label: item.provider, value: item.quantity })),
                            ...tokenUsage.period.byModel.map((item) => ({ label: item.model, value: item.quantity })),
                          ]}
                          empty="No provider or model breakdown."
                        />
                      </Card>
                    </div>
                    <RecentUsage
                      title="Recent token events"
                      rows={tokenUsage.recent.map((item) => ({
                        id: item.id,
                        primary: item.feature || "Token usage",
                        user: item.userName,
                        quantity: `${item.quantity.toLocaleString()} tokens`,
                        detail: [item.provider, item.model].filter(Boolean).join(" · "),
                        createdAt: item.createdAt,
                      }))}
                    />
                  </>
                )}
              </div>
            )}

            {tab === "meetings" && (
              <div className="space-y-4">
                {busy === "usage-meetings" && !meetingUsage ? (
                  <Card><Empty>Loading meeting minutes…</Empty></Card>
                ) : !meetingUsage || meetingUsage.period.eventCount === 0 ? (
                  <Card><Empty>No meeting minutes have been processed yet.</Empty></Card>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Metric icon={ClipboardList} label="Meetings processed" value={meetingUsage.period.meetingsProcessed} />
                      <Metric icon={Clock3} label="Total minutes" value={meetingUsage.period.totalMinutes} />
                      <Metric icon={Activity} label="Average minutes" value={meetingUsage.period.averageMinutes} />
                    </div>
                    <Card className="p-5">
                      <SectionTitle icon={BarChart3} title="Transcription minutes over time" />
                      <UsageChart data={meetingUsage.period.overTime} empty="No meeting minutes in this period." />
                    </Card>
                    <Card className="p-5">
                      <h3 className="font-semibold">Meeting minutes by user</h3>
                      <AggregateList items={meetingUsage.period.byUser.map((item) => ({ label: item.userName, value: item.quantity }))} empty="No per-user meeting minutes." />
                    </Card>
                    <RecentUsage
                      title="Recent processed meetings"
                      rows={meetingUsage.recent.map((item) => ({
                        id: item.id,
                        primary: item.label || "Meeting transcription",
                        user: item.userName,
                        quantity: `${item.minutes} minutes`,
                        detail: [item.provider, item.model].filter(Boolean).join(" · "),
                        createdAt: item.createdAt,
                      }))}
                    />
                  </>
                )}
              </div>
            )}

            {tab === "resume" && (
              <div className="space-y-4">
                {busy === "usage-resume" && !resumeUsage ? (
                  <Card><Empty>Loading resume rewrites…</Empty></Card>
                ) : !resumeUsage || resumeUsage.period.eventCount === 0 ? (
                  <Card><Empty>No resume rewrites have been recorded yet.</Empty></Card>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Metric icon={FilePenLine} label="Total rewrites" value={resumeUsage.period.totalRewrites} />
                      <Metric icon={ClipboardList} label="Operations" value={resumeUsage.period.operations} />
                    </div>
                    <Card className="p-5">
                      <SectionTitle icon={BarChart3} title="Resume rewrites over time" />
                      <UsageChart data={resumeUsage.period.overTime} empty="No resume rewrites in this period." />
                    </Card>
                    <Card className="p-5">
                      <h3 className="font-semibold">Resume rewrites by user</h3>
                      <AggregateList items={resumeUsage.period.byUser.map((item) => ({ label: item.userName, value: item.quantity }))} empty="No per-user resume rewrites." />
                    </Card>
                    <RecentUsage
                      title="Recent resume rewrites"
                      rows={resumeUsage.recent.map((item) => ({
                        id: item.id,
                        primary: "Resume rewrite",
                        user: item.userName,
                        quantity: `${item.rewrites} rewrites`,
                        detail: [item.status, item.provider, item.model].filter(Boolean).join(" · "),
                        createdAt: item.createdAt,
                      }))}
                    />
                  </>
                )}
              </div>
            )}

            {tab === "privacy" && settings && (
              <Card className="space-y-4 p-5">
                <SectionTitle icon={Lock} title="Privacy controls" />
                {(
                  [
                    ["shareTranscriptsWithTeam", "Share transcripts with the team"],
                    ["allowAiTrainingOptIn", "Allow users to opt in to AI training"],
                    ["redactPiiInExports", "Redact personal information in exports"],
                    ["requireInviteForJoin", "Require an invitation to join"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] p-3 text-sm">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.privacy[key])}
                      disabled={!can(role, "privacy.write")}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSettings({
                          ...settings,
                          privacy: { ...settings.privacy, [key]: checked },
                        });
                        void mutate(
                          `privacy-${key}`,
                          () =>
                            api<SettingsData>("/api/admin/settings", {
                              method: "PATCH",
                              body: JSON.stringify({ privacy: { [key]: checked } }),
                            }),
                          "Privacy setting saved.",
                          setSettings,
                        );
                      }}
                    />
                  </label>
                ))}
              </Card>
            )}

            {tab === "retention" && settings && (
              <Card className="space-y-4 p-5">
                <SectionTitle icon={Database} title="Data retention" />
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  Auto-delete is configuration-only unless a cleanup job is enabled. Saving these values alone does not delete stored data.
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["meetingDays", "Meeting data (days)"],
                      ["transcriptDays", "Transcripts (days)"],
                      ["notesDays", "Generated notes (days)"],
                      ["resumeDays", "Resume data (days)"],
                      ["knowledgeDays", "Knowledge base (days)"],
                    ] as const
                  ).map(([key, label]) => (
                    <Input
                      key={key}
                      label={label}
                      type="number"
                      min={1}
                      max={3650}
                      value={Number(settings.retention[key])}
                      disabled={!can(role, "retention.write")}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          retention: {
                            ...settings.retention,
                            [key]: Number(event.target.value),
                          },
                        })
                      }
                      onBlur={() =>
                        void mutate(
                          `retention-${key}`,
                          () =>
                            api<SettingsData>("/api/admin/settings", {
                              method: "PATCH",
                              body: JSON.stringify({
                                retention: { [key]: Number(settings.retention[key]) },
                              }),
                            }),
                          "Retention setting saved.",
                          setSettings,
                        )
                      }
                    />
                  ))}
                </div>
                <label className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] p-3 text-sm">
                  <span>Enable auto-delete configuration</span>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.retention.autoDeleteEnabled)}
                    disabled={!can(role, "retention.write")}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSettings({
                        ...settings,
                        retention: { ...settings.retention, autoDeleteEnabled: checked },
                      });
                      void mutate(
                        "retention-auto",
                        () =>
                          api<SettingsData>("/api/admin/settings", {
                            method: "PATCH",
                            body: JSON.stringify({
                              retention: { autoDeleteEnabled: checked },
                            }),
                          }),
                        "Auto-delete configuration saved.",
                        setSettings,
                      );
                    }}
                  />
                </label>
              </Card>
            )}

            {tab === "audit" && (
              <Card className="p-5">
                <SectionTitle icon={ScrollText} title="Activity log" />
                {!audit.length ? (
                  <Empty>No activity has been recorded yet.</Empty>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="text-xs text-subtle">
                        <tr className="border-b border-[var(--border)]">
                          <th className="py-2 pr-3">Time</th>
                          <th className="py-2 pr-3">Actor</th>
                          <th className="py-2 pr-3">Action</th>
                          <th className="py-2">Resource</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.map((event) => (
                          <tr key={event.id} className="border-b border-[var(--border)]/60">
                            <td className="py-3 pr-3 text-xs text-muted">{formatDate(event.createdAt)}</td>
                            <td className="py-3 pr-3">{event.actorName}</td>
                            <td className="py-3 pr-3">{event.action}</td>
                            <td className="py-3 text-muted">
                              {event.resourceType}
                              {event.resourceId ? ` · ${event.resourceId}` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {tab === "settings" && (
              <Card className="p-5">
                <CardHeader className="p-0">
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Administration
                  </CardTitle>
                  <CardDescription>
                    You are signed in as {session?.name || session?.email || "an administrator"} with the {role} role.
                  </CardDescription>
                </CardHeader>
                <div className="mt-4 flex flex-wrap gap-2">
                  {permissions[role as WorkspaceRole]?.map((permission) => (
                    <Badge key={permission}>{permission}</Badge>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </main>

      {confirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card role="dialog" aria-modal="true" className="w-full max-w-md space-y-4 p-5">
            <h2 className="font-display text-lg font-semibold">Deactivate user?</h2>
            <p className="text-sm text-muted">
              {confirmUser.email} will no longer be able to sign in. Historical usage and audit records are preserved.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmUser(null)}>Cancel</Button>
              <Button
                variant="danger"
                loading={busy === "deactivate-user"}
                onClick={() =>
                  void mutate(
                    "deactivate-user",
                    () =>
                      api(`/api/admin/users?userId=${encodeURIComponent(confirmUser.id)}`, {
                        method: "DELETE",
                      }),
                    "User deactivated.",
                    () => {
                      setUsers((current) =>
                        current.map((item) =>
                          item.id === confirmUser.id
                            ? { ...item, status: "Deactivated" }
                            : item,
                        ),
                      );
                      setConfirmUser(null);
                    },
                  )
                }
              >
                Deactivate
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function AggregateList({
  items,
  empty,
}: {
  items: Array<{ label: string; value: number }>;
  empty: string;
}) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="flex justify-between gap-4 py-2">
          <span className="truncate">{item.label}</span>
          <span className="text-muted">{item.value.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

function RecentUsage({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    id: string;
    primary: string;
    user: string;
    quantity: string;
    detail: string;
    createdAt: string;
  }>;
}) {
  return (
    <Card className="p-5">
      <h3 className="font-semibold">{title}</h3>
      {!rows.length ? (
        <Empty>No recent events.</Empty>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs text-subtle">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-3">Event</th>
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Usage</th>
                <th className="py-2 pr-3">Details</th>
                <th className="py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)]/60">
                  <td className="py-3 pr-3">{row.primary}</td>
                  <td className="py-3 pr-3">{row.user}</td>
                  <td className="py-3 pr-3">{row.quantity}</td>
                  <td className="py-3 pr-3 text-muted">{row.detail || "—"}</td>
                  <td className="py-3 text-xs text-muted">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function AdminPage() {
  return (
    <RequireAdmin>
      <AdminPortalInner />
    </RequireAdmin>
  );
}
