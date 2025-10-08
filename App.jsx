import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Peddle West – RCIC Client Portal (single-file React app)
 * ---------------------------------------------------------------------------
 * Goals
 *  - Preserve brand feel: deep blue + white, clean, professional layout.
 *  - Add Client Portal features: Booking, Eligibility Form, Secure Uploads,
 *    Client Dashboard, basic Auth simulation, and Staff view.
 *  - Google integration hooks: Calendly embed, Google Drive upload stubs,
 *    and XLSX export for Drive/Sheets archiving.
 *  - A11y + responsive + fast (mobile-first, minimal CLS via fixed container
 *    sizes where possible).
 *
 * Tech Notes
 *  - TailwindCSS expected by the ChatGPT canvas runtime (no import needed here).
 *  - You can copy this component into a CRA/Vite/Next.js project.
 *  - Replace placeholders in GOOGLE CONFIG section with your own keys if you
 *    want to test Google Drive uploads client-side via gapi.
 */

// --- Simple brand system (approximate deep blue + neutrals) ---
const brand = {
  primary: "#0B2A5B", // deep blue
  primaryDark: "#071B3C",
  accent: "#1E66F5", // accessible blue accent for focus states/links
  bg: "#FFFFFF",
  text: "#0A0A0A",
};

// --- Utilities ---
const cls = (...s) => s.filter(Boolean).join(" ");
const required = (v) => (v ? undefined : "This field is required.");
const isEmail = (v) => (/^\S+@\S+\.\S+$/.test(v) ? undefined : "Enter a valid email.");

// Persist small pieces of state (save progress) in localStorage
function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue];
}

// --- Fake auth (for demo) ---
function useAuth() {
  const [user, setUser] = useLocalStorage("pw_auth_user", null);
  const login = (email, role = "client") => setUser({ email, role, name: email.split("@")[0] });
  const logout = () => setUser(null);
  return { user, login, logout };
}

// --- Google APIs (Drive/Sheets) placeholders ---
const GOOGLE_CONFIG = {
  apiKey: "YOUR_GOOGLE_API_KEY",
  clientId: "YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com",
  scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets",
};

async function ensureGapiLoaded() {
  if (typeof window === "undefined") return;
  if (window.gapi && window.google) return;
  await new Promise((resolve) => {
    const s1 = document.createElement("script");
    s1.src = "https://apis.google.com/js/api.js";
    s1.async = true;
    s1.onload = () => resolve();
    document.head.appendChild(s1);
  });
}

async function gapiSignIn() {
  await ensureGapiLoaded();
  const { gapi } = window;
  return new Promise((resolve, reject) => {
    gapi.load("client:picker", async () => {
      try {
        await gapi.client.init({ apiKey: GOOGLE_CONFIG.apiKey });
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CONFIG.clientId,
          scope: GOOGLE_CONFIG.scope,
          callback: (resp) => (resp && resp.access_token ? resolve(resp.access_token) : reject("No token")),
        });
        tokenClient.requestAccessToken({ prompt: "consent" });
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function uploadBlobToDrive({ accessToken, blob, filename, mimeType }) {
  // Uses multipart upload to Drive. On success returns file id.
  const metadata = { name: filename, mimeType };
  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";
  const reader = await blob.arrayBuffer();
  const base64Data = btoa(String.fromCharCode(...new Uint8Array(reader)));
  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    "\r\n" +
    delimiter +
    "Content-Type: " + mimeType + "\r\n" +
    "Content-Transfer-Encoding: base64\r\n\r\n" +
    base64Data +
    closeDelim;

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });
  if (!res.ok) throw new Error("Drive upload failed");
  return res.json();
}

// --- XLSX helper (on-demand import to keep initial bundle light) ---
async function exportRowsToXLSX({ rows, filename = "peddlewest_export.xlsx", sheetName = "Responses" }) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const wbout = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  return blob; // return blob so we can upload to Drive if signed in
}

// --- Calendly embed hook ---
function useCalendlyEmbed(url) {
  useEffect(() => {
    if (!url) return;
    const s = document.createElement("script");
    s.src = "https://assets.calendly.com/assets/external/widget.js";
    s.async = true;
    document.head.appendChild(s);
    return () => { s.remove(); };
  }, [url]);
}

// --- Components ---
function Shell({ children, user, onShowLogin }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: brand.bg, color: brand.text }}>
      <header className="sticky top-0 z-40 shadow-sm" style={{ backgroundColor: brand.primary }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-white/10 flex items-center justify-center text-white font-bold">PW</div>
            <a href="#home" className="text-white font-semibold tracking-wide">Peddle West</a>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#book" className="text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white rounded px-1">Book</a>
            <a href="#eligibility" className="text-white/90 hover:text-white">Eligibility</a>
            <a href="#uploads" className="text-white/90 hover:text-white">Uploads</a>
            <a href="#dashboard" className="text-white/90 hover:text-white">Dashboard</a>
            <a href="#about" className="text-white/90 hover:text-white">About</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <div className="text-white text-sm">Signed in as <span className="font-medium">{user.email}</span></div>
            ) : (
              <button onClick={onShowLogin} className="text-white text-sm underline">Sign in</button>
            )}
            <a href="#book" className="ml-2 inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
               style={{ backgroundColor: brand.accent, color: "white" }}>
              Book Now
            </a>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-12 border-t">
        <div className="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-3 gap-8">
          <div>
            <div className="font-semibold">Peddle West Immigration</div>
            <p className="text-sm text-neutral-600 mt-2">Kelowna, BC · info@peddlewest.com · +1‑236‑338‑0500</p>
          </div>
          <div>
            <div className="font-semibold">Quick Links</div>
            <ul className="mt-2 text-sm text-neutral-700 space-y-1">
              <li><a href="#eligibility" className="underline">Eligibility Assessment</a></li>
              <li><a href="#uploads" className="underline">Secure Uploads</a></li>
              <li><a href="#book" className="underline">Book Consultation</a></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold">Compliance</div>
            <p className="text-sm text-neutral-600 mt-2">RCIC‑CICC regulated. Privacy-first design. © {new Date().getFullYear()} Peddle West.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Hero() {
  return (
    <section id="home" className="relative overflow-hidden" aria-label="Hero">
      <div className="max-w-6xl mx-auto px-4 pt-10 pb-16 grid md:grid-cols-2 gap-8 items-center">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: brand.primary }}>Trusted Canadian Immigration, now with a secure client portal.</h1>
          <p className="mt-4 text-neutral-700">Retaining Peddle West’s familiar look and feel, this upgrade adds booking, eligibility assessments, document uploads, and a personalized dashboard—securely and efficiently.</p>
          <div className="mt-6 flex gap-3">
            <a href="#book" className="inline-flex items-center rounded-xl px-5 py-3 font-semibold shadow" style={{ backgroundColor: brand.accent, color: "white" }}>Book Now</a>
            <a href="#eligibility" className="inline-flex items-center rounded-xl px-5 py-3 font-semibold border" style={{ borderColor: brand.primary, color: brand.primary }}>Start Assessment</a>
          </div>
        </div>
        <div className="md:justify-self-end">
          <div className="aspect-[4/3] w-full max-w-md rounded-2xl border shadow-sm bg-white" aria-hidden="true" />
          <p className="sr-only">Decorative placeholder</p>
        </div>
      </div>
    </section>
  );
}

function CalendlySection() {
  const calendlyUrl = "https://calendly.com/your-team/initial-consult"; // replace with real
  useCalendlyEmbed(calendlyUrl);
  return (
    <section id="book" className="max-w-6xl mx-auto px-4 py-12">
      <h2 className="text-2xl font-semibold" style={{ color: brand.primary }}>Book an Initial Consultation</h2>
      <p className="mt-2 text-neutral-700">View live availability, pick a time, and pay securely. Your confirmation and calendar invite will be sent automatically.</p>
      <div className="mt-6 rounded-xl border shadow-sm overflow-hidden">
        <div className="calendly-inline-widget" data-url={calendlyUrl} style={{ minWidth: "320px", height: "680px" }} />
      </div>
      <p className="mt-3 text-xs text-neutral-500">Prefer Google Calendar appointments? Link your calendar in Settings and we’ll mirror bookings to your Google Calendar automatically.</p>
    </section>
  );
}

// --- Eligibility Assessment (multi-step with save-progress) ---
const initialAssessment = {
  contact: { firstName: "", lastName: "", email: "", phone: "" },
  basics: { age: "", education: "", marital: "Single" },
  language: { ieltsListening: "", ieltsReading: "", ieltsWriting: "", ieltsSpeaking: "", overall: "" },
  interest: { program: "Express Entry", notes: "" },
  work: [{ start: "", end: "", title: "", employer: "", city: "", country: "", state: "", current: false }],
};

function EligibilityForm({ onSubmit }) {
  const [data, setData] = useLocalStorage("pw_assessment_progress", initialAssessment);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});

  const steps = ["Contact", "Basics", "Language", "Work History", "Interest", "Review"];

  function set(path, value) {
    setData((prev) => {
      const next = structuredClone(prev);
      let t = next;
      for (let i = 0; i < path.length - 1; i++) t = t[path[i]];
      t[path[path.length - 1]] = value;
      return next;
    });
  }

  function validate(idx = step) {
    const e = {};
    if (idx === 0) {
      e.firstName = required(data.contact.firstName);
      e.lastName = required(data.contact.lastName);
      e.email = required(data.contact.email) || isEmail(data.contact.email);
    }
    if (idx === 1) {
      e.age = required(data.basics.age);
      e.education = required(data.basics.education);
    }
    if (idx === 2) {
      const L = data.language; ["ieltsListening", "ieltsReading", "ieltsWriting", "ieltsSpeaking"].forEach(k => { if (!L[k]) e[k] = "Required"; });
    }
    if (idx === 3) {
      const first = data.work[0];
      ["title", "employer", "city", "country"].forEach(k => { if (!first[k]) e[k] = "Required"; });
    }
    setErrors(e);
    return Object.values(e).every((x) => !x);
  }

  function next() { if (validate(step)) setStep((s) => Math.min(s + 1, steps.length - 1)); }
  function prev() { setStep((s) => Math.max(s - 1, 0)); }

  async function handleSubmit() {
    if (!validate(step)) return;
    // Assemble a flattened row for export/CRM
    const row = {
      timestamp: new Date().toISOString(),
      ...data.contact,
      age: data.basics.age,
      education: data.basics.education,
      marital: data.basics.marital,
      ieltsListening: data.language.ieltsListening,
      ieltsReading: data.language.ieltsReading,
      ieltsWriting: data.language.ieltsWriting,
      ieltsSpeaking: data.language.ieltsSpeaking,
      overall: data.language.overall,
      program: data.interest.program,
      notes: data.interest.notes,
      work_0_title: data.work[0]?.title || "",
      work_0_employer: data.work[0]?.employer || "",
      work_0_city: data.work[0]?.city || "",
      work_0_country: data.work[0]?.country || "",
    };

    // Persist to a local “DB” for demo and also keep a CSV/XLSX download for Drive/Sheets retention
    const existing = JSON.parse(localStorage.getItem("pw_assessments") || "[]");
    existing.push(row); localStorage.setItem("pw_assessments", JSON.stringify(existing));

    // Offer XLSX export (staff can upload to Drive)
    const blob = await exportRowsToXLSX({ rows: existing, filename: "peddlewest_assessments.xlsx" });

    // Optional: direct upload to Drive if user is signed in
    try {
      const token = await gapiSignIn();
      await uploadBlobToDrive({ accessToken: token, blob, filename: "peddlewest_assessments.xlsx", mimeType: blob.type });
      alert("Saved and uploaded XLSX to your Google Drive.");
    } catch (e) {
      console.info("Drive upload skipped or failed:", e);
      alert("Saved locally and downloaded XLSX. (Connect Google Drive to auto-upload.)");
    }

    onSubmit?.(row);
    localStorage.removeItem("pw_assessment_progress");
    setData(initialAssessment);
    setStep(0);
  }

  return (
    <section id="eligibility" className="max-w-6xl mx-auto px-4 py-12">
      <h2 className="text-2xl font-semibold" style={{ color: brand.primary }}>Eligibility Assessment</h2>
      <p className="mt-2 text-neutral-700">A secure, multi‑step form with validation and save‑progress. Staff can export submissions to Excel/Google Drive.</p>

      <ol className="mt-4 flex flex-wrap gap-2" aria-label="Progress steps">
        {steps.map((s, i) => (
          <li key={s} className={cls("text-sm px-3 py-1 rounded-full border", i === step ? "bg-blue-50 border-blue-300" : "border-neutral-300")}>{i + 1}. {s}</li>
        ))}
      </ol>

      <div className="mt-6 rounded-xl border shadow-sm p-4 grid gap-4">
        {step === 0 && (
          <div>
            <Field label="First name" error={errors.firstName}>
              <input className="input" value={data.contact.firstName} onChange={(e) => set(["contact", "firstName"], e.target.value)} />
            </Field>
            <Field label="Last name" error={errors.lastName}>
              <input className="input" value={data.contact.lastName} onChange={(e) => set(["contact", "lastName"], e.target.value)} />
            </Field>
            <Field label="Email" error={errors.email}>
              <input className="input" type="email" value={data.contact.email} onChange={(e) => set(["contact", "email"], e.target.value)} />
            </Field>
            <Field label="Phone (optional)">
              <input className="input" value={data.contact.phone} onChange={(e) => set(["contact", "phone"], e.target.value)} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div>
            <Field label="Age" error={errors.age}>
              <input className="input" type="number" min={18} value={data.basics.age} onChange={(e) => set(["basics", "age"], e.target.value)} />
            </Field>
            <Field label="Highest education" error={errors.education}>
              <select className="input" value={data.basics.education} onChange={(e) => set(["basics", "education"], e.target.value)}>
                <option value="">Select…</option>
                <option>Secondary</option>
                <option>Diploma</option>
                <option>Bachelor</option>
                <option>Master</option>
                <option>PhD</option>
              </select>
            </Field>
            <Field label="Marital status">
              <select className="input" value={data.basics.marital} onChange={(e) => set(["basics", "marital"], e.target.value)}>
                <option>Single</option>
                <option>Married</option>
                <option>Common‑law</option>
              </select>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="grid md:grid-cols-2 gap-4">
            {[["ieltsListening","Listening"],["ieltsReading","Reading"],["ieltsWriting","Writing"],["ieltsSpeaking","Speaking"],["overall","Overall (optional)"]].map(([k,label]) => (
              <Field key={k} label={`IELTS ${label}`} error={errors[k]}> 
                <input className="input" inputMode="decimal" value={data.language[k]} onChange={(e) => set(["language", k], e.target.value)} />
              </Field>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Job title" error={errors.title}><input className="input" value={data.work[0].title} onChange={(e) => set(["work", 0, "title"], e.target.value)} /></Field>
            <Field label="Employer" error={errors.employer}><input className="input" value={data.work[0].employer} onChange={(e) => set(["work", 0, "employer"], e.target.value)} /></Field>
            <Field label="City" error={errors.city}><input className="input" value={data.work[0].city} onChange={(e) => set(["work", 0, "city"], e.target.value)} /></Field>
            <Field label="Country" error={errors.country}><input className="input" value={data.work[0].country} onChange={(e) => set(["work", 0, "country"], e.target.value)} /></Field>
            <Field label="State/Province (optional)"><input className="input" value={data.work[0].state} onChange={(e) => set(["work", 0, "state"], e.target.value)} /></Field>
            <div className="flex items-center gap-2 mt-2">
              <input id="currentRole" type="checkbox" className="h-4 w-4" checked={data.work[0].current} onChange={(e) => set(["work", 0, "current"], e.target.checked)} />
              <label htmlFor="currentRole" className="text-sm">This is my current job</label>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Program of interest">
              <select className="input" value={data.interest.program} onChange={(e) => set(["interest", "program"], e.target.value)}>
                <option>Express Entry</option>
                <option>Study Permit</option>
                <option>Work Permit</option>
                <option>PNP</option>
                <option>Family Sponsorship</option>
              </select>
            </Field>
            <Field label="Notes (optional)"><textarea className="input min-h-[96px]" value={data.interest.notes} onChange={(e) => set(["interest", "notes"], e.target.value)} /></Field>
          </div>
        )}

        {step === 5 && (
          <div className="text-sm text-neutral-700">
            <p><strong>Review:</strong> Please confirm your details, then submit.</p>
            <pre className="mt-3 p-3 rounded bg-neutral-50 overflow-auto border text-xs">
{JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <button className="btn-secondary" onClick={prev} disabled={step === 0}>
            Back
          </button>
          {step < steps.length - 1 ? (
            <button className="btn-primary" onClick={next}>Next</button>
          ) : (
            <button className="btn-primary" onClick={handleSubmit}>Submit Assessment</button>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, error, children }) {
  const id = useMemo(() => Math.random().toString(36).slice(2), []);
  return (
    <div className="mt-3">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-800">{label}</label>
      {React.cloneElement(children, { id, className: cls("mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring", children.props.className, error ? "border-red-500" : "border-neutral-300") })}
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

// --- Uploads (client side with confirmation) ---
function Uploads() {
  const [uploads, setUploads] = useLocalStorage("pw_uploads", []);
  const inputRef = useRef(null);
  const [pending, setPending] = useState(false);

  async function handleFiles(files) {
    const items = Array.from(files).slice(0, 16);
    setPending(true);
    // Simulate secure storage by keeping only metadata and an object URL for preview
    const metas = await Promise.all(items.map(async (f) => ({
      id: crypto.randomUUID(),
      name: f.name, size: f.size, type: f.type, at: new Date().toISOString(),
      url: URL.createObjectURL(f),
    })));
    setUploads((prev) => [...metas, ...prev].slice(0, 200));
    setPending(false);
  }

  return (
    <section id="uploads" className="max-w-6xl mx-auto px-4 py-12">
      <h2 className="text-2xl font-semibold" style={{ color: brand.primary }}>Secure Document Uploads</h2>
      <p className="mt-2 text-neutral-700">Upload passports, education credentials, IELTS/TEF, and more. Accepted: PDF, JPEG, PNG. You’ll receive an on‑screen confirmation for each file.</p>
      <div className="mt-4 rounded-xl border shadow-sm p-4">
        <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        <button className="btn-primary" onClick={() => inputRef.current?.click()} disabled={pending}>{pending ? "Uploading…" : "Choose files"}</button>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {uploads.map((u) => (
            <div key={u.id} className="rounded-lg border p-3 text-sm">
              <div className="font-medium truncate" title={u.name}>{u.name}</div>
              <div className="text-neutral-600">{(u.size/1024).toFixed(1)} KB · {u.type || "file"}</div>
              <div className="text-neutral-500 text-xs mt-1">Uploaded {new Date(u.at).toLocaleString()}</div>
              {u.type?.startsWith("image/") && (
                <img src={u.url} alt="Preview" className="mt-2 w-full h-32 object-cover rounded" />
              )}
              <a href={u.url} download className="mt-2 inline-block underline text-sm">Download</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// --- Client Dashboard ---
function ClientDashboard({ user }) {
  const [status, setStatus] = useLocalStorage("pw_client_status", "Documents Needed");
  return (
    <section id="dashboard" className="max-w-6xl mx-auto px-4 py-12">
      <h2 className="text-2xl font-semibold" style={{ color: brand.primary }}>Client Dashboard</h2>
      <p className="mt-2 text-neutral-700">Welcome{user?.name ? `, ${user.name}` : ""}. Track your application and access next steps below.</p>

      <div className="mt-6 grid md:grid-cols-3 gap-4">
        <Card title="Current Status">
          <div className="text-lg font-semibold">{status}</div>
          <p className="text-sm text-neutral-600 mt-1">Status updates appear here (e.g., Assessment Complete → Documents Needed → Application Submitted).</p>
          <div className="mt-3 flex gap-2">
            <button className="btn-secondary" onClick={() => setStatus("Assessment Complete")}>Mark Assessment Complete</button>
            <button className="btn-secondary" onClick={() => setStatus("Application Submitted")}>Mark Submitted</button>
          </div>
        </Card>
        <Card title="Quick Actions">
          <ul className="text-sm list-disc list-inside text-neutral-700 space-y-1">
            <li><a href="#uploads" className="underline">Upload documents</a></li>
            <li><a href="#eligibility" className="underline">Finish eligibility form</a></li>
            <li><a href="#book" className="underline">Book/Change appointment</a></li>
          </ul>
        </Card>
        <Card title="Messages">
          <p className="text-sm text-neutral-700">No new messages.</p>
        </Card>
      </div>
    </section>
  );
}

function StaffPanel() {
  const [assessments, setAssessments] = useState(() => JSON.parse(localStorage.getItem("pw_assessments") || "[]"));
  async function exportAll() {
    const blob = await exportRowsToXLSX({ rows: assessments, filename: "peddlewest_assessments.xlsx" });
    try {
      const token = await gapiSignIn();
      await uploadBlobToDrive({ accessToken: token, blob, filename: "peddlewest_assessments.xlsx", mimeType: blob.type });
      alert("Exported + uploaded to Drive.");
    } catch (e) {
      console.info("Drive upload skipped or failed:", e);
    }
  }
  return (
    <section className="max-w-6xl mx-auto px-4 py-12">
      <h2 className="text-2xl font-semibold" style={{ color: brand.primary }}>Staff – Submissions</h2>
      <p className="mt-2 text-neutral-700">This view simulates a private CRM. Use Export to save Excel locally or push to Google Drive.</p>
      <div className="mt-4 flex gap-2">
        <button className="btn-primary" onClick={exportAll}>Export to XLSX (and upload)</button>
        <button className="btn-secondary" onClick={() => { localStorage.removeItem("pw_assessments"); setAssessments([]); }}>Clear (demo)</button>
      </div>
      <div className="mt-4 overflow-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-left">
            <tr>
              {"timestamp firstName lastName email age education program overall".split(" ").map(h => (
                <th key={h} className="px-3 py-2 font-semibold text-neutral-700 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assessments.map((r, i) => (
              <tr key={i} className={i % 2 ? "bg-white" : "bg-neutral-50/40"}>
                <td className="px-3 py-2 whitespace-nowrap">{r.timestamp}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.firstName}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.lastName}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.email}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.age}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.education}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.program}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.overall}</td>
              </tr>
            ))}
            {!assessments.length && (
              <tr><td className="px-3 py-4 text-neutral-500" colSpan={8}>No submissions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-xl border shadow-sm p-4 bg-white">
      <div className="font-semibold" style={{ color: brand.primary }}>{title}</div>
      <div className="mt-2 text-neutral-700">{children}</div>
    </div>
  );
}

function LoginModal({ open, onClose, onLogin }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("client");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <h3 className="text-lg font-semibold" style={{ color: brand.primary }}>Sign in</h3>
        <p className="text-sm text-neutral-600">Demo sign‑in. No password required.</p>
        <div className="mt-3">
          <label className="block text-sm font-medium">Email</label>
          <input className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="mt-3">
          <label className="block text-sm font-medium">Role</label>
          <select className="input mt-1" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="client">Client</option>
            <option value="staff">Staff</option>
          </select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { onLogin(email, role); onClose(); }}>Continue</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, login, logout } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <Shell user={user} onShowLogin={() => setLoginOpen(true)}>
      <Hero />
      <CalendlySection />
      <EligibilityForm />
      <Uploads />
      <ClientDashboard user={user} />
      {user?.role === "staff" && <StaffPanel />}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onLogin={login} />

      {/* Floating account control for quick testing */}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2">
        {user ? (
          <button className="rounded-full px-4 py-2 shadow text-sm font-semibold" style={{ backgroundColor: brand.primary, color: "white" }} onClick={logout}>
            Sign out
          </button>
        ) : (
          <button className="rounded-full px-4 py-2 shadow text-sm font-semibold border" style={{ borderColor: brand.primary, color: brand.primary }} onClick={() => setLoginOpen(true)}>
            Sign in
          </button>
        )}
      </div>

      {/* Global styles for buttons/inputs (tailwind utility shortcut) */}
      <style>{`
        .btn-primary { background:${brand.accent}; color:#fff; padding:.625rem 1rem; border-radius:.75rem; font-weight:600; box-shadow:0 1px 2px rgb(0 0 0 / .08); }
        .btn-primary:focus { outline:2px solid ${brand.accent}; outline-offset:2px; }
        .btn-secondary { background:#fff; color:${brand.primary}; border:1px solid ${brand.primary}; padding:.625rem 1rem; border-radius:.75rem; font-weight:600; }
        .btn-secondary:disabled { opacity:.6 }
        .input { background:#fff; border:1px solid #e5e7eb; border-radius:.75rem; padding:.5rem .75rem; }
        .input:focus { outline:2px solid ${brand.accent}; outline-offset:2px; }
      `}</style>
    </Shell>
  );
}
initial commit – client portal single-file app


