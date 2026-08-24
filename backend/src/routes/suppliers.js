import { Router } from "express";
import { prisma } from "../index.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  res.json(suppliers);
});
router.post("/", async (req, res) => {
  try { res.status(201).json(await prisma.supplier.create({ data: req.body })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.put("/:id", async (req, res) => {
  try { res.json(await prisma.supplier.update({ where: { id: req.params.id }, data: req.body })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
