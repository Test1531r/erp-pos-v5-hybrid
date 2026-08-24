import { Router } from "express";
import { prisma } from "../index.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  const cats = await prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  res.json(cats);
});

router.post("/", async (req, res) => {
  try {
    const cat = await prisma.category.create({ data: { name: req.body.name, slug: req.body.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""), icon: req.body.icon } });
    res.status(201).json(cat);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "التصنيف موجود بالفعل" });
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const cat = await prisma.category.update({ where: { id: req.params.id }, data: req.body });
    res.json(cat);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
