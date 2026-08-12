import { logger } from "../lib/logger.js"
import { Router, type Response } from "express"
import mongoose from "mongoose"
import { renderHtmlToPdf } from "../lib/pdf.js"
import { School } from "../models/School.js"
import { Class } from "../models/Class.js"
import { Module } from "../models/Module.js"
import { ModuleProgress } from "../models/ModuleProgress.js"
import { User } from "../models/User.js"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"

const router = Router()
router.use(requireAuth)

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

router.get("/compliance", async (req: AuthRequest, res: Response) => {
  try {
    const caller = await User.findById(req.userId!).select("school_id role").lean()
    if (!caller || !["admin", "super_admin"].includes(caller.role as string)) {
      res.status(403).json({ error: "Admin access required" }); return
    }
    const school_id = caller.school_id
    if (!school_id) { res.status(400).json({ error: "No school assigned" }); return }

    const [school, classes] = await Promise.all([
      School.findById(school_id).lean(),
      Class.find({ school_id }).lean(),
    ])

    // Compute real lesson progress per class from ModuleProgress + Module collections
    const classIds = classes.map(c => c._id)

    const [modules, progressDocs] = await Promise.all([
      Module.find({ school_id, class_id: { $in: classIds } })
        .select("class_id items")
        .lean(),
      // Count distinct (student_id, module_id, item_id) triples per class
      ModuleProgress.aggregate([
        {
          $lookup: {
            from: "modules",
            localField: "module_id",
            foreignField: "_id",
            as: "mod",
          },
        },
        { $unwind: "$mod" },
        {
          $match: {
            "mod.school_id": new mongoose.Types.ObjectId(school_id.toString()),
          },
        },
        {
          $group: {
            _id: "$mod.class_id",
            viewed_count: { $sum: 1 },
          },
        },
      ]),
    ])

    // Build total item count per class from modules
    const totalItemsPerClass: Record<string, number> = {}
    for (const mod of modules) {
      const cid = mod.class_id.toString()
      totalItemsPerClass[cid] = (totalItemsPerClass[cid] ?? 0) + (mod.items?.length ?? 0)
    }

    const viewedPerClass: Record<string, number> = {}
    for (const row of progressDocs) {
      viewedPerClass[row._id.toString()] = row.viewed_count
    }

    const classStats = classes.map(cls => {
      const cid   = cls._id.toString()
      const label = (cls as unknown as { name?: string | null }).name || `Class ${cls.grade}${cls.section}`
      const total = totalItemsPerClass[cid] ?? 0
      const done  = Math.min(viewedPerClass[cid] ?? 0, total)
      const pct   = total > 0 ? Math.round((done / total) * 100) : 0
      return { label, done, total, pct }
    })

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><style>
body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
h1 { color: #378ADD; margin-bottom: 4px; }
.subtitle { color: #888; font-size: 13px; margin-bottom: 32px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 12px; color: #888; padding: 8px 12px; border-bottom: 1px solid #eee; }
td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f5f5f5; }
.bar-bg { background: #f0f0f0; border-radius: 4px; height: 8px; width: 160px; }
.bar-fill { background: #378ADD; border-radius: 4px; height: 8px; }
.pct { font-weight: 700; color: #378ADD; }
</style></head>
<body>
<h1>Lesson Progress Compliance Report</h1>
<p class="subtitle">${esc(school?.name ?? "School")} · Generated ${new Date().toLocaleDateString("en-IN")}</p>
<table>
  <thead><tr><th>Class</th><th>Items Viewed</th><th>Progress</th><th>Completion %</th></tr></thead>
  <tbody>
    ${classStats.map(c => `
    <tr>
      <td>${esc(c.label)}</td>
      <td>${c.done} / ${c.total}</td>
      <td><div class="bar-bg"><div class="bar-fill" style="width:${c.pct}%"></div></div></td>
      <td class="pct">${c.pct}%</td>
    </tr>`).join("")}
  </tbody>
</table>
</body>
</html>`

    const pdf = await renderHtmlToPdf(html, { format: "A4" })
    const schoolName = (school?.name ?? "school").replace(/[^a-z0-9]/gi, "_").toLowerCase()
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="compliance_${schoolName}.pdf"`)
    res.send(pdf)
  } catch (err: unknown) {
    logger.error({ err: err }, "[reports/compliance]")
    res.status(500).json({ error: "Failed to generate compliance report. Please try again." })
  }
})

export default router
