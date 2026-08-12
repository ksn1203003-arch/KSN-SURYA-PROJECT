// ─────────────────────────────────────────────────────────────────────────────
// models/Quiz.ts — Mongoose model for a teacher-created MCQ quiz.
// Questions are embedded in the document. The correct_index field is stripped
// from the student-facing GET response in the quiz route.
// Exports: IQuiz, IQuizQuestion, Quiz
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface IQuizQuestion {
  text: string
  options: [string, string, string, string]
  correct_index: number   // 0-3
  explanation: string
}

export interface IQuiz extends Document {
  school_id:        mongoose.Types.ObjectId
  class_id:         mongoose.Types.ObjectId
  created_by:       mongoose.Types.ObjectId
  title:            string
  questions:        IQuizQuestion[]
  is_active:        boolean
  deadline:         Date | null
  max_attempts:     number       // fixed at 10; stored so teacher can see it
  shuffle_on_retry: boolean      // randomise question order on 2nd+ attempt
  attempts_reset_at: Date | null // set when teacher extends deadline; only count attempts after this
  created_at:       Date
}

// Strip correct_index from toJSON output unconditionally.
// All teacher routes that need the answers use .lean() which bypasses toJSON,
// so stripping here has no impact on teacher functionality. Any future route
// that accidentally calls .toJSON() (e.g. via res.json(doc)) will be safe.
const questionSchema = new mongoose.Schema<IQuizQuestion>({
  text:          { type: String, required: true },
  options:       { type: [String], required: true },
  correct_index: { type: Number, required: true },
  explanation:   { type: String, default: "" },
}, {
  _id: false,
  toJSON: {
    transform(_doc: unknown, ret: Record<string, unknown>) {
      delete ret.correct_index
      return ret
    },
  },
})

const quizSchema = new mongoose.Schema<IQuiz>({
  school_id:         { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
  class_id:          { type: mongoose.Schema.Types.ObjectId, ref: "Class",  required: true },
  created_by:        { type: mongoose.Schema.Types.ObjectId, ref: "User",   required: true },
  title:             { type: String, required: true },
  questions:         {
    type:     [questionSchema],
    default:  [],
    validate: {
      validator: (arr: unknown[]) => arr.length >= 1 && arr.length <= 100,
      message:   "A quiz must have between 1 and 100 questions",
    },
  },
  is_active:         { type: Boolean, default: true },
  deadline:          { type: Date, default: null },
  max_attempts:      { type: Number, default: 10 },
  shuffle_on_retry:  { type: Boolean, default: false },
  attempts_reset_at: { type: Date, default: null },
  created_at:        { type: Date, default: Date.now },
})

quizSchema.index({ school_id: 1, class_id: 1 })

export const Quiz: Model<IQuiz> =
  mongoose.models.Quiz ?? mongoose.model<IQuiz>("Quiz", quizSchema)
