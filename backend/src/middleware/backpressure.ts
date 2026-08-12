import { type Request, type Response, type NextFunction } from "express"

let active = 0
const MAX_ACTIVE = 45 // leave buffer below mongoose maxPoolSize: 50

export function backpressure(req: Request, res: Response, next: NextFunction): void {
  active++
  if (active > MAX_ACTIVE) {
    active--
    res.status(503).json({ error: "Server is busy. Please try again shortly." })
    return
  }
  const decrement = () => { active-- }
  res.on("finish", decrement)
  res.on("close", decrement)
  next()
}
