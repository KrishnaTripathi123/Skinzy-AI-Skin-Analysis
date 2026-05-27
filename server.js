const express = require("express");
const multer = require("multer");
const cors = require("cors");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { sendPasswordResetEmail, sendAppointmentEmail } = require('./utils/emailService');
const { loadData } = require("./utils/loadData");
const authRoutes = require("./routes/auth");
const authMiddleware = require("./middleware/authMiddleware");
const pool = require("./db");
const { getFinalRecommendations, callGeminiAIDermatologist } = require('./utils/hybridRecommend');
const { saveFeedback } = require('./utils/feedback');

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Auth Routes ────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);

// ── Load CSV catalogs once at startup ──────────────────────────────────────
let PRODUCTS = [];
let REMEDIES = [];
let DERMATS = [];

loadData()
  .then(({ products, remedies, dermats }) => {
    PRODUCTS = products;
    REMEDIES = remedies;
    DERMATS = dermats;
    console.log(
      `📦 Loaded ${PRODUCTS.length} products, ${REMEDIES.length} remedies, ${DERMATS.length} dermatologists from CSV`
    );
  })
  .catch((err) => console.error("❌ Failed to load CSV data:", err.message));

// ── Helper: format CSV rows as readable catalog ────────────────────────────
function buildProductCatalog(products) {
  if (!products.length) return "No products available.";
  return products
    .map(
      (p, i) =>
        `${i + 1}. ${p.product_name} by ${p.brand} | Type: ${p.product_type} | Skin: ${p.skin_type} | Concern: ${p.concern} | Key Ingredient: ${p.ingredients} | Usage: ${p.usage} | Price: ₹${p.price} | Rating: ${p.rating} | For: ${p.recommended_for}`
    )
    .join("\n");
}

function buildRemedyCatalog(remedies) {
  if (!remedies.length) return "No remedies available.";
  return remedies
    .map(
      (r, i) =>
        `${i + 1}. ${r.remedy_name} | Skin: ${r.skin_type} | Concern: ${r.concern} | Ingredients: ${r.ingredients} | Steps: ${r.steps} | Frequency: ${r.frequency} | Precautions: ${r.precautions}`
    )
    .join("\n");
}

function buildDermatCatalog(dermats) {
  if (!dermats.length) return "No dermatologists available.";
  return dermats
    .map(
      (d, i) =>
        `${i + 1}. ${d.name} | Clinic: ${d.clinic_name} | Experience: ${d.experience} | Location: ${d.location} | Rating: ${d.rating} | Specialization: ${d.specialization}`
    )
    .join("\n");
}

// ── Save Quiz Results (protected) ──────────────────────────────────────────
app.post("/api/save-quiz", authMiddleware, async (req, res) => {
  try {
    const { answers } = req.body;
    if (!answers) return res.status(400).json({ error: "No answers provided." });

    await pool.query(
      "INSERT INTO quiz_results (user_id, answers) VALUES (?, ?)",
      [req.userId, JSON.stringify(answers)]
    );
    res.json({ message: "Quiz saved successfully." });
  } catch (err) {
    console.error("Save quiz error:", err.message);
    res.status(500).json({ error: "Failed to save quiz." });
  }
});

// ── Save Routine (protected) ───────────────────────────────────────────────
app.post("/api/save-routine", authMiddleware, async (req, res) => {
  try {
    const { routine, mode, budget } = req.body;
    if (!routine) return res.status(400).json({ error: "No routine provided." });

    await pool.query(
      "INSERT INTO routines (user_id, data, mode, budget) VALUES (?, ?, ?, ?)",
      [req.userId, JSON.stringify(routine), mode || null, budget || null]
    );
    res.json({ message: "Routine saved successfully." });
  } catch (err) {
    console.error("Save routine error:", err.message);
    res.status(500).json({ error: "Failed to save routine." });
  }
});

// ── Get Profile (protected) ────────────────────────────────────────────────
app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const [[user]] = await pool.query(
      "SELECT id, name, email, age, gender, skin_type, skin_concerns, created_at FROM users WHERE id = ?",
      [req.userId]
    );
    if (!user) return res.status(404).json({ error: "User not found." });

    const [[quizRow]] = await pool.query(
      "SELECT answers FROM quiz_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
      [req.userId]
    );
    const [[analysisRow]] = await pool.query(
      "SELECT result, mode, budget FROM skin_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
      [req.userId]
    );
    const [[routineRow]] = await pool.query(
      "SELECT data, mode, budget FROM routines WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
      [req.userId]
    );

    let derivedSkinType = user.skin_type;
    let derivedConcerns = user.skin_concerns;
    if (!derivedSkinType && analysisRow) {
      try {
        const parsed = typeof analysisRow.result === 'string' ? JSON.parse(analysisRow.result) : analysisRow.result;
        derivedSkinType = parsed.skin_type || null;
        if (!derivedConcerns && parsed.primary_concern) {
          derivedConcerns = parsed.primary_concern;
        }
      } catch (_) {}
    }

    res.json({
      user: { ...user, skin_type: derivedSkinType, skin_concerns: derivedConcerns },
      savedData: {
        quizResults:   quizRow     ? (typeof quizRow.answers === 'string' ? JSON.parse(quizRow.answers) : quizRow.answers)    : null,
        imageAnalysis: analysisRow ? (typeof analysisRow.result === 'string' ? JSON.parse(analysisRow.result) : analysisRow.result) : null,
        routine:       routineRow  ? (typeof routineRow.data === 'string' ? JSON.parse(routineRow.data) : routineRow.data)    : null,
        mode:          routineRow?.mode   || analysisRow?.mode  || null,
        budget:        routineRow?.budget || analysisRow?.budget || null,
      },
    });
  } catch (err) {
    console.error("Profile error:", err.message);
    res.status(500).json({ error: "Failed to load profile." });
  }
});

// ── Update Profile (protected) ─────────────────────────────────────────────
app.put("/api/profile", authMiddleware, async (req, res) => {
  try {
    const { name, skin_type, skin_concerns } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required." });

    await pool.query(
      "UPDATE users SET name = ?, skin_type = ?, skin_concerns = ? WHERE id = ?",
      [name.trim(), skin_type || null, skin_concerns || null, req.userId]
    );

    const [[updated]] = await pool.query(
      "SELECT id, name, email, age, gender, skin_type, skin_concerns, created_at FROM users WHERE id = ?",
      [req.userId]
    );

    res.json({ message: "Profile updated successfully.", user: updated });
  } catch (err) {
    console.error("Update profile error:", err.message);
    res.status(500).json({ error: "Failed to update profile." });
  }
});

// ── Appointments (protected) ─────────────────────────────────────────────
app.post("/api/appointments", authMiddleware, async (req, res) => {
  try {
    const { doctor_name, clinic, appointment_date, mode } = req.body;
    if (!doctor_name || !appointment_date) return res.status(400).json({ error: "Missing required fields." });

    const finalMode = mode || 'online';

    await pool.query(
      "INSERT INTO appointments (user_id, doctor_name, clinic, appointment_date, mode) VALUES (?, ?, ?, ?, ?)",
      [req.userId, doctor_name, clinic || '', new Date(appointment_date), finalMode]
    );

    try {
      const [[user]] = await pool.query("SELECT name, email FROM users WHERE id = ?", [req.userId]);
      if (user && user.email) {
        let meetLink = null;
        if (finalMode === 'online') {
          meetLink = `https://meet.google.com/${Math.random().toString(36).substring(2,5)}-${Math.random().toString(36).substring(2,6)}-${Math.random().toString(36).substring(2,5)}`;
        }

        const apptDate = new Date(appointment_date);
        const dateStr = apptDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = apptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        const appointmentDetails = {
          doctorName: doctor_name.replace(/^Dr\.\s*/i, ''),
          clinicName: clinic || 'Online Consultation',
          date: dateStr,
          time: timeStr,
          mode: finalMode,
          meetLink
        };

        await sendAppointmentEmail(user.email, user.name, appointmentDetails);
      }
    } catch (emailErr) {
      console.error("Failed to send appointment email:", emailErr);
    }

    res.json({ message: "Appointment booked successfully." });
  } catch (err) {
    console.error("Booking error:", err.message);
    res.status(500).json({ error: "Failed to book appointment." });
  }
});

app.get("/api/appointments", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, doctor_name, clinic, appointment_date, mode, status FROM appointments WHERE user_id = ? ORDER BY appointment_date ASC",
      [req.userId]
    );
    res.json({ appointments: rows });
  } catch (err) {
    console.error("Fetch appointments error:", err.message);
    res.status(500).json({ error: "Failed to load appointments." });
  }
});

app.delete("/api/appointments/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM appointments WHERE id = ? AND user_id = ?", [id, req.userId]);
    res.json({ message: "Appointment cancelled successfully." });
  } catch (err) {
    console.error("Cancel appointment error:", err.message);
    res.status(500).json({ error: "Failed to cancel appointment." });
  }
});

// ── Daily Progress (protected) ─────────────────────────────────────────────
app.get("/api/progress", authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "Date is required (YYYY-MM-DD)." });
    
    const [rows] = await pool.query(
      "SELECT completed_steps FROM daily_progress WHERE user_id = ? AND date = ?",
      [req.userId, date]
    );
    
    if (rows.length === 0) {
      return res.json({ completed_steps: { am: {}, pm: {} } });
    }
    
    res.json({ completed_steps: typeof rows[0].completed_steps === 'string' ? JSON.parse(rows[0].completed_steps) : rows[0].completed_steps });
  } catch (err) {
    console.error("Fetch progress error:", err.message);
    res.status(500).json({ error: "Failed to load progress." });
  }
});

app.post("/api/progress", authMiddleware, async (req, res) => {
  try {
    const { date, completed_steps } = req.body;
    if (!date || !completed_steps) return res.status(400).json({ error: "Date and completed_steps are required." });
    
    await pool.query(
      "INSERT INTO daily_progress (user_id, date, completed_steps) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE completed_steps = ?",
      [req.userId, date, JSON.stringify(completed_steps), JSON.stringify(completed_steps)]
    );
    
    res.json({ message: "Progress saved successfully." });
  } catch (err) {
    console.error("Save progress error:", err.message);
    res.status(500).json({ error: "Failed to save progress." });
  }
});

// ── Main Analysis Endpoint ─────────────────────────────────────────────────
app.post("/api/analyze", upload.single("image"), async (req, res) => {
  try {
    const mode = req.body.mode || "product";

    let quizResults = {};
    if (req.body.quizResults) {
      try { quizResults = JSON.parse(req.body.quizResults); }
      catch (e) { console.warn("Failed to parse quiz results:", e); }
    }

    const budget = req.body.budget || quizResults["11"] || "Any";

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Build quiz context
    let quizContext = "User's Skin Questionnaire:\n";
    if (Object.keys(quizResults).length > 0) {
      for (const [qId, answer] of Object.entries(quizResults)) {
        quizContext += `- Q${qId}: ${Array.isArray(answer) ? answer.join(", ") : answer}\n`;
      }
    } else {
      quizContext += "No questionnaire data provided.\n";
    }

    const productCatalog = buildProductCatalog(PRODUCTS);
    const remedyCatalog  = buildRemedyCatalog(REMEDIES);
    const dermatCatalog  = buildDermatCatalog(DERMATS);

    const budgetNote =
      budget && budget !== "Any"
        ? `The user's budget is ₹${budget}. Only recommend products priced at or below this budget.`
        : "No specific budget — recommend best-fit products.";

    const prompt = `
You are an expert clinical dermatologist and skincare advisor for SKINZY, an Indian skincare platform.

${quizContext}
${req.file ? "A face photo has also been provided — analyze it carefully for visible skin concerns, texture, and tone." : ""}

${budgetNote}

━━━━━━━━━ OUR PRODUCT CATALOG ━━━━━━━━━
IMPORTANT: For the "product" routine, you MUST ONLY pick products from the list below. Do not invent or suggest any products outside this catalog. Pick the best 4–6 products that match the user's skin type, concerns, and budget.

${productCatalog}

━━━━━━━━━ OUR ORGANIC REMEDIES CATALOG ━━━━━━━━━
For the "natural" routine, follow this hybrid approach:
1. First, include the most relevant remedies from our catalog below that suit the user's skin type and concerns.
2. Then, use your own expert dermatological knowledge to add any additional organic/natural remedies that would further benefit this specific user — especially if the catalog doesn't fully cover their concern.
3. Aim for a total of 4–6 remedies (catalog + AI-generated combined).
4. For AI-generated remedies you add, still follow the same JSON format — provide a clear remedy name, ingredients, application steps, and frequency.

Our Catalog Remedies (use as starting point, supplement freely):
${remedyCatalog}

━━━━━━━━━ RECOMMENDED DERMATOLOGISTS (Indore) ━━━━━━━━━
For the "dermatologist" section, suggest the 2–3 best-matched dermatologists from this list based on the user's concern. Include their clinic name, rating, and specialization.

${dermatCatalog}

━━━━━━━━━ INSTRUCTIONS ━━━━━━━━━
Based on the questionnaire (and image if provided), return ONLY raw JSON in the exact format below. Do NOT wrap in markdown. Do NOT add any extra text.

{
  "skin_type": "oily/dry/combination/normal/sensitive",
  "acne": "none/mild/moderate/severe",
  "pigmentation": "none/low/medium/high",
  "overall_health_score": <40-100 integer>,
  "primary_concern": "<max 5 words summarizing main concern>",
  "sensitivity": "Not sensitive/Slightly sensitive/Very sensitive",
  "insight": "<A 2-sentence encouraging and personalized insight about their specific skin type and concerns>",
  "recommendations": ["<Short personalized tip 1>", "<Short personalized tip 2>", "<Short personalized tip 3>"],
  "avoid_ingredients": ["<ingredient to avoid 1>", "<ingredient to avoid 2>"],
  "routines": {
    "product": [
      {
        "name": "<Exact product_name from catalog>",
        "brand": "<Exact brand from catalog>",
        "product_type": "<product_type from catalog>",
        "ingredients": "<ingredients from catalog>",
        "price": <price number from catalog>,
        "recommended_for": "<Why this specific product helps this specific user>",
        "usage": "<day/night/both>"
      }
    ],
    "natural": [
      {
        "name": "<Remedy name — from catalog OR your own expert suggestion>",
        "ingredients": "<Ingredients list>",
        "steps": "<Clear application steps>",
        "frequency": "<daily / 2x/week / weekly / nightly>",
        "usage": "<day/night/both>",
        "source": "<'catalog' if from our list, 'ai' if your expert suggestion>",
        "reason": "<Why this works/benefits>"
      }
    ],
    "dermatologist": [
      {
        "name": "<Exact doctor name from catalog>",
        "clinic": "<Exact clinic_name from catalog>",
        "experience": "<Exact experience from catalog>",
        "location": "<location from catalog>",
        "rating": <rating from catalog>,
        "specialization": "<specialization from catalog>",
        "reason": "<Why this doctor is a good match for the user's concern>"
      }
    ]
  }
}
`;

    let result;
    if (req.file) {
      const imageBase64 = req.file.buffer.toString("base64");
      const mimeType = req.file.mimetype || "image/jpeg";
      result = await model.generateContent([
        prompt,
        { inlineData: { mimeType, data: imageBase64 } },
      ]);
    } else {
      result = await model.generateContent([prompt]);
    }

    let text = result.response.text().trim();
    if (text.startsWith("```json")) {
      text = text.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (text.startsWith("```")) {
      text = text.replace(/^```/, "").replace(/```$/, "").trim();
    }

    const parsed = JSON.parse(text);

    // ── Save analysis to DB if user is logged in ──────────────────────────
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const jwt = require("jsonwebtoken");
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await pool.query(
          "INSERT INTO skin_analyses (user_id, result, mode, budget) VALUES (?, ?, ?, ?)",
          [decoded.userId, JSON.stringify(parsed), mode, budget]
        );
      } catch (_) { /* not logged in or token expired — just skip saving */ }
    }

    res.json({
      analysis: parsed,
      budget,
      mode,
      recommendations: {
        natural:       parsed.routines?.natural       || [],
        product:       parsed.routines?.product       || [],
        dermatologist: parsed.routines?.dermatologist || [],
      },
    });
  } catch (err) {
    console.error("Skin analysis error:", err.message, err.stack);
    res.status(500).json({ error: err.message || "Failed to analyze skin data. Please try again." });
  }
});

// ── Hybrid Recommendation Endpoint (New AI ML System) ──────────────────────
app.post("/api/recommend", async (req, res) => {
  try {
      const { skin_type, main_concern } = req.body;
      const userInput = { skin_type, main_concern };
      
      const globalData = {
          products: PRODUCTS,
          remedies: REMEDIES,
          dermats: DERMATS
      };

      // 1. Get Hybrid Recommendations (Rule-based + ML)
      const hybridResults = getFinalRecommendations(userInput, globalData);
      
      // 2. Pass Hybrid Results to Gemini for personalized advice
      const geminiAdvice = await callGeminiAIDermatologist(userInput, hybridResults);
      
      res.json({
          success: true,
          recommendations: hybridResults,
          ai_dermatologist_advice: geminiAdvice
      });
  } catch (error) {
      console.error("Recommend error:", error);
      res.status(500).json({ error: error.message });
  }
});

// ── Feedback Endpoint (New AI ML System) ───────────────────────────────────
app.post("/api/feedback", (req, res) => {
  try {
      const { user_id, skin_type, likedItem, isPositive } = req.body;
      saveFeedback({ user_id, skin_type }, likedItem, isPositive);
      res.json({ success: true, message: "Feedback recorded to improve ML!" });
  } catch (error) {
      console.error("Feedback error:", error);
      res.status(500).json({ error: error.message });
  }
});

// Health check
app.get("/", (req, res) => res.json({ status: "Skinzy backend running ✅" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Skinzy backend running on http://localhost:${PORT}`);
  console.log(`🔑 Gemini API key: ${process.env.GEMINI_API_KEY ? "YES ✓" : "NO ✗"}`);
  console.log(`🗄  MySQL DB: ${process.env.DB_NAME}@${process.env.DB_HOST}`);
});
