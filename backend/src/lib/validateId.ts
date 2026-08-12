import mongoose from "mongoose"
import { type Response } from "express"

// Returns true if id is a valid ObjectId, otherwise sends 400 and returns false.
export function validateObjectId(id: string | string[] | undefined, res: Response, label = "ID"): id is string {
  const str = Array.isArray(id) ? id[0] : id
  if (!str || !mongoose.isValidObjectId(str)) {
    res.status(400).json({ error: `Invalid ${label}` })
    return false
  }
  return true
}
