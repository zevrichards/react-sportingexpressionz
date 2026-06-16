const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const logger = require("firebase-functions/logger");

admin.initializeApp();

const FYGARO_SECRET    = defineSecret("FYGARO_SECRET");
const FYGARO_API_KEY   = defineSecret("FYGARO_API_KEY");
const PAYPAL_CLIENT_ID = defineSecret("PAYPAL_CLIENT_ID");
const PAYPAL_SECRET    = defineSecret("PAYPAL_SECRET");
const PAYPAL_WEBHOOK_ID = defineSecret("PAYPAL_WEBHOOK_ID");

const db = admin.firestore();
const SHIPPING_PRICE = 70;
const DELIVERY_PRICE = 50;

// ── HTML escape helper (for jerseyMeta) ───────────────────────────────────────
function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Shared order fulfilment ───────────────────────────────────────────────────
async function fulfillOrder({ orderNumber, transactionId, amount, provider }) {
  const pendingRef  = db.collection("PendingOrders").doc(orderNumber);
  const pendingSnap = await pendingRef.get();

  if (!pendingSnap.exists) {
    logger.error("Order not found:", orderNumber);
    return;
  }

  const pendingOrder = pendingSnap.data();
  const userId       = pendingOrder.userId;

  const userRef  = db.collection("Users").doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) { logger.error("User not found:", userId); return; }
  const user = userSnap.data();

  const pendingOrderRef = userRef.collection("Orders").doc(orderNumber);

  await pendingOrderRef.update({
    transactionId,
    amount:          Number(amount),
    paidAt:          admin.firestore.Timestamp.fromDate(new Date()),
    status:          "Completed",
    paymentProvider: provider,
  });

  // Update stock + build email items array
  const batch      = db.batch();
  const itemsArray = [];
  const itemSnap   = await pendingOrderRef.collection("Items").get();

  for (const docSnap of itemSnap.docs) {
    const d = docSnap.data();

    itemsArray.push({
      text:         `${d.League || ""} ${d.Team || ""} ${d.Cut || ""} ${d.Sleeve || ""} ${d.Variant || ""} ${d.Size || ""} ${d.PlayerName || ""} ${d.PlayerNumber || ""}`.trim(),
      image:        d.JerseyImgFront || "",
      price:        "$" + d.Price,
      quantity:     d.Quantity,
      PlayerNote:   d.PlayerNote   || "",
      PrintOptions: d.PrintOptions || "",
    });

    const stockRef = db
      .collection("Leagues").doc(d.League)
      .collection("Teams").doc(d.Team)
      .collection("Cuts").doc(d.Cut)
      .collection("Sleeves").doc(d.Sleeve)
      .collection("Variants").doc(d.Variant)
      .collection("Sizes").doc(d.Size);

    const stockSnap = await stockRef.get();
    if (stockSnap.exists && (stockSnap.data().StockQuantity || 0) > 0) {
      batch.update(stockRef, {
        StockQuantity: admin.firestore.FieldValue.increment(-d.Quantity),
      });
    }
  }

  if (pendingOrder.ShippingMsg) {
    itemsArray.push({ text: "Ordering and Shipping", image: "", price: "$" + SHIPPING_PRICE, quantity: "" });
  }
  itemsArray.push({ text: "Delivery", image: "", price: "$" + DELIVERY_PRICE, quantity: "" });

  if (pendingOrder.PromoCode) {
    const promoRef = db.collection("PromoCodes").doc(pendingOrder.PromoCode);
    batch.update(promoRef, { Quantity: admin.firestore.FieldValue.increment(-1) });
  }

  // 🛒 Clear the user's cart now that payment is confirmed
  const cartSnap = await db.collection("Users").doc(userId).collection("Cart").get();
  for (const cartDoc of cartSnap.docs) {
    batch.delete(cartDoc.ref);
  }

  batch.update(pendingRef, { status: "Completed" });
  await batch.commit();

  // Add to tracking collection so admin can send a tracking email later
  db.collection("tracking").doc(orderNumber).set({
    orderNumber:       orderNumber,
    DeliveryName:      pendingOrder.DeliveryName      || "",
    DeliveryTelNumber: pendingOrder.DeliveryTelNumber || "",
    Email:             pendingOrder.email || user.email || "",
    completedAt:       admin.firestore.Timestamp.fromDate(new Date()),
  }).catch(err => logger.warn("Failed to write tracking record", err));

  // Send receipt email via Firestore-triggered mail extension
  db.collection("mail").add({
    to:   pendingOrder.email || user.email,
    cc:  "sportingexpressionztt@gmail.com",
    template: {
      name: "receipt",
      data: {
        orderNumber: orderNumber,
        total:       amount,
        items:       itemsArray,
        receipt:     provider !== "COD",
        COD:         provider === "COD",
        name:        pendingOrder.DeliveryName || "",
        address01:   pendingOrder.DeliveryAddress1 || "",
        address02:   pendingOrder.DeliveryAddress2 || "",
        city:        pendingOrder.DeliveryCity || "",
        contactnumber: pendingOrder.DeliveryTelNumber || "",
        ShippingMsg: pendingOrder.ShippingMsg || "",
      },
    },
  }).then(() => logger.info("Receipt email queued"));

  logger.info("Order completed", { transactionId, orderNumber });
}

// ── jerseyMeta — Open Graph preview for shared customize links ────────────────
exports.jerseyMeta = onRequest({ cors: false }, async (req, res) => {
  const { league, team, cut, sleeve, variant } = req.query;
  const qs          = new URLSearchParams(req.query).toString();
  const customizeUrl = `/customize${qs ? "?" + qs : ""}`;
  const title       = [team, cut, sleeve, variant].filter(Boolean).join(" · ");

  let imageUrl = "";
  try {
    if (league && team && cut && sleeve && variant) {
      const snap = await db
        .collection("Leagues").doc(league)
        .collection("Teams").doc(team)
        .collection("Cuts").doc(cut)
        .collection("Sleeves").doc(sleeve)
        .collection("Variants").doc(variant)
        .get();
      if (snap.exists) imageUrl = snap.data().JerseyImgFront || "";
    }
  } catch (_) { /* serve without image */ }

  res.set("Cache-Control", "public, max-age=3600");
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <meta property="og:type"        content="website" />
  <meta property="og:title"       content="${esc(title)}" />
  <meta property="og:description" content="Customize your jersey — add a name &amp; number" />
  <meta property="og:url"         content="${esc(customizeUrl)}" />
  ${imageUrl ? `<meta property="og:image" content="${esc(imageUrl)}" />` : ""}
  <meta name="twitter:card"  content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  ${imageUrl ? `<meta name="twitter:image" content="${esc(imageUrl)}" />` : ""}
  <meta http-equiv="refresh" content="0; url=${esc(customizeUrl)}" />
</head>
<body><script>window.location.replace(${JSON.stringify(customizeUrl)});</script></body>
</html>`);
});

// ── createFygaroJWT ───────────────────────────────────────────────────────────
exports.createFygaroJWT = onRequest(
  { secrets: [FYGARO_SECRET, FYGARO_API_KEY] },
  (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).send("");

    const { amount, orderNumber } = req.body;
    const secret = FYGARO_SECRET.value();
    const apiKey = FYGARO_API_KEY.value();
    if (!secret || !apiKey) return res.status(500).json({ error: "Server misconfigured" });

    const token = jwt.sign(
      { amount, currency: "TTD", custom_reference: orderNumber },
      secret,
      { algorithm: "HS256", header: { typ: "JWT", kid: apiKey } }
    );
    res.json({ token });
  }
);

// ── manualOrderComplete (COD / admin bank transfer) ───────────────────────────
exports.manualOrderComplete = onRequest(
  { secrets: [], cors: true },
  async (req, res) => {
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) return res.status(401).send("Missing token");

    const decoded = await admin.auth().verifyIdToken(idToken);
    const { orderNumber, amount, COD } = req.body;
    const provider = COD ? "COD" : "Manual";

    if (!COD && decoded.email !== "sportingexpressionztt@gmail.com") {
      return res.status(403).send("Forbidden");
    }

    await fulfillOrder({ orderNumber, provider, transactionId: null, amount });
    res.json({ success: true });
  }
);

// ── PayPal helpers ────────────────────────────────────────────────────────────
function normalizeBody(rawBody) {
  const text = rawBody.toString("utf8");
  try { return JSON.stringify(JSON.parse(text)); } catch { return text; }
}

async function verifyPaypalWebhook(req) {
  const fetch = (await import("node-fetch")).default;
  const id     = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  const whId   = process.env.PAYPAL_WEBHOOK_ID;

  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const { access_token } = await (await fetch(
    "https://api-m.paypal.com/v1/oauth2/token",
    { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" }
  )).json();

  const result = await (await fetch(
    "https://api-m.paypal.com/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo:         req.headers["paypal-auth-algo"],
        cert_url:          req.headers["paypal-cert-url"],
        transmission_id:   req.headers["paypal-transmission-id"],
        transmission_sig:  req.headers["paypal-transmission-sig"],
        transmission_time: req.headers["paypal-transmission-time"],
        webhook_id:        whId,
        webhook_event:     req.body,
      }),
    }
  )).json();
  return result.verification_status === "SUCCESS";
}

exports.paypalWebhook = onRequest(
  { rawRequestBody: true, secrets: [PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_WEBHOOK_ID] },
  async (req, res) => {
    try {
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
      const valid = await verifyPaypalWebhook(req);
      if (!valid) return res.status(400).send("Invalid signature");

      const event = req.body;
      if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") return res.status(200).send("Ignored");

      const { resource } = event;
      await fulfillOrder({
        orderNumber:   resource.custom_id,
        transactionId: resource.id,
        amount:        resource.amount.value,
        provider:      "PayPal",
      });
      return res.status(200).send("Order processed via PayPal");
    } catch (err) {
      logger.error("PayPal webhook error", err);
      return res.status(500).send("Server error");
    }
  }
);

// ── Fygaro helpers ────────────────────────────────────────────────────────────
function verifyFygaroSignature({ secret, signatureHeader, rawBody }) {
  if (!signatureHeader) return false;
  const parts    = signatureHeader.split(",");
  const tPart    = parts.find(p => p.startsWith("t="));
  const v1Part   = parts.find(p => p.startsWith("v1="));
  if (!tPart || !v1Part) return false;

  const timestamp    = tPart.split("=")[1];
  const receivedSig  = v1Part.split("=")[1];
  const normalized   = normalizeBody(rawBody);
  const signedPayload = `${timestamp}.${normalized}`;

  const expected = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(signedPayload, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(receivedSig, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

exports.fygaroWebhook = onRequest(
  { rawRequestBody: true, secrets: [FYGARO_SECRET, FYGARO_API_KEY] },
  async (req, res) => {
    try {
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

      const valid = verifyFygaroSignature({
        secret:          FYGARO_SECRET.value(),
        signatureHeader: req.headers["fygaro-signature"],
        rawBody:         req.rawBody,
      });
      if (!valid) return res.status(400).send("Invalid signature");

      const { transactionId, customReference, amount } = req.body;
      if (!transactionId)  return res.status(400).send("Missing transactionId");
      if (!customReference) return res.status(400).send("Missing customReference");

      await fulfillOrder({ orderNumber: customReference, transactionId, amount, provider: "Fygaro" });
      return res.status(200).send("Order processed via Fygaro");
    } catch (err) {
      logger.error("Fygaro webhook error", err);
      return res.status(500).send("Server error");
    }
  }
);
