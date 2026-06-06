require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ============================= */
/* MongoDB Connection */
/* ============================= */

const MONGO_URL = process.env.MONGO_URL;

if (!MONGO_URL) {
  console.error("❌ MONGO_URL no está definida en las variables de entorno");
} else {
  mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 5000 })
    .then(() => {
      console.log("🍃 MongoDB conectado");
      seedDefaults();
    })
    .catch(err => console.error("❌ Mongo Error:", err.message));
}

mongoose.set("toJSON", {
  virtuals: true,
  transform: (_doc, converted) => {
    converted.id = converted._id?.toString();
    delete converted._id;
    delete converted.__v;
  }
});

/* ============================= */
/* Cloudinary (optional) */
/* ============================= */

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

const SECRET = process.env.JWT_SECRET || "super_secret_key";

/* ============================= */
/* Models */
/* ============================= */

const userSchema = new mongoose.Schema({
  googleId: String,
  email: String,
  name: String,
  picture: String
});
const User = mongoose.model("User", userSchema);

const categorySchema = new mongoose.Schema({
  category: { type: String, required: true }
});
const Category = mongoose.model("Categories", categorySchema, "categories");

const colorSchema = new mongoose.Schema({
  color: { type: String, required: true }
});
const Color = mongoose.model("Colors", colorSchema, "colors");

const clothingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  color: { type: mongoose.Schema.Types.ObjectId, ref: "Colors", required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: "Categories", required: true },
  image_url: { type: String, default: "" },
  userId: { type: String, required: true }
});
const Clothing = mongoose.model("Clothing", clothingSchema, "clothings");

const outfitSchema = new mongoose.Schema({
  name: String,
  clothings: [{ type: mongoose.Schema.Types.ObjectId, ref: "Clothing", required: true }],
  userId: { type: String, required: true }
});
const Outfit = mongoose.model("Outfit", outfitSchema, "outfits");

/* ============================= */
/* Seed default categories/colors */
/* ============================= */

async function seedDefaults() {
  try {
    const categoryCount = await Category.countDocuments();
    if (categoryCount === 0) {
      await Category.insertMany([
        { category: "Tops" },
        { category: "Bottoms" },
        { category: "Shoes" },
        { category: "Accessories" }
      ]);
      console.log("📦 Categorías por defecto creadas");
    }

    const colorCount = await Color.countDocuments();
    if (colorCount === 0) {
      await Color.insertMany([
        { color: "Black" },
        { color: "White" },
        { color: "Blue" },
        { color: "Red" },
        { color: "Green" }
      ]);
      console.log("🎨 Colores por defecto creados");
    }
  } catch (error) {
    console.error("❌ Seed error:", error.message);
  }
}

/* ============================= */
/* Middleware */
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

function dbReady(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: "Database not connected" });
  }
  next();
}

/* ============================= */
/* Base */
/* ============================= */

app.get("/", (req, res) => {
  res.send("Backend funcionando 🚀");
});

/* ============================= */
/* Google Auth */
/* ============================= */

app.post("/auth/google", dbReady, async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: "No idToken provided" });
  }

  let googleUser;

  try {
    const googleResponse = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    googleUser = googleResponse.data;
  } catch (error) {
    console.error("❌ GOOGLE ERROR:", error.response?.data || error.message);
    return res.status(401).json({ message: "Invalid Google token" });
  }

  try {
    const { sub, email, name, picture } = googleUser;

    let user = await User.findOne({ googleId: sub });

    if (!user) {
      user = await User.create({ googleId: sub, email, name, picture });
      console.log("🆕 Usuario creado");
    }

    const token = jwt.sign({ userId: user._id.toString() }, SECRET, { expiresIn: "1d" });

    console.log("✅ LOGIN OK:", user.name);

    return res.json({
      user: {
        googleId: user.googleId,
        email: user.email,
        name: user.name,
        picture: user.picture
      },
      token
    });
  } catch (error) {
    console.error("❌ DB ERROR:", error.message);
    return res.status(500).json({ message: "Database error" });
  }
});

/* ============================= */
/* API — Categories */
/* ============================= */

app.get("/api/categories", dbReady, async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json(categories);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/categories", authMiddleware, dbReady, async (req, res) => {
  try {
    const saved = await Category.create(req.body);
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/* ============================= */
/* API — Colors */
/* ============================= */

app.get("/api/colors", dbReady, async (req, res) => {
  try {
    const colors = await Color.find();
    res.status(200).json(colors);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/colors", authMiddleware, dbReady, async (req, res) => {
  try {
    const saved = await Color.create(req.body);
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/* ============================= */
/* API — Clothings */
/* ============================= */

app.get("/api/clothings", authMiddleware, dbReady, async (req, res) => {
  try {
    const { name, color, category } = req.query;
    const dbQuery = { userId: req.userId };

    if (name) dbQuery.name = { $regex: name, $options: "i" };
    if (color) dbQuery.color = color;
    if (category) dbQuery.category = category;

    const clothings = await Clothing.find(dbQuery)
      .populate("category")
      .populate("color");

    res.status(200).json(clothings);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/clothings/:id", authMiddleware, dbReady, async (req, res) => {
  try {
    const clothing = await Clothing.findOne({
      _id: req.params.id,
      userId: req.userId
    }).populate("category").populate("color");

    if (!clothing) {
      return res.status(404).json({ message: "Clothing not found" });
    }

    res.status(200).json(clothing);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/clothings", authMiddleware, dbReady, async (req, res) => {
  try {
    const { name, color, category } = req.body;

    const saved = await Clothing.create({
      name,
      color,
      category,
      image_url: "",
      userId: req.userId
    });

    const populated = await Clothing.findById(saved._id)
      .populate("category")
      .populate("color");

    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/clothings/:id", authMiddleware, dbReady, async (req, res) => {
  try {
    const clothing = await Clothing.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId
    });

    res.status(200).json(clothing);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/clothings/image/:id", authMiddleware, dbReady, upload.single("my_file"), async (req, res) => {
  try {
    const clothing = await Clothing.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!clothing) {
      return res.status(404).json({ message: "Clothing not found" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;

      await cloudinary.uploader.upload(dataURI, {
        resource_type: "auto",
        public_id: req.params.id,
        overwrite: true
      });

      clothing.image_url = cloudinary.url(req.params.id);
    } else {
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      clothing.image_url = `data:${req.file.mimetype};base64,${b64}`;
    }

    await clothing.save();

    const populated = await Clothing.findById(clothing._id)
      .populate("category")
      .populate("color");

    res.status(200).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/* ============================= */
/* API — Outfits */
/* ============================= */

app.get("/api/outfits", authMiddleware, dbReady, async (req, res) => {
  try {
    const { name, color, category } = req.query;
    const dbQuery = { userId: req.userId };

    if (name) dbQuery.name = { $regex: name, $options: "i" };

    const outfits = await Outfit.find(dbQuery)
      .populate({ path: "clothings", populate: { path: "category" } })
      .populate({ path: "clothings", populate: { path: "color" } });

    const filtered = outfits.filter(outfit => {
      if (color) {
        const exists = outfit.clothings.some(c => c.color?.id === color || c.color?._id?.toString() === color);
        if (!exists) return false;
      }
      if (category) {
        const exists = outfit.clothings.some(c => c.category?.id === category || c.category?._id?.toString() === category);
        if (!exists) return false;
      }
      return true;
    });

    res.status(200).json(filtered);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/outfits/:id", authMiddleware, dbReady, async (req, res) => {
  try {
    const outfit = await Outfit.findOne({
      _id: req.params.id,
      userId: req.userId
    })
      .populate({ path: "clothings", populate: { path: "category" } })
      .populate({ path: "clothings", populate: { path: "color" } });

    if (!outfit) {
      return res.status(404).json({ message: "Outfit not found" });
    }

    res.status(200).json(outfit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/outfits", authMiddleware, dbReady, async (req, res) => {
  try {
    const { name, clothings } = req.body;

    if (!Array.isArray(clothings) || clothings.length === 0) {
      return res.status(400).json({ message: "clothings array is required" });
    }

    const ownedCount = await Clothing.countDocuments({
      _id: { $in: clothings },
      userId: req.userId
    });

    if (ownedCount !== clothings.length) {
      return res.status(403).json({ message: "Some clothings do not belong to this user" });
    }

    const saved = await Outfit.create({
      name,
      clothings,
      userId: req.userId
    });

    const populated = await Outfit.findById(saved._id)
      .populate({ path: "clothings", populate: { path: "category" } })
      .populate({ path: "clothings", populate: { path: "color" } });

    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put("/api/outfits/:id", authMiddleware, dbReady, async (req, res) => {
  try {
    const { clothings } = req.body;

    if (clothings) {
      if (!Array.isArray(clothings) || clothings.length === 0) {
        return res.status(400).json({ message: "clothings array is required" });
      }

      const ownedCount = await Clothing.countDocuments({
        _id: { $in: clothings },
        userId: req.userId
      });

      if (ownedCount !== clothings.length) {
        return res.status(403).json({ message: "Some clothings do not belong to this user" });
      }
    }

    const edited = await Outfit.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body,
      { new: true }
    )
      .populate({ path: "clothings", populate: { path: "category" } })
      .populate({ path: "clothings", populate: { path: "color" } });

    res.status(201).json(edited);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/outfits/:id", authMiddleware, dbReady, async (req, res) => {
  try {
    const outfit = await Outfit.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId
    });

    res.status(200).json(outfit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/* ============================= */
/* Start Server */
/* ============================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
