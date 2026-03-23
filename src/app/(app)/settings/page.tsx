"use client";

import { useEffect, useState } from "react";

interface IntegrationStatus {
  provider: string;
  connected: boolean;
  active: boolean;
  tokenExpired: boolean;
  lastSync: string | null;
  metadata: Record<string, unknown>;
}

interface UserProfile {
  id: string;
  display_name: string | null;
  job_title: string | null;
  role_description: string | null;
  company_name: string | null;
  company_description: string | null;
  team_structure: string | null;
  work_preferences: Record<string, unknown>;
}

interface FilterRuleData {
  id: string;
  rule_type: string;
  pattern: string;
  description: string | null;
  is_active: boolean;
  type: "filter";
}

interface ProcessingRuleData {
  id: string;
  match_type: string;
  match_value: string;
  priority_override: string | null;
  instruction_text: string | null;
  is_active: boolean;
  type: "processing";
  delegate_to_name: string | null;
}

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <IntegrationsSection />
      <ProfileSection />
      <RulesSection />
    </div>
  );
}

// ========== Integrations ==========

function IntegrationsSection() {
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [slackToken, setSlackToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetchStatuses();
  }, []);

  async function fetchStatuses() {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      setStatuses(data.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function connectSlack() {
    if (!slackToken.startsWith("xoxb-")) {
      alert("Token must start with xoxb-");
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch("/api/integrations/slack/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: slackToken }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setSlackToken("");
        fetchStatuses();
      } else {
        alert(data.error ?? "Failed to connect");
      }
    } catch {
      alert("Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect(provider: string) {
    if (!confirm(`Disconnect ${provider}?`)) return;
    try {
      await fetch(`/api/integrations/${provider}/disconnect`, { method: "POST" });
      fetchStatuses();
    } catch {
      alert("Failed to disconnect");
    }
  }

  if (loading) return <SectionSkeleton title="Integrations" />;

  const gmail = statuses.find((s) => s.provider === "gmail");
  const slack = statuses.find((s) => s.provider === "slack");

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">Integrations</h2>
      <div className="space-y-3">
        {/* Gmail */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Gmail</h3>
              <p className="text-sm text-slate-400">
                {gmail?.connected
                  ? `Connected${gmail.lastSync ? ` \u00b7 Last sync: ${new Date(gmail.lastSync).toLocaleString()}` : ""}`
                  : "Not connected"}
              </p>
            </div>
            {gmail?.connected ? (
              <button
                onClick={() => disconnect("gmail")}
                className="rounded-lg bg-red-500/10 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20"
              >
                Disconnect
              </button>
            ) : (
              <a
                href="/api/integrations/gmail/connect"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Connect
              </a>
            )}
          </div>
        </div>

        {/* Slack */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Slack</h3>
              <p className="text-sm text-slate-400">
                {slack?.connected
                  ? `Connected to ${(slack.metadata?.team_name as string) ?? "workspace"}${slack.lastSync ? ` \u00b7 Last sync: ${new Date(slack.lastSync).toLocaleString()}` : ""}`
                  : "Not connected"}
              </p>
            </div>
            {slack?.connected ? (
              <button
                onClick={() => disconnect("slack")}
                className="rounded-lg bg-red-500/10 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20"
              >
                Disconnect
              </button>
            ) : null}
          </div>
          {!slack?.connected && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="xoxb-..."
                value={slackToken}
                onChange={(e) => setSlackToken(e.target.value)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={connectSlack}
                disabled={connecting || !slackToken}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {connecting ? "..." : "Connect"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ========== Profile ==========

function ProfileSection() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    display_name: "",
    job_title: "",
    role_description: "",
    company_name: "",
    company_description: "",
    team_structure: "",
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/user-context");
        const data = await res.json();
        if (data.data) {
          setProfile(data.data);
          setForm({
            display_name: data.data.display_name ?? "",
            job_title: data.data.job_title ?? "",
            role_description: data.data.role_description ?? "",
            company_name: data.data.company_name ?? "",
            company_description: data.data.company_description ?? "",
            team_structure: data.data.team_structure ?? "",
          });
        }
      } catch {
        // ignore
      }
    }
    load();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/user-context", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setProfile(data.data);
      setEditing(false);
    } catch {
      alert("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Profile Context</h2>
        <button
          onClick={() => (editing ? save() : setEditing(true))}
          disabled={saving}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : editing ? "Save" : "Edit"}
        </button>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        This context is injected into every AI prompt to personalize suggestions.
      </p>
      <div className="space-y-3">
        <ProfileField label="Display Name" field="display_name" form={form} setForm={setForm} editing={editing} />
        <ProfileField label="Job Title" field="job_title" form={form} setForm={setForm} editing={editing} />
        <ProfileField label="Role Description" field="role_description" form={form} setForm={setForm} editing={editing} textarea />
        <ProfileField label="Company Name" field="company_name" form={form} setForm={setForm} editing={editing} />
        <ProfileField label="Company Description" field="company_description" form={form} setForm={setForm} editing={editing} textarea />
        <ProfileField label="Team Structure" field="team_structure" form={form} setForm={setForm} editing={editing} textarea />
      </div>
    </section>
  );
}

type ProfileForm = {
  display_name: string;
  job_title: string;
  role_description: string;
  company_name: string;
  company_description: string;
  team_structure: string;
};

function ProfileField({
  label,
  field,
  form,
  setForm,
  editing,
  textarea,
}: {
  label: string;
  field: keyof ProfileForm;
  form: ProfileForm;
  setForm: (f: ProfileForm) => void;
  editing: boolean;
  textarea?: boolean;
}) {
  const value = form[field] ?? "";

  if (!editing) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
        <label className="text-xs font-medium text-slate-500">{label}</label>
        <p className="mt-1 text-sm text-slate-300">{value || "—"}</p>
      </div>
    );
  }

  const className =
    "mt-1 block w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none";

  return (
    <div>
      <label className="text-xs font-medium text-slate-500">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => setForm({ ...form, [field]: e.target.value })}
          rows={3}
          className={className}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => setForm({ ...form, [field]: e.target.value })}
          className={className}
        />
      )}
    </div>
  );
}

// ========== Rules ==========

function RulesSection() {
  const [filterRules, setFilterRules] = useState<FilterRuleData[]>([]);
  const [processingRules, setProcessingRules] = useState<ProcessingRuleData[]>([]);
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [newFilter, setNewFilter] = useState({ rule_type: "exclude_domain", pattern: "", description: "" });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchRules();
  }, []);

  async function fetchRules() {
    try {
      const res = await fetch("/api/rules");
      const data = await res.json();
      setFilterRules(data.data?.filter_rules ?? []);
      setProcessingRules(data.data?.processing_rules ?? []);
    } catch {
      // ignore
    }
  }

  async function addFilterRule() {
    setAdding(true);
    try {
      await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "filter", ...newFilter }),
      });
      setNewFilter({ rule_type: "exclude_domain", pattern: "", description: "" });
      setShowAddFilter(false);
      fetchRules();
    } catch {
      alert("Failed to add rule");
    } finally {
      setAdding(false);
    }
  }

  async function deleteRule(id: string, type: string) {
    if (!confirm("Delete this rule?")) return;
    try {
      await fetch(`/api/rules/${id}?type=${type}`, { method: "DELETE" });
      fetchRules();
    } catch {
      alert("Failed to delete");
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Filter Rules</h2>
        <button
          onClick={() => setShowAddFilter(!showAddFilter)}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
        >
          {showAddFilter ? "Cancel" : "+ Add Rule"}
        </button>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Messages matching these rules are skipped before AI processing (saves tokens).
      </p>

      {/* Add form */}
      {showAddFilter && (
        <div className="mb-4 space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-4">
          <select
            value={newFilter.rule_type}
            onChange={(e) => setNewFilter({ ...newFilter, rule_type: e.target.value })}
            className="block w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          >
            <option value="exclude_domain">Exclude Domain</option>
            <option value="exclude_address">Exclude Email Address</option>
            <option value="exclude_channel">Exclude Slack Channel</option>
          </select>
          <input
            type="text"
            placeholder={newFilter.rule_type === "exclude_domain" ? "example.com" : newFilter.rule_type === "exclude_channel" ? "C01ABC123" : "noreply@example.com"}
            value={newFilter.pattern}
            onChange={(e) => setNewFilter({ ...newFilter, pattern: e.target.value })}
            className="block w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newFilter.description}
            onChange={(e) => setNewFilter({ ...newFilter, description: e.target.value })}
            className="block w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500"
          />
          <button
            onClick={addFilterRule}
            disabled={adding || !newFilter.pattern}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add Rule"}
          </button>
        </div>
      )}

      {/* Existing rules */}
      <div className="space-y-2">
        {filterRules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 p-3"
          >
            <div>
              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-300">
                {rule.rule_type.replace("exclude_", "")}
              </span>
              <span className="ml-2 text-sm text-white">{rule.pattern}</span>
              {rule.description && (
                <span className="ml-2 text-sm text-slate-500">— {rule.description}</span>
              )}
            </div>
            <button
              onClick={() => deleteRule(rule.id, "filter")}
              className="text-sm text-red-400 hover:text-red-300"
            >
              Delete
            </button>
          </div>
        ))}
        {filterRules.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">No filter rules yet</p>
        )}
      </div>

      {/* Processing rules */}
      {processingRules.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-base font-semibold">Processing Rules</h3>
          <div className="space-y-2">
            {processingRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 p-3"
              >
                <div>
                  <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-300">
                    {rule.match_type}
                  </span>
                  <span className="ml-2 text-sm text-white">{rule.match_value}</span>
                  {rule.priority_override && (
                    <span className="ml-2 text-sm text-yellow-400">
                      Priority: {rule.priority_override}
                    </span>
                  )}
                  {rule.instruction_text && (
                    <span className="ml-2 text-sm text-slate-400">
                      {rule.instruction_text}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => deleteRule(rule.id, "processing")}
                  className="text-sm text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="animate-pulse rounded-lg bg-slate-900 p-8" />
    </section>
  );
}
