// ==========================================================
// HARTTECH - EMAIL NOTIFICATIONS (Supabase Edge Function "notify")
// Called by Database Webhooks:
//   members  INSERT  -> alert the admin about a new registration
//   members  UPDATE  -> welcome email when status becomes "active"
//   messages INSERT  -> alert the admin about a new contact message
// Secrets needed: RESEND_API_KEY, ADMIN_EMAIL, WEBHOOK_SECRET
// Optional secrets: FROM_EMAIL, CHAT_URL
// ==========================================================

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";
const SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const FROM = Deno.env.get("FROM_EMAIL") ?? "Harttech <onboarding@resend.dev>";
const CHAT_URL = Deno.env.get("CHAT_URL") ?? "";

// Escape user text before putting it in an email
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Keep subjects on one line
const oneLine = (s: unknown) => String(s ?? "").replace(/[\r\n]+/g, " ").slice(0, 150);

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY || !to) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: oneLine(subject), html }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Only our database webhook knows this secret
  if (!SECRET || req.headers.get("x-webhook-secret") !== SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: any;
  try { payload = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }

  const { type, table, record, old_record } = payload ?? {};

  try {
    if (table === "members" && type === "INSERT" && ADMIN_EMAIL) {
      await sendEmail(
        ADMIN_EMAIL,
        `New member registration: ${record.full_name}`,
        `<p>A new person registered and is waiting for approval.</p>
         <p><strong>Name:</strong> ${esc(record.full_name)}<br>
         <strong>Email:</strong> ${esc(record.email)}<br>
         <strong>Interest:</strong> ${esc(record.interest)}</p>
         <p>Open your admin dashboard, Members tab, to approve them.</p>`,
      );
    }

    if (table === "members" && type === "UPDATE" &&
        old_record?.status !== "active" && record?.status === "active") {
      const chat = /^https:\/\//i.test(CHAT_URL)
        ? `<p><a href="${esc(CHAT_URL)}">Join our group chat</a></p>` : "";
      await sendEmail(
        record.email,
        "Welcome to Harttech!",
        `<p>Hi ${esc(record.full_name)},</p>
         <p>Your membership has been approved. Welcome to the Harttech community!</p>
         ${chat}
         <p>We'll share updates and events with you soon.</p>
         <p>The Harttech team</p>`,
      );
    }

    if (table === "messages" && type === "INSERT" && ADMIN_EMAIL) {
      await sendEmail(
        ADMIN_EMAIL,
        `New contact message: ${record.subject}`,
        `<p><strong>From:</strong> ${esc(record.name)} (${esc(record.email)})</p>
         <p><strong>Subject:</strong> ${esc(record.subject)}</p>
         <p style="white-space:pre-wrap">${esc(record.message)}</p>
         <p>You can also read and reply from your admin dashboard, Messages tab.</p>`,
      );
    }
  } catch (err) {
    console.error("notify error", err);
  }

  return new Response("ok", { status: 200 });
});
