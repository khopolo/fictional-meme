import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  Upload,
  ScanText,
  Database,
  LayoutTemplate,
  Layers,
  PenLine,
  BriefcaseBusiness,
  ClipboardCheck,
  GitCompareArrows,
  Files,
  FolderKanban,
  Settings,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Sparkles,
  FileText,
  MoreHorizontal,
  Check,
  Clock,
  Download,
  X,
  Menu,
  ShieldCheck,
  HelpCircle,
  LogOut,
  Trash2,
  RefreshCw,
  Send,
  CheckCircle2,
  FileSpreadsheet,
  Image,
  Folder,
  Command,
  Info,
} from "lucide-react";
import "./style.css";
const nav = [
  [
    "Workspace",
    [
      ["Dashboard", LayoutDashboard],
      ["Upload Documents", Upload],
      ["AI Document Reader", ScanText],
      ["Data Library", Database],
      ["Templates", LayoutTemplate],
      ["Bulk Generator", Layers],
    ],
  ],
  [
    "Tools & automation",
    [
      ["My Signatures", PenLine],
      ["Business Automation", BriefcaseBusiness],
      ["Tender Assistant", ClipboardCheck],
      ["Document Comparison", GitCompareArrows],
    ],
  ],
  [
    "Manage",
    [
      ["Generated Documents", Files],
      ["Projects", FolderKanban],
      ["Settings", Settings],
    ],
  ],
];
let token = "";
async function api(url, opts = {}) {
  const r = await fetch("/api" + url, {
    ...opts,
    headers: {
      ...(opts.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...opts.headers,
    },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(e.error);
  }
  return r.json();
}
async function download(url, name) {
  const r = await fetch("/api" + url, {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
  if (!r.ok) throw new Error("Download failed");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await r.blob());
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
const post = (url, data) =>
  api(url, { method: "POST", body: JSON.stringify(data) });
const fmt = (n) => new Intl.NumberFormat().format(n);
const size = (n) =>
  n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";
function App() {
  const [page, setPage] = useState("Dashboard"),
    [state, setState] = useState({}),
    [config, setConfig] = useState(null),
    [session, setSession] = useState(null),
    [auth, setAuth] = useState(null),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [search, setSearch] = useState(""),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false);
  const input = useRef();
  const [recovering, setRecovering] = useState(false);
  const userId = useRef(null);
  const notify = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 4500);
  };
  async function refresh() {
    try {
      const requestedToken = token;
      const next = await api("/state");
      if (requestedToken === token) setState(next);
    } catch (e) {
      notify(e.message);
    }
  }
  useEffect(() => {
    let alive = true,
      subscription;
    api("/config")
      .then((c) => {
        if (!alive) return;
        setConfig(c);
        if (c.local) {
          refresh();
          return;
        }
        const a = createClient(c.supabaseUrl, c.supabaseKey);
        setAuth(a);
        const accept = (session) => {
          if (!alive) return;
          const nextId = session?.user?.id || null;
          if (userId.current !== nextId) {
            setState({});
            setPage("Dashboard");
            setSearch("");
            setModal(null);
            userId.current = nextId;
          }
          token = session?.access_token || "";
          setSession(session);
          if (token) queueMicrotask(refresh);
        };
        a.auth.getSession().then(({ data, error }) => {
          if (error) notify(error.message);
          accept(data.session);
        });
        subscription = a.auth.onAuthStateChange((event, session) => {
          if (event === "PASSWORD_RECOVERY") setRecovering(true);
          if (event === "SIGNED_OUT") setRecovering(false);
          accept(session);
        }).data.subscription;
      })
      .catch((e) => notify(e.message));
    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!config || (!config.local && !session)) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [config, session]);
  const go = (p) => {
    setPage(p);
    setSearch("");
    setMobile(false);
  };
  const data = (k) => state[k] || [];
  const docs = data("documents");
  const filtered = docs.filter((d) =>
    (d.name + " " + (d.text || ""))
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function upload(files) {
    if (!files?.length) return;
    await run(async () => {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const r = await api("/upload", { method: "POST", body: form });
      notify(
        `${r.filter((x) => !x.duplicate).length} uploaded · ${r.filter((x) => x.duplicate).length} duplicates skipped`,
      );
      go("Upload Documents");
    });
  }
  async function save(kind, values) {
    return run(async () => {
      await post("/items/" + kind, values);
      notify("Saved successfully");
      setModal(null);
    });
  }
  const remove = (item) => {
    setModal({
      title: "Delete " + item.name + "?",
      content: (
        <>
          <p>
            This permanently deletes this item. Deleting a source document also
            removes its extracted dataset.
          </p>
          <button
            className="danger"
            onClick={() =>
              run(async () => {
                await api("/items/" + item.id, { method: "DELETE" });
                setModal(null);
              })
            }
          >
            Delete permanently
          </button>
        </>
      ),
    });
  };
  function newProject() {
    setModal({
      title: "Create a project",
      content: (
        <Form
          fields={["Project name", "Description"]}
          onSubmit={(v) =>
            save("projects", {
              name: v["Project name"],
              description: v.Description,
            })
          }
        />
      ),
    });
  }
  function starter(name) {
    save("templates", {
      name,
      fields: [
        { name: "TITLE", x: 20, y: 25, size: 30, default: name },
        { name: "FULL_NAME", x: 30, y: 50, size: 28 },
        { name: "DATE", x: 35, y: 65, size: 14 },
        { name: "SIGNATURE", x: 65, y: 80, size: 18 },
      ],
    });
  }
  if (!config)
    return (
      <div className="loading">
        <Layers /> Loading your workspace…
      </div>
    );
  if (["/checkout/success", "/checkout/cancel"].includes(window.location.pathname)) {
    const success = window.location.pathname === "/checkout/success";
    return (
      <main className="checkout-result">
        <div className={success ? "checkout-mark success" : "checkout-mark cancelled"}>
          {success ? <Clock size={27} /> : <X size={27} />}
        </div>
        <div className="eyebrow">DOCUFLOW AI BILLING</div>
        <h1>{success ? "Payment confirmation is pending" : "Checkout was cancelled"}</h1>
        <p>
          {success
            ? "PayFast is confirming your payment. Your subscription will activate after we verify its secure notification. This return page alone does not confirm payment."
            : "No subscription has been activated. If you completed payment in another window, allow time for PayFast to notify us before trying again."}
        </p>
        <button className="primary" onClick={() => window.location.assign("/")}>
          Return to DocuFlow
        </button>
      </main>
    );
  }
  if (recovering && auth)
    return (
      <PasswordRecovery auth={auth} complete={() => setRecovering(false)} />
    );
  if (!config.local && !session) return <Auth auth={auth} notify={notify} />;
  return (
    <div className="app">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a className="brand" onClick={() => go("Dashboard")}>
          <span className="brandmark">
            <Layers size={23} />
          </span>
          <span>
            docuflow<span className="ai">AI</span>
          </span>
        </a>
        <div className="workspace-switch">
          <div className="workspace-avatar">D</div>
          <div>
            <b>My workspace</b>
            <small>Personal workspace</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav>
          {nav.map(([section, items]) => (
            <div className="nav-group" key={section}>
              <div className="nav-label">{section}</div>
              {items.map(([label, Icon]) => (
                <button
                  key={label}
                  className={page === label ? "nav-item active" : "nav-item"}
                  onClick={() => go(label)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {label === "AI Document Reader" && (
                    <span className="tiny-ai">AI</span>
                  )}
                  {label === "Dashboard" && page === label && (
                    <span className="active-dot" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="plan">
            <div>
              <Sparkles size={16} />
              <b>{config.local ? "Local workspace" : "Connected workspace"}</b>
            </div>
            <p>Your documents. Your possibilities.</p>
            <button onClick={() => go("Settings")}>
              Workspace settings <ArrowUpRight size={14} />
            </button>
          </div>
          <button className="user" onClick={() => go("Settings")}>
            <div className="avatar">
              {session?.user?.email?.[0]?.toUpperCase() || "Y"}
            </div>
            <div>
              <b>{session?.user?.email || "Your workspace"}</b>
              <small>
                {config.local ? "Local development mode" : "Personal account"}
              </small>
            </div>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-btn"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{page}</b>
          </div>
          <div className="header-right">
            <button
              className="header-search"
              onClick={() =>
                setModal({
                  title: "Search your documents",
                  content: (
                    <SearchPanel
                      docs={docs}
                      open={(d) => {
                        setModal(null);
                        go("AI Document Reader");
                        setSearch(d.name);
                      }}
                    />
                  ),
                })
              }
            >
              <Search size={16} />
              <span>Search anything...</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-btn"
              aria-label="Activity"
              onClick={() =>
                setModal({
                  title: "Workspace activity",
                  content: <Activity items={data("audit")} />,
                })
              }
            >
              <Bell size={19} />
              <span className="notification-dot" />
            </button>
            <div className="header-divider" />
            <div className="avatar small">Y</div>
          </div>
        </header>
        <div className="content">
          <input
            ref={input}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg"
            hidden
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = "";
            }}
          />
          {page === "Dashboard" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR DOCUMENT WORKSPACE</div>
                  <h1>
                    Less paperwork. More possibilities
                    <span className="purple">.</span>
                  </h1>
                  <p>
                    Turn your documents into insights, and your insights into
                    action.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => input.current.click()}
                >
                  <Plus size={17} /> Upload documents
                </button>
              </div>
              <section className="hero">
                <div className="hero-copy">
                  <div className="hero-badge">
                    <Sparkles size={13} /> YOUR WORK, SIMPLIFIED
                  </div>
                  <h2>
                    Big ideas.
                    <br />
                    Less busywork.
                  </h2>
                  <p>
                    Upload. Understand. Automate.
                    <br />
                    Give your documents a smarter way to work.
                  </p>
                  <button onClick={() => go("Bulk Generator")}>
                    Create your first workflow <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-art">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="art-chip chip-extract">
                    <span className="mint">
                      <ScanText size={17} />
                    </span>
                    <div>
                      <b>Information extracted</b>
                      <small>Ready for your next step</small>
                    </div>
                    <CheckCircle2 size={16} className="green" />
                  </div>
                  <div className="paper paper-back" />
                  <div className="paper paper-front">
                    <div className="paper-top">
                      <div className="paper-logo">
                        <Layers size={20} />
                      </div>
                      <span>
                        DOCUMENT
                        <br />
                        <b>INTELLIGENCE</b>
                      </span>
                      <MoreHorizontal size={17} />
                    </div>
                    <div className="paper-line wide" />
                    <div className="paper-line" />
                    <div className="paper-highlight">
                      <span />
                      <span />
                      <Check size={13} />
                    </div>
                    <div className="paper-line wide" />
                    <div className="paper-line short" />
                    <div className="paper-stamp">
                      <Sparkles size={20} />
                    </div>
                    <div className="paper-footer">
                      <span />
                      <span />
                    </div>
                  </div>
                  <div className="art-chip chip-ready">
                    <span className="lavender">
                      <Files size={18} />
                    </span>
                    <div>
                      <b>One upload. Endless possibilities.</b>
                      <small>Built around your documents</small>
                    </div>
                  </div>
                  <div className="sparkle s1">✦</div>
                  <div className="sparkle s2">✧</div>
                </div>
              </section>
              <div className="stats">
                {[
                  [
                    FileText,
                    "Uploaded documents",
                    docs.length,
                    "Your source of truth",
                    "purple",
                  ],
                  [
                    CheckCircle2,
                    "Documents processed",
                    docs.filter((d) => d.status === "Ready").length,
                    "Ready to put to work",
                    "green",
                  ],
                  [
                    Layers,
                    "Documents generated",
                    data("generated").length,
                    "Made with DocuFlow",
                    "blue",
                  ],
                  [
                    Folder,
                    "Active projects",
                    data("projects").length,
                    "Everything in its place",
                    "orange",
                  ],
                ].map(([Icon, label, value, sub, color]) => (
                  <div className="stat" key={label}>
                    <div className={"stat-icon " + color}>
                      <Icon size={20} />
                    </div>
                    <span>{label}</span>
                    <strong>{fmt(value)}</strong>
                    <small>{sub}</small>
                  </div>
                ))}
              </div>
              <div className="section-title">
                <h2>What would you like to do?</h2>
                <span>A little less manual. A lot more done.</span>
              </div>
              <div className="quick-grid">
                {[
                  [
                    Upload,
                    "Upload documents",
                    "Bring your files together.",
                    "Upload Documents",
                    "purple",
                  ],
                  [
                    Layers,
                    "Generate in bulk",
                    "One template. Hundreds of documents.",
                    "Bulk Generator",
                    "blue",
                  ],
                  [
                    ClipboardCheck,
                    "Analyse a tender",
                    "Know what’s needed. Be prepared.",
                    "Tender Assistant",
                    "orange",
                  ],
                  [
                    Sparkles,
                    "Ask your AI assistant",
                    "From a question to a clear next step.",
                    "assistant",
                    "green",
                  ],
                ].map(([Icon, title, sub, p, color]) => (
                  <button
                    className="quick-card"
                    key={title}
                    onClick={() =>
                      p === "assistant"
                        ? setModal({
                            title: "AI command centre",
                            content: <Assistant />,
                          })
                        : go(p)
                    }
                  >
                    <span className={"quick-icon " + color}>
                      <Icon size={20} />
                    </span>
                    <h3>
                      {title}
                      <ArrowUpRight size={16} />
                    </h3>
                    <p>{sub}</p>
                  </button>
                ))}
              </div>
              <div className="dashboard-bottom">
                <section className="panel recent">
                  <div className="panel-heading">
                    <h2>
                      Recent documents{" "}
                      <span className="count">{docs.length}</span>
                    </h2>
                    <button
                      className="text-btn"
                      onClick={() => go("Upload Documents")}
                    >
                      View all <ArrowRight size={14} />
                    </button>
                  </div>
                  <DocumentTable
                    docs={docs.slice(-4).reverse()}
                    open={(d) => {
                      go("AI Document Reader");
                      setSearch(d.name);
                    }}
                    download={(d) =>
                      run(() => download("/files/" + d.id, d.name))
                    }
                  />
                  {!docs.length && (
                    <div className="empty-recent">
                      <div className="empty-icon">
                        <FileText size={25} />
                      </div>
                      <b>A fresh start for your documents</b>
                      <p>Upload your first file. We’ll take it from there.</p>
                      <button
                        className="text-btn"
                        onClick={() => input.current.click()}
                      >
                        Upload a document <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                </section>
                <section className="panel activity">
                  <div className="panel-heading">
                    <h2>Workspace activity</h2>
                    <span className="live-dot" />
                  </div>
                  <Activity items={data("audit").slice(-3).reverse()} />
                  <div className="privacy-note">
                    <ShieldCheck size={20} />
                    <div>
                      <b>A workspace you can trust</b>
                      <p>
                        Your files stay in your workspace.
                        <br />
                        You’re always in control.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
              <div className="footer">
                <span>
                  <ShieldCheck size={13} /> Thoughtfully built for your everyday
                  work.
                </span>
                <span>
                  DocuFlow AI <i /> Upload. Understand. Automate.
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR DOCUMENT WORKSPACE</div>
                  <h1>{page}</h1>
                  <p>{descriptions[page]}</p>
                </div>
                {page === "Projects" ? (
                  <button className="primary" onClick={newProject}>
                    <Plus size={16} /> New project
                  </button>
                ) : page === "Templates" ? (
                  <button
                    className="primary"
                    onClick={() =>
                      setModal({
                        title: "Create a template",
                        content: (
                          <TemplateForm
                            docs={docs}
                            onSave={(v) => save("templates", v)}
                          />
                        ),
                      })
                    }
                  >
                    <Plus size={16} /> New template
                  </button>
                ) : page === "My Signatures" ? (
                  <button
                    className="primary"
                    onClick={() =>
                      setModal({
                        title: "Save your signature",
                        content: (
                          <SignatureForm
                            onSave={(v) => save("signatures", v)}
                          />
                        ),
                      })
                    }
                  >
                    <Plus size={16} /> Add signature
                  </button>
                ) : null}
              </div>
              {page === "Upload Documents" && (
                <>
                  <div
                    className={"dropzone " + (busy ? "busy" : "")}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      upload(e.dataTransfer.files);
                    }}
                  >
                    <div className="upload-icon">
                      <Upload size={30} />
                    </div>
                    <h2>
                      {busy
                        ? "Uploading your documents…"
                        : "A smarter workflow starts here"}
                    </h2>
                    <p>
                      Drag and drop your documents, or choose files to get
                      started.
                    </p>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => input.current.click()}
                    >
                      Browse files <Plus size={17} />
                    </button>
                    <small>
                      PDF, DOCX, XLSX, XLS, CSV, TXT, PNG, JPG · Up to 25 MB per
                      file
                    </small>
                  </div>
                  <div className="toolbar">
                    <h2>
                      Document library{" "}
                      <span className="count">{docs.length}</span>
                    </h2>
                    <SearchInput value={search} onChange={setSearch} />
                  </div>
                  <section className="panel">
                    <DocumentTable
                      docs={filtered}
                      open={(d) => {
                        go("AI Document Reader");
                        setSearch(d.name);
                      }}
                      download={(d) =>
                        run(() => download("/files/" + d.id, d.name))
                      }
                      remove={remove}
                    />
                  </section>
                </>
              )}
              {page === "AI Document Reader" && (
                <>
                  <SearchInput value={search} onChange={setSearch} />
                  <div className="reader-grid">
                    {filtered.length ? (
                      filtered.map((d) => (
                        <section className="panel reading" key={d.id}>
                          <div className="panel-heading">
                            <h2>
                              <FileText size={18} /> {d.name}
                            </h2>
                            <Badge status={d.status} />
                          </div>
                          <DocumentReader
                            document={d}
                            config={config}
                            run={run}
                            notify={notify}
                            go={go}
                          />
                          <div className="panel-actions">
                            <small>
                              Original document content · Review before reuse
                            </small>
                            <button
                              className="text-btn"
                              onClick={() =>
                                run(() => download("/files/" + d.id, d.name))
                              }
                            >
                              Download original <Download size={15} />
                            </button>
                          </div>
                        </section>
                      ))
                    ) : (
                      <Empty
                        icon={ScanText}
                        title="Your documents, understood"
                        text="Upload a document to read its extracted text and tables."
                        action={() => input.current.click()}
                      />
                    )}
                  </div>
                </>
              )}
              {page === "Data Library" && (
                <DataLibrary
                  datasets={data("datasets")}
                  save={save}
                  run={run}
                  remove={remove}
                  openSource={(id) => {
                    const source = docs.find((d) => d.id === id);
                    go("AI Document Reader");
                    setSearch(source?.name || "");
                  }}
                />
              )}
              {page === "Templates" && (
                <>
                  <div className="info-strip">
                    <Info size={18} /> PDF templates preserve your original
                    design. Place dynamic fields using page percentages.
                  </div>
                  <div className="cards">
                    {data("templates").map((t) => (
                      <section className="panel template-card" key={t.id}>
                        <div className="template-preview">
                          <div className="mini-certificate">
                            <span>✧</span>
                            <b>{t.name}</b>
                            <div />
                            <em>{"{{FULL_NAME}}"}</em>
                            <div />
                          </div>
                        </div>
                        <div className="card-content">
                          <h3>{t.name}</h3>
                          <p>
                            {t.fields.length} dynamic fields ·{" "}
                            {t.documentId ? "Original PDF" : "Blank canvas"}
                          </p>
                          <div className="card-actions">
                            <button
                              onClick={() =>
                                setModal({
                                  title: "Edit template",
                                  content: (
                                    <TemplateForm
                                      docs={docs}
                                      initial={t}
                                      onSave={(v) => save("templates", v)}
                                    />
                                  ),
                                })
                              }
                            >
                              Edit template <ArrowRight size={14} />
                            </button>
                            <button
                              className="icon-btn"
                              aria-label="Delete template"
                              onClick={() => remove(t)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </section>
                    ))}
                    <button
                      className="add-card"
                      onClick={() => starter("Certificate of Appreciation")}
                    >
                      <Plus size={26} />
                      <h3>Start with a certificate</h3>
                      <p>Create a reusable certificate template</p>
                    </button>
                  </div>
                </>
              )}
              {page === "Bulk Generator" && (
                <Generator state={state} run={run} notify={notify} go={go} />
              )}
              {page === "My Signatures" && (
                <>
                  <div className="info-strip">
                    <ShieldCheck size={18} /> Saved signatures require explicit
                    authorisation for every batch. These are signature images,
                    not cryptographic digital signatures.
                  </div>
                  <div className="cards">
                    {data("signatures").map((s) => (
                      <section className="panel signature-card" key={s.id}>
                        <img src={s.image} alt={s.name} />
                        <div className="card-content">
                          <div className="row-actions">
                            <h3>{s.name}</h3>
                            {s.default && <span className="badge success">Default</span>}
                          </div>
                          <small>
                            Saved {new Date(s.createdAt).toLocaleDateString()}
                          </small>
                          <div className="row-actions">
                            {!s.default && (
                              <button
                                onClick={() => save("signatures", { ...s, default: true })}
                              >
                                Make default
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setModal({
                                  title: "Edit signature",
                                  content: (
                                    <SignatureForm
                                      initial={s}
                                      onSave={(v) => save("signatures", { ...s, ...v })}
                                    />
                                  ),
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              className="icon-btn"
                              aria-label="Delete signature"
                              onClick={() => remove(s)}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                  {!data("signatures").length && (
                    <Empty
                      icon={PenLine}
                      title="Your signature. Your permission."
                      text="Draw or upload a signature to use in your documents."
                      action={() =>
                        setModal({
                          title: "Save your signature",
                          content: (
                            <SignatureForm
                              onSave={(v) => save("signatures", v)}
                            />
                          ),
                        })
                      }
                    />
                  )}
                </>
              )}
              {page === "Projects" && (
                <>
                  <div className="cards">
                    {data("projects").map((p) => (
                      <section className="panel project-card" key={p.id}>
                        <div className="quick-icon purple">
                          <Folder size={24} />
                        </div>
                        <h2>{p.name}</h2>
                        <p>{p.description || "No description yet"}</p>
                        <small>
                          Created {new Date(p.createdAt).toLocaleDateString()}
                        </small>
                        <div className="card-actions">
                          <button
                            onClick={() =>
                              setModal({
                                title: p.name,
                                content: (
                                  <Form
                                    fields={["Project name", "Description"]}
                                    initial={{
                                      "Project name": p.name,
                                      Description: p.description,
                                    }}
                                    onSubmit={(v) =>
                                      save("projects", {
                                        ...p,
                                        name: v["Project name"],
                                        description: v.Description,
                                      })
                                    }
                                  />
                                ),
                              })
                            }
                          >
                            Edit project
                          </button>
                          <button
                            className="icon-btn"
                            aria-label="Delete project"
                            onClick={() => remove(p)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </section>
                    ))}
                  </div>
                  {!data("projects").length && (
                    <Empty
                      icon={FolderKanban}
                      title="A place for every project"
                      text="Organise your next tender, onboarding process, or certificate batch."
                      action={newProject}
                    />
                  )}
                </>
              )}
              {page === "Generated Documents" && (
                <>
                  <div className="job-list">
                    {data("jobs")
                      .slice()
                      .reverse()
                      .map((j) => (
                        <section className="panel job" key={j.id}>
                          <div>
                            <h3>{j.name}</h3>
                            <p>
                              {j.completed} successful · {j.failed} failed ·{" "}
                              {j.total} total
                            </p>
                            <progress
                              value={j.completed + j.failed}
                              max={j.total}
                            />
                            {j.errors?.map((e) => (
                              <small className="error" key={e.record}>
                                Record {e.record}: {e.error}
                              </small>
                            ))}
                          </div>
                          <Badge status={j.status} />
                          <button
                            onClick={() =>
                              run(() =>
                                download(
                                  "/jobs/" + j.id + "/zip",
                                  "documents.zip",
                                ),
                              )
                            }
                          >
                            <Download size={16} /> Download ZIP
                          </button>
                        </section>
                      ))}
                  </div>
                  <section className="panel">
                    <DocumentTable
                      docs={data("generated")}
                      download={(d) =>
                        run(() => download("/files/" + d.id, d.name))
                      }
                      remove={remove}
                    />
                  </section>
                  {!data("generated").length && (
                    <Empty
                      icon={Files}
                      title="Ready when you are"
                      text="Your generated documents and download packages will appear here."
                      action={() => go("Bulk Generator")}
                    />
                  )}
                </>
              )}
              {page === "Business Automation" && (
                <section className="panel form-panel">
                  <h2>Your company, in one place</h2>
                  <p>
                    Save verified information to reuse across your business
                    documents.
                  </p>
                  <Form
                    fields={[
                      "Registered company name",
                      "Registration number",
                      "Business address",
                      "Email",
                      "Phone",
                      "Directors",
                      "Business description",
                      "Tax number",
                      "CSD number",
                    ]}
                    initial={data("business")[0] || {}}
                    onSubmit={(v) =>
                      save("business", { ...data("business")[0], ...v })
                    }
                  />
                </section>
              )}
              {page === "Tender Assistant" && (
                <Tender
                  docs={docs}
                  tenders={data("tenders")}
                  run={run}
                  save={save}
                />
              )}
              {page === "Document Comparison" && (
                <Comparison
                  docs={docs}
                  comparisons={data("comparisons")}
                  run={run}
                />
              )}
              {page === "Settings" && (
                <section className="panel form-panel">
                  <h2>Workspace & integrations</h2>
                  {auth && <AccountProfile auth={auth} session={session} />}
                  <div className="settings-row">
                    <div>
                      <b>Authentication</b>
                      <p>
                        {config.local
                          ? "Local development workspace. Anyone with access to this preview shares its data."
                          : "Supabase authentication connected."}
                      </p>
                    </div>
                    <Badge status={config.local ? "Local mode" : "Connected"} />
                  </div>
                  <div className="settings-row">
                    <div>
                      <b>AI provider</b>
                      <p>
                        Configure AI_API_KEY on the server to enable the command
                        centre.
                      </p>
                    </div>
                    <Badge
                      status={config.ai ? "Connected" : "Not configured"}
                    />
                  </div>
                  <div className="settings-row">
                    <div>
                      <b>Storage & billing</b>
                      <p>
                        {config.persistence === "supabase"
                          ? "Records are stored in Supabase PostgreSQL. Files and signatures use private Supabase buckets."
                          : "Files and records are stored on this local development server."}{" "}
                        Subscription enforcement and PayFast payments remain
                        unconfigured.
                      </p>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div>
                      <b>Usage</b>
                      <p>
                        {docs.length} documents ·{" "}
                        {size(docs.reduce((a, d) => a + d.size, 0))} stored ·{" "}
                        {data("generated").length} generated
                      </p>
                    </div>
                  </div>
                  <div className="info-strip">
                    Local limits: 25 MB per file, 10 uploads at once, 1,000
                    records per batch.
                  </div>
                  {auth && (
                    <button onClick={() => auth.auth.signOut()}>
                      <LogOut size={16} /> Sign out
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setModal({
                        title: "Privacy & terms",
                        content: (
                          <>
                            <h3>Application owner</h3>
                            <p>
                              This application was created by Zephyr Consulting
                              Pty Ltd, 2026 / 772679 / 07.
                            </p>
                            <h3>Your data</h3>
                            <p>
                              Document content is stored in this workspace. AI
                              requests are sent to the configured provider only
                              when you use the assistant. Do not upload
                              sensitive information to a shared development
                              preview.
                            </p>
                            <h3>Control and retention</h3>
                            <p>
                              Delete documents from the library. Source deletion
                              also removes its extracted dataset; generated
                              documents and audit records are retained
                              separately. Production retention, privacy contact,
                              provider agreements and legal terms must be
                              configured before launch.
                            </p>
                            <h3>Review outputs</h3>
                            <p>
                              Review extracted information, tender requirements
                              and generated documents. Signature images do not
                              provide cryptographic verification.
                            </p>
                          </>
                        ),
                      })
                    }
                  >
                    Privacy & terms <ArrowUpRight size={14} />
                  </button>
                </section>
              )}
            </>
          )}
        </div>
        <button
          className="assistant-fab"
          onClick={() =>
            setModal({ title: "AI command centre", content: <Assistant /> })
          }
        >
          <Sparkles size={19} />
          <span>Ask DocuFlow</span>
        </button>
      </main>
      {toast && (
        <div className="toast">
          <Info size={18} />
          {toast}
          <button className="icon-btn" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-heading">
              <h2>{modal.title}</h2>
              <button
                className="icon-btn"
                aria-label="Close"
                onClick={() => setModal(null)}
              >
                <X size={20} />
              </button>
            </div>
            {modal.content}
          </section>
        </div>
      )}
    </div>
  );
}
const descriptions = {
  "Upload Documents": "Your files, organised and ready to work.",
  "AI Document Reader":
    "Read source content and discover the information inside.",
  "Data Library": "Review, refine, and reuse your extracted information.",
  Templates: "A great document starts with a great template.",
  "Bulk Generator": "Personalised documents. At a whole new scale.",
  "My Signatures": "A personal touch, always under your control.",
  "Business Automation": "Your verified company information, ready to reuse.",
  "Tender Assistant": "Know the requirements before you make your next move.",
  "Document Comparison": "See exactly what changed between your documents.",
  "Generated Documents": "Your finished work, all in one place.",
  Projects: "Keep your next big thing beautifully organised.",
  Settings: "Make this workspace work for you.",
};
function Badge({ status }) {
  return (
    <span
      className={
        "badge " +
        (/Ready|Completed|Connected/.test(status)
          ? "success"
          : /Failed|errors/.test(status)
            ? "failed"
            : "neutral")
      }
    >
      <span />
      {status || "Generated"}
    </span>
  );
}
function DocumentTable({ docs, open, download, remove }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Document name</th>
            <th>Type</th>
            <th>Status</th>
            <th>Added</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td>
                <button
                  className="file-link"
                  onClick={() => (open ? open(d) : download(d))}
                >
                  <span
                    className={
                      "file-icon " + (/xls|csv/.test(d.ext) ? "excel" : "")
                    }
                  >
                    {/xls|csv/.test(d.ext) ? (
                      <FileSpreadsheet size={19} />
                    ) : (
                      <FileText size={19} />
                    )}
                  </span>
                  <span>
                    <b>{d.name}</b>
                    <small>{size(d.size || 0)}</small>
                  </span>
                </button>
              </td>
              <td>
                <span className="file-type">
                  {d.ext?.toUpperCase() || "PDF"}
                </span>
              </td>
              <td>
                <Badge status={d.status || "Ready"} />
              </td>
              <td className="muted">
                {new Date(d.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </td>
              <td>
                <div className="row-actions">
                  <button
                    className="icon-btn"
                    aria-label={"Download " + d.name}
                    onClick={() => download(d)}
                  >
                    <Download size={16} />
                  </button>
                  {remove && (
                    <button
                      className="icon-btn"
                      aria-label={"Delete " + d.name}
                      onClick={() => remove(d)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Activity({ items }) {
  return (
    <div className="activities">
      {items.length ? (
        items.map((a) => (
          <div className="activity-item" key={a.id}>
            <span className="activity-icon">
              <Check size={14} />
            </span>
            <div>
              <b>{a.action}</b>
              <p>
                {typeof a.details === "string"
                  ? a.details
                  : "Authorised workspace action"}
              </p>
              <small>{new Date(a.createdAt).toLocaleString()}</small>
            </div>
          </div>
        ))
      ) : (
        <div className="activity-item">
          <span className="activity-icon">
            <Sparkles size={15} />
          </span>
          <div>
            <b>Your next chapter starts here</b>
            <p>Upload a file to get things flowing.</p>
            <small>Welcome to DocuFlow</small>
          </div>
        </div>
      )}
    </div>
  );
}
function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={29} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <button className="primary" onClick={action}>
          Get started <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
function SearchInput({ value, onChange, placeholder = "Search documents…" }) {
  return (
    <label className="search-input">
      <Search size={17} />
      <input
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function SearchPanel({ docs, open }) {
  const [q, setQ] = useState("");
  return (
    <>
      <SearchInput value={q} onChange={setQ} />
      {docs
        .filter((d) =>
          (d.name + " " + d.text).toLowerCase().includes(q.toLowerCase()),
        )
        .map((d) => (
          <button className="search-result" key={d.id} onClick={() => open(d)}>
            <FileText size={18} />
            {d.name}
            <ArrowRight size={16} />
          </button>
        ))}
      {!docs.length && <p>No documents uploaded yet.</p>}
    </>
  );
}
function Form({ fields, initial = {}, onSubmit }) {
  const [v, setV] = useState(initial);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      {fields.map((f, i) => (
        <label key={f}>
          {f}
          <input
            required={i === 0}
            value={v[f] || ""}
            onChange={(e) => setV({ ...v, [f]: e.target.value })}
            placeholder={f}
          />
        </label>
      ))}
      <button className="primary" type="submit">
        <Check size={16} /> Save changes
      </button>
    </form>
  );
}
function DocumentReader({ document: doc, config, run, notify, go }) {
  const [tab, setTab] = useState("source"),
    [loading, setLoading] = useState(false),
    [fields, setFields] = useState([]),
    [approved, setApproved] = useState(false),
    [query, setQuery] = useState("");
  useEffect(() => {
    setFields((doc.extraction?.fields || []).map((f) => ({ ...f })));
    setApproved(false);
  }, [doc.extraction?.id]);
  const change = (index, property, value) => {
    setApproved(false);
    setFields((current) =>
      current.map((f, i) => (i === index ? { ...f, [property]: value } : f)),
    );
  };
  const extract = (mode) =>
    run(async () => {
      setLoading(true);
      try {
        const result = await post("/documents/" + doc.id + "/extract", {
          mode,
        });
        setFields(result.fields);
        setApproved(false);
        setTab("fields");
        notify(
          result.fields.length
            ? `${result.fields.length} fields found. Review the source evidence before saving.`
            : "No supported fields found. You can add verified values manually.",
        );
      } finally {
        setLoading(false);
      }
    });
  if (doc.status === "Failed")
    return (
      <div className="reading-body">
        <p className="error">{doc.error}</p>
        <button
          onClick={() => run(() => post("/documents/" + doc.id + "/retry", {}))}
        >
          <RefreshCw size={15} /> Retry processing
        </button>
      </div>
    );
  if (doc.status !== "Ready")
    return (
      <div className="reading-body">
        <p>Processing your document… Scanned pages may take a moment.</p>
      </div>
    );
  return (
    <div className="reading-body">
      <div className="reader-toolbar">
        <div className="reader-tabs">
          <button
            className={tab === "source" ? "selected" : ""}
            onClick={() => setTab("source")}
          >
            Source text
          </button>
          <button
            className={tab === "fields" ? "selected" : ""}
            onClick={() => setTab("fields")}
          >
            Extracted fields{" "}
            <span className="count">{doc.extraction?.fields.length || 0}</span>
          </button>
        </div>
        <div className="row-actions">
          <button
            disabled={loading || doc.processing?.method === "spreadsheet"}
            onClick={() => extract("labelled")}
          >
            <ScanText size={15} />
            {loading ? "Extracting…" : "Extract labelled fields"}
          </button>
          <button
            className="primary"
            disabled={
              loading || !config.ai || doc.processing?.method === "spreadsheet"
            }
            title={
              !config.ai
                ? "An AI provider must be configured to use this option"
                : undefined
            }
            onClick={() => extract("ai")}
          >
            <Sparkles size={15} /> AI extraction
          </button>
        </div>
      </div>
      <div className="reader-processing">
        <span>
          {doc.processing?.method === "pdf-with-ocr"
            ? `PDF · ${doc.processing.ocrPages} scanned page${doc.processing.ocrPages === 1 ? "" : "s"} read with OCR`
            : doc.processing?.method === "ocr"
              ? "Image read with OCR"
              : doc.processing?.method === "spreadsheet"
                ? "Spreadsheet · sheet and row locations retained"
                : "Extracted source text"}
        </span>
        {doc.processing?.pages && (
          <span>
            {doc.processing.pages} page{doc.processing.pages === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {doc.processing?.method === "spreadsheet" && (
        <div className="info-strip">
          <Database size={17} />
          <div>
            Structured records are already saved with their sheet and row
            locations.{" "}
            <button className="text-btn" onClick={() => go("Data Library")}>
              Open Data Library <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}
      {tab === "source" ? (
        <div className="source-segments">
          {doc.segments?.length ? (
            doc.segments.map((segment, i) => (
              <div className="source-line" key={segment.id + "-" + i}>
                <small>
                  {segment.sheet
                    ? `${segment.sheet} · Row ${segment.row}`
                    : segment.page
                      ? `Page ${segment.page} · Line ${segment.line}`
                      : `Line ${segment.line}`}
                  {segment.method === "ocr" ? " · OCR" : ""}
                </small>
                <p>{segment.text}</p>
              </div>
            ))
          ) : (
            <pre>{doc.text || "No readable source text."}</pre>
          )}
        </div>
      ) : (
        <>
          <div className="info-strip">
            <Info size={16} />
            <div>
              {doc.extraction?.mode === "ai"
                ? "AI suggestions are checked against quoted source text. Confidence is a model estimate."
                : "Labelled-field extraction copies explicit values from source text; it does not infer missing information."}{" "}
              OCR confidence describes recognition quality and does not verify
              the facts. Review every field before reuse.
            </div>
          </div>
          {!!doc.extraction?.rejectedCount && (
            <p className="error">
              {doc.extraction.rejectedCount} unsupported AI suggestions were
              rejected because the evidence did not match.
            </p>
          )}
          {!doc.extraction ? (
            <p>Choose an extraction method to start reviewing fields.</p>
          ) : (
            <>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search fields…"
              />
              <div className="extraction-table table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Value</th>
                      <th>Source evidence</th>
                      <th>Review</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {fields
                      .map((f, index) => ({ f, index }))
                      .filter(({ f }) =>
                        (f.name + " " + f.value)
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map(({ f, index }) => (
                        <tr key={f.id || "manual-" + index}>
                          <td>
                            <input
                              aria-label={`Field ${index + 1} name`}
                              value={f.name}
                              maxLength={80}
                              onChange={(e) =>
                                change(
                                  index,
                                  "name",
                                  e.target.value
                                    .toUpperCase()
                                    .replace(/[^A-Z0-9_]/g, "_"),
                                )
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              aria-label={`Field ${index + 1} value`}
                              value={f.value}
                              onChange={(e) =>
                                change(index, "value", e.target.value)
                              }
                            />
                          </td>
                          <td className="evidence-cell">
                            <small>
                              {f.source?.page
                                ? `Page ${f.source.page} · Line ${f.source.line}`
                                : f.source?.sheet
                                  ? `${f.source.sheet} · Row ${f.source.row}`
                                  : f.source
                                    ? `Line ${f.source.line}`
                                    : "Added manually"}
                            </small>
                            <blockquote>
                              {f.source?.quote ||
                                "No source quote. Verify your entered value."}
                            </blockquote>
                          </td>
                          <td>
                            <span className="badge neutral">
                              Review required
                            </span>
                            {f.confidence != null && (
                              <small>
                                AI estimate: {Math.round(f.confidence * 100)}%
                              </small>
                            )}
                            {f.ocrConfidence != null && (
                              <small
                                className={f.ocrConfidence < 0.8 ? "error" : ""}
                              >
                                OCR: {Math.round(f.ocrConfidence * 100)}%
                              </small>
                            )}
                          </td>
                          <td>
                            <button
                              className="icon-btn"
                              aria-label={`Remove field ${index + 1}`}
                              onClick={() => {
                                setFields(fields.filter((_, i) => i !== index));
                                setApproved(false);
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!fields.length && (
                <p className="muted">
                  No supported fields are available. Add only values you can
                  verify from your document.
                </p>
              )}
              <button
                onClick={() => {
                  setFields([
                    ...fields,
                    {
                      name: "CUSTOM_FIELD",
                      value: "",
                      method: "manual",
                      source: null,
                    },
                  ]);
                  setApproved(false);
                }}
              >
                <Plus size={15} /> Add field
              </button>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />{" "}
                I reviewed these values and their source evidence and approve
                reuse in documents.
              </label>
              <button
                className="primary"
                disabled={!approved || !fields.length || loading}
                onClick={() =>
                  run(async () => {
                    await post("/documents/" + doc.id + "/review", {
                      extractionId: doc.extraction.id,
                      approved,
                      fields: fields.map(({ id, name, value }) => ({
                        id,
                        name,
                        value,
                      })),
                    });
                    notify("Reviewed dataset saved to your Data Library");
                    go("Data Library");
                  })
                }
              >
                <Database size={16} /> Save reviewed dataset
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
function DataLibrary({ datasets, save, run, openSource }) {
  const [selected, setSelected] = useState(""),
    [edited, setEdited] = useState(null),
    [query, setQuery] = useState("");
  const d = datasets.find((d) => d.id === selected) || datasets[0];
  useEffect(() => {
    setEdited(null);
    setQuery("");
  }, [d?.id]);
  if (!d)
    return (
      <Empty
        icon={Database}
        title="Good data. Great documents."
        text="Upload a spreadsheet or review extracted document fields to create a reusable dataset."
      />
    );
  const rows = edited || d.records,
    allColumns = [
      ...new Set([
        ...(d.columns || Object.keys(d.records[0] || {})),
        ...rows.flatMap((r) => Object.keys(r)),
      ]),
    ],
    cols = allColumns.filter((c) => !c.startsWith("_"));
  const visible = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      Object.values(row).some((v) =>
        String(v).toLowerCase().includes(query.toLowerCase()),
      ),
    );
  return (
    <>
      <div className="toolbar">
        <select
          aria-label="Select dataset"
          value={d.id}
          onChange={(e) => setSelected(e.target.value)}
        >
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <div className="row-actions">
          <button
            onClick={() =>
              run(() =>
                download("/datasets/" + d.id + "/export", "dataset.xlsx"),
              )
            }
          >
            <Download size={16} /> Excel
          </button>
          <button
            onClick={() =>
              run(() =>
                download(
                  "/datasets/" + d.id + "/export?format=csv",
                  "dataset.csv",
                ),
              )
            }
          >
            <Download size={16} /> CSV
          </button>
          <button
            className="primary"
            disabled={!edited}
            onClick={async () => {
              if (await save("datasets", { ...d, records: rows }))
                setEdited(null);
            }}
          >
            Save edits
          </button>
        </div>
      </div>
      <div className="toolbar">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search records…"
        />
        {!d.fieldProvenance && (
          <button
            onClick={() =>
              setEdited([...rows, Object.fromEntries(cols.map((c) => [c, ""]))])
            }
          >
            <Plus size={15} /> Add record
          </button>
        )}
      </div>
      <div className="panel table-scroll data-table">
        <table>
          <thead>
            <tr>
              <th>Record</th>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
              <th>Source</th>
              {!d.fieldProvenance && <th />}
            </tr>
          </thead>
          <tbody>
            {visible.map(({ row, index }) => (
              <tr key={index}>
                <td>{index + 1}</td>
                {cols.map((c) => (
                  <td key={c}>
                    <input
                      aria-label={`${c} row ${index + 1}`}
                      readOnly={c.startsWith("_")}
                      value={row[c] ?? ""}
                      onChange={(e) =>
                        setEdited(
                          rows.map((r, j) =>
                            j === index ? { ...r, [c]: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </td>
                ))}
                <td>
                  {row._source_sheet ? (
                    `${row._source_sheet} · Row ${row._source_row || "—"}`
                  ) : row._source_document ? (
                    <button
                      className="text-btn"
                      onClick={() => openSource(row._source_document)}
                    >
                      View source <ArrowUpRight size={13} />
                    </button>
                  ) : (
                    "Manual entry"
                  )}
                </td>
                {!d.fieldProvenance && (
                  <td>
                    <button
                      className="icon-btn"
                      aria-label={`Delete row ${index + 1}`}
                      onClick={() =>
                        setEdited(rows.filter((_, j) => j !== index))
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        {visible.length} of {rows.length} records · Source locations retained
        where available · Exports use saved values
      </p>
      {d.fieldProvenance && (
        <section className="panel form-panel provenance-panel">
          <h2>Reviewed source evidence</h2>
          <p>
            Original evidence stays linked when you correct a value. Manual
            additions are identified separately.
          </p>
          {d.fieldProvenance.map((p) => (
            <div className="requirement" key={p.name}>
              <div>
                <b>{p.name}</b>
                <p>{p.source?.quote || "Added manually by the reviewer"}</p>
                <small>
                  {p.source?.page
                    ? `Page ${p.source.page} · Line ${p.source.line}`
                    : p.source?.sheet
                      ? `${p.source.sheet} · Row ${p.source.row}`
                      : p.source
                        ? `Line ${p.source.line}`
                        : "Manual entry"}
                </small>
              </div>
              <span className="badge neutral">
                {p.corrected
                  ? "Corrected by user"
                  : p.method === "manual"
                    ? "Manual value"
                    : "Reviewed source value"}
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
function TemplateForm({ docs, initial, onSave }) {
  const [t, setT] = useState(
    initial || {
      name: "",
      documentId: "",
      fields: [{ name: "FULL_NAME", x: 30, y: 50, size: 24, page: 0 }],
    },
  );
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(t);
      }}
    >
      <label>
        Template name
        <input
          required
          value={t.name}
          onChange={(e) => setT({ ...t, name: e.target.value })}
        />
      </label>
      <label>
        Background PDF
        <select
          value={t.documentId}
          onChange={(e) => setT({ ...t, documentId: e.target.value })}
        >
          <option value="">Blank landscape page</option>
          {docs
            .filter((d) => d.ext === "pdf" && d.status === "Ready")
            .map((d) => (
              <option value={d.id} key={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </label>
      <div className="position-preview">
        {t.fields.map((f, i) => (
          <span key={i} style={{ left: f.x + "%", top: f.y + "%" }}>
            {"{{" + f.name + "}}"}
          </span>
        ))}
      </div>
      <small>
        Positions are percentages from top-left. Page numbers begin at 0.
      </small>
      {t.fields.map((f, i) => (
        <div className="field-row" key={i}>
          {[
            ["name", "Field"],
            ["x", "X %"],
            ["y", "Y %"],
            ["size", "Size"],
            ["page", "Page"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required
                value={f[key] ?? 0}
                type={key === "name" ? "text" : "number"}
                min={key === "size" ? 6 : 0}
                max={["x", "y"].includes(key) ? 95 : undefined}
                onChange={(e) =>
                  setT({
                    ...t,
                    fields: t.fields.map((v, j) =>
                      i === j ? { ...v, [key]: e.target.value } : v,
                    ),
                  })
                }
              />
            </label>
          ))}
          <button
            type="button"
            className="icon-btn"
            onClick={() =>
              setT({ ...t, fields: t.fields.filter((_, j) => j !== i) })
            }
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setT({
            ...t,
            fields: [
              ...t.fields,
              { name: "CUSTOM_FIELD", x: 20, y: 60, size: 18, page: 0 },
            ],
          })
        }
      >
        <Plus size={16} /> Add field
      </button>
      <button className="primary">Save template</button>
    </form>
  );
}
function SignatureForm({ onSave, initial }) {
  const canvas = useRef(),
    drawing = useRef(false);
  const [name, setName] = useState(initial?.name || "My signature");
  const [defaultSignature, setDefaultSignature] = useState(Boolean(initial?.default));
  const [printName, setPrintName] = useState(initial?.printName !== false);
  const [printDate, setPrintDate] = useState(Boolean(initial?.printDate));
  const [opacity, setOpacity] = useState(Number(initial?.opacity) || 0.9);
  const [rotation, setRotation] = useState(Number(initial?.rotation) || 0);
  const [scale, setScale] = useState(Number(initial?.scale) || 1);
  const [width, setWidth] = useState(Number(initial?.width) || 120);
  const [height, setHeight] = useState(Number(initial?.height) || 40);
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [source, setSource] = useState(initial?.image || "");
  const [error, setError] = useState("");
  const touched = useRef(Boolean(initial?.image));
  function point(e) {
    const c = canvas.current,
      r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * c.width) / r.width,
      ((e.clientY - r.top) * c.height) / r.height,
    ];
  }
  useEffect(() => {
    if (!canvas.current || !source) return;
    const img = new window.Image();
    img.onload = () => {
      const ctx = canvas.current.getContext("2d");
      ctx.clearRect(0, 0, 700, 220);
      const cropX = Number(crop.x) || 0;
      const cropY = Number(crop.y) || 0;
      const cropWidth = Number(crop.width) > 0 ? Number(crop.width) : img.width;
      const cropHeight = Number(crop.height) > 0 ? Number(crop.height) : img.height;
      ctx.drawImage(
        img,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        700,
        220,
      );
      touched.current = true;
    };
    img.src = source;
  }, [source, crop]);
  return (
    <div className="form">
      <label>
        Signature name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <canvas
        className="signature-canvas"
        width="700"
        height="220"
        ref={canvas}
        onPointerDown={(e) => {
          drawing.current = true;
          touched.current = true;
          e.target.setPointerCapture(e.pointerId);
          const ctx = canvas.current.getContext("2d");
          ctx.beginPath();
          ctx.moveTo(...point(e));
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvas.current.getContext("2d");
          ctx.strokeStyle = "#1c2440";
          ctx.lineWidth = 2.5;
          ctx.lineCap = "round";
          ctx.lineTo(...point(e));
          ctx.stroke();
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      <small>Draw with your mouse, stylus, or finger.</small>
      <div className="row-actions">
        <button
          onClick={() => {
            canvas.current.getContext("2d").clearRect(0, 0, 700, 220);
            setSource("");
            touched.current = false;
          }}
        >
          Clear
        </button>
        <label className="button">
          Upload image
          <input
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => {
              const file = e.target.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = String(reader.result || "");
                const img = new window.Image();
                img.onload = () => {
                  const ctx = canvas.current.getContext("2d");
                  ctx.clearRect(0, 0, 700, 220);
                  ctx.drawImage(img, 0, 0, 700, 220);
                  setCrop({ x: 0, y: 0, width: img.width, height: img.height });
                  setSource(dataUrl);
                  touched.current = true;
                };
                img.src = dataUrl;
              };
              reader.readAsDataURL(file);
            }}
          />
        </label>
      </div>
      <div className="form-grid">
        <label>
          Crop left
          <input
            type="number"
            min="0"
            value={crop.x}
            onChange={(e) => setCrop({ ...crop, x: Number(e.target.value) || 0 })}
          />
        </label>
        <label>
          Crop top
          <input
            type="number"
            min="0"
            value={crop.y}
            onChange={(e) => setCrop({ ...crop, y: Number(e.target.value) || 0 })}
          />
        </label>
        <label>
          Crop width
          <input
            type="number"
            min="1"
            value={crop.width || ""}
            onChange={(e) => setCrop({ ...crop, width: Number(e.target.value) || 0 })}
          />
        </label>
        <label>
          Crop height
          <input
            type="number"
            min="1"
            value={crop.height || ""}
            onChange={(e) => setCrop({ ...crop, height: Number(e.target.value) || 0 })}
          />
        </label>
      </div>
      <div className="form-grid">
        <label>
          Width
          <input
            type="number"
            min="40"
            max="300"
            step="10"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value) || 120)}
          />
        </label>
        <label>
          Height
          <input
            type="number"
            min="20"
            max="200"
            step="10"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value) || 40)}
          />
        </label>
        <label>
          Opacity
          <input
            type="number"
            min="0.1"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value) || 0.9)}
          />
        </label>
        <label>
          Rotation (°)
          <input
            type="number"
            min="-180"
            max="180"
            step="5"
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value) || 0)}
          />
        </label>
        <label>
          Scale
          <input
            type="number"
            min="0.5"
            max="2"
            step="0.1"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value) || 1)}
          />
        </label>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={printName}
          onChange={(e) => setPrintName(e.target.checked)}
        />
        Print signature name on the document
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={printDate}
          onChange={(e) => setPrintDate(e.target.checked)}
        />
        Print authorisation date on the document
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={defaultSignature}
          onChange={(e) => setDefaultSignature(e.target.checked)}
        />
        Use as my default signature for new batches
      </label>
      {error && <p className="error">{error}</p>}
      <button
        className="primary"
        onClick={() => {
          if (!touched.current || !name.trim())
            return setError("Add a signature and its name.");
          if (!canvas.current) return setError("Signature canvas is not ready.");
          onSave({
            name,
            image: canvas.current.toDataURL("image/png"),
            default: defaultSignature,
            printName,
            printDate,
            opacity,
            rotation,
            scale,
            width,
            height,
          });
        }}
      >
        Save signature
      </button>
    </div>
  );
}
function Generator({ state, run, notify, go }) {
  const [d, setD] = useState(""),
    [t, setT] = useState(""),
    [m, setM] = useState({}),
    [sig, setSig] = useState(""),
    [approved, setApproved] = useState(false),
    [sign, setSign] = useState(false),
    [preview, setPreview] = useState("");
  const datasets = state.datasets || [],
    templates = state.templates || [],
    template = templates.find((x) => x.id === t);
  useEffect(() => {
    setApproved(false);
    setM({});
    setPreview("");
    if (d && t)
      post("/mappings", { datasetId: d, templateId: t })
        .then(setM)
        .catch((e) => notify(e.message));
  }, [d, t]);
  useEffect(() => {
    if (sig || !(state.signatures || []).length) return;
    const defaultSignature = (state.signatures || []).find((item) => item.default);
    if (defaultSignature) setSig(defaultSignature.id);
  }, [sig, state.signatures]);
  const cols = Object.keys(
    datasets.find((x) => x.id === d)?.records[0] || {},
  ).filter((c) => !c.startsWith("_"));
  return (
    <div className="generator-layout">
      <section className="panel form-panel">
        <div className="step-label">
          <span>1</span> Choose your source & template
        </div>
        <div className="form">
          <label>
            Source dataset
            <select value={d} onChange={(e) => setD(e.target.value)}>
              <option value="">Select a dataset</option>
              {datasets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.records.length} records
                </option>
              ))}
            </select>
          </label>
          <label>
            Destination template
            <select value={t} onChange={(e) => setT(e.target.value)}>
              <option value="">Select a template</option>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="step-label">
          <span>2</span> Review your field mappings
        </div>
        {template?.fields
          .filter((f) => f.name !== "SIGNATURE")
          .map((f) => (
            <label className="mapping-row" key={f.name}>
              <b>{"{{" + f.name + "}}"}</b>
              <ArrowRight size={17} />
              <input
                list="columns"
                value={m[f.name] || ""}
                placeholder={
                  f.default ? "Default: " + f.default : "Choose a source column"
                }
                onChange={(e) => {
                  setM({ ...m, [f.name]: e.target.value });
                  setApproved(false);
                }}
              />
            </label>
          ))}
        <datalist id="columns">
          {cols.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </datalist>
        <p className="muted">
          Combine columns with “ + ”, for example First Name + Surname.
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
          />{" "}
          I have reviewed and approve these mappings.
        </label>
        <div className="step-label">
          <span>3</span> Add a signature & authorise
        </div>
        <select
          value={sig}
          onChange={(e) => {
            setSig(e.target.value);
            setSign(false);
          }}
        >
          <option value="">No signature</option>
          {(state.signatures || []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        {sig && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={sign}
              onChange={(e) => setSign(e.target.checked)}
            />{" "}
            I authorise this signature on every document in this batch.
          </label>
        )}
        <div className="generator-actions">
          <button
            disabled={!d || !t}
            onClick={() =>
              run(async () => {
                const r = await fetch("/api/preview", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: "Bearer " + token } : {}),
                  },
                  body: JSON.stringify({
                    datasetId: d,
                    templateId: t,
                    mappings: m,
                    signatureId: sig,
                    authorised: sign,
                  }),
                });
                if (!r.ok) throw new Error((await r.json()).error);
                if (preview) URL.revokeObjectURL(preview);
                setPreview(URL.createObjectURL(await r.blob()));
              })
            }
          >
            <FileText size={16} /> Preview sample
          </button>
          <button
            className="primary"
            disabled={!d || !t || !approved || (sig && !sign)}
            onClick={() =>
              run(async () => {
                await post("/generate", {
                  datasetId: d,
                  templateId: t,
                  mappings: m,
                  signatureId: sig,
                  authorised: sign,
                  approved,
                });
                notify("Generation started");
                go("Generated Documents");
              })
            }
          >
            <Sparkles size={16} /> Generate documents
          </button>
        </div>
      </section>
      <section className="panel sample">
        {preview ? (
          <iframe title="Sample document" src={preview} />
        ) : (
          <Empty
            icon={FileText}
            title="Make it yours"
            text="Choose your data and template, then preview a personalised document."
          />
        )}
      </section>
    </div>
  );
}
function Tender({ docs, tenders, run, save }) {
  const [id, setId] = useState("");
  return (
    <>
      <section className="panel form-panel">
        <h2>Start with your tender document</h2>
        <p>
          Extract requirement sentences from source text for manual review. No
          compliance status is assumed.
        </p>
        <div className="toolbar">
          <select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Select a processed document</option>
            {docs
              .filter((d) => d.status === "Ready")
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
          <button
            className="primary"
            disabled={!id}
            onClick={() => run(() => post("/tender", { documentId: id }))}
          >
            <ScanText size={16} /> Extract requirements
          </button>
        </div>
      </section>
      {tenders.map((t) => (
        <section className="panel form-panel" key={t.id}>
          <h2>{t.name}</h2>
          {t.requirements.length ? (
            t.requirements.map((r, i) => (
              <div className="requirement" key={r.id}>
                <p>{r.text}</p>
                <select
                  value={r.status}
                  onChange={(e) =>
                    save("tenders", {
                      ...t,
                      requirements: t.requirements.map((x, j) =>
                        j === i ? { ...x, status: e.target.value } : x,
                      ),
                    })
                  }
                >
                  {[
                    "Manual review",
                    "Available",
                    "Missing",
                    "Expired",
                    "Needs update",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            ))
          ) : (
            <p>
              No requirement sentences detected. Review the original document
              manually.
            </p>
          )}
        </section>
      ))}
    </>
  );
}
function Comparison({ docs, comparisons, run }) {
  const [a, setA] = useState(""),
    [b, setB] = useState("");
  return (
    <>
      <section className="panel form-panel">
        <h2>Find the differences</h2>
        <p>A deterministic comparison of extracted source text.</p>
        <div className="toolbar">
          {[
            [a, setA, "Original document"],
            [b, setB, "Revised document"],
          ].map(([v, fn, label]) => (
            <select key={label} value={v} onChange={(e) => fn(e.target.value)}>
              <option value="">{label}</option>
              {docs
                .filter((d) => d.status === "Ready")
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          ))}
          <button
            className="primary"
            disabled={!a || !b || a === b}
            onClick={() => run(() => post("/compare", { a, b }))}
          >
            Compare documents
          </button>
        </div>
      </section>
      {comparisons
        .slice()
        .reverse()
        .map((c) => (
          <section className="panel form-panel" key={c.id}>
            <h3>{c.name}</h3>
            <div className="diff-legend">
              <span>+ Added</span>
              <span>− Removed</span>
            </div>
            {c.changes.map((p, i) => (
              <pre className={"diff " + p.type} key={i}>
                {p.text}
              </pre>
            ))}
          </section>
        ))}
    </>
  );
}
function Assistant() {
  const [msg, setMsg] = useState(""),
    [history, setHistory] = useState([]),
    [busy, setBusy] = useState(false);
  return (
    <div className="assistant">
      <div className="assistant-intro">
        <span className="quick-icon purple">
          <Sparkles size={25} />
        </span>
        <h3>What can we take off your plate?</h3>
        <p>
          Ask about your documents, explore requirements, or plan your next
          workflow.
        </p>
      </div>
      {history.map((m, i) => (
        <div key={i} className={"chat " + m.role}>
          {m.text}
        </div>
      ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!msg.trim()) return;
          setBusy(true);
          setHistory((h) => [...h, { role: "user", text: msg }]);
          setMsg("");
          try {
            const r = await post("/assistant", { message: msg });
            setHistory((h) => [...h, { role: "bot", text: r.message }]);
          } catch (e) {
            setHistory((h) => [...h, { role: "bot", text: e.message }]);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Ask about your documents…"
        />
        <button className="primary" aria-label="Send message" disabled={busy}>
          <Send size={17} />
        </button>
      </form>
      <small>Review AI suggestions. Actions require your approval.</small>
    </div>
  );
}
function Auth({ auth }) {
  const [mode, setMode] = useState("login");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Layers size={32} /> docuflow AI
      </div>
      <section className="panel form-panel">
        <h1>
          {mode === "login"
            ? "Welcome back"
            : mode === "register"
              ? "Create your workspace"
              : "Reset your password"}
        </h1>
        <p>Upload. Understand. Automate.</p>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setStatus("");
            const values = new FormData(e.target);
            const credentials = {
              email: values.get("email"),
              password: values.get("password"),
            };
            const r =
              mode === "login"
                ? await auth.auth.signInWithPassword(credentials)
                : mode === "register"
                  ? await auth.auth.signUp({
                      ...credentials,
                      options: { emailRedirectTo: window.location.origin },
                    })
                  : await auth.auth.resetPasswordForEmail(credentials.email, {
                      redirectTo: window.location.origin,
                    });
            setPending(false);
            setStatus(
              r.error?.message ||
                (mode === "login"
                  ? "Signed in"
                  : "Check your email for the next step."),
            );
          }}
        >
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          {mode !== "reset" && (
            <label>
              Password
              <input name="password" type="password" minLength="10" required />
            </label>
          )}
          {status && <p role="status">{status}</p>}
          <button className="primary" disabled={pending || !auth}>
            {mode === "login"
              ? "Sign in"
              : mode === "register"
                ? "Create account"
                : "Send reset email"}
          </button>
        </form>
        <button
          className="text-btn"
          onClick={() => setMode(mode === "register" ? "login" : "register")}
        >
          {mode === "register"
            ? "Already have an account? Sign in"
            : "Create an account"}
        </button>
        <button className="text-btn" onClick={() => setMode("reset")}>
          Forgot password?
        </button>
      </section>
    </div>
  );
}
function PasswordRecovery({ auth, complete }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <section className="panel form-panel">
        <h1>Choose a new password</h1>
        <p>Use at least 10 characters.</p>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.target);
            if (form.get("password") !== form.get("confirm"))
              return setMessage("Passwords do not match");
            setBusy(true);
            try {
              const { error } = await auth.auth.updateUser({
                password: form.get("password"),
              });
              if (error) throw error;
              window.history.replaceState({}, "", window.location.pathname);
              complete();
            } catch (e) {
              setMessage(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            New password
            <input
              type="password"
              name="password"
              minLength={10}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              name="confirm"
              minLength={10}
              autoComplete="new-password"
              required
            />
          </label>
          {message && <p role="alert">{message}</p>}
          <button className="primary" disabled={busy}>
            Update password
          </button>
        </form>
      </section>
    </div>
  );
}
function AccountProfile({ auth, session }) {
  const [name, setName] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    auth
      .from("profiles")
      .select("display_name")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setMessage("Profile could not be loaded");
        else setName(data.display_name || "");
      });
    return () => {
      active = false;
    };
  }, [auth, session.user.id]);
  return (
    <form
      className="form account-profile"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const { error } = await auth
            .from("profiles")
            .update({
              display_name: name,
              updated_at: new Date().toISOString(),
            })
            .eq("id", session.user.id);
          if (error) throw error;
          setMessage("Profile saved");
        } catch (e) {
          setMessage(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Display name
        <input
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Email
        <input value={session.user.email} readOnly />
      </label>
      <button className="primary" disabled={busy}>
        Save profile
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
createRoot(document.getElementById("root")).render(<App />);
