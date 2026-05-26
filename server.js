require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

/* ============================= */
/* 🍃 MongoDB Connection */
/* ============================= */

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("🍃 MongoDB conectado"))
  .catch(err => console.log("❌ Mongo Error:", err));

/* ============================= */
/* 🔐 JWT Secret */
/* ============================= */

const SECRET = process.env.JWT_SECRET || "super_secret_key";

/* ============================= */
/* 👤 User Model */
/* ============================= */

const userSchema = new mongoose.Schema({
  googleId: String,
  email: String,
  name: String,
  picture: String
});

const User = mongoose.model("User", userSchema);

/* ============================= */
/* 📦 Item Model */
/* ============================= */

const itemSchema = new mongoose.Schema({
  text: String,
  userId: String
});

const Item = mongoose.model("Item", itemSchema);

/* ============================= */
/* 🔐 Middleware de Auth */
/* ============================= */

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({
      message: "No token provided"
    });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET);

    req.userId = decoded.userId;

    next();

  } catch (error) {
    return res.status(401).json({
      message: "Invalid token"
    });
  }
}

/* ============================= */
/* 🚀 Ruta Base */
/* ============================= */

app.get("/", (req, res) => {
  res.send("Backend funcionando 🚀");
});

/* ============================= */
/* 🔑 Login Google */
/* ============================= */

app.post("/auth/google", async (req, res) => {

  const { idToken } = req.body;

  console.log("📥 BODY:", req.body);

  if (!idToken) {
    return res.status(400).json({
      message: "No idToken provided"
    });
  }

  try {

    const googleResponse = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );

    const {
      sub,
      email,
      name,
      picture
    } = googleResponse.data;

    let user = await User.findOne({
      googleId: sub
    });

    if (!user) {

      user = await User.create({
        googleId: sub,
        email,
        name,
        picture
      });

      console.log("🆕 Usuario creado");
    }

    const token = jwt.sign(
      {
        userId: user._id
      },
      SECRET,
      {
        expiresIn: "1d"
      }
    );

    console.log("✅ LOGIN OK:", user.name);

    return res.json({
      user,
      token
    });

  } catch (error) {

    console.error(
      "❌ GOOGLE ERROR:",
      error.response?.data || error.message
    );

    return res.status(401).json({
      message: "Invalid Google token"
    });
  }
});

/* ============================= */
/* 📦 Crear Item */
/* ============================= */

app.post("/items", authMiddleware, async (req, res) => {

  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      message: "Text is required"
    });
  }

  try {

    const newItem = await Item.create({
      text,
      userId: req.userId
    });

    console.log("📦 Item creado");

    res.json(newItem);

  } catch (error) {

    console.log("❌ CREATE ITEM ERROR:", error);

    res.status(500).json({
      message: "Error creating item"
    });
  }
});

/* ============================= */
/* 📋 Obtener Items */
/* ============================= */

app.get("/items", authMiddleware, async (req, res) => {

  try {

    const userItems = await Item.find({
      userId: req.userId
    });

    console.log("📦 ITEMS ENCONTRADOS:");
    console.log(JSON.stringify(userItems, null, 2));

    res.json(userItems);

  } catch (error) {

    console.log("❌ GET ITEMS ERROR:", error);

    res.status(500).json({
      message: "Error fetching items"
    });
  }
});

/* ============================= */
/* 🟢 Start Server */
/* ============================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});