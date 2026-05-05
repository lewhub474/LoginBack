const express = require("express");
const cors = require("cors");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());

// 🔐 Usar variable de entorno en producción
const SECRET = process.env.JWT_SECRET || "super_secret_key";

// Base de datos fake en memoria (solo MVP)
let users = [];
let items = [];

/* ============================= */
/* 🔐 Middleware de Autenticación */
/* ============================= */

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

/* ============================= */
/* 🚀 Ruta de prueba */
/* ============================= */

app.get("/", (req, res) => {
  res.send("Backend funcionando 🚀");
});

/* ============================= */
/* 🔑 Login con Google */
/* ============================= */

app.post("/auth/google", async (req, res) => {
  const { idToken } = req.body;

  console.log("📥 BODY:", req.body);

  if (!idToken) {
    return res.status(400).json({ message: "No idToken provided" });
  }

  try {
    const googleResponse = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );

    const { sub, email, name, picture } = googleResponse.data;

    let user = users.find(u => u.googleId === sub);

    if (!user) {
      user = {
        id: users.length + 1,
        googleId: sub,
        email,
        name,
        picture
      };
      users.push(user);
    }

    const token = jwt.sign(
      { userId: user.id },
      SECRET,
      { expiresIn: "1d" }
    );

    console.log("✅ LOGIN OK:", user.name);

    return res.json({
      user,
      token
    });

  } catch (error) {
    console.error("❌ GOOGLE ERROR:", error.response?.data || error.message);

    return res.status(401).json({
      message: "Invalid Google token"
    });
  }
});

/* ============================= */
/* 📦 Crear Item (PROTEGIDO) */
/* ============================= */

app.post("/items", authMiddleware, (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ message: "Text is required" });
  }

  const newItem = {
    id: items.length + 1,
    text,
    userId: req.userId
  };

  items.push(newItem);

  res.json(newItem);
});

/* ============================= */
/* 📋 Obtener Items del Usuario */
/* ============================= */

app.get("/items", authMiddleware, (req, res) => {
  const userItems = items.filter(item => item.userId === req.userId);
  res.json(userItems);
});

/* ============================= */
/* 🟢 Levantar Servidor */
/* ============================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});