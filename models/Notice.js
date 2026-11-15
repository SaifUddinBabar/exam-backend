import mongoose from "mongoose";

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, trim: true, default: "", maxlength: 5000 },
    attachmentUrl: { type: String, trim: true, default: "" },
    attachmentName: { type: String, trim: true, default: "" },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
    audience: {
      all: { type: Boolean, default: false },
      batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Batch" }],
      studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
    priority: { type: String, enum: ["normal", "important", "urgent"], default: "normal" },
    publishAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

noticeSchema.index({ "audience.batchIds": 1, publishAt: -1 });
noticeSchema.index({ "audience.studentIds": 1, publishAt: -1 });
noticeSchema.index({ "audience.all": 1, publishAt: -1 });

export default mongoose.model("Notice", noticeSchema);
