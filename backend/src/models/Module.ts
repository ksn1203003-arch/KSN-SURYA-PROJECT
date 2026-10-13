// ─────────────────────────────────────────────────────────────────────────────
// models/Module.ts — Mongoose model for a lesson module.
// Each module belongs to one class+subject and contains an ordered items[]
// array of uploaded files (stored in GridFS) and external links.
// Exports: IModule, IModuleItem, ItemType, LinkType, Module
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export type ItemType = "file" | "link"
export type LinkType = "gdrive" | "youtube" | "other"
// PPT/PPTX → PDF conversion state. Conversion runs once, at upload (or once in the
// repair script for older files) — never on view or at server start.
export type ConversionStatus = "pending" | "ready" | "failed"

export interface IModuleItem {
  _id: mongoose.Types.ObjectId
  order: number
  type: ItemType
  label: string
  // file fields
  gridfs_id: mongoose.Types.ObjectId | null
  pdf_gridfs_id: mongoose.Types.ObjectId | null  // PDF version of PPTX/PPT for inline viewing
  conversion_status: ConversionStatus | null      // only set for PPT/PPTX items
  file_name: string | null
  file_type: string | null  // "pdf", "pptx", "ppt", "mp4", "jpg", etc.
  file_size: number | null  // bytes
  // link fields
  link_url: string | null
  link_type: LinkType | null
}

export interface IModule extends Document {
  school_id: mongoose.Types.ObjectId
  class_id: mongoose.Types.ObjectId
  subject: string
  title: string
  order: number
  created_by: mongoose.Types.ObjectId
  items: IModuleItem[]
  created_at: Date
  updated_at: Date
}

const moduleItemSchema = new mongoose.Schema<IModuleItem>({
  order:         { type: Number, required: true },
  type:          { type: String, enum: ["file", "link"], required: true },
  label:         { type: String, required: true },
  gridfs_id:     { type: mongoose.Schema.Types.ObjectId, default: null },
  pdf_gridfs_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  conversion_status: { type: String, enum: ["pending", "ready", "failed", null], default: null },
  file_name:     { type: String, default: null },
  file_type:     { type: String, default: null },
  file_size:     { type: Number, default: null },
  link_url: {
    type: String,
    default: null,
    validate: {
      validator: (v: string | null) => !v || /^https?:\/\//i.test(v),
      message: "link_url must start with http:// or https://",
    },
  },
  link_type:     { type: String, enum: ["gdrive", "youtube", "other", null], default: null },
}, { _id: true })

const moduleSchema = new mongoose.Schema<IModule>({
  school_id:  { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
  class_id:   { type: mongoose.Schema.Types.ObjectId, ref: "Class",  required: true },
  subject:    { type: String, required: true },
  title:      { type: String, required: true },
  order:      { type: Number, required: true, default: 0 },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items:      {
    type: [moduleItemSchema],
    default: [],
    validate: {
      validator: (arr: unknown[]) => arr.length <= 200,
      message: "A module cannot have more than 200 items",
    },
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
})

moduleSchema.index({ school_id: 1, class_id: 1, subject: 1, order: 1 })

export const Module: Model<IModule> = mongoose.models.Module ?? mongoose.model<IModule>("Module", moduleSchema)
