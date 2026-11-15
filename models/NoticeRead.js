import mongoose from "mongoose";

const noticeReadSchema = new mongoose.Schema({
  noticeId: { type: mongoose.Schema.Types.ObjectId, ref: "Notice", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  readAt: { type: Date, default: () => new Date() },
});
noticeReadSchema.index({ userId: 1, noticeId: 1 }, { unique: true });
noticeReadSchema.index({ noticeId: 1 });

export default mongoose.model("NoticeRead", noticeReadSchema);
